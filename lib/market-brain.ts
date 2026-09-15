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

// A readable, distinctive label for the Knowledge Sources line item (the source's uri column shows here).
const label = (headline: string) => `Market: ${String(headline || "market finding").trim()}`.slice(0, 140);

// The RAG content: the finding as a self-contained, sourced passage. Ends with the real source so retrieval can
// attribute it, and so a reader can always check it.
function findingText(f: { headline?: string; why_it_matters?: string; detail?: string; sources?: { name?: string; url?: string }[] | null; published_at?: string | null }): string {
  const srcs = (Array.isArray(f.sources) ? f.sources : []).filter((s) => s?.url);
  const srcLine = srcs.length ? `\n\nSources: ${srcs.map((s) => `${s.name || "source"} (${s.url})`).join(" · ")}` : "";
  const dateLine = f.published_at ? `\nPublished: ${f.published_at}` : "";
  return [String(f.headline || "").trim(), String(f.why_it_matters || "").trim(), String(f.detail || "").trim()]
    .filter(Boolean).join("\n\n") + srcLine + dateLine;
}

export type AddResult = { ok: true; sourceId: string } | { ok: false; error: string };

export async function addFindingToBrain(clientId: string, intelId: string): Promise<AddResult> {
  const rows = (await db().query(
    `select headline, why_it_matters, detail, sources, published_at from studio_intel where id = $1 and client_id = $2`,
    [intelId, clientId],
  )) as { headline: string; why_it_matters: string; detail: string; sources: { name?: string; url?: string }[] | null; published_at: string | null }[];
  const f = rows[0];
  if (!f) return { ok: false, error: "That finding is not on this brain." };
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
