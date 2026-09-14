"use client";

import { useCallback, useEffect, useState } from "react";

// THE CEO/MD PUBLISH + MEASURE VIEW (Gary, manual-metrics v1). A sent piece is posted to LinkedIn by the exec;
// here the team marks it published (URL + date) and enters reach / reactions / comments / reshares, and the
// platform trends what lands per exec. Sent pieces auto-appear; a piece posted from elsewhere can be added.
type Pub = {
  id: string; publisher: string; title: string; topic: string | null; linkedin_url: string | null;
  published_at: string | null; reach: number | null; reactions: number | null; comments: number | null; reshares: number | null;
};
type Summary = { publisher: string; posted: number; reach: number; reactions: number; comments: number; reshares: number; avg_reactions: number | null };
type Edit = { reach: string; reactions: string; comments: string; reshares: string; linkedin_url: string; published_at: string };

const API = "/api/studio/intel/publications";
const str = (n: number | null) => (n === null || n === undefined ? "" : String(n));

export default function Publications({ clientId }: { clientId: string }) {
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [savingId, setSavingId] = useState("");
  const [savedId, setSavedId] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPublisher, setNewPublisher] = useState<"ceo" | "md">("ceo");

  const load = useCallback(async () => {
    const d = await fetch(`${API}?clientId=${encodeURIComponent(clientId)}`).then((r) => r.json()).catch(() => null);
    if (!d) return;
    const list: Pub[] = Array.isArray(d.publications) ? d.publications : [];
    setPubs(list);
    setSummary(Array.isArray(d.summary) ? d.summary : []);
    setEdits(Object.fromEntries(list.map((p) => [p.id, {
      reach: str(p.reach), reactions: str(p.reactions), comments: str(p.comments), reshares: str(p.reshares),
      linkedin_url: p.linkedin_url || "", published_at: p.published_at || "",
    }])));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  function setField(id: string, k: keyof Edit, v: string) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
    setSavedId("");
  }

  async function saveRow(id: string) {
    const e = edits[id]; if (!e) return;
    setSavingId(id);
    const d = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", clientId, id, ...e }) }).then((r) => r.json()).catch(() => null);
    setSavingId("");
    if (d?.ok) { setSavedId(id); load(); }
  }

  async function addPiece() {
    const title = newTitle.trim(); if (!title) return;
    const d = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", clientId, title, publisher: newPublisher }) }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { setNewTitle(""); setAdding(false); load(); }
  }

  async function removeRow(id: string) {
    await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", clientId, id }) }).catch(() => {});
    load();
  }

  const who = (p: string) => (p === "md" ? "MD" : "CEO");

  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[16px] font-bold text-ink">Published pieces</h4>
        <button onClick={() => setAdding((v) => !v)} className="rounded-lg border border-accent/50 px-3 py-1 text-sm font-semibold text-accent hover:bg-accent/10">＋ Add a piece</button>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-dim">Mark a piece published and paste its reach, reactions, comments and reshares over time. The platform trends what lands.</p>

      {/* WHAT LANDS: per-exec totals + average reactions. */}
      {summary.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {summary.map((s) => (
            <div key={s.publisher} className="rounded-lg border border-line bg-surface-1 px-3 py-2">
              <div className="tabular text-[11px] uppercase tracking-[0.14em] text-ink-faint">{who(s.publisher)} · {s.posted} posted</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-dim">
                <span><b className="text-ink">{s.reactions.toLocaleString()}</b> reactions</span>
                <span><b className="text-ink">{s.comments.toLocaleString()}</b> comments</span>
                <span><b className="text-ink">{s.reach.toLocaleString()}</b> reach</span>
                {s.avg_reactions != null && <span className="text-ink-faint">avg {s.avg_reactions}/post</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-1 p-3">
          <label className="block flex-1">
            <span className="tabular block text-[11px] uppercase tracking-[0.16em] text-ink-faint">Title of the piece posted</span>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What the LinkedIn post was about"
              className="mt-1 w-full min-w-[220px] rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent" />
          </label>
          <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
            {(["ceo", "md"] as const).map((p) => (
              <button key={p} onClick={() => setNewPublisher(p)} className={`rounded-md px-3 py-1.5 font-semibold ${newPublisher === p ? "bg-accent/20 text-accent" : "text-ink-dim"}`}>{who(p)}</button>
            ))}
          </div>
          <button onClick={addPiece} disabled={!newTitle.trim()} className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-bold text-accent disabled:opacity-50">Add</button>
        </div>
      )}

      {pubs.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-faint">No pieces yet. Sending a CEO/MD article adds it here to measure, or add one you posted elsewhere.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {pubs.map((p) => {
            const e = edits[p.id] || { reach: "", reactions: "", comments: "", reshares: "", linkedin_url: "", published_at: "" };
            return (
              <div key={p.id} className="rounded-lg border border-line bg-surface-1 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="tabular text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">{who(p.publisher)}{p.published_at ? ` · ${p.published_at}` : " · not yet published"}</span>
                    <div className="truncate text-[14px] font-semibold text-ink">{p.title}</div>
                  </div>
                  <button onClick={() => removeRow(p.id)} className="rounded px-1.5 py-0.5 text-ink-faint hover:text-alert" title="Remove">✕</button>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="block"><span className="tabular block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Reactions</span>
                    <input inputMode="numeric" value={e.reactions} onChange={(ev) => setField(p.id, "reactions", ev.target.value)} className="mt-0.5 w-20 rounded border border-line bg-surface-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent" /></label>
                  <label className="block"><span className="tabular block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Comments</span>
                    <input inputMode="numeric" value={e.comments} onChange={(ev) => setField(p.id, "comments", ev.target.value)} className="mt-0.5 w-20 rounded border border-line bg-surface-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent" /></label>
                  <label className="block"><span className="tabular block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Reshares</span>
                    <input inputMode="numeric" value={e.reshares} onChange={(ev) => setField(p.id, "reshares", ev.target.value)} className="mt-0.5 w-20 rounded border border-line bg-surface-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent" /></label>
                  <label className="block"><span className="tabular block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Reach</span>
                    <input inputMode="numeric" value={e.reach} onChange={(ev) => setField(p.id, "reach", ev.target.value)} className="mt-0.5 w-24 rounded border border-line bg-surface-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent" /></label>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="block flex-1"><span className="tabular block text-[10px] uppercase tracking-[0.14em] text-ink-faint">LinkedIn post URL</span>
                    <input value={e.linkedin_url} onChange={(ev) => setField(p.id, "linkedin_url", ev.target.value)} placeholder="https://www.linkedin.com/posts/…" className="mt-0.5 w-full min-w-[200px] rounded border border-line bg-surface-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent" /></label>
                  <label className="block"><span className="tabular block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Published</span>
                    <input type="date" value={e.published_at} onChange={(ev) => setField(p.id, "published_at", ev.target.value)} className="mt-0.5 rounded border border-line bg-surface-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent" /></label>
                  <button onClick={() => saveRow(p.id)} disabled={savingId === p.id} className="rounded-lg bg-accent/20 px-4 py-1.5 text-sm font-bold text-accent disabled:opacity-50">{savingId === p.id ? "Saving…" : savedId === p.id ? "✓ Saved" : "Save"}</button>
                  {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">open ↗</a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
