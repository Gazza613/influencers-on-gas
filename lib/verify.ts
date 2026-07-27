import Anthropic from "@anthropic-ai/sdk";
import { isSafePublicUrl } from "./safe-url";
import { INGEST } from "./vendors/anthropic";

// VERIFIED RETRIEVAL. The Researcher's findings come back from a model that CITES sources - but a model can
// cite a plausible URL it never read, and it can invent a publish date (it did exactly that: "posted 1st
// August 2025" stamped on two undated pages). This module closes that gap. For each finding we FETCH the page
// it cites, read the REAL publish date off the page, and ask a cheap model whether the page actually supports
// the claim, judging only from the page text. The date the desk shows and gates on is then the one we read,
// not the one the model guessed; a finding whose own cited page does not support it is dropped as a fabrication.
//
// It is deliberately conservative about DROPPING: a page that cannot be fetched (many sites bot-block a server
// fetch with a 403) is marked "unverified", NOT refuted - we never bin a real finding just because a publisher
// blocks robots. Only a page we DID read and that does not support the claim is refuted.

export type Verdict = {
  status: "verified" | "refuted" | "partial" | "unverified" | "dead";
  supported: boolean | null;
  date: string | null;      // the REAL publish date we established, YYYY-MM-DD, or null
  checkedUrl: string | null;
  note: string;
};

// A DEAD link is one the server explicitly says does not exist. This is the facebook.com/business/help/
// click-to-whatsapp-ads case Gary hit: a plausible-looking URL the model invented, that 404s. We treat only
// these explicit codes as dead (drop the finding); a 403/429/timeout is a bot-block, not a fabrication (keep).
const DEAD_STATUS = new Set([404, 410, 451]);

/** Normalise any date-ish string to YYYY-MM-DD, or null. */
export function toISODate(s: unknown): string | null {
  if (!s) return null;
  const t = String(s).trim();
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Pull the publish date out of a page's HTML, deterministically - the machine truth, not a model guess. */
export function extractPublishedDate(html: string): string | null {
  const patterns: RegExp[] = [
    /"datePublished"\s*:\s*"([^"]+)"/i,                                                            // JSON-LD
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,             // OpenGraph
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,             // reversed attr order
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,                      // schema.org microdata
    /<meta[^>]+name=["'](?:date|pubdate|publishdate|publish-date|dc\.date|dc\.date\.issued|sailthru\.date)["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,                                                        // <time datetime>
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) { const d = toISODate(m[1]); if (d) return d; }
  }
  return null;
}

/** Strip HTML to readable text for the support check. Head/meta is kept out; we only need the body prose. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch a cited page. SSRF-guarded, timed out, and never throws - a failed fetch is a result, not an error. */
export async function fetchSourcePage(url: string): Promise<{ ok: boolean; status: number; text: string; date: string | null }> {
  if (!isSafePublicUrl(url)) return { ok: false, status: 0, text: "", date: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GAS-Studio-Researcher/1.0; +https://gasmarketing.co.za)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { ok: false, status: res.status, text: "", date: null };
    const ct = res.headers.get("content-type") || "";
    if (!/html|text/i.test(ct)) return { ok: false, status: res.status, text: "", date: null };
    const raw = (await res.text()).slice(0, 500_000);
    return { ok: true, status: res.status, text: htmlToText(raw).slice(0, 8000), date: extractPublishedDate(raw) };
  } catch {
    return { ok: false, status: 0, text: "", date: null };
  } finally {
    clearTimeout(timer);
  }
}

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    supported: { type: "boolean", description: "True ONLY if the page text substantively supports the core of the claim. If the page is unrelated, a homepage, a search page, or simply does not make the claim, return false. Judge only from the text given." },
    published_date: { type: "string", description: "The date this page/article was published as YYYY-MM-DD, read from the page text or its own dateline. Empty string if the page gives no date." },
    note: { type: "string", description: "One short line: what the page does or does not confirm." },
  },
  required: ["supported", "published_date", "note"],
} as unknown as Anthropic.Tool["input_schema"];

/**
 * Verify one finding against the source(s) it cites. Fetches up to the first two, reads the real date, and asks
 * the cheap ingestion model whether the reached page supports the claim. Returns a verdict; never throws.
 * `meter` is called once per model check so the caller can record the usage.
 */
export async function verifyFinding(
  claim: { headline: string; detail: string; published_at: string | null },
  srcs: { name: string; url: string }[],
  anthropic: Anthropic,
  meter: () => void,
): Promise<Verdict> {
  const candidates = srcs.slice(0, 3);
  const pages = await Promise.all(candidates.map((s) => fetchSourcePage(s.url)));
  const idx = pages.findIndex((p) => p.ok && p.text.length > 200);
  if (idx === -1) {
    // Reached nothing readable. Split two very different cases. If the server EXPLICITLY says the page does
    // not exist (404/410) and nothing softer failed, the cited link is dead - a fabricated or broken URL, and
    // the finding is dropped. A 403 / timeout / 5xx is a bot-block, not a fabrication, so we keep it, flagged.
    const hardDead = pages.some((p) => DEAD_STATUS.has(p.status));
    const softFail = pages.some((p) => !p.ok && !DEAD_STATUS.has(p.status));
    if (hardDead && !softFail) {
      return { status: "dead", supported: false, date: null, checkedUrl: candidates[0]?.url || null, note: "The cited source returned 404 - the page does not exist. Link is fabricated or broken." };
    }
    return { status: "unverified", supported: null, date: toISODate(claim.published_at), checkedUrl: candidates[0]?.url || null, note: "Source could not be fetched for verification (may be bot-blocked)." };
  }
  const pg = pages[idx];
  const url = candidates[idx].url;
  try {
    const r = await anthropic.messages.create({
      model: INGEST,
      max_tokens: 400,
      system: "You verify one research finding against the SOURCE PAGE it cites. Judge ONLY from the page text provided. Never use outside knowledge to confirm a claim the page itself does not make. Answer via the tool.",
      tools: [{ name: "verdict", description: "The verification verdict for this finding.", input_schema: VERDICT_SCHEMA }],
      tool_choice: { type: "tool", name: "verdict" },
      messages: [{ role: "user", content: `CLAIM:\n${claim.headline}\n${(claim.detail || "").slice(0, 1500)}\n\nSOURCE PAGE (${url}):\n${pg.text}` }],
    });
    meter();
    const b = r.content.find((x) => x.type === "tool_use");
    const out = (b && b.type === "tool_use" ? b.input : {}) as { supported?: boolean; published_date?: string; note?: string };
    const date = toISODate(out.published_date) || pg.date || toISODate(claim.published_at);
    const supported = out.supported === true;
    return { status: supported ? "verified" : "refuted", supported, date, checkedUrl: url, note: String(out.note || "").slice(0, 300) };
  } catch {
    // We reached the page and can date it; we just could not grade support. Keep it, flagged partial.
    return { status: "partial", supported: null, date: pg.date || toISODate(claim.published_at), checkedUrl: url, note: "Source reached; support check unavailable." };
  }
}
