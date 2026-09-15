import { getSecret } from "../connections";
import { isSafeCrawlTarget, safeFetch } from "../safe-url";

// Firecrawl - turn a web page into clean markdown for the knowledge base.
const BASE = "https://api.firecrawl.dev/v1";

async function key(): Promise<string> {
  const k = await getSecret("firecrawl");
  if (!k) throw new Error("Crawler (Firecrawl) is not connected");
  return k;
}

export type ScrapedPage = { url: string; title: string; content: string };

// Scrape a single page → main-content markdown.
// A page whose "content" is really a bot-wall challenge (Cloudflare "you have been blocked" / "Just a moment",
// cookie walls). It must NEVER be treated as real site content: fed to the research model it produces zero facts
// (or worse, a fact about the block page). Detected here so every caller can reject it.
const BLOCK_RE = /(you have been blocked|attention required|cf-browser-verification|just a moment|enable (cookies|javascript)( and reload)?|checking your browser|verify you are (a )?human|access denied|ddos protection by)/i;
export function looksBlocked(content: string): boolean {
  const c = (content || "").trim();
  return c.length < 200 || (BLOCK_RE.test(c) && c.length < 1200);
}

// Scrape a single page → main-content markdown. `stealth` routes through Firecrawl's stealth proxy, which renders
// JS and clears harder anti-bot walls (Cloudflare) that the basic fetch and default proxy cannot - needed for sites
// like egifts24 that block both a raw fetch AND a default Firecrawl. It costs more, so it is opt-in per call.
export async function scrape(url: string, opts: { stealth?: boolean } = {}): Promise<ScrapedPage> {
  const res = await fetch(`${BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, ...(opts.stealth ? { proxy: "stealth", waitFor: 3500 } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { markdown?: string; metadata?: { title?: string } }; error?: string };
  if (!res.ok) throw new Error(`Firecrawl scrape failed (${res.status}): ${(data.error || JSON.stringify(data)).slice(0, 160)}`);
  return {
    url,
    title: data.data?.metadata?.title || url,
    content: (data.data?.markdown || "").trim(),
  };
}

// SCRAPE, BUT NEVER STORE A BOT-WALL (audit P1). A default scrape can come back with a Cloudflare / JS challenge
// body instead of the page, and that challenge text was silently being ingested as "knowledge". So: scrape, and if
// the result looks blocked, retry ONCE through the stealth proxy (which renders JS and clears harder walls); if it
// is STILL a wall, throw loudly rather than poisoning the brain with challenge text. Used for single-page ingest.
export async function scrapeReadable(url: string): Promise<ScrapedPage> {
  let page = await scrape(url);
  if (looksBlocked(page.content)) {
    page = await scrape(url, { stealth: true });
    if (looksBlocked(page.content)) {
      throw new Error("the page returned a bot-wall or challenge (Cloudflare or a JavaScript gate) instead of readable content, even through the stealth proxy, so nothing real could be read from it");
    }
  }
  return page;
}

// CRAWL A WHOLE SECTION, not one page.
//
// Scraping the index of a blog gets you the index of a blog: fifty headlines and no arguments. To teach a
// brain what a company actually says, every article has to come in - and adding fifty sources by hand is the
// kind of task that gets done once and never again.
//
// Firecrawl's crawl is asynchronous: it returns a job id, then you poll. That shape is why this lives behind
// a durable Inngest step - a serverless request would time out long before a fifty-page site finished.
export type CrawlStarted = { id: string };

export async function startCrawl(url: string, limit = 60, includePath?: string | null): Promise<CrawlStarted> {
  const res = await fetch(`${BASE}/crawl`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      limit,                                   // a hard ceiling, so a big site cannot run up an unbounded bill
      // FOLLOW LINKS OUTSIDE THE STARTING PATH. Firecrawl only descends into sub-paths of the given URL by
      // default, and that quietly broke the first real crawl: gasmarketing.co.za/articles is an INDEX whose
      // every article lives at /blog/..., so nothing was under /articles and the crawler followed nothing.
      // Index-at-one-path, articles-at-another is the normal shape of a blog, not an edge case.
      allowBackwardLinks: true,
      // SCOPE IT TO ONE SECTION. Without this a crawl wanders the whole site: the first real one returned a
      // case study, a solutions page and the sitemap alongside the articles it was asked for, and the INDEX
      // page itself dominated the brain with 220 chunks of summaries - abbreviated restatements of the very
      // articles we wanted, which is the worst thing to have competing with them in retrieval.
      ...(includePath ? { includePaths: [`^${includePath.replace(/^\/?/, "/").replace(/\/$/, "")}/.*`] } : {}),
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !data.id) throw new Error(`Firecrawl crawl failed (${res.status}): ${(data.error || JSON.stringify(data)).slice(0, 160)}`);
  return { id: data.id };
}

export type CrawlStatus = { status: string; done: boolean; pages: ScrapedPage[]; seen: number };

export async function crawlStatus(id: string): Promise<CrawlStatus> {
  const res = await fetch(`${BASE}/crawl/${id}`, { headers: { Authorization: `Bearer ${await key()}` } });
  const data = (await res.json().catch(() => ({}))) as {
    status?: string; error?: string;
    data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string; url?: string } }[];
  };
  if (!res.ok) throw new Error(`Firecrawl status failed (${res.status}): ${(data.error || "").slice(0, 160)}`);
  const status = data.status || "scraping";
  const all = data.data ?? [];
  return {
    status,
    done: status === "completed" || status === "failed",
    // `seen` is everything the crawl fetched, before filtering. Reporting both is what tells you whether the
    // crawler found nothing at all or found plenty and we discarded it.
    seen: all.length,
    pages: all
      .map((p) => ({
        url: p.metadata?.sourceURL || p.metadata?.url || "",
        title: p.metadata?.title || p.metadata?.sourceURL || "",
        content: (p.markdown || "").trim(),
      }))
      // A crawl always picks up navigation and tag pages; anything under ~400 characters is not an article and
      // would fill the brain with menus. A sitemap is a list of links rather than content, so it goes too - it
      // arrived in the first real crawl as 24 chunks of bare URLs. A bot-wall / challenge page is dropped too, so
      // a Cloudflare "Just a moment" body never enters the brain as knowledge (audit P1).
      .filter((p) => p.content.length > 400 && !/\.(xml|json|txt)(\?|$)/i.test(p.url) && !looksBlocked(p.content)),
  };
}

// THE SITEMAP IS THE RELIABLE ROUTE, not link-following.
//
// Firecrawl's crawler would not follow this site's article links no matter how it was configured: pointed at
// the index it fetched a case study, a privacy policy and the sitemap, but never one of the 76 articles, even
// though they are 76 plain <a href> anchors in the served HTML. Rather than keep guessing at another crawler's
// heuristics, we read the site's own sitemap and scrape exactly the pages we want.
//
// It is deterministic, it honours the path filter precisely, and it uses the single-page scrape that has
// always worked. A site without a sitemap falls back to the crawler.
// Fetch a sitemap/robots document, SSRF-guarded. Returns the text, or null on any failure.
async function fetchXml(url: string): Promise<string | null> {
  if (!isSafeCrawlTarget(url)) return null;
  // SSRF-hardened: robots.txt Sitemap: lines and sitemap-index children are content-derived URLs, so safeFetch
  // resolves DNS and re-validates each redirect hop - none can point at an internal/metadata address.
  const res = await safeFetch(url, { validate: isSafeCrawlTarget, headers: { "User-Agent": "FirecrawlAgent" } }).catch(() => null);
  if (!res?.ok) return null;
  return await res.text().catch(() => null);
}

// Parse a sitemap OR a sitemap-index into {url, lastmod} entries. Handles <url> and <sitemap> blocks (both carry
// <loc> + optional <lastmod>), falling back to bare <loc> matching. lastmod is a timestamp (0 when absent).
function parseSitemap(xml: string): { url: string; lastmod: number }[] {
  const out: { url: string; lastmod: number }[] = [];
  const blocks = xml.match(/<(?:url|sitemap)>[\s\S]*?<\/(?:url|sitemap)>/g);
  if (blocks) {
    for (const b of blocks) {
      const loc = b.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
      const lm = b.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim();
      if (loc) out.push({ url: loc, lastmod: lm ? (Date.parse(lm) || 0) : 0 });
    }
  } else {
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) out.push({ url: m[1].trim(), lastmod: 0 });
  }
  return out;
}

export async function sitemapUrls(siteUrl: string, includePath?: string | null): Promise<string[]> {
  // SSRF: every fetch below is server-side, so the target must be a public site. The add/recrawl doors validate,
  // and fetchXml guards each fetch too since this is the actual fetch site.
  if (!isSafeCrawlTarget(siteUrl)) return [];
  const origin = new URL(siteUrl).origin;

  // INFER THE SCOPE FROM THE ADDRESS when none was typed. Giving the crawler ".../blog" plainly means "the
  // blog", and making someone repeat that in a second field is a trap: leave it blank and the whole site
  // comes in, which is the opposite of what they asked for. An explicit path still wins. Taken AS TYPED, not after
  // redirects (/blog 301s to /articles on this site while the articles live at /blog/...).
  let scope = includePath;
  if (!scope) {
    const trimmed = new URL(siteUrl).pathname.replace(/^\/+|\/+$/g, "");
    if (trimmed) scope = trimmed;
  }

  // FIND A SITEMAP. Try robots.txt's declared Sitemap: lines first (the authoritative pointer), then the two
  // conventional locations. Enterprise sites often only declare it in robots or use /sitemap_index.xml.
  const candidates: string[] = [];
  const robots = await fetchXml(`${origin}/robots.txt`);
  if (robots) for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(m[1].trim());
  candidates.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);
  let xml: string | null = null;
  for (const c of [...new Set(candidates)]) { xml = await fetchXml(c); if (xml) break; }
  if (!xml) return [];

  // If this is a sitemap INDEX (every entry points at a child .xml sitemap), follow the freshest children and
  // gather their page URLs - a common enterprise shape that the old single-fetch simply discarded.
  let entries = parseSitemap(xml);
  const isIndex = entries.length > 0 && entries.every((e) => /\.xml(\?|$)/i.test(e.url) && e.url.startsWith(origin));
  if (isIndex) {
    const children = entries.sort((a, b) => b.lastmod - a.lastmod).slice(0, 10);
    entries = [];
    for (const child of children) { const cx = await fetchXml(child.url); if (cx) entries.push(...parseSitemap(cx)); }
  }

  const want = scope ? `/${scope.replace(/^\/+|\/+$/g, "")}/` : null;
  const dedup = new Map<string, { url: string; lastmod: number }>();
  for (const e of entries) if (!dedup.has(e.url)) dedup.set(e.url, e);
  return [...dedup.values()]
    .filter((e) => e.url.startsWith(origin))
    // The path filter, applied to the URL itself rather than trusted to a crawler's scoping.
    .filter((e) => (want ? new URL(e.url).pathname.startsWith(want) : true))
    // Never a sitemap or other non-page asset.
    .filter((e) => !/\.(xml|json|txt|pdf|png|jpe?g|svg|webp)(\?|$)/i.test(e.url))
    // NEWEST FIRST (audit): so when the caller caps the list, it keeps the freshest pages, not an arbitrary slice.
    .sort((a, b) => b.lastmod - a.lastmod)
    .map((e) => e.url);
}
