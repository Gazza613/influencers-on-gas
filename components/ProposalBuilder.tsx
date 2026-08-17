"use client";
import { useCallback, useEffect, useState } from "react";
import { OBJECTIVES, TIERS, type ObjectiveId, type TierId } from "@/lib/proposal-config";
import { PROPOSAL_SECTIONS, type Proposal, type ProposalContent } from "@/lib/proposal";
import Working, { WORKING_PROPOSAL, WORKING_PDF } from "@/components/Working";
import StructuredEditor from "@/components/StructuredEditor";

// THE PROPOSAL BUILDER (Step 4). Runs from an approved strategy: pick the objective + tier, build the client-facing
// growth proposal (Fable 5), then READ and GATE it section by section (Gary): approve each section, or edit it by
// prompt and "refine and rewrite" (Fable rewrites only that section). The branded PDF cuts once every section is
// approved. Human Command, AI Execution: the AI drafts, a senior human reads, steers and approves.
function arr<T>(v: T[] | null | undefined): T[] { return Array.isArray(v) ? v : []; }

const PRIORITY: Record<string, { label: string; cls: string }> = {
  lead: { label: "Lead channel", cls: "bg-[#4ade80]/15 text-[#86efac]" },
  support: { label: "Support", cls: "bg-[#60a5fa]/15 text-[#93c5fd]" },
  test: { label: "Test", cls: "bg-[#fbbf24]/15 text-[#fcd34d]" },
};

// Is this reviewable section actually present in the content (so we only gate on sections that render)?
function present(c: ProposalContent, key: string): boolean {
  const def = PROPOSAL_SECTIONS.find((s) => s.key === key);
  return !!def && def.fields.some((f) => (c as unknown as Record<string, unknown>)[f as string] != null);
}

export default function ProposalBuilder({ strategyId }: { strategyId: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [objective, setObjective] = useState<ObjectiveId>("leads");
  const [tier, setTier] = useState<TierId>("dominate");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [accent, setAccent] = useState("");   // optional client-colour override (auto-detected from their site if blank)
  const [dark, setDark] = useState("");        // optional DARK/background-page colour (near-black if blank)
  const [pdfBusy, setPdfBusy] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  // Per-section review state.
  const [editKey, setEditKey] = useState<string | null>(null);   // which section is open for editing
  const [editMode, setEditMode] = useState<"prompt" | "text" | null>(null);   // edit by prompt, or edit the text by hand
  const [prompt, setPrompt] = useState("");                       // the section edit instruction (prompt mode)
  const [draftValue, setDraftValue] = useState<Record<string, unknown> | null>(null);   // the hand-edited fields (text mode)
  const [sectionBusy, setSectionBusy] = useState<string | null>(null);   // which section is mid-refine/edit/approve

  function closeEdit() { setEditKey(null); setEditMode(null); setPrompt(""); setDraftValue(null); }
  // Open the hand-edit for a section: clone its current fields into an editable draft.
  function openText(skey: string) {
    if (!c) return;
    const def = PROPOSAL_SECTIONS.find((s) => s.key === skey);
    const val: Record<string, unknown> = {};
    for (const f of def?.fields || []) val[f as string] = JSON.parse(JSON.stringify((c as unknown as Record<string, unknown>)[f as string] ?? null));
    setEditKey(skey); setEditMode("text"); setPrompt(""); setDraftValue(val);
  }

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
    setMsg(""); setProposal(r.proposal); setEditKey(null); setPrompt("");
  }

  async function makePdf() {
    if (!proposal) return;
    setPdfBusy(true); setMsg("Rendering the branded PDF, this takes a moment…");
    const r = await fetch(`/api/studio/proposal/pdf`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, accent: accent.trim() || undefined, dark: dark.trim() || undefined }),
    }).then((x) => x.json()).catch(() => null);
    setPdfBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't render the PDF."); return; }
    setMsg(""); setProposal((p) => (p ? { ...p, pdf_url: r.url } : p));
  }

  // The whole-proposal gate: approve (only when every section is approved), reopen an approved proposal.
  async function gate(action: "approve" | "reopen") {
    if (!proposal) return;
    setGateBusy(true);
    const r = await fetch(`/api/studio/proposal/gate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, action }),
    }).then((x) => x.json()).catch(() => null);
    setGateBusy(false);
    if (!r?.ok) { setMsg(r?.error || "Couldn't complete that."); return; }
    setMsg("");
    if (r.proposal) setProposal(r.proposal); else await load();
  }

  // The per-section gate: refine by prompt (Fable rewrites only this section), edit the text by hand, approve, reopen.
  async function sectionAct(skey: string, action: "refine" | "edit" | "approve" | "reopen", payload?: { instruction?: string; value?: Record<string, unknown> }) {
    if (!proposal) return;
    setSectionBusy(skey);
    if (action === "refine" || action === "edit") setMsg("");
    const r = await fetch(`/api/studio/proposal/section`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, section: skey, action, instruction: payload?.instruction, value: payload?.value }),
    }).then((x) => x.json()).catch(() => null);
    setSectionBusy(null);
    if (!r?.ok) { setMsg(r?.error || "Couldn't do that."); return; }
    if (action === "refine" || action === "edit") closeEdit();
    if (r.proposal) setProposal(r.proposal);
  }

  const c = (proposal?.content || null) as ProposalContent | null;
  const locked = proposal?.status === "approved";
  const review = proposal?.section_review || {};
  const activeSections = c ? PROPOSAL_SECTIONS.filter((s) => present(c, s.key)) : [];
  const approvedCount = activeSections.filter((s) => review[s.key] === "approved").length;
  const allApproved = activeSections.length > 0 && approvedCount === activeSections.length;

  // A reviewable section: its content body + the human gate (approve, or edit-by-prompt then refine and rewrite).
  function section(skey: string, label: string, body: React.ReactNode) {
    const approved = review[skey] === "approved";
    const editingPrompt = editKey === skey && editMode === "prompt";
    const editingText = editKey === skey && editMode === "text";
    const busyHere = sectionBusy === skey;
    return (
      <section key={skey} className={`rounded-xl border ${approved ? "border-[#4ade80]/40" : "border-line"} bg-surface-1 p-5`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-base font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
          {approved
            ? <span className="rounded-full bg-[#4ade80]/15 px-2.5 py-0.5 text-sm font-bold text-[#86efac]">✓ Approved</span>
            : <span className="rounded-full bg-[#fbbf24]/15 px-2.5 py-0.5 text-sm font-bold text-[#fcd34d]">Needs review</span>}
        </div>
        <div className="mt-2">{editingText && draftValue ? <StructuredEditor value={draftValue} onChange={setDraftValue} /> : body}</div>
        {!locked && (
          <div className="mt-3 border-t border-line pt-3">
            {editingText ? (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => sectionAct(skey, "edit", { value: draftValue || {} })} disabled={busyHere}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-[15px] font-bold text-black disabled:opacity-50">
                  {busyHere && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
                  {busyHere ? "Saving…" : "Save my edits"}
                </button>
                <button onClick={closeEdit} className="text-[15px] font-semibold text-ink-faint hover:text-ink">Cancel</button>
                <span className="text-[13px] text-ink-faint">Saves your exact text, no AI.</span>
              </div>
            ) : editingPrompt ? (
              <div>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} autoFocus
                  placeholder={`How should the ${label.toLowerCase()} change? e.g. "lead with the price", "make it plainer", "shorten it"…`}
                  className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={() => sectionAct(skey, "refine", { instruction: prompt.trim() })} disabled={busyHere || !prompt.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-[15px] font-bold text-black disabled:opacity-50">
                    {busyHere && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
                    {busyHere ? "Rewriting…" : "Refine and rewrite now"}
                  </button>
                  <button onClick={closeEdit} className="text-[15px] font-semibold text-ink-faint hover:text-ink">Cancel</button>
                  <span className="text-[13px] text-ink-faint">Rewrites only this section, on Fable 5.</span>
                </div>
                {busyHere && <div className="mt-2 text-base text-accent"><Working messages={WORKING_PROPOSAL} /></div>}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {!approved && (
                  <button onClick={() => sectionAct(skey, "approve")} disabled={busyHere}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#34c759] px-3.5 py-1.5 text-[15px] font-bold text-black disabled:opacity-50">
                    {busyHere && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />}✓ Approve section
                  </button>
                )}
                <button onClick={() => { setEditKey(skey); setEditMode("prompt"); setPrompt(""); setDraftValue(null); }} disabled={busyHere}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-1.5 text-[15px] font-semibold text-ink-dim hover:text-ink disabled:opacity-50">✎ Edit by prompt</button>
                <button onClick={() => openText(skey)} disabled={busyHere}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-1.5 text-[15px] font-semibold text-ink-dim hover:text-ink disabled:opacity-50">⌨ Edit text</button>
                {approved && <button onClick={() => sectionAct(skey, "reopen")} disabled={busyHere} className="text-[15px] font-semibold text-ink-faint hover:text-ink">Reopen</button>}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[#4ade80]/30 bg-surface-1 p-5">
      <div className="text-lg font-bold text-[#86efac]">The Proposal</div>
      <p className="mt-1 text-lg text-ink-dim">Build the client-facing growth proposal from this approved strategy, then read it section by section: approve each one, or edit it by prompt and refine. The branded PDF cuts once every section is approved. Figures are illustrative, never a guarantee.</p>

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
          {busy ? "Working…" : proposal ? "Rebuild the whole proposal" : "Build the proposal"}
        </button>
      </div>
      <p className="mt-2 text-base text-ink-faint">Rebuild writes the whole proposal fresh (and clears your section approvals). To change one part, edit that section below instead. Brand colour: leave blank to read it from the client&apos;s site, or set it once to lock their exact colour.</p>
      {pdfBusy
        ? <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-lg text-accent"><Working messages={WORKING_PDF} /></div>
        : busy
          ? <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-lg text-accent"><Working messages={WORKING_PROPOSAL} /></div>
          : msg && <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-lg text-ink-dim">{msg}</p>}

      {/* THE PROPOSAL DRAFT, section by section */}
      {c && (
        <div className="mt-6 space-y-6">
          {section("cover", "Cover", (
            <div>
              <h3 className="text-2xl font-extrabold text-ink">{c.headline}</h3>
              <p className="mt-1 text-lg text-ink-dim">{c.subhead}</p>
            </div>
          ))}

          {section("exec_summary", "Executive summary", (
            <div>
              <p className="text-lg text-ink-dim">{c.exec_summary?.intro}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {arr(c.exec_summary?.cards).map((x, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="text-lg font-bold text-ink">{x.title}</div>
                    <div className="mt-0.5 text-base text-ink-dim">{x.body}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {section("opportunity", "The opportunity", (
            <div>
              <p className="text-lg text-ink-dim">{c.opportunity?.intro}</p>
              <p className="mt-2 rounded-lg border border-accent/30 bg-surface-2 p-3 text-lg font-semibold text-ink">Definition of success · {c.opportunity?.definition_of_success}</p>
            </div>
          ))}

          {section("audience", "The audience · platform-level targeting", (
            <div>
              {c.audience?.overview && <p className="text-lg text-ink-dim">{c.audience.overview}</p>}
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
            </div>
          ))}

          {section("strategy", "Strategic recommendation", (
            <div>
              <p className="text-lg font-bold text-ink">{c.strategy?.proposition}</p>
              <p className="mt-1 text-lg text-ink-dim">{c.strategy?.angle}</p>
              <ul className="mt-2 list-disc pl-5 text-lg text-ink-dim">{arr(c.strategy?.why_it_wins).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          ))}

          {c.market_intel && section("market_intel", "Market intelligence & opportunities", (
            <div>
              {c.market_intel.overview && <p className="text-lg text-ink-dim">{c.market_intel.overview}</p>}
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
            </div>
          ))}

          {section("channels", "Channel plan · intelligently selected", (
            <div>
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
            </div>
          ))}

          {section("pods", "The eight pods, mapped to the client", (
            <div className="grid gap-3 sm:grid-cols-2">
              {arr(c.pods).map((pod, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="text-lg font-bold text-ink">{pod.name}</div>
                  <div className="mt-0.5 text-base text-ink-dim">{pod.for_client}</div>
                  <div className="mt-1 text-base text-ink-faint">{pod.benefit}</div>
                </div>
              ))}
            </div>
          ))}

          {c.psi_chat && section("psi_chat", "PSI conversation", (
            <div>
              <div className="space-y-1.5">
                {arr(c.psi_chat.conversation).map((b, i) => (
                  <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-base ${b.role === "out" ? "ml-auto bg-accent/15 text-ink" : "bg-surface-2 text-ink-dim"}`}>{b.text}</div>
                ))}
              </div>
              <div className="mt-2 text-base font-semibold text-[#86efac]">{c.psi_chat.outcome}</div>
            </div>
          ))}

          {section("funnel", "Illustrative funnel economics", (
            <div>
              <p className="text-base italic text-ink-faint">{c.funnel?.disclaimer}</p>
              <div className="mt-2 space-y-1.5">{arr(c.funnel?.stages).map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-lg text-ink-dim"><span className="font-bold text-ink">{s.stage}</span> · {s.note}</div>
              ))}</div>
            </div>
          ))}

          {section("kpis", "KPIs", (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-lg">
                <thead><tr className="border-b border-line text-base uppercase tracking-wide text-ink-faint"><th className="py-1.5 pr-3 font-semibold">Metric</th><th className="py-1.5 pr-3 font-semibold">Why</th><th className="py-1.5 font-semibold">Baseline</th></tr></thead>
                <tbody>{arr(c.kpis).map((k, i) => <tr key={i} className="border-b border-line/50 last:border-0"><td className="py-1.5 pr-3 text-ink">{k.metric}</td><td className="py-1.5 pr-3 text-ink-dim">{k.why}</td><td className="py-1.5 text-ink-faint">{k.baseline}</td></tr>)}</tbody>
              </table>
            </div>
          ))}

          {section("rollout", "31-day rollout", (
            <div className="space-y-3">{arr(c.rollout).map((w, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="text-lg font-bold text-ink">{w.week} · {w.title} <span className="text-base font-normal text-ink-faint">· {w.pods}</span></div>
                <ul className="mt-1 list-disc pl-5 text-base text-ink-dim">{arr(w.points).map((pt, j) => <li key={j}>{pt}</li>)}</ul>
                <div className="mt-1 text-base font-semibold text-accent">Milestone · {w.gate}</div>
              </div>
            ))}</div>
          ))}

          {section("compliance", "Compliance", (
            <div>
              <p className="text-lg text-ink-dim">{c.compliance?.intro}</p>
              <ul className="mt-1.5 list-disc pl-5 text-lg text-ink-dim">{arr(c.compliance?.points).map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          ))}

          {section("investment", "The investment", (
            <div>
              <div className="text-2xl font-extrabold text-ink">{c.investment?.tier_name || TIERS[tier].name} · {c.investment?.rate || TIERS[tier].rate}</div>
              <ul className="mt-2 grid list-disc gap-1 pl-5 text-lg text-ink-dim sm:grid-cols-2">{arr(c.investment?.engine_includes).map((x, i) => <li key={i}>{x}</li>)}</ul>
              {arr(c.investment?.notes).map((n, i) => <p key={i} className="mt-2 text-base text-ink-faint">{n}</p>)}
            </div>
          ))}

          {/* THE FINAL GATE. The PDF only cuts after every section is approved. */}
          {!locked ? (
            <div className="rounded-xl border border-[#fbbf24]/40 bg-surface-1 p-5">
              <div className="text-lg font-bold text-[#fcd34d]">Your review · {approvedCount} of {activeSections.length} sections approved</div>
              <p className="mt-1 text-lg text-ink-dim">Read each section above and approve it, or edit it by prompt and refine. Once every section is approved, the proposal is ready for the branded PDF. Nothing is client-ready until you approve.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={() => gate("approve")} disabled={gateBusy || !allApproved}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#34c759] px-5 py-2.5 text-lg font-bold text-black disabled:opacity-50">
                  {gateBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
                  Approve the proposal →
                </button>
                {!allApproved && <span className="text-base text-ink-faint">Approve all {activeSections.length} sections to unlock the PDF.</span>}
              </div>
            </div>
          ) : (
            /* APPROVED -> the branded PDF (final cut). Client colours auto-detected, override if needed. */
            <div className="rounded-xl border border-accent/40 bg-surface-1 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-lg font-bold text-[#86efac]">Approved ✓ · the final cut</div>
                <button onClick={() => gate("reopen")} disabled={gateBusy} className="text-base font-semibold text-ink-faint hover:text-ink">Reopen to edit</button>
              </div>
              <p className="mt-1 text-lg text-ink-dim">Render the client-branded PDF for sign-off. The accent colour is detected from their website (override if needed); the dark pages default to black, set a hex if you want a branded dark. The white pages stay white.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-base text-ink-dim">
                  Accent colour
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#3a5bd9"} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface-2" />
                  {accent && <button onClick={() => setAccent("")} className="text-sm text-ink-faint hover:text-ink">auto-detect</button>}
                </label>
                <label className="flex items-center gap-2 text-base text-ink-dim">
                  Dark pages
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(dark) ? dark : "#0e1016"} onChange={(e) => setDark(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-surface-2" />
                  {dark && <button onClick={() => setDark("")} className="text-sm text-ink-faint hover:text-ink">black</button>}
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
