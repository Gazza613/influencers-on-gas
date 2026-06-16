"use client";

import { useState } from "react";

type Source = { id: string; type: string; uri: string; status: string; chunk_count?: number };
type Hit = { content: string; metadata: Record<string, unknown>; score: number };

export default function BrainConsole({ brainId, initialSources }: { brainId: string; initialSources: Source[] }) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [mode, setMode] = useState<"website" | "text">("website");
  const [uri, setUri] = useState("");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [querying, setQuerying] = useState(false);
  const [qErr, setQErr] = useState("");

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
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Feed the brain</div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setMode("website")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "website" ? "bg-[#a855f7]/15 text-[#c79bff]" : "border border-line text-ink-dim"}`}>Website</button>
          <button onClick={() => setMode("text")} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "text" ? "bg-[#a855f7]/15 text-[#c79bff]" : "border border-line text-ink-dim"}`}>Paste text</button>
        </div>
        {mode === "website" ? (
          <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://client-website.com/about"
            className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-line-strong" />
        ) : (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste brand notes, positioning, proof points…"
            className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-line-strong" />
        )}
        <button onClick={add} disabled={adding} className="btn-brand mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
          {adding ? "Adding to brain…" : "Add to brain"}
        </button>
        {addErr && <p className="mt-2 text-xs text-alert">{addErr}</p>}
        <p className="mt-2 text-[11px] text-ink-faint">Sources are scraped, chunked and embedded into this brain only.</p>
      </div>

      {/* Sources */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Knowledge sources</div>
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
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Test the brain */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Test the brain</div>
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
    </div>
  );
}
