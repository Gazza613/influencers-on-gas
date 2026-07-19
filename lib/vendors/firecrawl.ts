import { getSecret } from "../connections";

// Firecrawl - turn a web page into clean markdown for the knowledge base.
const BASE = "https://api.firecrawl.dev/v1";

async function key(): Promise<string> {
  const k = await getSecret("firecrawl");
  if (!k) throw new Error("Crawler (Firecrawl) is not connected");
  return k;
}

export type ScrapedPage = { url: string; title: string; content: string };

// Scrape a single page → main-content markdown.
export async function scrape(url: string): Promise<ScrapedPage> {
  const res = await fetch(`${BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { markdown?: string; metadata?: { title?: string } }; error?: string };
  if (!res.ok) throw new Error(`Firecrawl scrape failed (${res.status}): ${(data.error || JSON.stringify(data)).slice(0, 160)}`);
  return {
    url,
    title: data.data?.metadata?.title || url,
    content: (data.data?.markdown || "").trim(),
  };
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
      // arrived in the first real crawl as 24 chunks of bare URLs.
      .filter((p) => p.content.length > 400 && !/\.(xml|json|txt)(\?|$)/i.test(p.url)),
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
export async function sitemapUrls(siteUrl: string, includePath?: string | null): Promise<string[]> {
  const origin = new URL(siteUrl).origin;

  // INFER THE SCOPE FROM THE ADDRESS when none was typed. Giving the crawler ".../blog" plainly means "the
  // blog", and making someone repeat that in a second field is a trap: leave it blank and the whole site
  // comes in, which is the opposite of what they asked for. An explicit path still wins.
  //
  // The path is taken AS TYPED, deliberately not after following redirects. Following them looked like the
  // careful choice and is exactly wrong here: /blog 301s to /articles on this site, while the articles
  // themselves live at /blog/... - so resolving the redirect would scope to /articles and select nothing.
  // What someone types is what they mean.
  let scope = includePath;
  if (!scope) {
    const trimmed = new URL(siteUrl).pathname.replace(/^\/+|\/+$/g, "");
    if (trimmed) scope = trimmed;
  }
  const res = await fetch(`${origin}/sitemap.xml`, { headers: { "User-Agent": "FirecrawlAgent" } });
  if (!res.ok) return [];
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

  const want = scope ? `/${scope.replace(/^\/+|\/+$/g, "")}/` : null;
  return [...new Set(urls)]
    .filter((u) => u.startsWith(origin))
    // The path filter, applied to the URL itself rather than trusted to a crawler's scoping.
    .filter((u) => (want ? new URL(u).pathname.startsWith(want) : true))
    // Never the sitemap or other non-pages.
    .filter((u) => !/\.(xml|json|txt|pdf|png|jpe?g|svg|webp)(\?|$)/i.test(u));
}
