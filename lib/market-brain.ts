import { db } from "./db";
import { createSource } from "./brains";
import { inngest } from "./inngest";
import { setIntelStatus } from "./intel";

// STACK A MARKET FINDING INTO THE BRAIN (Gary). An accepted market-sweep finding becomes REAL brain knowledge:
// it is created as a knowledge SOURCE and embedded into the RAG store through the exact same durable ingest path
// as a website or a document (brain/ingest.source). That means it (1) appears in the Knowledge Sources list as a
// line item, and (2) lifts the brain-strength depth score, both automatically and accurately - because the score
// and the list are computed from the knowledge_chunks/knowledge_sources this creates, nothing is estimated.
// It is ALSO marked accepted on studio_intel, so it stays as standing research the Researcher/Strategist read.
// client_id scopes every write (isolation).
//
// TRUST (audit P0): a market fact that enters the brain must carry its own PROVENANCE, so no downstream pod (or
// human) can mistake an unconfirmed model claim for an established, sourced fact. So: (1) a finding with NO real
// source is REFUSED - we never embed a bare assertion; (2) the embedded passage is STAMPED with its verification
// status, so a passage that was only bot-blocked (unverified) reads as such wherever it is retrieved; and (3) the
// model's own "why it matters" is labelled ANALYSIS, not fact, keeping the facts-only-in-the-brain doctrine.

// A readable, distinctive label for the Knowledge Sources line item (the source's uri column shows here).
const label = (headline: string) => `Market: ${String(headline || "market finding").trim()}`.slice(0, 140);

// The provenance stamp that leads every embedded market passage, so its trust level travels WITH the text.
function stamp(verification?: string | null): string {
  if (verification === "verified") return "[Market intelligence · source verified]";
  if (verification === "partial") return "[Market intelligence · source partially verified]";
  return "[Market intelligence · UNVERIFIED - the source could not be machine-confirmed, treat with care]";
}

// The RAG content: the finding as a self-contained, sourced, provenance-stamped passage. The stamp leads; the
// source ends it so a reader can always check it; "why it matters" is explicitly demarcated as analysis.
function findingText(f: { headline?: string; why_it_matters?: string; detail?: string; sources?: { name?: string; url?: string }[] | null; published_at?: string | null; verification?: string | null }): string {
  const srcs = (Array.isArray(f.sources) ? f.sources : []).filter((s) => s?.url);
  const parts = [stamp(f.verification), String(f.headline || "").trim(), String(f.detail || "").trim()].filter(Boolean);
  const why = String(f.why_it_matters || "").trim();
  if (why) parts.push(`Why it matters (analysis, not established fact): ${why}`);
  const srcLine = srcs.length ? `Sources: ${srcs.map((s) => `${s.name || "source"} (${s.url})`).join(" · ")}` : "";
  const dateLine = f.published_at ? `Published: ${f.published_at}` : "";
  return [parts.join("\n\n"), [srcLine, dateLine].filter(Boolean).join("\n")].filter(Boolean).join("\n\n");
}

export type AddResult = { ok: true; sourceId: string } | { ok: false; error: string };

export async function addFindingToBrain(clientId: string, intelId: string): Promise<AddResult> {
  const rows = (await db().query(
    `select headline, why_it_matters, detail, sources, published_at, verification from studio_intel where id = $1 and client_id = $2`,
    [intelId, clientId],
  )) as { headline: string; why_it_matters: string; detail: string; sources: { name?: string; url?: string }[] | null; published_at: string | null; verification: string | null }[];
  const f = rows[0];
  if (!f) return { ok: false, error: "That finding is not on this brain." };
  // NO SOURCE, NO ENTRY. A finding with no real source URL is a bare assertion; it must never become brain "fact".
  const hasSource = (Array.isArray(f.sources) ? f.sources : []).some((s) => s?.url && /^https?:\/\//i.test(String(s.url)));
  if (!hasSource) return { ok: false, error: "This finding has no source, so it cannot be added to the brain. Only sourced facts belong here." };
  const text = findingText(f);
  if (text.length < 20) return { ok: false, error: "That finding has too little to add." };

  const sourceId = await createSource(clientId, "market", label(f.headline), null);
  try {
    await inngest.send({ name: "brain/ingest.source", data: { sourceId, clientId, type: "market", uri: label(f.headline), text, includePath: null, kind: "market" } });
  } catch {
    return { ok: false, error: "The ingestion engine is not connected (Inngest)." };
  }
  // Mark it accepted too, so it stays standing research for the desks (a re-run reports against it, does not restate it).
  await setIntelStatus(clientId, intelId, "accepted").catch(() => {});
  return { ok: true, sourceId };
}
