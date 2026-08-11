"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Strategy, StrategyContent } from "@/lib/cycle";
import ProposalBuilder from "@/components/ProposalBuilder";
import Working, { WORKING_STRATEGY } from "@/components/Working";

// GATE 2 surface. Build a strategy from the approved fact base, review it, refine with notes if needed, then
// approve. The Proposal (next step, same POD) will run from the approved strategy - shown here as the next move.
type Client = { id: string; name: string };
type Latest = { strategy: Strategy | null; objective: string | null; hasApprovedResearch: boolean };

const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_approval: { label: "Awaiting your approval", cls: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]" },
  approved: { label: "Approved · direction locked", cls: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" },
  superseded: { label: "Superseded by a newer version", cls: "border-line bg-surface-2 text-ink-faint" },
  draft: { label: "Draft", cls: "border-line bg-surface-2 text-ink-dim" },
};

export default function StrategyGate({ clients, ready }: { clients: Client[]; ready: string[] }) {
  const [clientId, setClientId] = useState(clients.find((c) => ready.includes(c.id))?.id || clients[0]?.id || "");
  const [data, setData] = useState<Latest | null>(null);
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);
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

  async function refine() {
    if (!strategy || !note.trim()) return;
    setBusy(true); setMsg("Refining against your notes…");
    const r = await fetch(`/api/studio/strategist/refine`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId: strategy.id, notes: note }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't refine."); return; }
    setMsg(""); setNote(""); setShowNotes(false); await load(clientId);
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

  return (
    <div className="mt-8">
      {/* CLIENT */}
      <label className="block">
        <span className="text-base font-semibold uppercase tracking-wide text-ink-faint">Client</span>
        <select value={clientId} onChange={(e) => { setClientId(e.target.value); setObjective(""); setMsg(""); }}
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
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-ink">The strategy</h2>
            {status && <span className={`rounded-full border px-3 py-1 text-base font-semibold ${status.cls}`}>v{strategy.version} · {status.label}</span>}
            {data?.objective && <span className="text-base text-ink-faint">Objective: {data.objective}</span>}
          </div>
          {/* Legend for the provenance badges used throughout, so "grounded" vs "assumption" is never a mystery. */}
          <p className="text-base text-ink-faint">
            <span className="mr-1.5 rounded bg-[#4ade80]/15 px-1.5 py-0.5 text-sm font-bold text-[#86efac]">grounded</span> traced to a verified fact ·
            <span className="mx-1.5 rounded bg-[#fbbf24]/15 px-1.5 py-0.5 text-sm font-bold text-[#fcd34d]">assumption</span> the Strategist&apos;s reasoning, not in the fact base yet
          </p>

          {/* PROPOSITION */}
          <section className="rounded-xl border border-accent/40 bg-surface-1 p-5">
            <div className="text-base font-semibold uppercase tracking-wide text-accent">The proposition</div>
            <p className="mt-2 text-2xl font-bold leading-snug text-ink">{content.proposition}</p>
          </section>

          <div className="grid gap-5 sm:grid-cols-2">
            <Block title="Target">
              <p className="text-lg font-semibold text-ink">{content.target?.segment}</p>
              <p className="mt-1 text-lg text-ink-dim">{content.target?.insight}</p>
            </Block>
            <Block title="Positioning">
              <p className="text-lg font-semibold text-ink">{content.positioning?.promise}</p>
              <ul className="mt-1.5 list-disc pl-5 text-lg text-ink-dim">{(content.positioning?.usps || []).map((u, i) => <li key={i}>{u}</li>)}</ul>
            </Block>
            <Block title="The angle">
              <p className="text-lg text-ink">{content.angle}</p>
            </Block>
            <Block title="Message hierarchy">
              <ol className="list-decimal pl-5 text-lg text-ink-dim">{(content.message_hierarchy || []).map((m, i) => <li key={i}>{m}</li>)}</ol>
            </Block>
          </div>

          {/* AUDIENCE BLUEPRINT - the proof of targeting ability (goes into the proposal). Who + how we reach, never a promised outcome. */}
          {content.audience && (
            <section className="rounded-xl border border-accent/40 bg-surface-1 p-5">
              <div className="text-base font-semibold uppercase tracking-wide text-accent">The target audience</div>
              {content.audience.overview && <p className="mt-2 text-lg text-ink-dim">{content.audience.overview}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(content.audience.personas || []).map((p, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-bold text-ink">{p.label}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${p.fact_id ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#fbbf24]/15 text-[#fcd34d]"}`}>{p.fact_id ? "grounded" : "assumption"}</span>
                    </div>
                    <p className="mt-1.5 text-base text-ink-faint"><b className="text-ink-dim">Trigger</b> · {p.trigger}</p>
                    <p className="mt-0.5 text-base text-ink-faint"><b className="text-ink-dim">Need</b> · {p.need}</p>
                    <p className="mt-0.5 text-base text-ink-faint"><b className="text-ink-dim">Who</b> · {p.who}</p>
                    {(p.signals || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">{p.signals.map((s, j) => <span key={j} className="rounded-full border border-line px-2 py-0.5 text-sm text-ink-dim">{s}</span>)}</div>
                    )}
                    <p className="mt-2 text-base text-ink-dim"><b className="text-ink">Why they convert</b> · {p.propensity}</p>
                    <p className="mt-1 text-base text-ink-dim"><b className="text-ink">Angle</b> · {p.angle}</p>
                    <p className="mt-1.5 text-sm text-ink-faint">Indicative reach · {p.scale}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Block title="Channel logic">
            <ul className="space-y-1.5">{(content.channel_logic || []).map((c, i) => (
              <li key={i} className="text-lg text-ink-dim"><b className="text-ink">{c.channel}</b> · {c.role}</li>
            ))}</ul>
          </Block>

          {/* KPIs */}
          <Block title="Objective + KPIs">
            <p className="text-lg text-ink-dim"><b className="text-ink">{content.objective?.type}</b> · {content.objective?.target}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-lg">
                <thead><tr className="border-b border-line text-base uppercase tracking-wide text-ink-faint">
                  <th className="py-1.5 pr-3 font-semibold">Metric</th><th className="py-1.5 pr-3 font-semibold">Target</th><th className="py-1.5 font-semibold">Baseline</th></tr></thead>
                <tbody>{(content.kpis || []).map((k, i) => (
                  <tr key={i} className="border-b border-line/50 last:border-0">
                    <td className="py-1.5 pr-3 text-ink">{k.metric}</td><td className="py-1.5 pr-3 tabular text-ink-dim">{k.target}</td><td className="py-1.5 tabular text-ink-faint">{k.baseline}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </Block>

          <Block title="Sales-ready definition"><p className="text-lg text-ink-dim">{content.sales_ready_def}</p></Block>

          {/* RATIONALE - each point grounded to a fact */}
          <Block title="Why this works (traced to the facts)">
            <ul className="space-y-2">{(content.rationale || []).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-lg text-ink-dim">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${r.fact_id ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#fbbf24]/15 text-[#fcd34d]"}`}>{r.fact_id ? "grounded" : "assumption"}</span>
                <span>{r.point}</span>
              </li>))}</ul>
          </Block>

          {content.changes_from_last?.length > 0 && (
            <Block title="What changed in this version">
              <ul className="space-y-1.5">{content.changes_from_last.map((c, i) => (
                <li key={i} className="text-lg text-ink-dim"><b className="text-ink">{c.change}</b> — {c.because}</li>
              ))}</ul>
            </Block>
          )}

          {content.market_opportunities?.length > 0 && (
            <section className="rounded-xl border border-[#60a5fa]/30 bg-surface-1 p-5">
              <div className="text-base font-semibold uppercase tracking-wide text-[#93c5fd]">Market opportunities · the whole board</div>
              <p className="mt-1 text-base text-ink-faint">Industry insights the client should consider, including beyond our digital scope. These carry into the proposal.</p>
              <ul className="mt-3 space-y-2">{content.market_opportunities.map((m, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-lg font-semibold text-ink">{m.insight}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${m.digital ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#60a5fa]/15 text-[#93c5fd]"}`}>{m.digital ? "our pods" : "beyond digital"}</span>
                  </div>
                  <div className="mt-0.5 text-base text-ink-dim">{m.why_it_matters}</div>
                </li>
              ))}</ul>
            </section>
          )}

          <section className="rounded-xl border border-[#f87171]/30 bg-surface-1 p-5">
            <div className="text-base font-semibold uppercase tracking-wide text-[#fca5a5]">Pre-mortem · risks</div>
            <ul className="mt-2 list-disc pl-5 text-lg text-ink-dim">{(content.risks || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          </section>

          {/* GATE 2 + edit */}
          {canGate && (
            <div className="rounded-xl border border-line bg-surface-1 p-5">
              <div className="text-lg font-bold text-ink">Gate 2 · your decision</div>
              <p className="mt-0.5 text-base text-ink-faint">Approve the direction, or refine it with a note first. Approving unlocks the Proposal, which is generated from this strategy below.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={approve} disabled={busy} className="rounded-lg bg-[#34c759] px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">Approve the strategy</button>
                <button onClick={() => setShowNotes((s) => !s)} disabled={busy} className="rounded-lg border border-line px-5 py-2.5 text-lg font-semibold text-ink-dim hover:text-ink">Refine with notes</button>
              </div>
              {showNotes && (
                <div className="mt-3">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                    placeholder="What to change. e.g. 'Lead on the value angle, not price. Drop the enterprise segment, focus SMB.'"
                    className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
                  <button onClick={refine} disabled={busy || !note.trim()} className="mt-2 rounded-lg bg-accent px-4 py-2 text-lg font-bold text-black disabled:opacity-50">Refine</button>
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

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="text-base font-semibold uppercase tracking-wide text-ink-faint">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}
