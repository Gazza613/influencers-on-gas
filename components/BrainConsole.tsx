"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

type Source = { id: string; type: string; uri: string; status: string; chunk_count?: number };
type Hit = { content: string; metadata: Record<string, unknown>; score: number };

export default function BrainConsole({ brainId, initialSources }: { brainId: string; initialSources: Source[] }) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [mode, setMode] = useState<"website" | "text" | "file">("website");
  const [progress, setProgress] = useState("");
  const [uri, setUri] = useState("");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [querying, setQuerying] = useState(false);
  const [qErr, setQErr] = useState("");
  const [reindexing, setReindexing] = useState(false);

  async function refresh(tries = 0): Promise<void> {
    const r = await fetch(`/api/brains/${brainId}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setSources(d.sources);
      if (d.sources.some((s: Source) => s.status === "pending") && tries < 60) {
        await new Promise((res) => setTimeout(res, 4000));
        return refresh(tries + 1);
      }
    }
  }

  async function add() {
    if (adding) return;
    setAdding(true); setAddErr("");
    const r = await fetch(`/api/brains/${brainId}/sources`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "website" ? { type: "website", uri } : { type: "text", text }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setAddErr(d?.error || "Could not add source"); setAdding(false); return; }
    setUri(""); setText("");
    await refresh();
    setAdding(false);
  }

  // DOCUMENTS (articles, PDFs, decks, notes). Each file goes STRAIGHT to Blob from the browser - a serverless
  // request body caps around 4.5MB and a research PDF sails past it - then we register it, and it ingests as it
  // lands. Files are handled one at a time with the failures NAMED: dropping ten PDFs in and being told only
  // that "something went wrong" would be useless.
  async function addFiles(list: FileList | null) {
    if (!list?.length || adding) return;
    setAdding(true); setAddErr(""); setProgress("");
    const failed: string[] = [];
    let done = 0;
    for (const f of Array.from(list)) {
      setProgress(`${f.name} (${done + 1}/${list.length})`);
      try {
        const blob = await upload(`brains/${brainId}/${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/brains/blob-upload",
        });
        const r = await fetch(`/api/brains/${brainId}/sources`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "file", uri: blob.url, text: f.name }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) failed.push(`${f.name}: ${d?.error || "could not add"}`);
      } catch (e) {
        failed.push(`${f.name}: ${String((e as Error)?.message || e).slice(0, 90)}`);
      }
      done++;
    }
    setProgress("");
    if (failed.length) setAddErr(failed.join(" · "));
    else flex(`${done} document${done === 1 ? "" : "s"} added. The brain is reading ${done === 1 ? "it" : "them"} now.`);
    await refresh();
    setAdding(false);
  }

  async function removeSource(s: Source) {
    if (!(await askConfirm({ title: "Delete this source and everything it taught the brain?", body: `${s.uri} - This wipes its chunks and embeddings. It cannot be undone.`, tone: "danger", confirmLabel: "Delete" }))) return;
    await fetch(`/api/brains/${brainId}/sources?sourceId=${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => {});
    setSources((list) => list.filter((x) => x.id !== s.id));
  }

  async function nukeAll() {
    if (!(await askConfirm({ title: "NUKE all knowledge in this brain?", body: "Every source, chunk and embedding is permanently deleted. The brain stays but forgets everything. This cannot be undone.", tone: "danger", confirmLabel: "Nuke" }))) return;
    await fetch(`/api/brains/${brainId}/sources?sourceId=all`, { method: "DELETE" }).catch(() => {});
    setSources([]); setHits(null);
  }

  // RE-INDEX: re-embed the brain's existing chunks with the current embedding model. Needed once after an
  // embedding-model change, otherwise retrieval compares incompatible vectors and quietly returns noise.
  // Lossless: only the vectors are rebuilt, the stored text is untouched.
  async function reindex() {
    if (reindexing) return;
    if (!(await askConfirm({ title: "Re-index this brain?", body: "Rebuilds every chunk's embedding with the current model so retrieval works properly. Your sources and text are not touched. Takes a moment on a big brain.", confirmLabel: "Re-index" }))) return;
    setReindexing(true);
    const r = await fetch(`/api/brains/${brainId}/reindex`, { method: "POST" }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setReindexing(false);
    if (r?.ok) { setHits(null); flex(`Re-indexed ${d.chunks} chunk${d.chunks === 1 ? "" : "s"}. Retrieval is now accurate.`); }
    else flex(d?.error || "Could not re-index the brain.");
  }

  async function deleteBrainNow() {
    if (!(await askConfirm({ title: "Delete this entire brain?", body: "The brain and ALL its data are permanently removed. This cannot be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    const r = await fetch(`/api/brains/${brainId}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) window.location.href = "/setup/brains";
    else flex("Could not delete the brain. Please try again.");
  }

  async function runQuery() {
    if (!query.trim() || querying) return;
    setQuerying(true); setQErr(""); setHits(null);
    const r = await fetch(`/api/brains/${brainId}/query`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setQErr(d?.error || "Query failed"); setQuerying(false); return; }
    setHits(d.hits || []);
    setQuerying(false);
  }

  const badge = (s: string) =>
    s === "indexed" ? "text-ready" : s === "failed" ? "text-alert" : "text-active";

  return (
    <div className="mt-6 space-y-6">
      {/* Add knowledge */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Feed the brain</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {([["file", "Documents"], ["website", "Website or link"], ["text", "Paste text"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === m ? "bg-[#a855f7]/15 text-[#c79bff]" : "border border-line text-ink-dim hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>

        {mode === "file" ? (
          <>
            {/* Articles, PDFs, decks, notes. Uploads straight to Blob and ingests as each one lands. */}
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-surface-2/50 px-4 py-7 text-center hover:border-[#a855f7]/50">
              <input type="file" multiple accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} disabled={adding} className="hidden" />
              <span className="text-sm font-bold text-ink">Choose documents, or drop them here</span>
              <span className="text-[13px] text-ink-dim">Articles, PDFs, research, notes. Each one ingests as it lands.</span>
              <span className="mt-1 text-[12px] text-ink-faint">PDF · TXT · MD · CSV, up to 50MB each</span>
            </label>
            {progress && <p className="mt-2 text-[13px] text-ink-dim">Uploading {progress}…</p>}
          </>
        ) : mode === "website" ? (
          <>
            <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://an-article.com/the-piece"
              className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-line-strong" />
            <button onClick={add} disabled={adding} className="btn-brand mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
              {adding ? "Adding to brain…" : "Add to brain"}
            </button>
          </>
        ) : (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste brand notes, positioning, proof points, a transcript…"
              className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-line-strong" />
            <button onClick={add} disabled={adding} className="btn-brand mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
              {adding ? "Adding to brain…" : "Add to brain"}
            </button>
          </>
        )}

        {addErr && <p className="mt-2 text-[13px] text-alert">{addErr}</p>}
        {/* The isolation guarantee, said out loud where someone is about to hand us a client's private material. */}
        <p className="mt-3 text-[13px] text-ink-faint">
          Everything added here is chunked and embedded into <b className="text-ink-dim">this brain only</b>. No other brain can read it.
        </p>
      </div>

      {/* Sources */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Knowledge sources</div>
          {sources.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={reindex} disabled={reindexing} title="Rebuild every chunk's embedding with the current model. Needed once after an embedding-model change, otherwise retrieval returns noise. Your text is not touched." className="rounded-md border border-[#a855f7]/40 px-2.5 py-1 text-[11px] font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{reindexing ? "Re-indexing…" : "↻ Re-index"}</button>
              <button onClick={nukeAll} className="rounded-md border border-alert/40 px-2.5 py-1 text-[11px] font-semibold text-alert hover:bg-alert/10">Nuke all data</button>
            </div>
          )}
        </div>
        {sources.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">No sources yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">{s.type === "website" ? s.uri : s.uri || "Pasted note"}</span>
                <span className="flex shrink-0 items-center gap-3 text-[11px]">
                  <span className="text-ink-faint">{s.chunk_count ?? 0} chunks</span>
                  <span className={badge(s.status)}>{s.status === "pending" ? "indexing…" : s.status}</span>
                  <button onClick={() => removeSource(s)} title="Delete this source" aria-label="Delete this source" className="rounded px-1.5 py-0.5 text-ink-faint hover:bg-alert/15 hover:text-alert">✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Test the brain */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Test the brain</div>
        <div className="mt-3 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runQuery()}
            placeholder="Ask what the brain knows (e.g. what's the brand's positioning?)"
            className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-line-strong" />
          <button onClick={runQuery} disabled={querying || !query.trim()} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-line-strong disabled:opacity-50">
            {querying ? "Searching…" : "Search"}
          </button>
        </div>
        {qErr && <p className="mt-2 text-xs text-alert">{qErr}</p>}
        {hits && hits.length === 0 && <p className="mt-3 text-sm text-ink-dim">No matches. Feed the brain some knowledge first.</p>}
        {hits && hits.length > 0 && (
          <ul className="mt-3 space-y-2">
            {hits.map((h, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="tabular mb-1 text-[10px] text-ink-faint">match {Math.round(h.score * 100)}%{(h.metadata?.title as string) ? ` · ${h.metadata.title}` : ""}</div>
                <div className="text-[13px] leading-relaxed text-ink-dim">{h.content.slice(0, 280)}{h.content.length > 280 ? "…" : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-alert/30 bg-alert/5 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-alert">Danger zone</div>
        <p className="mt-2 text-[13px] text-ink-dim">Delete this entire brain and everything in it. This cannot be undone.</p>
        <button onClick={deleteBrainNow} className="mt-3 rounded-lg border border-alert/50 px-4 py-2 text-sm font-semibold text-alert hover:bg-alert/10">🗑 Delete this brain</button>
      </div>
    </div>
  );
}
