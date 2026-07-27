"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flex } from "@/lib/flex";
import { askConfirm } from "@/lib/confirm";

// THE RESEARCHER (V3) + GATE 1. The Researcher COLLECTS facts, it never analyses (that is the Strategist's job).
// This screen commissions a collect, shows the fact base as typed claims - claim on the left, source and TIER
// inline on the right, so Gary can check what he is approving at a glance (spec 4.2) - and carries the Gate 1
// decision: Approve (locks the fact base, lets the Strategist start), Rerun with notes (a new version, never an
// overwrite), or Reject. The competitor set is editable right here.

type Client = { id: string; name: string };
type Run = { id: string; version: number; status: string; website: string | null; notes: string | null; created_at: string };
type Claim = {
  id: string; section: string; subject: string | null; claim: string;
  source_name: string | null; source_url: string | null; source_date: string | null;
  tier: number | null; verified: boolean; unverified_reason: string | null; conflict: string | null;
};
type Competitor = { id: string; name: string; website: string | null; added_by: string | null };

// The ten sections of the Research Document, in render order (spec 3.8). Kept here so this client component does
// not import the server engine. Unverified is last and visually set apart - nothing in it is a fact.
const SECTIONS: { id: string; label: string; blurb: string }[] = [
  { id: "snapshot", label: "Client snapshot", blurb: "Who they are, what they sell, where they play" },
  { id: "foundations", label: "Company foundations", blurb: "History, ownership, leadership, structure" },
  { id: "products", label: "Products and services", blurb: "Range, pricing where public, propositions" },
  { id: "market", label: "Market and category", blurb: "Size where sourced, dynamics, regulation" },
  { id: "digital", label: "Digital footprint", blurb: "Website, SEO basics, social presence" },
  { id: "competitor", label: "Competitor intelligence", blurb: "Observable public activity, client and each competitor" },
  { id: "competitor_set", label: "Competitor set", blurb: "A factual profile per competitor" },
  { id: "activity", label: "90-day activity log", blurb: "Dated, sourced developments" },
  { id: "customer_voice", label: "Customer voice", blurb: "Reviews, ratings, public sentiment" },
  { id: "unverified", label: "Unverified, treat as signal only", blurb: "Could not be verified; never cited as fact" },
];

const TIER: Record<number, { label: string; cls: string; title: string }> = {
  1: { label: "Tier 1", title: "Load-bearing: own channels, regulators, official releases, verified financials", cls: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" },
  2: { label: "Tier 2", title: "Reliable: established news, industry bodies, credible trade press, verified reviews", cls: "border-[#60a5fa]/40 bg-[#60a5fa]/10 text-[#93c5fd]" },
  3: { label: "Tier 3", title: "Directional: social, forums, single-source, unverified media", cls: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]" },
};

const STATUS: Record<string, { label: string; cls: string }> = {
  collecting: { label: "Collecting", cls: "border-line bg-surface-2 text-ink-dim" },
  ready: { label: "Awaiting your review", cls: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]" },
  gate1_approved: { label: "Approved · fact base locked", cls: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" },
  gate1_rejected: { label: "Rejected", cls: "border-[#f87171]/40 bg-[#f87171]/10 text-[#fca5a5]" },
  gate1_rerun: { label: "Superseded by a newer version", cls: "border-line bg-surface-2 text-ink-faint" },
};

function ukDate(s: string | null): string {
  if (!s) return "";
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  const day = dt.getUTCDate();
  const th = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${th} ${dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })} ${dt.getUTCFullYear()}`;
}

export default function ResearchGate({ clients, configured = [] }: { clients: Client[]; configured?: string[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(() => {
    const momo = clients.find((c) => /mo\s*mo|mtn/i.test(c.name));
    const briefed = clients.find((c) => configured.includes(c.id));
    return (momo || briefed || clients[0])?.id || "";
  });
  const [run, setRun] = useState<Run | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [newComp, setNewComp] = useState({ name: "", website: "" });
  const [progress, setProgress] = useState<null | { label: string; searches: string[]; sources: number; filed: number }>(null);
  const [elapsed, setElapsed] = useState(0);
  // Ground-truth website (Gary, material): the team offers up the client's real site so the collect can never
  // research a same-named but different business. Reuses the existing client-website endpoint.
  const [website, setWebsite] = useState("");
  const [siteSaved, setSiteSaved] = useState(false);

  const clientName = clients.find((c) => c.id === clientId)?.name || "the client";
  const isConfigured = configured.length === 0 || configured.includes(clientId);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    const d = await fetch(`/api/studio/researcher/collect?clientId=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setRun(d?.run || null);
    setClaims(Array.isArray(d?.claims) ? d.claims : []);
    setCompetitors(Array.isArray(d?.competitors) ? d.competitors : []);
  }, []);

  useEffect(() => { load(clientId); }, [clientId, load]);

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    fetch(`/api/studio/client-website?clientId=${clientId}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (live) { setWebsite(d?.website || ""); setSiteSaved(false); } }).catch(() => {});
    return () => { live = false; };
  }, [clientId]);

  useEffect(() => {
    if (!progress) { setElapsed(0); return; }
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [progress]);

  async function saveWebsite() {
    const r = await fetch("/api/studio/client-website", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, website }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setWebsite(r.website || ""); setSiteSaved(true); setTimeout(() => setSiteSaved(false), 1800); }
    else flex(r?.error || "Couldn't save the website.");
  }

  // Commission a collect. withNotes runs a "Rerun with notes" - a fresh VERSION addressing corrections, never an
  // overwrite. Streams the real searches, sources and claims as they land, so the run never feels like a dead bar.
  async function runCollect(withNotes?: string) {
    setRunning(true); setNote(""); setShowNotes(false);
    setProgress({ label: `Collecting facts on ${clientName}`, searches: [], sources: 0, filed: 0 });
    let version = 0, count = 0, errored = "";
    try {
      const resp = await fetch(`/api/studio/researcher/collect`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, notes: withNotes || "" }),
      });
      if (!resp.ok || !resp.body) throw new Error(`The Researcher could not start (${resp.status}).`);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let e: { t: string; label?: string; q?: string; n?: number; version?: number; count?: number; message?: string };
          try { e = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (e.t === "phase") setProgress((p) => p ? { ...p, label: e.label || p.label } : p);
          else if (e.t === "search") setProgress((p) => p ? { ...p, searches: [...p.searches, e.q || ""].slice(-6) } : p);
          else if (e.t === "sources") setProgress((p) => p ? { ...p, sources: e.n || p.sources } : p);
          else if (e.t === "claim") setProgress((p) => p ? { ...p, filed: p.filed + 1 } : p);
          else if (e.t === "run") { version = e.version || 0; count = e.count || 0; }
          else if (e.t === "error") errored = e.message || "The Researcher failed.";
        }
      }
    } catch (err) {
      errored = (err as Error)?.message || "Couldn't run the Researcher.";
    }
    setRunning(false); setProgress(null);
    if (errored) { setNote(errored); flex(errored); await load(clientId); return; }
    flex(`Research v${version} filed ${count} claim${count === 1 ? "" : "s"}, ready for your review.`);
    await load(clientId);
  }

  async function gate(action: "approve" | "reject") {
    if (!run) return;
    if (action === "reject" && !(await askConfirm({ title: `Reject research v${run.version}?`, body: "It is archived and the pipeline stops here for this client. You can commission a fresh run any time.", tone: "danger", confirmLabel: "Reject" }))) return;
    if (action === "approve" && !(await askConfirm({ title: `Approve research v${run.version} as the fact base?`, body: "It locks as the fact base and the Strategist can start from it. Approve facts you have checked.", confirmLabel: "Approve" }))) return;
    setBusy(true);
    const r = await fetch(`/api/studio/researcher/gate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, runId: run.id, action }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { flex(r?.error || "Couldn't record that."); return; }
    flex(action === "approve" ? "Approved. The fact base is locked." : "Rejected and archived.");
    await load(clientId);
  }

  async function addCompetitor() {
    const name = newComp.name.trim();
    if (!name) return;
    const r = await fetch(`/api/studio/researcher/competitors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, name, website: newComp.website.trim() }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setNewComp({ name: "", website: "" }); setCompetitors(r.competitors || []); }
    else flex(r?.error || "Couldn't add that competitor.");
  }

  async function removeCompetitor(c: Competitor) {
    const r = await fetch(`/api/studio/researcher/competitors?id=${c.id}&clientId=${clientId}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setCompetitors(r.competitors || []);
  }

  const status = run ? (STATUS[run.status] || STATUS.collecting) : null;
  const canGate = run?.status === "ready";
  const bySection = (id: string) => claims.filter((c) => c.section === id);

  return (
    <div className="mt-8">
      {/* CLIENT + GROUND TRUTH */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="block">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="mt-1 block w-72 rounded-lg border border-line bg-surface-1 px-3 py-2 text-lg outline-none focus:border-accent">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{configured.includes(c.id) ? "" : " (not researchable yet)"}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Ground-truth website</span>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.the-amber-room.co.za/"
              className="mt-1 block w-80 rounded-lg border border-line bg-surface-1 px-3 py-2 text-base outline-none focus:border-accent" />
          </label>
          <button onClick={saveWebsite} className="rounded-lg border border-line px-3 py-2 text-base font-semibold text-ink-dim hover:text-ink">
            {siteSaved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-faint">The website is the anchor: the Researcher only reports the organisation at this address, never a same-named business.</p>

      {/* RUN BAR */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={() => runCollect()} disabled={running || !isConfigured}
          className="rounded-lg bg-accent px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
          {running ? "Collecting…" : run ? "Collect again (new version)" : "Run the Researcher"}
        </button>
        {run && status && (
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${status.cls}`}>
            v{run.version} · {status.label}
          </span>
        )}
        {run && <span className="text-sm text-ink-faint">{claims.length} claim{claims.length === 1 ? "" : "s"} · collected {ukDate(run.created_at)}</span>}
      </div>
      {!isConfigured && <p className="mt-2 text-base text-[#fca5a5]">This brain has nothing to research yet. Add the client and crawl their site into the brain first.</p>}
      {note && <p className="mt-3 rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2.5 text-base text-[#fca5a5]">{note}</p>}

      {/* LIVE PROGRESS */}
      {progress && (
        <div className="mt-4 rounded-xl border border-line bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-ink">{progress.label}</div>
            <div className="tabular text-sm text-ink-faint">{elapsed}s · {progress.sources} sources · {progress.filed} filed</div>
          </div>
          {progress.searches.length > 0 && (
            <ul className="mt-3 space-y-1">
              {progress.searches.map((q, i) => <li key={i} className="truncate text-sm text-ink-dim">🔍 {q}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* GATE 1 ACTIONS */}
      {canGate && (
        <div className="mt-6 rounded-xl border border-[#fbbf24]/30 bg-[#fbbf24]/[0.06] p-5">
          <div className="text-lg font-bold text-ink">Gate 1 · your review</div>
          <p className="mt-1 text-base text-ink-dim">Approve the facts you have checked. Rerun with notes if anything is wrong, that files a fresh version and never overwrites this one.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => gate("approve")} disabled={busy}
              className="rounded-lg bg-[#4ade80] px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">Approve</button>
            <button onClick={() => setShowNotes((s) => !s)} disabled={busy}
              className="rounded-lg border border-line px-5 py-2.5 text-lg font-semibold text-ink hover:border-accent">Rerun with notes</button>
            <button onClick={() => gate("reject")} disabled={busy}
              className="rounded-lg border border-[#f87171]/40 px-5 py-2.5 text-lg font-semibold text-[#fca5a5] hover:bg-[#f87171]/10">Reject</button>
          </div>
          {showNotes && (
            <div className="mt-4">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="What to fix, referencing the section. e.g. 'Foundations: wrong founder, it is Suzanne Stevens.' 'Drop the theamberroom.co.za items, wrong business.'"
                className="block w-full rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-base outline-none focus:border-accent" />
              <button onClick={() => runCollect(notes)} disabled={running || !notes.trim()}
                className="mt-2 rounded-lg bg-accent px-4 py-2 text-base font-bold text-black disabled:opacity-50">Rerun with these notes</button>
            </div>
          )}
        </div>
      )}
      {run?.status === "gate1_approved" && (
        <div className="mt-6 rounded-xl border border-[#4ade80]/30 bg-[#4ade80]/[0.06] p-4 text-base text-[#86efac]">
          <b>Fact base locked.</b> The Strategist can build from research v{run.version}. Collect again only if the ground truth has moved.
        </div>
      )}

      {/* COMPETITOR SET */}
      {run && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-ink">Competitor set</h2>
          <p className="mt-0.5 text-base text-ink-dim">Auto-detected from the category. Add or remove before you approve, adding one commissions a targeted pass on the next run.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {competitors.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-base">
                {c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-accent">{c.name}</a> : <span className="font-semibold text-ink">{c.name}</span>}
                {c.added_by === "auto" && <span className="text-xs text-ink-faint">auto</span>}
                <button onClick={() => removeCompetitor(c)} aria-label={`Remove ${c.name}`} className="text-ink-faint hover:text-alert">✕</button>
              </span>
            ))}
            {competitors.length === 0 && <span className="text-base text-ink-faint">None yet, they land on the first run.</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} placeholder="Competitor name"
              className="w-52 rounded-md border border-line bg-surface-1 px-3 py-2 text-base outline-none focus:border-accent" />
            <input value={newComp.website} onChange={(e) => setNewComp({ ...newComp, website: e.target.value })} placeholder="their website (optional)"
              className="w-64 rounded-md border border-line bg-surface-1 px-3 py-2 text-base outline-none focus:border-accent" />
            <button onClick={addCompetitor} className="rounded-md border border-line px-4 py-2 text-base font-semibold text-ink-dim hover:text-ink">+ Add</button>
          </div>
        </div>
      )}

      {/* THE FACT BASE, BY SECTION */}
      {run && claims.length > 0 && (
        <div className="mt-8 space-y-8">
          <h2 className="text-xl font-bold text-ink">The fact base</h2>
          {SECTIONS.map((sec) => {
            const rows = bySection(sec.id);
            if (rows.length === 0) return null;
            const isUnverified = sec.id === "unverified";
            return (
              <section key={sec.id}>
                <div className="flex items-baseline justify-between border-b border-line pb-2">
                  <h3 className={`text-lg font-bold ${isUnverified ? "text-[#fca5a5]" : "text-ink"}`}>{sec.label}</h3>
                  <span className="text-sm text-ink-faint">{rows.length}</span>
                </div>
                <p className="mt-1 text-sm text-ink-faint">{sec.blurb}</p>
                <ul className="mt-3 divide-y divide-line/50">
                  {rows.map((c) => (
                    <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 flex-1">
                        {c.subject && !new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(c.subject) && (
                          <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-ink-dim">{c.subject}</span>
                        )}
                        <span className="text-base leading-relaxed text-ink">{c.claim}</span>
                        {c.conflict && <div className="mt-1 text-sm text-[#fcd34d]">⚠ Sources conflict: {c.conflict}</div>}
                        {isUnverified && c.unverified_reason && <div className="mt-1 text-sm text-ink-faint">Why unverified: {c.unverified_reason}</div>}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        {c.tier && TIER[c.tier] && <span title={TIER[c.tier].title} className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${TIER[c.tier].cls}`}>{TIER[c.tier].label}</span>}
                        {c.verified ? <span title="Source fetched and confirmed" className="text-xs font-semibold text-[#86efac]">✓ verified</span> : <span className="text-xs text-ink-faint">unconfirmed</span>}
                        {c.source_date && <span className="tabular text-xs text-ink-faint">{ukDate(c.source_date)}</span>}
                        {c.source_url
                          ? <a href={c.source_url} target="_blank" rel="noreferrer" className="max-w-[12rem] truncate text-sm text-accent hover:underline">{c.source_name || "source"}</a>
                          : <span className="text-sm text-ink-faint">{c.source_name || "no source"}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {run && claims.length === 0 && !running && (
        <p className="mt-8 text-base text-ink-dim">This version filed no claims. Run again, or check the client has crawled material and a website set.</p>
      )}
    </div>
  );
}
