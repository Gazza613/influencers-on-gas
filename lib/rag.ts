import { db } from "./db";
import { embed, toVectorLiteral } from "./vendors/voyage";

// Split text into overlapping chunks (~900 chars, ~120 overlap) on paragraph/sentence
// boundaries where possible. Keeps chunks embeddable and retrieval-friendly.
// CHUNK ON MEANING, NOT ON A CHARACTER COUNT.
//
// The plain chunker below slices at ~900 characters and only nudges to the nearest sentence break. On a
// structured document that guillotines facts apart: syncing the MoMo doctrine put "KAGISO MOTHIBI is CHIEF
// EXECUTIVE OF MTN MoMo SOUTH AFRICA" in one chunk and his title in the next, so the top-scoring passage for
// "who is the CEO?" discussed his title without ever naming him. Retrieval looked broken when the real fault
// was where the knife fell.
//
// A doctrine is written in paragraphs and sections, and those ARE the units of meaning. So: split on blank
// lines, keep each paragraph whole, and only pack neighbours together while they fit. A paragraph longer than
// the window still falls back to the character chunker, because something has to give - but that is now the
// exception rather than what happens to every fact in the document.
export function chunkStructured(text: string, size = 1200): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];

  // SECTION HEADINGS ARE HARD WALLS. A doctrine is written in titled sections ("--- LEADERSHIP ---",
  // "--- ZERO FEES ---"), and packing two of them into one chunk to use up the character budget is what
  // buried the CEO's name inside a passage about African Bank. A chunk that mixes topics scores weakly for
  // every one of them - the embedding is an average, so dilution is a direct retrieval loss.
  //
  // Splitting on the heading and KEEPING it at the top of its section also gives every chunk its own subject
  // line, which is what lets a short factual statement be found at all.
  const sections = clean
    .split(/\n(?=-{2,}\s*[A-Z][^\n]*?-{2,}\s*(?:\n|$))/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const section of sections) {
    const paras = section.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let buf = "";
    for (const p of paras) {
      if (p.length > size) {
        // Too big to keep whole. Flush, then fall back to the character chunker for this paragraph only.
        if (buf) { out.push(buf); buf = ""; }
        out.push(...chunkText(p, size, 120));
        continue;
      }
      // +2 for the blank line we rejoin with. Packing only ever happens WITHIN one section.
      if (buf && buf.length + p.length + 2 > size) { out.push(buf); buf = p; }
      else buf = buf ? `${buf}\n\n${p}` : p;
    }
    if (buf) out.push(buf);
  }
  return out;
}

export function chunkText(text: string, size = 900, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      // prefer to break on a paragraph or sentence boundary near the end
      const slice = clean.slice(i, end);
      const br = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (br > size * 0.5) end = i + br + 1;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return chunks;
}


// Drop everything a source previously taught the brain. Called before a re-ingest so the operation is
// idempotent: a retried or re-run source REPLACES its chunks instead of adding a second copy of them.
export async function clearSourceChunks(sourceId: string): Promise<void> {
  await db().query(`delete from knowledge_chunks where source_id = $1`, [sourceId]);
}

// Embed + store chunks for a brain. ALWAYS scoped to clientId. Embeds in batches.
export async function ingestChunks(
  clientId: string,
  sourceId: string | null,
  items: { content: string; metadata?: Record<string, unknown> }[],
): Promise<number> {
  const filtered = items.filter((x) => x.content.trim().length > 0);
  if (!filtered.length) return 0;
  let stored = 0;
  const BATCH = 32;
  for (let b = 0; b < filtered.length; b += BATCH) {
    const batch = filtered.slice(b, b + BATCH);
    const vectors = await embed(batch.map((x) => x.content), "document");
    for (let j = 0; j < batch.length; j++) {
      await db().query(
        `insert into knowledge_chunks (client_id, source_id, content, embedding, metadata)
         values ($1, $2, $3, $4::vector, $5)`,
        [clientId, sourceId, batch[j].content, toVectorLiteral(vectors[j]), JSON.stringify(batch[j].metadata ?? {})],
      );
      stored++;
    }
  }
  return stored;
}

// RE-INDEX a brain: recompute every chunk's embedding with the CURRENT model, in place.
//
// Vectors from different Voyage models are not comparable. Embedding a query with voyage-4-lite and comparing
// it to documents embedded with voyage-3.5 yields meaningless similarity - both are 1024-dim, so nothing errors,
// the retrieval just silently returns noise. Every brain ingested before the model switch is in exactly that
// state and must be re-embedded once. The chunk CONTENT is stored, so this is lossless: no re-crawl, no need to
// re-paste a note, nothing to lose. Scoped to one client_id, which is the brain-isolation guarantee.
export async function reembedBrain(clientId: string): Promise<number> {
  const rows = (await db().query(
    `select id, content from knowledge_chunks where client_id = $1 order by created_at`,
    [clientId],
  )) as { id: string; content: string }[];
  if (!rows.length) return 0;

  let done = 0;
  const BATCH = 32;
  for (let b = 0; b < rows.length; b += BATCH) {
    const batch = rows.slice(b, b + BATCH);
    const vectors = await embed(batch.map((r) => r.content), "document");
    for (let j = 0; j < batch.length; j++) {
      await db().query(
        `update knowledge_chunks set embedding = $1::vector where id = $2 and client_id = $3`,
        [toVectorLiteral(vectors[j]), batch[j].id, clientId],
      );
      done++;
    }
  }
  return done;
}

export type Retrieved = { content: string; metadata: Record<string, unknown>; score: number };

// Retrieve the top-k most relevant chunks for a query, HARD-SCOPED to one brain.
// The `client_id = $1` filter is the isolation guarantee.
export async function retrieve(clientId: string, query: string, k = 6): Promise<Retrieved[]> {
  const [qv] = await embed([query], "query");
  if (!qv) return [];
  return (await db().query(
    `select content, metadata, 1 - (embedding <=> $2::vector) as score
     from knowledge_chunks
     where client_id = $1 and embedding is not null
     order by embedding <=> $2::vector
     limit $3`,
    [clientId, toVectorLiteral(qv), k],
  )) as Retrieved[];
}
