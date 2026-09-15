import { createHash } from "crypto";
import { db } from "./db";
import { embed, rerank, toVectorLiteral, EMBED_MODEL } from "./vendors/voyage";
import { recordUsage } from "./usage";

// CLEAN SCRAPED WEB CONTENT before it becomes brain knowledge (Gary: the scrape must be world-class, not a raw
// dump). Firecrawl markdown carries a lot of non-knowledge: nav/blog-index link soup, image + CDN URLs, cookie
// and privacy boilerplate, Cloudflare bot-challenge text, and the HTML5 video-player caption UI. None of that is
// what the brain should retrieve on. Applied to CRAWLED/SCRAPED/FILE content only, never to a human's pasted note.
export function cleanScraped(md: string): string {
  let s = String(md || "");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");            // markdown images: drop entirely
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");           // markdown links: keep the text, drop the URL
  s = s.replace(/https?:\/\/\S+/g, " ");                   // any remaining bare URLs / asset refs
  s = s.replace(/\\\s*$/gm, " ").replace(/\\+/g, " ");      // stray markdown line-continuation backslashes
  // Kill whole lines that are Cloudflare/bot-challenge, cookie-consent or the video-player caption UI.
  s = s.split("\n").filter((line) => {
    const l = line.trim();
    if (!l) return false;
    // Cloudflare/bot-challenge lines only. "troubleshoot"/"refresh" were dropped standalone before, which also
    // killed legitimate copy ("refresh your brand", "troubleshoot your campaign") - now they only count when a
    // challenge-specific token is also present on the line (M2).
    if (/(turnstile|challenge-platform|cloudflare|verification (failed|expired))/i.test(l)) return false;
    if (/(troubleshoot|refresh)/i.test(l) && /(ray id|performance & security|attention required|are you a robot|checking your browser)/i.test(l)) return false;
    if (/(TextColor|Caption Area|Opacity(Opaque|Semi-Transparent)|Semi-TransparentTransparent|Beginning of dialog window|modal window|Escape will cancel|Fullscreen|enable JavaScript|upgrading to a)/i.test(l)) return false;
    if (/^(we use cookies|this site uses cookies|accept( all)? cookies)/i.test(l)) return false;
    return true;
  }).join("\n");
  return s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// Is a chunk junk we should NOT store? Two tests: too little actual prose (mostly symbols/nav after cleaning),
// or clear cookie/privacy legalese, which is not marketing knowledge. Kept moderate so real copy is never dropped.
export function isJunkChunk(c: string): boolean {
  const letters = (c.match(/[a-z]/gi) || []).length;
  const words = (c.match(/[a-z]{2,}/gi) || []).length;
  // Drop only genuine fragments: almost no prose, OR short AND with too few words to be a sentence. A punchy real
  // line ("We never charge a monthly fee") is 6+ words and now survives, while a 3-word nav crumb still goes (M1).
  if (letters < 25 || (letters < 60 && words < 6)) return true;
  const lc = c.toLowerCase();
  const legal = ["privacy policy", "personally identifying", "cookies", "third-party vendors", "google adwords", "google display network", "ip address", "web browsers and servers"];
  return legal.filter((k) => lc.includes(k)).length >= 2;
}

// A stable content hash for de-duplication: normalise (lowercase, strip non-alphanumerics) then SHA1. Two chunks
// that say the same thing collapse to the same hash even if whitespace or punctuation differs.
export function contentHash(c: string): string {
  const norm = c.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha1").update(norm).digest("hex");
}

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
// CONTEXTUAL HEADER (Anthropic's contextual-retrieval idea, kept cheap). A crawled chunk like "R50 minimum,
// repaid in 30 days" is useless to retrieval without knowing it is about MoMo Nano Credit: the embedding and the
// lexical index both need the SUBJECT on the chunk. So the page title is prepended as one short lead line to
// every chunk that does not already open with it. Applied AFTER the junk filter (see the ingest), so prepending
// the title can never rescue a nav crumb the junk test would otherwise have dropped.
export function withContextHeader(chunks: string[], context?: string): string[] {
  const ctx = (context || "").trim().replace(/^#+\s*/, "").slice(0, 120);
  if (!ctx) return chunks;
  const lc = ctx.toLowerCase();
  return chunks.map((c) => c.slice(0, ctx.length + 4).toLowerCase().includes(lc) ? c : `${ctx}\n\n${c}`);
}

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
  //
  // CRAWLED PAGES USE MARKDOWN HEADINGS, not the "--- X ---" doctrine form, so a "# Fees" / "## Eligibility"
  // is just as much a hard wall as a doctrine banner. Splitting on either keeps a crawled page's own structure
  // intact instead of guillotining it at ~1200 characters like the old plain chunker did.
  const sections = clean
    .split(/\n(?=(?:-{2,}\s*[A-Z][^\n]*?-{2,}\s*(?:\n|$))|(?:#{1,6}\s+\S))/)
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
    // START THE NEXT CHUNK ON A CLEAN BOUNDARY, never mid-word. The end is already nudged to a sentence break,
    // but the overlap start (end - overlap) is a raw character offset that lands inside a word - which is why
    // every passage after the first read "...oved continuously" / "...ans can do". Snap forward to the start of
    // a sentence within the overlap window if there is one, otherwise to the next whole word.
    let next = end - overlap;
    const win = clean.slice(next, end);
    const sent = win.search(/[.!?]\s+\S/);
    if (sent >= 0) {
      next += sent + (win.slice(sent).match(/[.!?]\s+/)?.[0].length ?? 1);
    } else {
      const sp = clean.indexOf(" ", next);
      if (sp >= 0 && sp < end) next = sp + 1;
    }
    i = next;
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
  // DE-DUPLICATION (Gary: no duplication ever), scoped to THIS SOURCE - not the whole brain. Cross-source dedup
  // was a silent knowledge-loss trap: a passage shared by two sources was stored once, owned by whichever source
  // ingested first, so deleting or re-crawling that source erased content the OTHER source still legitimately
  // supplied. Now each source keeps its own copy (delete-safe and self-contained); a shared passage is collapsed
  // to one at RETRIEVAL time (see retrieve()), so the model never sees a duplicate even though two sources hold
  // it. Null-source chunks (doctrine, saved answers) share one scope per brain via the coalesce below.
  //
  // The app-level skip below only avoids paying to embed a chunk we already have; the real guarantee is the
  // unique index (client_id, coalesce(source_id), metadata->>'h') + ON CONFLICT DO NOTHING on the insert, so even
  // if this read fails on a transient blip, a duplicate row still cannot be written.
  const existing = (await db().query(
    `select metadata->>'h' as h from knowledge_chunks
      where client_id = $1 and coalesce(source_id::text, '') = coalesce($2::text, '') and metadata->>'h' is not null`,
    [clientId, sourceId],
  ).catch(() => [])) as { h: string }[];
  const seen = new Set(existing.map((r) => r.h).filter(Boolean));
  const deduped: { content: string; metadata: Record<string, unknown> }[] = [];
  for (const it of filtered) {
    const h = contentHash(it.content);
    if (seen.has(h)) continue;
    seen.add(h);
    deduped.push({ content: it.content, metadata: { ...(it.metadata ?? {}), h } });
  }
  if (!deduped.length) return 0;
  let stored = 0;
  const BATCH = 32;
  for (let b = 0; b < deduped.length; b += BATCH) {
    const batch = deduped.slice(b, b + BATCH);
    const vectors = await embed(batch.map((x) => x.content), "document");
    for (let j = 0; j < batch.length; j++) {
      // ON CONFLICT DO NOTHING is the blip-proof backstop; RETURNING id tells us whether the row was actually
      // written, so `stored` counts real inserts (and metering counts what truly landed).
      const ins = (await db().query(
        `insert into knowledge_chunks (client_id, source_id, content, embedding, metadata, embedding_model)
         values ($1, $2, $3, $4::vector, $5, $6)
         on conflict do nothing
         returning id`,
        [clientId, sourceId, batch[j].content, toVectorLiteral(vectors[j]), JSON.stringify(batch[j].metadata ?? {}), EMBED_MODEL],
      )) as { id: string }[];
      if (ins.length) stored++;
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
  const ids = await brainChunkIds(clientId);
  if (!ids.length) return 0;
  let done = 0;
  const BATCH = 32;
  for (let b = 0; b < ids.length; b += BATCH) {
    done += await reembedChunks(clientId, ids.slice(b, b + BATCH));
  }
  return done;
}

// The chunk ids for a brain, oldest first. Kept light (ids only) so a durable re-index job can hold the full
// worklist in one small step and then re-embed it batch by batch, each batch its own retryable step.
export async function brainChunkIds(clientId: string): Promise<string[]> {
  const rows = (await db().query(
    `select id from knowledge_chunks where client_id = $1 order by created_at`,
    [clientId],
  )) as { id: string }[];
  return rows.map((r) => r.id);
}

// Re-embed a specific set of chunks with the CURRENT model. client_id is in every WHERE - the isolation
// guarantee holds even when the caller supplies ids. Returns how many were actually re-embedded.
export async function reembedChunks(clientId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = (await db().query(
    `select id, content from knowledge_chunks where client_id = $1 and id = any($2::uuid[])`,
    [clientId, ids],
  )) as { id: string; content: string }[];
  if (!rows.length) return 0;
  const vectors = await embed(rows.map((r) => r.content), "document");
  let done = 0;
  for (let j = 0; j < rows.length; j++) {
    await db().query(
      `update knowledge_chunks set embedding = $1::vector, embedding_model = $4 where id = $2 and client_id = $3`,
      [toVectorLiteral(vectors[j]), rows[j].id, clientId, EMBED_MODEL],
    );
    done++;
  }
  return done;
}

export type Retrieved = { content: string; metadata: Record<string, unknown>; score: number };

// HYBRID RETRIEVAL tuning. Cast a wide, cheap net with two retrievers, fuse, then rerank a bounded shortlist.
const DENSE_N = 60;    // dense (vector) candidates pulled - wider so duplicate-heavy brains still yield enough DISTINCT
const LEX_N = 60;      // lexical (tsvector) candidates pulled
const RRF_K = 60;      // Reciprocal Rank Fusion damping (the standard constant); larger flattens each rank's pull
const SHORTLIST = 30;  // how many fused candidates the reranker actually scores
const RERANK_FLOOR = 0.05; // drop passages the cross-encoder scores as clearly irrelevant (but never return empty)

// Retrieve the top-k most relevant chunks for a query, HARD-SCOPED to one brain.
//
// Three stages, best-in-class RAG retrieval:
//   1. DENSE (semantic) - the Voyage query embedding vs the chunk embeddings (pgvector cosine). Great at meaning,
//      weak on exact tokens (a product name, a price, a person) that the embedding smooths into a topic.
//   2. LEXICAL (exact term) - a Postgres tsvector match. Great at the exact tokens dense misses.
//   3. FUSE the two by Reciprocal Rank Fusion, then RERANK the shortlist with Voyage rerank-2.5 (a cross-encoder
//      that reads the query and each passage together), which is the real accuracy lever.
//
// The `client_id = $1` filter on EVERY query is the brain-isolation guarantee. Every stage degrades gracefully:
// no embedding, no lexical match, or a reranker outage each fall back to what the remaining stages found, so a
// question always gets the best answer available rather than an error.
export async function retrieve(clientId: string, query: string, k = 6, opts?: { userEmail?: string | null }): Promise<Retrieved[]> {
  const q = String(query || "").trim();
  if (!q) return [];
  const [qv] = await embed([q], "query").catch(() => [] as number[][]);
  // METER the query embedding (audit P3): every paid Voyage call is recorded, even though the query embed is priced
  // at zero today - so Cost Control never has an invisible paid call. Best-effort, never blocks retrieval.
  if (qv) await recordUsage({ clientId, userEmail: opts?.userEmail ?? null, provider: "voyage", model: EMBED_MODEL, unit: "embed", action: "query-embed", count: 1 }).catch(() => {});

  // The two halves run in parallel. websearch_to_tsquery parses free user text safely (nothing to escape) and
  // returns an empty query for all-stopword input, in which case the lexical half matches nothing and the dense
  // half carries the retrieval on its own.
  const runDense = async (): Promise<Retrieved[]> => {
    if (!qv) return [];
    try {
      // MODEL-CONSISTENCY GATE (audit P1): score ONLY chunks embedded under the CURRENT model. Vectors from a
      // different Voyage model are 1024-dim but not comparable, so mixing them is silent noise; excluding them here
      // means a model change can never quietly corrupt recall - the mismatched rows simply don't score until the
      // brain is re-indexed. (Untagged legacy rows are treated as current, since retrieval on them works today.)
      return (await db().query(
        `select content, metadata, 1 - (embedding <=> $2::vector) as score
         from knowledge_chunks
         where client_id = $1 and embedding is not null and (embedding_model = $4 or embedding_model is null)
         order by embedding <=> $2::vector
         limit $3`,
        [clientId, toVectorLiteral(qv), DENSE_N, EMBED_MODEL],
      )) as Retrieved[];
    } catch { return []; }
  };
  const runLex = async (): Promise<Retrieved[]> => {
    try {
      return (await db().query(
        `select content, metadata, ts_rank_cd(content_tsv, websearch_to_tsquery('english', $2)) as score
         from knowledge_chunks
         where client_id = $1 and content_tsv @@ websearch_to_tsquery('english', $2)
         order by score desc
         limit $3`,
        [clientId, q, LEX_N],
      )) as Retrieved[];
    } catch { return []; }
  };
  const [dense, lex] = await Promise.all([runDense(), runLex()]);

  // RECIPROCAL RANK FUSION. Combine the lists by RANK, not raw score: cosine and ts_rank live on different
  // scales, and normalising them is brittle. RRF sums 1/(K + rank) across the lists a passage appears in, which
  // rewards agreement between the two retrievers with no scale juggling. Fusion also does the dedup - keying by
  // content hash collapses a passage two sources both hold (per-source storage lets it show up in either list).
  const fused = new Map<string, { row: Retrieved; rrf: number }>();
  const addList = (rows: Retrieved[]) => {
    rows.forEach((row, i) => {
      const h = (row.metadata?.h as string) || contentHash(row.content);
      const inc = 1 / (RRF_K + i + 1);
      const cur = fused.get(h);
      if (cur) cur.rrf += inc;
      else fused.set(h, { row, rrf: inc });
    });
  };
  addList(dense);
  addList(lex);
  if (!fused.size) return [];

  const shortEntries = [...fused.values()].sort((a, b) => b.rrf - a.rrf).slice(0, SHORTLIST);
  const shortlist = shortEntries.map((x) => x.row);
  const maxRrf = shortEntries[0]?.rrf || 1;

  // RERANK the shortlist with the cross-encoder - the accuracy stage. If Voyage is unavailable or errors, DO NOT
  // fail retrieval: fall back to the RRF order, which is already a strong hybrid ranking. Degrade, never break.
  try {
    const scored = await rerank(q, shortlist.map((r) => r.content), k);
    if (scored.length) {
      await recordUsage({ clientId, userEmail: opts?.userEmail ?? null, provider: "voyage", model: "rerank-2.5", unit: "rerank", action: "brain-rerank", count: 1 }).catch(() => {});
      const ranked = scored.map((s) => ({ ...shortlist[s.index], score: s.score }));
      // FLOOR (audit P3): drop passages the cross-encoder scores as clearly irrelevant, so off-topic junk is not fed
      // to the answerer - but never return empty, keep the single best so a weak-but-only match can still answer
      // (the answer prompt itself says plainly when the passages do not cover the question).
      const kept = ranked.filter((r) => (r.score ?? 0) >= RERANK_FLOOR);
      return (kept.length ? kept : ranked.slice(0, 1)).slice(0, k);
    }
  } catch {
    // fall through to the fused order
  }
  // FALLBACK (rerank down): return the fused order with a NORMALISED rrf score in 0-1 (audit P3), so the score means
  // the same thing here as on the rerank path - a raw mixed cosine/ts_rank value made the strength chip and the
  // answer-audit top_score misleading whenever rerank was unavailable.
  return shortEntries.slice(0, k).map((x) => ({ ...x.row, score: Math.min(1, x.rrf / maxRrf) }));
}
