"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Strategy, StrategyContent } from "@/lib/cycle";
import ProposalBuilder from "@/components/ProposalBuilder";
import Working, { WORKING_STRATEGY } from "@/components/Working";

// GATE 2 surface. Build a strategy from the approved fact base, review it, refine it, then approve. Redesigned for
// the team (Gary): every section can be REFINED in place (no scrolling to the bottom), the Gate 2 decision rides
// along in a sticky bar so Approve is always one click away, and each section carries an icon + tighter typography
// so a dense strategy reads at a glance instead of as a wall of text. The Proposal (same POD) runs from an
// approved strategy, shown at the end.
type Client = { id: string; name: string };
type Latest = { strategy: Strategy | null; objective: string | null; hasApprovedResearch: boolean };

// The model occasionally returns a string (or object) where the schema wants an array - and `(str || []).map()`
// then throws and takes the ENTIRE page down ("This page couldn't load", seen on MoMo's strategy where kpis,
// risks and channel_logic came back as strings). Coerce anything non-array to [] before mapping, always.
function arr<T>(v: T[] | null | undefined): T[] { return Array.isArray(v) ? v : []; }

const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_approval: { label: "Awaiting your approval", cls: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]" },
  approved: { label: "Approved · direction locked", cls: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" },
  superseded: { label: "Superseded by a newer version", cls: "border-line bg-surface-2 text-ink-faint" },
  draft: { label: "Draft", cls: "border-line bg-surface-2 text-ink-dim" },
};

// Section iconography (constant SVG path strings, never user text - safe to inline). One motif per section so the
// strategy reads as a set of named tools, the same visual language as the Brain and Researcher.
const IC = {
  proposition: '<path d="M4 4v16"/><path d="M4 5h12l-2 3 2 3H4"/>',
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

export default function StrategyGate({ clients, ready, initialClientId = "" }: { clients: Client[]; ready: string[]; initialClientId?: string }) {
  const [clientId, setClientId] = useState(() => {
    // Arriving FROM the Researcher ("Go to the Strategist") must land on THAT client, even if its fact base is not
    // approved yet (the page just shows it as not-ready). Only honour a real client id; otherwise fall back.
    const fromPod = initialClientId && clients.find((c) => c.id === initialClientId);
    if (fromPod) return fromPod.id;
    return clients.find((c) => ready.includes(c.id))?.id || clients[0]?.id || "";
  });
  const [data, setData] = useState<Latest | null>(null);
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // Which section's inline refine box is open. A section title, or "__gate__" for the sticky Gate-2 note box.
  const [refineFor, setRefineFor] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  // The LIVE client, so a slow response for a previously-selected client cannot overwrite the current one's view.
  const clientRef = useRef(clientId);
  useEffect(() => { clientRef.current = clientId; }, [clientId]);
  const load = useCallback(async (id: string) => {
    if (!id) return;
    const d = await fetch(`/api/studio/strategist/latest?clientId=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (clientRef.current !== id) return;   // client switched while this was in flight - discard
    setData(d || { strategy: null, objective: null, hasApprovedResearch: false });
  }, []);
  useEffect(() => { load(clientId); }, [clientId, load]);

  const isReady = ready.includes(clientId);
  const strategy = data?.strategy || null;
  const content = (strategy?.content || null) as StrategyContent | null;
  const status = strategy ? (STATUS[strategy.status] || STATUS.draft) : null;

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

  // Refine the whole strategy against a note. When a section label is given, the note is SCOPED to that section so
  // the team can fix one part in place (Gary: no scrolling to the bottom for every change). The backend still
  // regenerates the whole strategy, kept coherent, but told exactly what to change.
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

  const canGate = strategy?.status === "awaiting_approval";

  // One shared section shell: icon + title + an inline Refine trigger (only while the strategy is open to change).
  function Sect({ id, title, icon, tone = "line", children }: { id: keyof typeof IC | string; title: string; icon: string; tone?: "line" | "accent" | "blue" | "red"; children: React.ReactNode }) {
    const open = refineFor === title;
    const border = tone === "accent" ? "border-accent/40" : tone === "blue" ? "border-[#60a5fa]/30" : tone === "red" ? "border-[#f87171]/30" : "border-line";
    const chip = tone === "blue" ? "bg-[#60a5fa]/12 text-[#93c5fd]" : tone === "red" ? "bg-[#f87171]/12 text-[#fca5a5]" : "bg-accent/12 text-accent";
    const label = tone === "blue" ? "text-[#93c5fd]" : tone === "red" ? "text-[#fca5a5]" : "text-accent";
    return (
      <section id={String(id)} className={`scroll-mt-24 rounded-xl border ${border} bg-surface-1 p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chip}`}><Icon path={icon} /></span>
            <div className={`text-base font-semibold uppercase tracking-wide ${label}`}>{title}</div>
          </div>
          {canGate && (
            <button onClick={() => { setRefineFor(open ? null : title); setNote(""); }}
              className="shrink-0 rounded-md border border-line px-2.5 py-1 text-sm font-semibold text-ink-faint transition hover:border-accent/50 hover:text-ink">
              {open ? "Cancel" : "✎ Refine"}
            </button>
          )}
        </div>
        <div className="mt-3">{children}</div>
        {open && (
          <div className="mt-3 rounded-lg border border-accent/30 bg-surface-2 p-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus
              placeholder={`What should change about ${title.toLowerCase()}? e.g. lead on price, make it sharper, drop the enterprise angle…`}
              className="w-full resize-y rounded-lg border border-line bg-surface-1 px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => refine(title)} disabled={busy || !note.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-1.5 text-base font-bold text-black disabled:opacity-50">
                {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />}Apply to this section
              </button>
              <span className="text-sm text-ink-faint">Regenerates the strategy with just this change.</span>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="mt-8">
      {/* CLIENT */}
      <label className="block">
        <span className="text-base font-semibold uppercase tracking-wide text-ink-faint">Client</span>
        <select value={clientId} onChange={(e) => { setClientId(e.target.value); setObjective(""); setMsg(""); setRefineFor(null); }}
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
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink">The strategy</h2>
            {status && <span className={`rounded-full border px-3 py-1 text-base font-semibold ${status.cls}`}>v{strategy.version} · {status.label}</span>}
            {data?.objective && <span className="text-base text-ink-faint">Objective: {data.objective}</span>}
          </div>
          {/* Provenance legend + how to edit, so the two things the team needs are stated once, up top. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-base text-ink-faint">
            <span><span className="mr-1.5 rounded bg-[#4ade80]/15 px-1.5 py-0.5 text-sm font-bold text-[#86efac]">grounded</span>traced to a verified fact</span>
            <span><span className="mr-1.5 rounded bg-[#fbbf24]/15 px-1.5 py-0.5 text-sm font-bold text-[#fcd34d]">assumption</span>the Strategist&apos;s reasoning, not a fact yet</span>
            {canGate && <span className="text-ink-dim">Change any section with its <b className="text-ink">✎ Refine</b> button, right where it sits.</span>}
          </div>

          {/* PROPOSITION - the hero line of the whole strategy. */}
          <section className="relative overflow-hidden rounded-2xl border border-accent/40 bg-surface-1 p-6">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-[80px]" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.16), transparent 70%)" }} />
            <div className="relative flex items-start justify-between gap-3">
              <div className="text-base font-semibold uppercase tracking-wide text-accent">The proposition</div>
              {canGate && (
                <button onClick={() => { const t = "The proposition"; setRefineFor(refineFor === t ? null : t); setNote(""); }}
                  className="shrink-0 rounded-md border border-line px-2.5 py-1 text-sm font-semibold text-ink-faint transition hover:border-accent/50 hover:text-ink">
                  {refineFor === "The proposition" ? "Cancel" : "✎ Refine"}
                </button>
              )}
            </div>
            <p className="relative mt-2 max-w-[46ch] text-2xl font-bold leading-snug text-ink sm:text-[26px]">{content.proposition}</p>
            {refineFor === "The proposition" && (
              <div className="relative mt-3 rounded-lg border border-accent/30 bg-surface-2 p-3">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus
                  placeholder="What should change about the proposition? e.g. lead on the manufacturer price advantage…"
                  className="w-full resize-y rounded-lg border border-line bg-surface-1 px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={() => refine("The proposition")} disabled={busy || !note.trim()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-1.5 text-base font-bold text-black disabled:opacity-50">{busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />}Apply to this section</button>
                  <span className="text-sm text-ink-faint">Regenerates the strategy with just this change.</span>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-5 sm:grid-cols-2">
            <Sect id="target" title="Target" icon={IC.target}>
              <p className="text-lg font-semibold text-ink">{content.target?.segment}</p>
              <p className="mt-1 text-lg leading-relaxed text-ink-dim">{content.target?.insight}</p>
            </Sect>
            <Sect id="positioning" title="Positioning" icon={IC.positioning}>
              <p className="text-lg font-semibold text-ink">{content.positioning?.promise}</p>
              <ul className="mt-1.5 list-disc pl-5 text-lg leading-relaxed text-ink-dim">{arr(content.positioning?.usps).map((u, i) => <li key={i}>{u}</li>)}</ul>
            </Sect>
            <Sect id="angle" title="The angle" icon={IC.angle}>
              <p className="text-lg leading-relaxed text-ink">{content.angle}</p>
            </Sect>
            <Sect id="message" title="Message hierarchy" icon={IC.message}>
              <ol className="list-decimal space-y-1 pl-5 text-lg leading-relaxed text-ink-dim">{arr(content.message_hierarchy).map((m, i) => <li key={i}>{m}</li>)}</ol>
            </Sect>
          </div>

          {/* AUDIENCE BLUEPRINT - the proof of targeting ability (goes into the proposal). */}
          {content.audience && (
            <Sect id="audience" title="The target audience" icon={IC.audience} tone="accent">
              {content.audience.overview && <p className="text-lg leading-relaxed text-ink-dim">{content.audience.overview}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {arr(content.audience.personas).map((p, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-bold text-ink">{p.label}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${p.fact_id ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#fbbf24]/15 text-[#fcd34d]"}`}>{p.fact_id ? "grounded" : "assumption"}</span>
                    </div>
                    <p className="mt-1.5 text-base text-ink-faint"><b className="text-ink-dim">Trigger</b> · {p.trigger}</p>
                    <p className="mt-0.5 text-base text-ink-faint"><b className="text-ink-dim">Need</b> · {p.need}</p>
                    <p className="mt-0.5 text-base text-ink-faint"><b className="text-ink-dim">Who</b> · {p.who}</p>
                    {arr(p.signals).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">{arr(p.signals).map((s, j) => <span key={j} className="rounded-full border border-line px-2 py-0.5 text-sm text-ink-dim">{s}</span>)}</div>
                    )}
                    <p className="mt-2 text-base text-ink-dim"><b className="text-ink">Why they convert</b> · {p.propensity}</p>
                    <p className="mt-1 text-base text-ink-dim"><b className="text-ink">Angle</b> · {p.angle}</p>
                    <p className="mt-1.5 text-sm text-ink-faint">Indicative reach · {p.scale}</p>
                  </div>
                ))}
              </div>
            </Sect>
          )}

          <Sect id="channels" title="Channel logic" icon={IC.channels}>
            <ul className="space-y-1.5">{arr(content.channel_logic).map((c, i) => (
              <li key={i} className="text-lg leading-relaxed text-ink-dim"><b className="text-ink">{c.channel}</b> · {c.role}</li>
            ))}</ul>
          </Sect>

          <Sect id="kpis" title="Objective + KPIs" icon={IC.kpis}>
            <p className="text-lg text-ink-dim"><b className="text-ink">{content.objective?.type}</b> · {content.objective?.target}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-lg">
                <thead><tr className="border-b border-line text-base uppercase tracking-wide text-ink-faint">
                  <th className="py-1.5 pr-3 font-semibold">Metric</th><th className="py-1.5 pr-3 font-semibold">Target</th><th className="py-1.5 font-semibold">Baseline</th></tr></thead>
                <tbody>{arr(content.kpis).map((k, i) => (
                  <tr key={i} className="border-b border-line/50 last:border-0">
                    <td className="py-1.5 pr-3 text-ink">{k.metric}</td><td className="py-1.5 pr-3 tabular text-ink-dim">{k.target}</td><td className="py-1.5 tabular text-ink-faint">{k.baseline}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </Sect>

          <Sect id="sales" title="Sales-ready definition" icon={IC.sales}><p className="text-lg leading-relaxed text-ink-dim">{content.sales_ready_def}</p></Sect>

          <Sect id="rationale" title="Why this works (traced to the facts)" icon={IC.rationale}>
            <ul className="space-y-2">{arr(content.rationale).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-lg leading-relaxed text-ink-dim">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${r.fact_id ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#fbbf24]/15 text-[#fcd34d]"}`}>{r.fact_id ? "grounded" : "assumption"}</span>
                <span>{r.point}</span>
              </li>))}</ul>
          </Sect>

          {arr(content.changes_from_last).length > 0 && (
            <Sect id="changes" title="What changed in this version" icon={IC.changes}>
              <ul className="space-y-1.5">{arr(content.changes_from_last).map((c, i) => (
                <li key={i} className="text-lg leading-relaxed text-ink-dim"><b className="text-ink">{c.change}</b> — {c.because}</li>
              ))}</ul>
            </Sect>
          )}

          {arr(content.market_opportunities).length > 0 && (
            <Sect id="market" title="Market opportunities · the whole board" icon={IC.market} tone="blue">
              <p className="text-base text-ink-faint">Industry insights the client should consider, including beyond our digital scope. These carry into the proposal.</p>
              <ul className="mt-3 space-y-2">{arr(content.market_opportunities).map((m, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-lg font-semibold text-ink">{m.insight}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${m.digital ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#60a5fa]/15 text-[#93c5fd]"}`}>{m.digital ? "our pods" : "beyond digital"}</span>
                  </div>
                  <div className="mt-0.5 text-base leading-relaxed text-ink-dim">{m.why_it_matters}</div>
                </li>
              ))}</ul>
            </Sect>
          )}

          <Sect id="risks" title="Pre-mortem · risks" icon={IC.risks} tone="red">
            <ul className="list-disc space-y-1 pl-5 text-lg leading-relaxed text-ink-dim">{arr(content.risks).map((r, i) => <li key={i}>{r}</li>)}</ul>
          </Sect>

          {/* GATE 2 - a STICKY bar so Approve / Refine ride along as the team reads, never a scroll to the bottom. */}
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
