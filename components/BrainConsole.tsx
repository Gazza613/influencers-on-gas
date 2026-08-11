"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";
import BrainKnowledge from "@/components/BrainKnowledge";
import BrainLibrary from "@/components/BrainLibrary";

type Source = { id: string; type: string; uri: string; status: string; chunk_count?: number; error?: string | null };
type Hit = { content: string; metadata: Record<string, unknown>; score: number };

type Mode = "website" | "documents" | "youtube" | "text" | "compliance" | "positioning";

// A professional 2px-stroke mark per source type, in the brain's violet->cyan family (via currentColor).
function SourceIcon({ m }: { m: Mode }) {
  const paths: Record<Mode, string> = {
    website: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.5 5.8 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.8-3.5-9s1-6.5 3.5-9Z"/>`,
    documents: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>`,
    youtube: `<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>`,
    text: `<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>`,
    compliance: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .58-.91l7-3.5a1 1 0 0 1 .84 0l7 3.5A1 1 0 0 1 20 6Z"/><path d="m9 12 2 2 4-4"/>`,
    positioning: `<path d="m12 3 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.9l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76z"/>`,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]" aria-hidden dangerouslySetInnerHTML={{ __html: paths[m] }} />;
}

export default function BrainConsole({ brainId, initialSources, chunkCount = 0, initialDoctrine = "" }: { brainId: string; initialSources: Source[]; chunkCount?: number; initialDoctrine?: string }) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [mode, setMode] = useState<Mode>("website");
  const [progress, setProgress] = useState("");
  const [sites, setSites] = useState<string[]>([""]);      // multi-site website scrape
  const [fullSite, setFullSite] = useState(true);          // full-site crawl vs a single page
  const [text, setText] = useState("");
  const [compliance, setCompliance] = useState("");
  const [doctrine, setDoctrine] = useState(initialDoctrine);
  const [savingDoc, setSavingDoc] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [answer, setAnswer] = useState("");
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

  // WEBSITE(S). Multi-site: each row is scraped. Full-site crawls every page it can reach (no path scope);
  // single-page reads just that URL. Both keep each page's own title + URL so a passage traces back to source.
  async function addWebsites() {
    const list = sites.map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
    if (!list.length) { setAddErr("Enter at least one website URL (https://…)."); return; }
    if (adding) return;
    setAdding(true); setAddErr("");
    const failed: string[] = [];
    for (const site of list) {
      const r = await fetch(`/api/brains/${brainId}/sources`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullSite ? { type: "crawl", uri: site, includePath: "" } : { type: "website", uri: site }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) failed.push(`${site}: ${d?.error || "could not add"}`);
    }
    if (failed.length) setAddErr(failed.join(" · "));
    else { setSites([""]); flex(fullSite ? "Scraping the site now, every page it can reach." : "Reading the page now."); }
    await refresh(); setAdding(false);
  }

  // PASTE / COMPLIANCE. Both are pasted text; compliance is tagged kind:"compliance" so creative and the
  // proposal's governance page can retrieve that kind of passage specifically.
  async function addText(kind?: "compliance") {
    const val = (kind === "compliance" ? compliance : text).trim();
    if (val.length < 20) { setAddErr("Paste a bit more text to learn from."); return; }
    if (adding) return;
    setAdding(true); setAddErr("");
    const r = await fetch(`/api/brains/${brainId}/sources`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", text: val, ...(kind ? { kind } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setAddErr(d?.error || "Could not add"); setAdding(false); return; }
    if (kind === "compliance") setCompliance(""); else setText("");
    await refresh(); setAdding(false);
  }

  // POSITIONING & RULES (the brand doctrine, folded in). Saves to the brand kit and embeds it into the brain in
  // one action, so it is retrievable, no separate "sync" step.
  async function saveDoctrine() {
    if (savingDoc) return;
    if (doctrine.trim().length < 20) { setAddErr("Write a bit more positioning to learn from."); return; }
    setSavingDoc(true); setAddErr("");
    const s = await fetch(`/api/studio/brand-kit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: brainId, tone_notes: doctrine }) }).catch(() => null);
    if (!s?.ok) { setSavingDoc(false); flex("Could not save the positioning."); return; }
    const e = await fetch(`/api/brains/${brainId}/sync-doctrine`, { method: "POST" }).catch(() => null);
    const d = await e?.json().catch(() => ({}));
    setSavingDoc(false);
    if (e?.ok) { flex("Saved. The brain has learnt the positioning and rules."); await refresh(); }
    else flex(d?.error || "Saved, but could not embed it.");
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
    setQuerying(true); setQErr(""); setHits(null); setAnswer("");
    const r = await fetch(`/api/brains/${brainId}/query`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setQErr(d?.error || "Query failed"); setQuerying(false); return; }
    setHits(d.hits || []);
    setAnswer(d.answer || "");
    setQuerying(false);
  }

  const badge = (s: string) =>
    s === "indexed" ? "text-ready" : s === "failed" ? "text-alert" : "text-active";

  return (
    <div className="mt-6 space-y-6">
      {/* Add knowledge */}
      <div className="overflow-hidden rounded-2xl border border-[#a855f7]/25 bg-surface-1 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#a855f7]/15 text-[#c79bff]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden><path d="M12 3a4 4 0 0 0-4 4 3.5 3.5 0 0 0-2 6.3A3.5 3.5 0 0 0 8 20a4 4 0 0 0 8 0 3.5 3.5 0 0 0 2-6.7A3.5 3.5 0 0 0 16 7a4 4 0 0 0-4-4Z" /><path d="M12 7v13M8.5 10.5 12 12l3.5-1.5" /></svg>
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">Feed the knowledge</h2>
            <p className="text-base text-ink-dim">Everything here becomes the brain&apos;s memory: chunked, embedded, and retrievable by every desk.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          {([["website", "Website"], ["documents", "Documents"], ["youtube", "YouTube"], ["text", "Paste text"], ["compliance", "Compliance"], ["positioning", "Positioning & rules"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} disabled={m === "youtube"}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[15px] font-semibold transition ${mode === m ? "bg-[#a855f7]/15 text-[#c79bff] ring-1 ring-[#a855f7]/40" : m === "youtube" ? "cursor-not-allowed border border-line/70 text-ink-faint" : "border border-line text-ink-dim hover:border-line-strong hover:text-ink"}`}>
              <SourceIcon m={m} />{label}{m === "youtube" && <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-ink-faint">soon</span>}
            </button>
          ))}
        </div>

        <div className="mt-5">
        {mode === "documents" ? (
          <>
            {/* PDFs, decks, notes. Uploads straight to Blob and ingests as each one lands. */}
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-surface-2/50 px-4 py-8 text-center hover:border-[#a855f7]/50">
              <input type="file" multiple accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} disabled={adding} className="hidden" />
              <span className="text-base font-bold text-ink">Choose documents, or drop them here</span>
              <span className="text-base text-ink-dim">PDFs, decks, research, notes. Each one ingests as it lands.</span>
              <span className="mt-1 text-base text-ink-faint">PDF · TXT · MD · CSV, up to 50MB each</span>
            </label>
            {progress && <p className="mt-2 text-base text-ink-dim">Uploading {progress}…</p>}
          </>
        ) : mode === "website" ? (
          <>
            {/* Full site crawls every page it can reach (no path scope); single page reads just that URL. Each
                page keeps its own title + URL so a passage always traces back to its source. */}
            <div className="inline-flex rounded-lg border border-line p-1 text-[14px]">
              <button onClick={() => setFullSite(true)} className={`rounded-md px-3 py-1.5 font-semibold ${fullSite ? "bg-[#a855f7]/15 text-[#c79bff]" : "text-ink-dim hover:text-ink"}`}>Full site, all pages</button>
              <button onClick={() => setFullSite(false)} className={`rounded-md px-3 py-1.5 font-semibold ${!fullSite ? "bg-[#a855f7]/15 text-[#c79bff]" : "text-ink-dim hover:text-ink"}`}>Single page</button>
            </div>
            {sites.map((s, i) => (
              <div key={i} className="mt-2.5 flex gap-2">
                <input value={s} onChange={(e) => setSites((list) => list.map((x, j) => (j === i ? e.target.value : x)))} placeholder="https://the-client.com"
                  className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base outline-none focus:border-line-strong" />
                {sites.length > 1 && <button onClick={() => setSites((list) => list.filter((_, j) => j !== i))} aria-label="Remove this website" className="shrink-0 rounded-lg border border-line px-3 text-ink-faint hover:border-alert/50 hover:text-alert">✕</button>}
              </div>
            ))}
            <button onClick={() => setSites((list) => [...list, ""])} className="mt-2.5 text-[15px] font-semibold text-[#c79bff] hover:underline">+ Add another website</button>
            <div><button onClick={addWebsites} disabled={adding} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-base font-bold disabled:opacity-50">{adding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{adding ? "Reading and adding the pages…" : fullSite ? "Scrape and add every page" : "Add these pages"}</button></div>
            <p className="mt-2.5 text-base text-ink-dim">{fullSite ? "Reads every page it can reach, up to 80 per site. Takes a few minutes and keeps running if you close the tab." : "Reads just the page at each URL."}</p>
          </>
        ) : mode === "youtube" ? (
          <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-8 text-center">
            <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-faint"><SourceIcon m="youtube" /></span>
            <p className="text-base font-bold text-ink">YouTube channel ingestion</p>
            <p className="mt-1 text-base text-ink-dim">We will pull the channel&apos;s video transcripts into the brain, great for brand voice and thought leadership. This backend is being built next.</p>
          </div>
        ) : mode === "compliance" ? (
          <>
            <textarea value={compliance} onChange={(e) => setCompliance(e.target.value)} rows={5} placeholder="Paste the client's mandatory compliance copy: disclaimers, licence wording, advertising rules…"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base leading-relaxed outline-none focus:border-line-strong" />
            <button onClick={() => addText("compliance")} disabled={adding} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-base font-bold disabled:opacity-50">{adding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{adding ? "Adding…" : "Add compliance copy"}</button>
            <p className="mt-2.5 text-base text-ink-dim">Tagged as <b className="text-ink-dim">compliance</b> so creative and the proposal&apos;s governance page can pull it specifically.</p>
          </>
        ) : mode === "positioning" ? (
          <>
            <textarea value={doctrine} onChange={(e) => setDoctrine(e.target.value)} rows={7} placeholder="The client's positioning, brand rules and proof points. What they stand for, how they talk, what is true about them, what must never be said…"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base leading-relaxed outline-none focus:border-line-strong" />
            <button onClick={saveDoctrine} disabled={savingDoc} className="btn-brand mt-3 rounded-lg px-4 py-2.5 text-base font-bold disabled:opacity-50">{savingDoc ? "Saving…" : "Save & teach the brain"}</button>
            <p className="mt-2.5 text-base text-ink-dim">This is the <b className="text-ink-dim">brand doctrine</b>: positioning, rules and proof points. Saved and embedded automatically, no separate sync step.</p>
          </>
        ) : (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste brand notes, proof points, a transcript, a key document…"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base leading-relaxed outline-none focus:border-line-strong" />
            <button onClick={() => addText()} disabled={adding} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-base font-bold disabled:opacity-50">{adding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{adding ? "Adding…" : "Add to brain"}</button>
          </>
        )}
        </div>

        {addErr && <p className="mt-3 text-base text-alert">{addErr}</p>}
        {/* The isolation guarantee, said out loud where someone is about to hand us a client's private material. */}
        <p className="mt-4 text-base text-ink-faint">
          Everything added here is chunked and embedded into <b className="text-ink-dim">this brain only</b>. No other brain can read it.
        </p>
      </div>

      {/* Sources */}
      <div className="rounded-xl border border-line bg-surface-1 p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="tabular text-[16px] font-semibold uppercase tracking-[0.14em] text-ink-dim">Knowledge sources</div>
          {sources.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={reindex} disabled={reindexing} title="Rebuild every chunk's embedding with the current model. Needed once after an embedding-model change, otherwise retrieval returns noise. Your text is not touched." className="inline-flex items-center gap-1.5 rounded-md border border-[#a855f7]/40 px-2.5 py-1 text-[13px] font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{reindexing && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{reindexing ? "Re-indexing…" : "↻ Re-index"}</button>
              <button onClick={nukeAll} className="rounded-md border border-alert/40 px-2.5 py-1 text-[13px] font-semibold text-alert hover:bg-alert/10">Nuke all data</button>
            </div>
          )}
        </div>
        {sources.length === 0 ? (
          <p className="mt-3 text-base text-ink-dim">No sources yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="border-b border-line/60 py-2.5 text-base">
                <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ink">{s.type === "website" ? s.uri : s.uri || "Pasted note"}</span>
                <span className="flex shrink-0 items-center gap-3 text-[13px]">
                  <span className="text-ink-faint">{s.chunk_count ?? 0} chunks</span>
                  <span className={badge(s.status)}>{s.status === "pending" ? "indexing…" : s.status}</span>
                  <button onClick={() => removeSource(s)} title="Delete this source" aria-label="Delete this source" className="rounded px-1.5 py-0.5 text-ink-faint hover:bg-alert/15 hover:text-alert">✕</button>
                </span>
                </div>
                {/* The reason, in plain sight. A source that says only "failed" gives nobody anything to act on. */}
                {s.status === "failed" && s.error && (
                  <p className="mt-1.5 rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-base leading-relaxed text-alert">{s.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* WHAT IT KNOWS + WHAT IT BUILDS FROM. Both sit above "Test the brain" deliberately: when an answer
          comes back wrong the first question is "what is actually in there?", and that has to be one scroll
          away, not buried under the tools that add more. */}
      <BrainKnowledge brainId={brainId} total={chunkCount} />
      <BrainLibrary brainId={brainId} />

      {/* Test the brain */}
      <div className="rounded-xl border border-line bg-surface-1 p-6">
        <div className="tabular text-[16px] font-semibold uppercase tracking-[0.14em] text-ink-dim">Test the brain</div>
        <div className="mt-3 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runQuery()}
            placeholder="Ask the brain anything, e.g. who is the CEO? what is our positioning?"
            className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-base outline-none focus:border-line-strong" />
          <button onClick={runQuery} disabled={querying || !query.trim()} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink hover:border-line-strong disabled:opacity-50">
            {querying && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
            {querying ? "Thinking…" : "Ask"}
          </button>
        </div>
        {qErr && <p className="mt-2 text-sm text-alert">{qErr}</p>}
        {/* THE ANSWER, not a pile of search results. The passages stay below it so any answer can be checked
            against the material it was written from - that is what makes it trustworthy rather than just fluent. */}
        {answer && (
          <div className="mt-4 rounded-lg border border-[#a855f7]/35 bg-[#a855f7]/[0.07] p-4">
            <div className="tabular mb-2 text-[13px] uppercase tracking-[0.18em] text-[#c79bff]">The brain says</div>
            <p className="whitespace-pre-wrap text-[17px] leading-relaxed text-ink">{answer}</p>
          </div>
        )}
        {hits && hits.length === 0 && !answer && <p className="mt-3 text-base text-ink-dim">No matches. Feed the brain some knowledge first.</p>}
        {hits && hits.length > 0 && <p className="mt-4 text-base uppercase tracking-wider text-ink-faint">What it read to answer that</p>}
        {hits && hits.length > 0 && (
          <ul className="mt-3 space-y-2">
            {hits.map((h, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="tabular mb-1 text-[12px] text-ink-faint">match {Math.round(h.score * 100)}%{(h.metadata?.title as string) ? ` · ${h.metadata.title}` : ""}</div>
                <div className="text-base leading-relaxed text-ink-dim">{h.content.slice(0, 280)}{h.content.length > 280 ? "…" : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-alert/30 bg-alert/5 p-6">
        <div className="tabular text-[16px] font-semibold uppercase tracking-[0.14em] text-alert">Danger zone</div>
        <p className="mt-2 text-base text-ink-dim">Delete this entire brain and everything in it. This cannot be undone.</p>
        <button onClick={deleteBrainNow} className="mt-3 rounded-lg border border-alert/50 px-4 py-2 text-base font-semibold text-alert hover:bg-alert/10">🗑 Delete this brain</button>
      </div>
    </div>
  );
}
