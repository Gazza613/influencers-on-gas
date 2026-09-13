import { getSecret } from "../connections";

// Voyage embeddings → 1024-dim (Matryoshka), matching the pgvector column.
// voyage-4-lite: equal quality to legacy voyage-3.5 at ~3x lower cost ($0.02 vs $0.06 / Mtok).
// NOTE: v4 vectors are NOT compatible with 3.5 vectors, so any existing brain must be
// fully RE-INGESTED per client_id after this change (do not mix old + new vectors).
const BASE = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-4-lite";
export const EMBED_DIM = 1024;

async function key(): Promise<string> {
  const k = await getSecret("voyage");
  if (!k) throw new Error("Embeddings (Voyage) is not connected");
  return k;
}

// Embed one or more texts. input_type 'document' for stored knowledge, 'query' for
// retrieval queries (Voyage tunes the two differently for better recall).
export async function embed(texts: string[], inputType: "document" | "query" = "document"): Promise<number[][]> {
  if (!texts.length) return [];
  const k = await key();
  // Retry on 429: the free tier is 3 RPM, so spacing ~21s keeps ingestion working
  // (just slower) until a payment method lifts the limit.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType, output_dimension: EMBED_DIM }),
    });
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 21000));
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as { data?: { embedding: number[]; index: number }[]; detail?: string };
    if (!res.ok) throw new Error(`Voyage embed failed (${res.status}): ${(data.detail || JSON.stringify(data)).slice(0, 180)}`);
    return (data.data ?? []).sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

// pgvector literal for a query/insert parameter cast with ::vector.
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

// RERANK (cross-encoder). A bi-encoder embedding scores query and document independently, so it misses fine
// relevance ("who is the CEO" vs a passage that only mentions the CEO in passing). rerank-2.5 reads the query
// and each candidate TOGETHER and scores true relevance, which is why it belongs at the end of retrieval: cast a
// wide, cheap net first (dense + lexical), then let the expensive-but-accurate reranker pick the final order.
const RERANK_BASE = "https://api.voyageai.com/v1/rerank";
const RERANK_MODEL = "rerank-2.5";

export type RerankResult = { index: number; score: number };

// Score `documents` against `query`, most-relevant first. Returns the ORIGINAL index of each document plus its
// relevance score, so the caller maps results back to its own candidate array. `truncation` lets Voyage clip an
// over-long document rather than error the whole batch.
export async function rerank(query: string, documents: string[], topK?: number): Promise<RerankResult[]> {
  if (!documents.length) return [];
  const k = await key();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RERANK_BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: RERANK_MODEL, query, documents, top_k: topK ?? documents.length, truncation: true }),
    });
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 21000));
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as { data?: { index: number; relevance_score: number }[]; detail?: string };
    if (!res.ok) throw new Error(`Voyage rerank failed (${res.status}): ${(data.detail || JSON.stringify(data)).slice(0, 180)}`);
    return (data.data ?? []).map((d) => ({ index: d.index, score: d.relevance_score }));
  }
}
