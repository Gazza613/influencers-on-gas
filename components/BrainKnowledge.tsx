"use client";

import { useCallback, useEffect, useState } from "react";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

// WHAT THE BRAIN ACTUALLY KNOWS (Gary: "it says 159 chunks in the brain but how do we see that and maybe even
// remove if we feel it is off on a specific data input? THIS IS KEY TO GETTING THE BRAIN 100% KNOWLEDGABLE").
//
// A chunk is one passage the brain retrieves from. Until now the brain reported a COUNT and showed none of
// them, which meant a wrong fact inside an otherwise good document could only be removed by deleting the whole
// document. That is exactly how the R5 false positioning survived: not because nobody would have cut it, but
// because nobody could see it to cut.
//
// Two jobs, in this order:
//   1. SEARCH IT. Type "R5" or "MAU" and see every passage that mentions it. Literal substring, not semantic -
//      when you are auditing for a specific wrong claim you want the actual words, not the neighbourhood.
//   2. CUT ONE OUT. Deleting a chunk removes its embedding with it, so the brain stops retrieving it at once.

type Chunk = {
  id: string; content: string; source_id: string | null;
  source_uri: string | null; source_type: string | null; added: string;
  metadata?: { url?: string; campaign?: string; title?: string; kind?: string } | null;
};

// WHERE A PASSAGE CAME FROM. Not every chunk has a knowledge_sources row behind it - the funnel ingestion
// writes chunks with their origin in `metadata` and no source_id at all, which is most of the MoMo brain. So
// the source row is only the FIRST place to look, and metadata is the fallback. Without this the inspector
// would render a blank line above most passages and look broken.
function originOf(c: Chunk): string {
  if (c.source_uri) return c.source_type === "website" ? c.source_uri : c.source_uri;
  const m = c.metadata || {};
  return m.campaign || m.title || m.url || "Origin not recorded";
}

export default function BrainKnowledge({ brainId, total }: { brainId: string; total: number }) {
  const [open, setOpen] = useState(false);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [count, setCount] = useState(total);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");     // the term actually applied, so the heading cannot lie
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [duplicates, setDuplicates] = useState(0);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async (nextOffset: number, search: string) => {
    setLoading(true);
    const u = `/api/brains/${brainId}/chunks?offset=${nextOffset}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
    const d = await fetch(u, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.chunks) {
      // Append when paging, replace when the search changes - otherwise "Load more" would wipe what you read.
      setChunks((prev) => (nextOffset === 0 ? d.chunks : [...prev, ...d.chunks]));
      setCount(d.total);
      setDuplicates(d.duplicates ?? 0);
      setOffset(nextOffset);
      setTerm(search);
    }
    setLoading(false);
  }, [brainId]);

  useEffect(() => { if (open && chunks.length === 0) load(0, ""); }, [open, chunks.length, load]);

  async function remove(c: Chunk) {
    const preview = c.content.slice(0, 180) + (c.content.length > 180 ? "…" : "");
    if (!(await askConfirm({
      title: "Remove this passage from the brain?",
      body: `"${preview}"\n\nThe brain stops retrieving it immediately. Its source stays, and every other passage in that source is untouched.`,
      tone: "danger", confirmLabel: "Remove it",
    }))) return;
    const r = await fetch(`/api/brains/${brainId}/chunks?chunkId=${encodeURIComponent(c.id)}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      setChunks((list) => list.filter((x) => x.id !== c.id));
      setCount((n) => Math.max(0, n - 1));
      flex("Gone. The brain will not use that passage again.");
    } else flex("Could not remove that passage. Please try again.");
  }

  // Keeps the oldest copy of each identical passage, drops the rest. Every distinct fact survives.
  async function dedupe() {
    if (cleaning) return;
    if (!(await askConfirm({
      title: `Remove ${duplicates} duplicate passage${duplicates === 1 ? "" : "s"}?`,
      body: "One copy of every passage is kept, so the brain loses no facts at all - only the repetition. This makes its answers better, because retrieval stops spending its few slots on the same text twice.",
      confirmLabel: "Remove duplicates",
    }))) return;
    setCleaning(true);
    const r = await fetch(`/api/brains/${brainId}/chunks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dedupe" }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setCleaning(false);
    if (r?.ok) {
      setChunks([]); await load(0, term);
      flex(`Removed ${d.removed} duplicate passage${d.removed === 1 ? "" : "s"}. Every distinct fact is still there.`);
    } else flex("Could not clean up the duplicates. Please try again.");
  }

  function search(e?: React.FormEvent) {
    e?.preventDefault();
    setChunks([]);
    load(0, q.trim());
  }

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-6">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <div className="tabular text-sm uppercase tracking-[0.2em] text-ink-faint">What the brain knows</div>
          <p className="mt-1.5 text-base text-ink-dim">
            Read every passage the brain retrieves from, and cut out anything that is wrong.
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-line px-3.5 py-2 text-base font-bold text-ink">
          {open ? "Hide" : `Inspect ${total} passage${total === 1 ? "" : "s"}`}
        </span>
      </button>

      {open && (
        <div className="mt-5">
          <form onSubmit={search} className="flex gap-2">
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find the exact words, e.g. R5, MAU, zero fees"
              className="flex-1 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base outline-none focus:border-line-strong"
            />
            <button type="submit" className="rounded-lg border border-line px-4 py-2.5 text-base font-semibold text-ink hover:border-line-strong">Search</button>
            {term && (
              <button type="button" onClick={() => { setQ(""); setChunks([]); load(0, ""); }}
                className="rounded-lg px-3 py-2.5 text-base font-semibold text-ink-dim hover:text-ink">Clear</button>
            )}
          </form>

          <p className="mt-3 text-base text-ink-dim">
            {term
              ? <><b className="text-ink">{count}</b> passage{count === 1 ? "" : "s"} mention &ldquo;{term}&rdquo;</>
              : <><b className="text-ink">{count}</b> passage{count === 1 ? "" : "s"} in this brain</>}
          </p>

          {/* REDUNDANCY IS A QUALITY BUG, NOT HOUSEKEEPING. Retrieval pulls only the top 5 passages into the
              answer, so a fact stored three times can take three of those five slots and push out two
              different facts. A brain full of repeats is a brain that answers badly while looking well fed. */}
          {duplicates > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-4 py-3">
              <p className="text-[15px] text-[#fcd34d]">
                <b>{duplicates} of these passages are exact duplicates.</b> The brain only reads its top few
                matches per question, so repeats crowd out facts it should be using instead.
              </p>
              <button onClick={dedupe} disabled={cleaning}
                className="shrink-0 rounded-lg border border-[#fbbf24]/50 px-3.5 py-2 text-[15px] font-bold text-[#fcd34d] hover:bg-[#fbbf24]/15 disabled:opacity-50">
                {cleaning ? "Cleaning…" : "Remove the duplicates"}
              </button>
            </div>
          )}

          <ul className="mt-3 space-y-2.5">
            {chunks.map((c) => {
              const isOpen = expanded[c.id];
              const long = c.content.length > 320;
              return (
                <li key={c.id} className="rounded-lg border border-line bg-surface-2 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="tabular min-w-0 truncate text-[13px] text-ink-faint">
                      {originOf(c)} · {c.added}
                    </div>
                    <button onClick={() => remove(c)} title="Remove this passage from the brain"
                      className="shrink-0 rounded px-2 py-0.5 text-[13px] font-semibold text-ink-faint hover:bg-alert/15 hover:text-alert">
                      Remove
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-dim">
                    {isOpen || !long ? c.content : c.content.slice(0, 320) + "…"}
                  </div>
                  {long && (
                    <button onClick={() => setExpanded((m) => ({ ...m, [c.id]: !isOpen }))}
                      className="mt-2 text-[14px] font-semibold text-[#c79bff] hover:underline">
                      {isOpen ? "Show less" : "Read the whole passage"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {!loading && chunks.length === 0 && (
            <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-base text-ink-dim">
              {term ? `Nothing in this brain mentions "${term}".` : "This brain holds nothing yet."}
            </p>
          )}
          {loading && <p className="mt-4 text-base text-ink-dim">Reading the brain…</p>}

          {chunks.length < count && !loading && (
            <button onClick={() => load(offset + 50, term)}
              className="mt-4 w-full rounded-lg border border-line py-2.5 text-base font-semibold text-ink-dim hover:text-ink">
              Load more ({count - chunks.length} to go)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
