"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Strategy, StrategyContent } from "@/lib/cycle";
import ProposalBuilder from "@/components/ProposalBuilder";
import Working, { WORKING_STRATEGY } from "@/components/Working";

// GATE 2 surface, redesigned for the team's REVIEW journey (Gary): an at-a-glance summary first (the proposition +
// the key moves), then the strategy split into clustered, COLLAPSIBLE sections so it reads as a scannable outline
// instead of a wall of copy. Each section carries an icon, expands to the full detail, and can be refined in place;
// the Gate 2 decision rides along in a sticky bar. The Proposal (same POD) runs from an approved strategy.
type Client = { id: string; name: string };
type Latest = { strategy: Strategy | null; objective: string | null; hasApprovedResearch: boolean };

// The model occasionally returns a string (or object) where the schema wants an array - and `(str || []).map()`
// then throws and takes the ENTIRE page down. Coerce anything non-array to [] before mapping, always.
function arr<T>(v: T[] | null | undefined): T[] { return Array.isArray(v) ? v : []; }
const clip = (s: string | null | undefined, n = 92): string => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t; };

const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_approval: { label: "Awaiting your approval", cls: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]" },
  approved: { label: "Approved · direction locked", cls: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" },
  superseded: { label: "Superseded by a newer version", cls: "border-line bg-surface-2 text-ink-faint" },
  draft: { label: "Draft", cls: "border-line bg-surface-2 text-ink-dim" },
};

// Section iconography (constant SVG path strings, never user text - safe to inline).
const IC = {
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>',
  positioning: '<circle cx="12" cy="12" r="9"/><path d="m14.5 9.5-2 5-3-2z"/>',
  angle: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0 0 12 2Z"/>',
  message: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h6"/>',
  audience: '<circle cx="9" cy="8" r="3"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 6.5A3 3 0 0 1 16 12"/><path d="M18 20a5 5 0 0 0-3-4.6"/>',
  channels: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.6"/>',
  kpis: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7"/><rect x="12" y="7" width="3" height="11"/><rect x="17" y="4" width="3" height="14"/>',
  sales: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  rationale: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M8 12h8"/>',
  changes: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  market: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  risks: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
} as const;

function Icon({ path, className = "h-[18px] w-[18px]" }: { path: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden dangerouslySetInnerHTML={{ __html: path }} />;
}

const CLUSTERS = ["The idea", "The audience", "The plan", "The case"] as const;
type ClusterName = (typeof CLUSTERS)[number];
type Section = { id: string; cluster: ClusterName; icon: string; title: string; preview: string; body: React.ReactNode };

export default function StrategyGate({ clients, ready, initialClientId = "" }: { clients: Client[]; ready: string[]; initialClientId?: string }) {
  const [clientId, setClientId] = useState(() => {
    const fromPod = initialClientId && clients.find((c) => c.id === initialClientId);
    if (fromPod) return fromPod.id;
    return clients.find((c) => ready.includes(c.id))?.id || clients[0]?.id || "";
  });
  const [data, setData] = useState<Latest | null>(null);
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [refineFor, setRefineFor] = useState<string | null>(null);   // a section title, or "__gate__" for the sticky bar
  const [open, setOpen] = useState<Set<string>>(new Set());          // which sections are expanded
  const [msg, setMsg] = useState("");

  const clientRef = useRef(clientId);
  useEffect(() => { clientRef.current = clientId; }, [clientId]);
  const load = useCallback(async (id: string) => {
    if (!id) return;
    const d = await fetch(`/api/studio/strategist/latest?clientId=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (clientRef.current !== id) return;
    setData(d || { strategy: null, objective: null, hasApprovedResearch: false });
  }, []);
  useEffect(() => { load(clientId); }, [clientId, load]);

  const isReady = ready.includes(clientId);
  const strategy = data?.strategy || null;
  const content = (strategy?.content || null) as StrategyContent | null;
  const status = strategy ? (STATUS[strategy.status] || STATUS.draft) : null;
  const canGate = strategy?.status === "awaiting_approval";
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function build() {
    if (!objective.trim()) { setMsg("Give the strategy an objective."); return; }
    setBusy(true); setMsg("Drafting and red-teaming the strategy, this takes a moment…");
    const r = await fetch(`/api/studio/strategist/build`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, objective, name: objective.slice(0, 80) }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't build the strategy."); return; }
    setMsg(""); setObjective(""); await load(clientId);
  }

  // Refine the whole strategy against a note. A section label scopes the change so the team fixes one part in place.
  async function refine(sectionLabel?: string) {
    if (!strategy || !note.trim()) return;
    const scoped = sectionLabel
      ? `Refine ONLY the "${sectionLabel}" section of the strategy, leaving the rest intact unless a change is needed for coherence. The change: ${note.trim()}`
      : note.trim();
    setBusy(true); setMsg("Refining against your notes…");
    const r = await fetch(`/api/studio/strategist/refine`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId: strategy.id, notes: scoped }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't refine."); return; }
    setMsg(""); setNote(""); setRefineFor(null); await load(clientId);
  }

  async function approve() {
    if (!strategy) return;
    setBusy(true);
    const r = await fetch(`/api/studio/strategist/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId: strategy.id }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't approve."); return; }
    await load(clientId);
  }

  // Reopen an approved strategy so it can be edited again. Flips to awaiting_approval, lighting up the refine + Gate 2 controls.
  async function reopen() {
    if (!strategy || busy) return;
    setBusy(true); setMsg("");
    const r = await fetch(`/api/studio/strategist/reopen`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId: strategy.id }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't reopen the strategy."); return; }
    setMsg("Reopened for edits. Refine any section, then approve again. Rebuild the proposal from the new version afterwards.");
    await load(clientId);
  }

  // The inline per-section refine control, shown inside an expanded section while the strategy is editable.
  const RefineControl = ({ title }: { title: string }) => {
    if (!canGate) return null;
    const on = refineFor === title;
    return (
      <div className="mt-3 border-t border-line pt-3">
        {!on ? (
          <button onClick={() => { setRefineFor(title); setNote(""); }} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink-faint transition hover:text-accent">✎ Refine this section</button>
        ) : (
          <div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus
              placeholder={`What should change about ${title.toLowerCase()}? e.g. lead on price, sharpen it…`}
              className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => refine(title)} disabled={busy || !note.trim()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-[15px] font-bold text-black disabled:opacity-50">{busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />}Apply to this section</button>
              <button onClick={() => { setRefineFor(null); setNote(""); }} className="text-[15px] font-semibold text-ink-faint hover:text-ink">Cancel</button>
              <span className="text-[13px] text-ink-faint">Regenerates the strategy with just this change.</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Build the collapsible section descriptors from the strategy content (only those with real content).
  const sections: Section[] = [];
  if (content) {
    if (content.positioning) sections.push({
      id: "positioning", cluster: "The idea", icon: IC.positioning, title: "Positioning", preview: content.positioning.promise,
      body: <><p className="text-lg font-semibold text-ink">{content.positioning.promise}</p><ul className="mt-1.5 list-disc pl-5 text-lg leading-relaxed text-ink-dim">{arr(content.positioning.usps).map((u, i) => <li key={i}>{u}</li>)}</ul></>,
    });
    if (content.angle) sections.push({ id: "angle", cluster: "The idea", icon: IC.angle, title: "The angle", preview: content.angle, body: <p className="text-lg leading-relaxed text-ink">{content.angle}</p> });
    if (arr(content.message_hierarchy).length) sections.push({
      id: "message", cluster: "The idea", icon: IC.message, title: "Message hierarchy", preview: arr(content.message_hierarchy).join(" · "),
      body: <ol className="list-decimal space-y-1 pl-5 text-lg leading-relaxed text-ink-dim">{arr(content.message_hierarchy).map((m, i) => <li key={i}>{m}</li>)}</ol>,
    });
    if (content.audience) sections.push({
      id: "audience", cluster: "The audience", icon: IC.audience, title: `The target audience${arr(content.audience.personas).length ? ` · ${arr(content.audience.personas).length} personas` : ""}`,
      preview: content.audience.overview || `${arr(content.audience.personas).length} personas defined`,
      body: <>{content.audience.overview && <p className="text-lg leading-relaxed text-ink-dim">{content.audience.overview}</p>}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">{arr(content.audience.personas).map((p, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-2"><span className="text-lg font-bold text-ink">{p.label}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${p.fact_id ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#fbbf24]/15 text-[#fcd34d]"}`}>{p.fact_id ? "grounded" : "assumption"}</span></div>
            <p className="mt-1.5 text-base text-ink-faint"><b className="text-ink-dim">Trigger</b> · {p.trigger}</p>
            <p className="mt-0.5 text-base text-ink-faint"><b className="text-ink-dim">Need</b> · {p.need}</p>
            <p className="mt-0.5 text-base text-ink-faint"><b className="text-ink-dim">Who</b> · {p.who}</p>
            {arr(p.signals).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{arr(p.signals).map((s, j) => <span key={j} className="rounded-full border border-line px-2 py-0.5 text-sm text-ink-dim">{s}</span>)}</div>}
            <p className="mt-2 text-base text-ink-dim"><b className="text-ink">Why they convert</b> · {p.propensity}</p>
            <p className="mt-1 text-base text-ink-dim"><b className="text-ink">Angle</b> · {p.angle}</p>
            <p className="mt-1.5 text-sm text-ink-faint">Indicative reach · {p.scale}</p>
          </div>
        ))}</div></>,
    });
    if (arr(content.channel_logic).length) sections.push({
      id: "channels", cluster: "The plan", icon: IC.channels, title: "Channel logic", preview: arr(content.channel_logic).map((c) => c.channel).join(", "),
      body: <ul className="space-y-1.5">{arr(content.channel_logic).map((c, i) => <li key={i} className="text-lg leading-relaxed text-ink-dim"><b className="text-ink">{c.channel}</b> · {c.role}</li>)}</ul>,
    });
    if (content.objective || arr(content.kpis).length) sections.push({
      id: "kpis", cluster: "The plan", icon: IC.kpis, title: "Objective + KPIs", preview: content.objective ? `${content.objective.type} · ${content.objective.target}` : `${arr(content.kpis).length} KPIs`,
      body: <>{content.objective && <p className="text-lg text-ink-dim"><b className="text-ink">{content.objective.type}</b> · {content.objective.target}</p>}
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-lg"><thead><tr className="border-b border-line text-base uppercase tracking-wide text-ink-faint"><th className="py-1.5 pr-3 font-semibold">Metric</th><th className="py-1.5 pr-3 font-semibold">Target</th><th className="py-1.5 font-semibold">Baseline</th></tr></thead>
        <tbody>{arr(content.kpis).map((k, i) => <tr key={i} className="border-b border-line/50 last:border-0"><td className="py-1.5 pr-3 text-ink">{k.metric}</td><td className="py-1.5 pr-3 tabular text-ink-dim">{k.target}</td><td className="py-1.5 tabular text-ink-faint">{k.baseline}</td></tr>)}</tbody></table></div></>,
    });
    if (content.sales_ready_def) sections.push({ id: "sales", cluster: "The plan", icon: IC.sales, title: "Sales-ready definition", preview: content.sales_ready_def, body: <p className="text-lg leading-relaxed text-ink-dim">{content.sales_ready_def}</p> });
    if (arr(content.rationale).length) sections.push({
      id: "rationale", cluster: "The case", icon: IC.rationale, title: "Why this works", preview: `${arr(content.rationale).length} reasons, each traced to a fact`,
      body: <ul className="space-y-2">{arr(content.rationale).map((r, i) => <li key={i} className="flex items-start gap-2 text-lg leading-relaxed text-ink-dim"><span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${r.fact_id ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#fbbf24]/15 text-[#fcd34d]"}`}>{r.fact_id ? "grounded" : "assumption"}</span><span>{r.point}</span></li>)}</ul>,
    });
    if (arr(content.market_opportunities).length) sections.push({
      id: "market", cluster: "The case", icon: IC.market, title: "Market opportunities", preview: arr(content.market_opportunities).map((m) => m.insight).join(" · "),
      body: <ul className="space-y-2">{arr(content.market_opportunities).map((m, i) => <li key={i} className="rounded-lg border border-line bg-surface-2 p-3"><div className="flex items-start justify-between gap-2"><span className="text-lg font-semibold text-ink">{m.insight}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${m.digital ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#60a5fa]/15 text-[#93c5fd]"}`}>{m.digital ? "our pods" : "beyond digital"}</span></div><div className="mt-0.5 text-base leading-relaxed text-ink-dim">{m.why_it_matters}</div></li>)}</ul>,
    });
    if (arr(content.risks).length) sections.push({ id: "risks", cluster: "The case", icon: IC.risks, title: "Pre-mortem · risks", preview: `${arr(content.risks).length} risks named`, body: <ul className="list-disc space-y-1 pl-5 text-lg leading-relaxed text-ink-dim">{arr(content.risks).map((r, i) => <li key={i}>{r}</li>)}</ul> });
    if (arr(content.changes_from_last).length) sections.push({ id: "changes", cluster: "The case", icon: IC.changes, title: "What changed in this version", preview: arr(content.changes_from_last).map((c) => c.change).join(" · "), body: <ul className="space-y-1.5">{arr(content.changes_from_last).map((c, i) => <li key={i} className="text-lg leading-relaxed text-ink-dim"><b className="text-ink">{c.change}</b> — {c.because}</li>)}</ul> });
  }
  const allOpen = sections.length > 0 && sections.every((s) => open.has(s.id));

  const keyMove = (label: string, value: string) => value ? (
    <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[15px] font-medium leading-snug text-ink">{value}</div>
    </div>
  ) : null;

  return (
    <div className="mt-8">
      {/* CLIENT */}
      <label className="block">
        <span className="text-base font-semibold uppercase tracking-wide text-ink-faint">Client</span>
        <select value={clientId} onChange={(e) => { setClientId(e.target.value); setObjective(""); setMsg(""); setRefineFor(null); setOpen(new Set()); }}
          className="mt-1 block w-72 rounded-lg border border-line bg-surface-1 px-3 py-2 text-lg outline-none focus:border-accent">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{ready.includes(c.id) ? "" : " (no approved research)"}</option>)}
        </select>
      </label>

      {!isReady && (
        <p className="mt-4 rounded-lg border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-4 py-3 text-lg text-[#fcd34d]">
          The Strategist can only build from an approved fact base. Run the Researcher on this client and approve it at Gate 1 first.
        </p>
      )}

      {/* BUILD */}
      {isReady && (
        <div className="mt-6 rounded-xl border border-line bg-surface-1 p-5">
          <div className="text-lg font-bold text-ink">{strategy ? "Build a new strategy" : "Build the strategy"}</div>
          <p className="mt-0.5 text-base text-ink-faint">The objective this strategy must achieve, e.g. &quot;acquire high-intent leads for the new product at a lower cost per lead&quot;.</p>
          <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2}
            placeholder="The commercial objective for this strategy…"
            className="mt-3 w-full resize-y rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
          <button onClick={build} disabled={busy}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
            {busy ? "Drafting and red-teaming…" : strategy ? "Build a new strategy" : "Build the strategy"}
          </button>
        </div>
      )}

      {busy
        ? <div className="mt-3 rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-lg text-accent"><Working messages={WORKING_STRATEGY} /></div>
        : msg && <p className="mt-3 rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-lg text-ink-dim">{msg}</p>}

      {/* THE STRATEGY */}
      {strategy && content && (
        <div className="mt-8 space-y-5">
          {/* AT A GLANCE - the proposition + the key moves, so the team gets the whole strategy in one look. */}
          <section className="relative overflow-hidden rounded-2xl border border-accent/40 bg-surface-1 p-6">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-[80px]" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.16), transparent 70%)" }} />
            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div className="text-base font-semibold uppercase tracking-wide text-accent">The strategy · at a glance</div>
              <div className="flex flex-wrap items-center gap-2">
                {status && <span className={`rounded-full border px-3 py-1 text-base font-semibold ${status.cls}`}>v{strategy.version} · {status.label}</span>}
                {strategy.status === "approved" && (
                  <button onClick={reopen} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-base font-semibold text-ink-dim transition hover:border-accent/50 hover:text-ink disabled:opacity-50">✎ Reopen to refine</button>
                )}
              </div>
            </div>
            <p className="relative mt-2 max-w-[48ch] text-2xl font-bold leading-snug text-ink sm:text-[26px]">{content.proposition}</p>
            {data?.objective && <p className="relative mt-1.5 text-base text-ink-faint">Objective: {data.objective}</p>}
            <div className="relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {keyMove("Target", content.target?.segment || "")}
              {keyMove("The angle", clip(content.angle, 70))}
              {keyMove("Channels", arr(content.channel_logic).slice(0, 4).map((c) => c.channel).join(" · "))}
              {keyMove("Objective", content.objective?.type || "")}
            </div>
          </section>

          {/* Provenance + how to read, once. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-base text-ink-faint">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span><span className="mr-1.5 rounded bg-[#4ade80]/15 px-1.5 py-0.5 text-sm font-bold text-[#86efac]">grounded</span>traced to a fact</span>
              <span><span className="mr-1.5 rounded bg-[#fbbf24]/15 px-1.5 py-0.5 text-sm font-bold text-[#fcd34d]">assumption</span>the Strategist&apos;s reasoning</span>
            </div>
            <button onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((s) => s.id)))} className="font-semibold text-ink-dim transition hover:text-ink">{allOpen ? "Collapse all" : "Expand all"}</button>
          </div>

          {/* CLUSTERED, COLLAPSIBLE SECTIONS. */}
          {CLUSTERS.map((cl) => {
            const secs = sections.filter((s) => s.cluster === cl);
            if (!secs.length) return null;
            return (
              <div key={cl}>
                <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-accent">{cl}</div>
                <div className="space-y-2.5">
                  {secs.map((sec) => {
                    const isOpen = open.has(sec.id);
                    return (
                      <div key={sec.id} className="overflow-hidden rounded-xl border border-line bg-surface-1 transition hover:border-line-strong">
                        <button onClick={() => toggle(sec.id)} className="flex w-full items-center gap-3 p-4 text-left">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent"><Icon path={sec.icon} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="text-lg font-bold text-ink">{sec.title}</div>
                            {!isOpen && <div className="truncate text-[15px] text-ink-faint">{clip(sec.preview, 96)}</div>}
                          </div>
                          <span aria-hidden className={`shrink-0 text-ink-faint transition ${isOpen ? "rotate-180" : ""}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m6 9 6 6 6-6" /></svg>
                          </span>
                        </button>
                        {isOpen && <div className="px-4 pb-4">{sec.body}<RefineControl title={sec.title} /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* GATE 2 - sticky, always reachable. */}
          {canGate && (
            <div className="sticky bottom-4 z-20 rounded-xl border border-accent/45 bg-surface-1/95 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4ade80]/15 text-[#86efac]"><Icon path={IC.sales} /></span>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-ink">Gate 2 · your decision</div>
                  <div className="text-sm text-ink-faint">Approve to unlock the Proposal, or leave a note for a whole-strategy rework.</div>
                </div>
                <div className="flex-1" />
                <button onClick={() => { setRefineFor(refineFor === "__gate__" ? null : "__gate__"); setNote(""); }} disabled={busy}
                  className="rounded-lg border border-line px-4 py-2.5 text-lg font-semibold text-ink-dim transition hover:text-ink disabled:opacity-50">
                  {refineFor === "__gate__" ? "Cancel" : "Refine with notes"}
                </button>
                <button onClick={approve} disabled={busy} className="rounded-lg bg-[#34c759] px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">Approve the strategy</button>
              </div>
              {refineFor === "__gate__" && (
                <div className="mt-3">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus
                    placeholder="A whole-strategy note. e.g. 'Lead on the value angle, not price. Drop the enterprise segment, focus SMB.'"
                    className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
                  <button onClick={() => refine()} disabled={busy || !note.trim()} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-lg font-bold text-black disabled:opacity-50">{busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}Refine the strategy</button>
                </div>
              )}
            </div>
          )}

          {/* APPROVED -> the Proposal runs from here (same POD) */}
          {strategy.status === "approved" && <ProposalBuilder strategyId={strategy.id} />}
        </div>
      )}
    </div>
  );
}
