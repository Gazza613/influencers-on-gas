// A LIGHTWEIGHT RSS / ATOM PARSER (Gary: broader source intake). No dependency and no per-article scrape: we read
// the feed's OWN item content, which most feeds carry (content:encoded / content / description / summary), so a
// feed refresh costs one fetch, not a Firecrawl page per item. Robust enough for the common feed shapes; a feed
// that only ships titles gives the brain titles + links, still useful, still traceable.
export type FeedItem = { title: string; link: string; content: string; date: string | null };

const decode = (s: string): string =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");

const stripHtml = (s: string): string => {
  // UNWRAP CDATA FIRST. A feed's description/content is usually CDATA-wrapped; the tag-stripper below would eat
  // the whole <![CDATA[...]]> block (it opens with "<"), so the text must be freed from CDATA before tags go.
  const unwrapped = String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decode(unwrapped.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
};

// First <name>...</name> inside a block, CDATA-aware. `name` may be namespaced (e.g. "content:encoded").
function tag(block: string, name: string): string {
  const re = new RegExp(`<${name.replace(":", "\\:")}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(":", "\\:")}>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = String(xml || "").match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const title = decode(tag(b, "title")).trim();
    // RSS uses <link>url</link>; Atom uses <link href="url"/> (prefer rel="alternate" when present).
    let link = decode(tag(b, "link")).trim();
    if (!link) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = alt ? alt[1].trim() : "";
    }
    const content = stripHtml(tag(b, "content:encoded") || tag(b, "content") || tag(b, "description") || tag(b, "summary"));
    const date = (tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || "").trim() || null;
    if (title || content) out.push({ title, link, content, date });
  }
  return out;
}

// Fetch + parse a feed, newest first, capped. Best-effort: a bad feed returns [].
export async function fetchFeed(url: string, limit = 20): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "GAS-Studio-Feed/1.0", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml).slice(0, limit);
  } catch { return []; }
}
