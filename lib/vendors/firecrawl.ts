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

export async function startCrawl(url: string, limit = 60): Promise<CrawlStarted> {
  const res = await fetch(`${BASE}/crawl`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      limit,                                   // a hard ceiling, so a big site cannot run up an unbounded bill
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !data.id) throw new Error(`Firecrawl crawl failed (${res.status}): ${(data.error || JSON.stringify(data)).slice(0, 160)}`);
  return { id: data.id };
}

export type CrawlStatus = { status: string; done: boolean; pages: ScrapedPage[] };

export async function crawlStatus(id: string): Promise<CrawlStatus> {
  const res = await fetch(`${BASE}/crawl/${id}`, { headers: { Authorization: `Bearer ${await key()}` } });
  const data = (await res.json().catch(() => ({}))) as {
    status?: string; error?: string;
    data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string; url?: string } }[];
  };
  if (!res.ok) throw new Error(`Firecrawl status failed (${res.status}): ${(data.error || "").slice(0, 160)}`);
  const status = data.status || "scraping";
  return {
    status,
    done: status === "completed" || status === "failed",
    pages: (data.data ?? [])
      .map((p) => ({
        url: p.metadata?.sourceURL || p.metadata?.url || "",
        title: p.metadata?.title || p.metadata?.sourceURL || "",
        content: (p.markdown || "").trim(),
      }))
      // A crawl always picks up some navigation and tag pages. Anything under ~400 characters is not an
      // article, and letting those in would fill the brain with menus.
      .filter((p) => p.content.length > 400),
  };
}
