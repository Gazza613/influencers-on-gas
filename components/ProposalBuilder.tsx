"use client";
import { useCallback, useEffect, useState } from "react";
import { OBJECTIVES, TIERS, type ObjectiveId, type TierId } from "@/lib/proposal-config";
import type { Proposal, ProposalContent } from "@/lib/proposal";
import Working, { WORKING_PROPOSAL, WORKING_PDF } from "@/components/Working";

// THE PROPOSAL BUILDER (in the Strategist POD). Runs from an approved strategy: pick the objective and tier, build
// the client-facing growth proposal (Fable 5), review it. The branded PDF is the next increment. Never commits an
// outcome; figures are illustrative.
// A malformed field (the model sometimes returns a string where an array is expected) must never crash the page:
// coerce anything non-array to [] before mapping. Same guard as StrategyGate.
function arr<T>(v: T[] | null | undefined): T[] { return Array.isArray(v) ? v : []; }

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
  const [accent, setAccent] = useState("");   // optional client-colour override (auto-detected from their site if blank)
  const [pdfBusy, setPdfBusy] = useState(false);
  const [comments, setComments] = useState("");
  const [gateBusy, setGateBusy] = useState(false);

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

  async function makePdf() {
    if (!proposal) return;
    setPdfBusy(true); setMsg("Rendering the branded PDF, this takes a moment…");
    const r = await fetch(`/api/studio/proposal/pdf`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, accent: accent.trim() || undefined }),
    }).then((x) => x.json()).catch(() => null);
    setPdfBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't render the PDF."); return; }
    setMsg(""); setProposal((p) => (p ? { ...p, pdf_url: r.url } : p));
  }

  async function gate(action: "refine" | "approve" | "reopen") {
    if (!proposal) return;
    if (action === "refine" && !comments.trim()) { setMsg("Add your comments to send it back."); return; }
    setGateBusy(true);
    if (action === "refine") setMsg("Reworking the proposal against your comments on Fable 5…");
    const r = await fetch(`/api/studio/proposal/gate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, action, comments: comments.trim() }),
    }).then((x) => x.json()).catch(() => null);
    setGateBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't complete that."); return; }
    setMsg(""); setComments("");
    if (r.proposal) setProposal(r.proposal); else await load();
  }

  const c = (proposal?.content || null) as ProposalContent | null;
  const approved = proposal?.status === "approved";

  return (
    <section className="rounded-xl border border-[#4ade80]/30 bg-surface-1 p-5">
      <div className="text-lg font-bold text-[#86efac]">The Proposal</div>
      <p className="mt-1 text-lg text-ink-dim">Build the client-facing growth proposal from this approved strategy. Written on Fable 5, specific to the objective, with platform-level audience selections and an intelligent channel plan. Figures are illustrative, never a guarantee.</p>

      {/* CONFIG */}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-base font-semibold uppercase tracking-wide text-ink-faint">Objective</span>
          <select value={objective} onChange={(e) => setObjective(e.target.value as ObjectiveId)}
            className="mt-1 block w-72 rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg outline-none focus:border-accent">
            {OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <div>
          <span className="text-base font-semibold uppercase tracking-wide text-ink-faint">Rate card</span>
          <div className="mt-1 flex rounded-lg border border-line p-0.5">
            {(Object.keys(TIERS) as TierId[]).map((t) => (
              <button key={t} onClick={() => setTier(t)}
                className={`rounded-md px-4 py-1.5 text-lg font-semibold transition ${tier === t ? "bg-accent text-black" : "text-ink-dim hover:text-ink"}`}>
                {TIERS[t].name} · {TIERS[t].rate.replace(" / month excl VAT", "")}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-base font-semibold uppercase tracking-wide text-ink-faint">Client brand colour</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#3a5bd9"} onChange={(e) => setAccent(e.target.value)} aria-label="Client brand colour" className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface-2 p-1" />
            <input value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="Auto from site" className="w-36 rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg outline-none focus:border-accent" />
            {accent && <button type="button" onClick={() => setAccent("")} className="text-base font-semibold text-ink-faint hover:text-ink">Auto</button>}
          </div>
        </label>
        <button onClick={build} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#34c759] px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
          {busy ? "Working…" : proposal ? "Rebuild the proposal" : "Build the proposal"}
        </button>
      </div>
      <p className="mt-2 text-base text-ink-faint">Brand colour: leave blank to read it from the client&apos;s site automatically, or set it once here to lock their exact colour. A locked colour is saved to the client and reused on every future proposal, so you never set it twice.</p>
      {pdfBusy
        ? <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-lg text-accent"><Working messages={WORKING_PDF} /></div>
        : (busy || gateBusy)
          ? <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-lg text-accent"><Working messages={WORKING_PROPOSAL} /></div>
          : msg && <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-lg text-ink-dim">{msg}</p>}

      {/* THE PROPOSAL DRAFT */}
      {c && (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-2xl font-extrabold text-ink">{c.headline}</h3>
            <p className="mt-1 text-lg text-ink-dim">{c.subhead}</p>
          </div>

          <Blk title="Executive summary">
            <p className="text-lg text-ink-dim">{c.exec_summary?.intro}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {arr(c.exec_summary?.cards).map((x, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="text-lg font-bold text-ink">{x.title}</div>
                  <div className="mt-0.5 text-base text-ink-dim">{x.body}</div>
                </div>
              ))}
            </div>
          </Blk>

          <Blk title="The opportunity">
            <p className="text-lg text-ink-dim">{c.opportunity?.intro}</p>
            <p className="mt-2 rounded-lg border border-accent/30 bg-surface-2 p-3 text-lg font-semibold text-ink">Definition of success · {c.opportunity?.definition_of_success}</p>
          </Blk>

          {/* AUDIENCE - the star: platform-level targeting */}
          <section className="rounded-xl border border-accent/50 bg-surface-1 p-5">
            <div className="text-base font-semibold uppercase tracking-wide text-accent">The target audience · platform-level targeting</div>
            {c.audience?.overview && <p className="mt-2 text-lg text-ink-dim">{c.audience.overview}</p>}
            <div className="mt-4 space-y-4">
              {arr(c.audience?.personas).map((p, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-4">
                  <div className="text-lg font-bold text-ink">{p.label}</div>
                  <p className="mt-1 text-base text-ink-faint"><b className="text-ink-dim">Trigger</b> · {p.trigger} &nbsp;·&nbsp; <b className="text-ink-dim">Need</b> · {p.need}</p>
                  <p className="mt-0.5 text-base text-ink-faint"><b className="text-ink-dim">Who</b> · {p.who}</p>
                  <p className="mt-0.5 text-base text-ink-dim"><b className="text-ink">Angle</b> · {p.angle}</p>
                  <div className="mt-3 space-y-2">
                    {arr(p.platforms).map((pl, j) => (
                      <div key={j} className="rounded-md border border-line/70 bg-surface-1 p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-accent/15 px-2 py-0.5 text-base font-bold text-accent">{pl.platform}</span>
                          <span className="text-base text-ink-faint">{pl.approach}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">{arr(pl.selections).map((s, k) => <span key={k} className="rounded-full border border-line px-2 py-0.5 text-sm text-ink-dim">{s}</span>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Blk title="Strategic recommendation">
            <p className="text-lg font-bold text-ink">{c.strategy?.proposition}</p>
            <p className="mt-1 text-lg text-ink-dim">{c.strategy?.angle}</p>
            <ul className="mt-2 list-disc pl-5 text-lg text-ink-dim">{arr(c.strategy?.why_it_wins).map((w, i) => <li key={i}>{w}</li>)}</ul>
          </Blk>

          {/* MARKET INTELLIGENCE - proves industry expertise, incl. non-digital opportunities */}
          {c.market_intel && (
            <section className="rounded-xl border border-[#60a5fa]/40 bg-surface-1 p-5">
              <div className="text-base font-semibold uppercase tracking-wide text-[#93c5fd]">Market intelligence & opportunities</div>
              {c.market_intel.overview && <p className="mt-2 text-lg text-ink-dim">{c.market_intel.overview}</p>}
              {arr(c.market_intel?.stats).length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {c.market_intel.stats.map((s, i) => (
                    <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                      <div className="text-lg font-bold text-ink">{s.stat}</div>
                      <div className="mt-0.5 text-sm text-ink-faint">{s.source}</div>
                    </div>
                  ))}
                </div>
              )}
              {arr(c.market_intel?.opportunities).length > 0 && (
                <ul className="mt-3 space-y-2">{c.market_intel.opportunities.map((o, i) => (
                  <li key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-lg font-semibold text-ink">{o.insight}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${o.digital ? "bg-[#4ade80]/15 text-[#86efac]" : "bg-[#60a5fa]/15 text-[#93c5fd]"}`}>{o.digital ? "our pods" : "beyond digital"}</span>
                    </div>
                    <div className="mt-0.5 text-base text-ink-dim">{o.why}</div>
                  </li>
                ))}</ul>
              )}
            </section>
          )}

          {/* CHANNELS - intelligent selection */}
          <Blk title="Channel plan · intelligently selected">
            <p className="text-lg text-ink-dim">{c.channels?.rationale}</p>
            <div className="mt-3 space-y-2">
              {arr(c.channels?.plan).map((ch, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
                  <span className="rounded bg-accent/15 px-2 py-0.5 text-base font-bold text-accent">{ch.platform}</span>
                  <span className={`rounded px-1.5 py-0.5 text-sm font-bold ${(PRIORITY[ch.priority] || PRIORITY.support).cls}`}>{(PRIORITY[ch.priority] || PRIORITY.support).label}</span>
                  <span className="text-base text-ink"><b>{ch.role}</b></span>
                  <span className="w-full text-base text-ink-faint">{ch.why}</span>
                </div>
              ))}
            </div>
          </Blk>

          <Blk title="The eight pods, mapped to the client">
            <div className="grid gap-3 sm:grid-cols-2">
              {arr(c.pods).map((pod, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="text-lg font-bold text-ink">{pod.name}</div>
                  <div className="mt-0.5 text-base text-ink-dim">{pod.for_client}</div>
                  <div className="mt-1 text-base text-ink-faint">{pod.benefit}</div>
                </div>
              ))}
            </div>
          </Blk>

          <Blk title="Illustrative funnel economics">
            <p className="text-base italic text-ink-faint">{c.funnel?.disclaimer}</p>
            <div className="mt-2 space-y-1.5">{arr(c.funnel?.stages).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-lg text-ink-dim"><span className="font-bold text-ink">{s.stage}</span> · {s.note}</div>
            ))}</div>
          </Blk>

          <Blk title="KPIs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-lg">
                <thead><tr className="border-b border-line text-base uppercase tracking-wide text-ink-faint"><th className="py-1.5 pr-3 font-semibold">Metric</th><th className="py-1.5 pr-3 font-semibold">Why</th><th className="py-1.5 font-semibold">Baseline</th></tr></thead>
                <tbody>{arr(c.kpis).map((k, i) => <tr key={i} className="border-b border-line/50 last:border-0"><td className="py-1.5 pr-3 text-ink">{k.metric}</td><td className="py-1.5 pr-3 text-ink-dim">{k.why}</td><td className="py-1.5 text-ink-faint">{k.baseline}</td></tr>)}</tbody>
              </table>
            </div>
          </Blk>

          <Blk title="31-day rollout">
            <div className="space-y-3">{arr(c.rollout).map((w, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="text-lg font-bold text-ink">{w.week} · {w.title} <span className="text-base font-normal text-ink-faint">· {w.pods}</span></div>
                <ul className="mt-1 list-disc pl-5 text-base text-ink-dim">{arr(w.points).map((pt, j) => <li key={j}>{pt}</li>)}</ul>
                <div className="mt-1 text-base font-semibold text-accent">Gate · {w.gate}</div>
              </div>
            ))}</div>
          </Blk>

          <Blk title="Compliance">
            <p className="text-lg text-ink-dim">{c.compliance?.intro}</p>
            <ul className="mt-1.5 list-disc pl-5 text-lg text-ink-dim">{arr(c.compliance?.points).map((p, i) => <li key={i}>{p}</li>)}</ul>
          </Blk>

          <section className="rounded-xl border border-accent/40 bg-surface-1 p-5">
            <div className="text-base font-semibold uppercase tracking-wide text-accent">The investment</div>
            <div className="mt-1 text-2xl font-extrabold text-ink">{c.investment?.tier_name || TIERS[tier].name} · {c.investment?.rate || TIERS[tier].rate}</div>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-lg text-ink-dim sm:grid-cols-2">{arr(c.investment?.engine_includes).map((x, i) => <li key={i}>{x}</li>)}</ul>
            {arr(c.investment?.notes).map((n, i) => <p key={i} className="mt-2 text-base text-ink-faint">{n}</p>)}
          </section>

          {/* STRATEGIST GATE (Human Command). Review the draft: send it back with comments, or approve for the
              final cut. The PDF only cuts after a human approves. */}
          {!approved ? (
            <div className="rounded-xl border border-[#fbbf24]/40 bg-surface-1 p-5">
              <div className="text-lg font-bold text-[#fcd34d]">Strategist review · your gate</div>
              <p className="mt-1 text-lg text-ink-dim">You have read the full proposal above. Add any comments to rework it, or approve it as is for the final cut. Nothing is client-ready until you approve.</p>
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={4}
                placeholder="Comments to rework (leave blank to accept as is). e.g. 'Lead the audience on the LinkedIn segment for the business-owner persona. Test TikTok, do not lead with it. Tighten the funnel note.'"
                className="mt-3 w-full resize-y rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={() => gate("refine")} disabled={gateBusy || !comments.trim()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
                  {gateBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
                  {gateBusy ? "Reworking…" : "Rework with my comments"}
                </button>
                <button onClick={() => gate("approve")} disabled={gateBusy} className="inline-flex items-center gap-2 rounded-lg bg-[#34c759] px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
                  {gateBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
                  Approve as is →
                </button>
              </div>
              {/* The rework runs a full Fable-5 pass and can take a minute; show it right here, where the click was,
                  not only in the status line far above (Gary: no visible spinner near the button). */}
              {gateBusy && <div className="mt-3 text-lg text-accent"><Working messages={WORKING_PROPOSAL} /></div>}
            </div>
          ) : (
            /* APPROVED -> the branded PDF (final cut). Client colours auto-detected, override if needed. */
            <div className="rounded-xl border border-accent/40 bg-surface-1 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-lg font-bold text-[#86efac]">Approved ✓ · the final cut</div>
                <button onClick={() => gate("reopen")} disabled={gateBusy} className="text-base font-semibold text-ink-faint hover:text-ink">Reopen to edit</button>
              </div>
              <p className="mt-1 text-lg text-ink-dim">Render the client-branded PDF for sign-off. The client&apos;s accent colour is detected from their website; override it if needed.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-base text-ink-dim">
                  Client colour
                  <input type="color" value={accent || "#3a5bd9"} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface-2" />
                  {accent && <button onClick={() => setAccent("")} className="text-sm text-ink-faint hover:text-ink">auto-detect</button>}
                </label>
                <button onClick={makePdf} disabled={pdfBusy} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
                  {pdfBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
                  {pdfBusy ? "Rendering…" : proposal?.pdf_url ? "Re-render PDF" : "Cut the final PDF"}
                </button>
                {proposal?.pdf_url && <a href={proposal.pdf_url} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-5 py-2.5 text-lg font-semibold text-ink-dim hover:text-ink">Download PDF ↓</a>}
              </div>
              <p className="mt-2 text-base text-ink-faint">Reproduces GAS&apos;s standard terms and sign-off. Figures are illustrative, never a guarantee.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Blk({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="text-base font-semibold uppercase tracking-wide text-ink-faint">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}
