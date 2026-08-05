"use client";
import { useCallback, useEffect, useState } from "react";
import { OBJECTIVES, TIERS, type ObjectiveId, type TierId } from "@/lib/proposal-config";
import type { Proposal, ProposalContent } from "@/lib/proposal";

// THE PROPOSAL BUILDER (in the Strategist POD). Runs from an approved strategy: pick the objective and tier, build
// the client-facing growth proposal (Fable 5), review it. The branded PDF is the next increment. Never commits an
// outcome; figures are illustrative.
const PRIORITY: Record<string, { label: string; cls: string }> = {
  lead: { label: "Lead channel", cls: "bg-[#4ade80]/15 text-[#86efac]" },
  support: { label: "Support", cls: "bg-[#60a5fa]/15 text-[#93c5fd]" },
  test: { label: "Test", cls: "bg-[#fbbf24]/15 text-[#fcd34d]" },
};

export default function ProposalBuilder({ strategyId }: { strategyId: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [objective, setObjective] = useState<ObjectiveId>("leads");
  const [tier, setTier] = useState<TierId>("dominate");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/studio/proposal/latest?strategyId=${strategyId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.proposal) { setProposal(d.proposal); if (d.proposal.objective) setObjective(d.proposal.objective); if (d.proposal.tier) setTier(d.proposal.tier); }
  }, [strategyId]);
  useEffect(() => { load(); }, [load]);

  async function build() {
    setBusy(true); setMsg("Writing the proposal on Fable 5, this takes a moment…");
    const r = await fetch(`/api/studio/proposal/build`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategyId, objective, tier }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't build the proposal."); return; }
    setMsg(""); setProposal(r.proposal);
  }

  const c = (proposal?.content || null) as ProposalContent | null;

  return (
    <section className="rounded-xl border border-[#4ade80]/30 bg-surface-1 p-5">
      <div className="text-lg font-bold text-[#86efac]">The Proposal</div>
      <p className="mt-1 text-base text-ink-dim">Build the client-facing growth proposal from this approved strategy. Written on Fable 5, specific to the objective, with platform-level audience selections and an intelligent channel plan. Figures are illustrative, never a guarantee.</p>

      {/* CONFIG */}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Objective</span>
          <select value={objective} onChange={(e) => setObjective(e.target.value as ObjectiveId)}
            className="mt-1 block w-72 rounded-lg border border-line bg-surface-2 px-3 py-2 text-base outline-none focus:border-accent">
            {OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <div>
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Rate card</span>
          <div className="mt-1 flex rounded-lg border border-line p-0.5">
            {(Object.keys(TIERS) as TierId[]).map((t) => (
              <button key={t} onClick={() => setTier(t)}
                className={`rounded-md px-4 py-1.5 text-base font-semibold transition ${tier === t ? "bg-accent text-black" : "text-ink-dim hover:text-ink"}`}>
                {TIERS[t].name} · {TIERS[t].rate.replace(" / month excl VAT", "")}
              </button>
            ))}
          </div>
        </div>
        <button onClick={build} disabled={busy} className="rounded-lg bg-[#34c759] px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
          {busy ? "Working…" : proposal ? "Rebuild the proposal" : "Build the proposal"}
        </button>
      </div>
      {msg && <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-base text-ink-dim">{msg}</p>}

      {/* THE PROPOSAL DRAFT */}
      {c && (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-2xl font-extrabold text-ink">{c.headline}</h3>
            <p className="mt-1 text-lg text-ink-dim">{c.subhead}</p>
          </div>

          <Blk title="Executive summary">
            <p className="text-base text-ink-dim">{c.exec_summary?.intro}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(c.exec_summary?.cards || []).map((x, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="text-base font-bold text-ink">{x.title}</div>
                  <div className="mt-0.5 text-sm text-ink-dim">{x.body}</div>
                </div>
              ))}
            </div>
          </Blk>

          <Blk title="The opportunity">
            <p className="text-base text-ink-dim">{c.opportunity?.intro}</p>
            <p className="mt-2 rounded-lg border border-accent/30 bg-surface-2 p-3 text-base font-semibold text-ink">Definition of success · {c.opportunity?.definition_of_success}</p>
          </Blk>

          {/* AUDIENCE - the star: platform-level targeting */}
          <section className="rounded-xl border border-accent/50 bg-surface-1 p-5">
            <div className="text-sm font-semibold uppercase tracking-wide text-accent">The target audience · platform-level targeting</div>
            {c.audience?.overview && <p className="mt-2 text-base text-ink-dim">{c.audience.overview}</p>}
            <div className="mt-4 space-y-4">
              {(c.audience?.personas || []).map((p, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
                  <div className="text-lg font-bold text-ink">{p.label}</div>
                  <p className="mt-1 text-sm text-ink-faint"><b className="text-ink-dim">Trigger</b> · {p.trigger} &nbsp;·&nbsp; <b className="text-ink-dim">Need</b> · {p.need}</p>
                  <p className="mt-0.5 text-sm text-ink-faint"><b className="text-ink-dim">Who</b> · {p.who}</p>
                  <p className="mt-0.5 text-sm text-ink-dim"><b className="text-ink">Angle</b> · {p.angle}</p>
                  <div className="mt-3 space-y-2">
                    {(p.platforms || []).map((pl, j) => (
                      <div key={j} className="rounded-md border border-line/70 bg-surface-1 p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-accent/15 px-2 py-0.5 text-sm font-bold text-accent">{pl.platform}</span>
                          <span className="text-sm text-ink-faint">{pl.approach}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">{(pl.selections || []).map((s, k) => <span key={k} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-dim">{s}</span>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Blk title="Strategic recommendation">
            <p className="text-lg font-bold text-ink">{c.strategy?.proposition}</p>
            <p className="mt-1 text-base text-ink-dim">{c.strategy?.angle}</p>
            <ul className="mt-2 list-disc pl-5 text-base text-ink-dim">{(c.strategy?.why_it_wins || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
          </Blk>

          {/* CHANNELS - intelligent selection */}
          <Blk title="Channel plan · intelligently selected">
            <p className="text-base text-ink-dim">{c.channels?.rationale}</p>
            <div className="mt-3 space-y-2">
              {(c.channels?.plan || []).map((ch, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
                  <span className="rounded bg-accent/15 px-2 py-0.5 text-sm font-bold text-accent">{ch.platform}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${(PRIORITY[ch.priority] || PRIORITY.support).cls}`}>{(PRIORITY[ch.priority] || PRIORITY.support).label}</span>
                  <span className="text-sm text-ink"><b>{ch.role}</b></span>
                  <span className="w-full text-sm text-ink-faint">{ch.why}</span>
                </div>
              ))}
            </div>
          </Blk>

          <Blk title="The eight pods, mapped to the client">
            <div className="grid gap-3 sm:grid-cols-2">
              {(c.pods || []).map((pod, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="text-base font-bold text-ink">{pod.name}</div>
                  <div className="mt-0.5 text-sm text-ink-dim">{pod.for_client}</div>
                  <div className="mt-1 text-sm text-ink-faint">{pod.benefit}</div>
                </div>
              ))}
            </div>
          </Blk>

          <Blk title="Illustrative funnel economics">
            <p className="text-sm italic text-ink-faint">{c.funnel?.disclaimer}</p>
            <div className="mt-2 space-y-1.5">{(c.funnel?.stages || []).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-base text-ink-dim"><span className="font-bold text-ink">{s.stage}</span> · {s.note}</div>
            ))}</div>
          </Blk>

          <Blk title="KPIs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead><tr className="border-b border-line text-sm uppercase tracking-wide text-ink-faint"><th className="py-1.5 pr-3 font-semibold">Metric</th><th className="py-1.5 pr-3 font-semibold">Why</th><th className="py-1.5 font-semibold">Baseline</th></tr></thead>
                <tbody>{(c.kpis || []).map((k, i) => <tr key={i} className="border-b border-line/50 last:border-0"><td className="py-1.5 pr-3 text-ink">{k.metric}</td><td className="py-1.5 pr-3 text-ink-dim">{k.why}</td><td className="py-1.5 text-ink-faint">{k.baseline}</td></tr>)}</tbody>
              </table>
            </div>
          </Blk>

          <Blk title="31-day rollout">
            <div className="space-y-3">{(c.rollout || []).map((w, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="text-base font-bold text-ink">{w.week} · {w.title} <span className="text-sm font-normal text-ink-faint">· {w.pods}</span></div>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-dim">{(w.points || []).map((pt, j) => <li key={j}>{pt}</li>)}</ul>
                <div className="mt-1 text-sm font-semibold text-accent">Gate · {w.gate}</div>
              </div>
            ))}</div>
          </Blk>

          <Blk title="Compliance">
            <p className="text-base text-ink-dim">{c.compliance?.intro}</p>
            <ul className="mt-1.5 list-disc pl-5 text-base text-ink-dim">{(c.compliance?.points || []).map((p, i) => <li key={i}>{p}</li>)}</ul>
          </Blk>

          <section className="rounded-xl border border-accent/40 bg-surface-1 p-5">
            <div className="text-sm font-semibold uppercase tracking-wide text-accent">The investment</div>
            <div className="mt-1 text-2xl font-extrabold text-ink">{c.investment?.tier_name} · {c.investment?.rate}</div>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-base text-ink-dim sm:grid-cols-2">{(c.investment?.engine_includes || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            {(c.investment?.notes || []).map((n, i) => <p key={i} className="mt-2 text-sm text-ink-faint">{n}</p>)}
          </section>

          <div className="rounded-xl border border-line bg-surface-1 p-4 text-sm text-ink-faint">
            This is the proposal draft for your review. The client-branded PDF (their colours, professional iconography, GAS as Agency of NOW) is the next step, coming shortly.
          </div>
        </div>
      )}
    </section>
  );
}

function Blk({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}
