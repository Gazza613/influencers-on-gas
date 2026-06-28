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
