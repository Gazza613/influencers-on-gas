"use client";
import { useState } from "react";
import Working from "@/components/Working";
import IntelEmailControl from "@/components/IntelEmailControl";
import LivingResearch from "@/components/LivingResearch";

// ASK THE MARKET A QUESTION (Gary). The Strategist desk, on demand: type a market question about a client and get
// the same sourced assessment the daily email gives - what changed, what it could do, and the DEFENSIVE/PROACTIVE
// move - without waiting for the schedule. Runs the real desk (scope-locked, never invents), so the answer is
// trustworthy and its findings also land in the /strategist review queue.

type Client = { id: string; name: string };
type Finding = {
  id?: string;
  headline: string; why_it_matters: string; detail: string | null;
  impact_risk: string | null; campaign_response: string | null; material: boolean;
  sources: { name: string; url: string }[];
};

const WORKING_MARKET = [
  "Scanning the market right now…",
  "Reading what the rivals just did…",
  "Weighing what it means for the client…",
  "Grading the move: defensive or proactive…",
  "Writing it up with the sources…",
];

export default function MarketQuestion({ clients }: { clients: Client[] }) {
  // On the landing view the brain always defaults to GAS Marketing (Gary), our own brain, then the team switches.
  const gasDefault = clients.find((c) => /gas\s*marketing/i.test(c.name))?.id || clients.find((c) => /\bgas\b/i.test(c.name))?.id;
  const [clientId, setClientId] = useState(gasDefault || clients[0]?.id || "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [err, setErr] = useState("");
  // The CEO thought-leadership draft flow (one open at a time).
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [art, setArt] = useState("");
  const [recips, setRecips] = useState("");
  const [ceoName, setCeoName] = useState("");
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState("");
  const [draftErr, setDraftErr] = useState("");
  // Add-to-Brain (accepts the finding so it is kept for the brain rather than binned).
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState("");
  const [showAuto, setShowAuto] = useState(false); // the automation/schedule block is collapsed to keep the panel short

  const CEO_API = "/api/studio/intel/ceo-article";

  // Save a finding to the brain: accept it (the gate that keeps it) rather than letting it sit unreviewed.
  async function addToBrain(f: Finding) {
    if (!f.id || addingId) return;
    setAddingId(f.id);
    const d = await fetch(`/api/studio/intel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, id: f.id, status: "accepted" }),
    }).then((r) => r.json()).catch(() => null);
    setAddingId("");
    if (d?.ok) setAddedIds((prev) => new Set(prev).add(f.id!));
  }

  // Draft the CEO's article from a finding, and prefill the saved recipient(s) for this brain.
  async function draftArticle(f: Finding) {
    if (!f.id || drafting) return;
    setDraftFor(f.id); setDrafting(true); setDraftErr(""); setDraftText(""); setSentFor("");
    const [d, rec] = await Promise.all([
      fetch(CEO_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", clientId, id: f.id }) }).then((r) => r.json()).catch(() => null),
      fetch(`${CEO_API}?clientId=${encodeURIComponent(clientId)}`).then((r) => r.json()).catch(() => null),
    ]);
    setDrafting(false);
    if (!d?.ok) { setDraftErr(d?.error || "Couldn't draft that."); return; }
    setDraftText(d.post || ""); setArt(d.art?.subject || "");
    if (rec?.ceoName) setCeoName(rec.ceoName);
    if (Array.isArray(rec?.recipients) && rec.recipients.length && !recips) setRecips(rec.recipients.join(", "));
  }

  // Send the (edited) article to the CEO's email(s); bcc's the sender.
  async function sendArticle(f: Finding) {
    if (!f.id || sending) return;
    const recipients = recips.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) { setDraftErr("Add at least one recipient email."); return; }
    setSending(true); setDraftErr("");
    const d = await fetch(CEO_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", clientId, id: f.id, recipients, post: draftText }) }).then((r) => r.json()).catch(() => null);
    setSending(false);
    if (!d?.ok) { setDraftErr(d?.error || "Couldn't send."); return; }
    setSentFor(f.id); setDraftFor(null);
  }

  // TWO MODES (Gary): "question" answers a specific ask (looks back ~90 days); "discover" proactively finds what is
  // NEW and relevant to the brain with no question typed (only ~14 days, so it surfaces genuine change).
  async function ask(mode: "question" | "discover" = "question") {
    if (busy || !clientId) return;
    if (mode === "question" && !q.trim()) return;
    setBusy(true); setErr(""); setFindings(null); setDraftFor(null); setSentFor(""); setDraftErr(""); setAddedIds(new Set());
    const d = await fetch(`/api/studio/intel/ask`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, question: mode === "question" ? q : "", mode }),
    }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { setErr(d?.error || "Couldn't run that."); return; }
    setFindings(Array.isArray(d.findings) ? d.findings : []);
  }

  const brainName = clients.find((c) => c.id === clientId)?.name || "this brain";

  return (
    <div className="relative isolate overflow-hidden rounded-2xl border border-[#ec4899]/25 p-6"
      style={{ background: "linear-gradient(160deg,#151022,#0d0a16)" }}>
      {/* Accent glow, corner to corner, behind the content (Gary's Neon Bento look). */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(80% 120% at 0% 0%, rgba(236,72,153,0.16), transparent 52%), radial-gradient(70% 120% at 100% 100%, rgba(168,85,247,0.12), transparent 55%)" }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* The Living Researcher radar (same signature visual as the Researcher step), always sweeping so the pod
              reads as live. The section title sits beside it. */}
          <div className="h-14 w-14 shrink-0"><LivingResearch lit={0.7} active /></div>
          <div>
            <h3 className="text-[19px] font-bold tracking-tight text-ink">Daily Intelligence</h3>
            <p className="text-sm text-ink-dim">The market, on demand.</p>
          </div>
        </div>
        <span className="w-full text-left text-[11px] font-semibold uppercase leading-relaxed tracking-[0.1em] text-ink-dim sm:w-auto sm:text-right">Live Market Intelligence pod<br />sourced, never invented</span>
      </div>
      <p className="mt-3.5 max-w-[94ch] text-[13px] leading-relaxed text-ink-dim">Two ways to run it. <b className="text-ink">Ask the market</b> a specific question and the pod researches the last 3 months to answer it, with the move it argues for. <b className="text-ink">Find what&rsquo;s new</b> needs no question: it proactively surfaces the freshest shifts, threats and openings from the past 2 weeks.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="tabular block text-[10px] uppercase tracking-[0.2em] text-ink-faint">Brain</span>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setFindings(null); setErr(""); }}
            className="mt-1.5 rounded-lg border border-[#a855f7]/30 bg-[#0d0a16] px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-[#a855f7]">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask("question"); }}
        placeholder={`e.g. What has changed in ${brainName}'s market recently, and what should we do about it? What did a key rival just do?`}
        className="mt-3 w-full rounded-lg border border-[#a855f7]/30 bg-[#0d0a16] px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none focus:border-[#a855f7]" />
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <button onClick={() => ask("question")} disabled={busy || !q.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-5 py-2.5 text-[13.5px] font-bold text-white shadow-[0_8px_24px_-12px_#a855f7] transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0">
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
          {busy ? "Scanning…" : "Ask the market"}
        </button>
        <button onClick={() => ask("discover")} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-[#a855f7]/40 bg-[#a855f7]/10 px-5 py-2.5 text-[13.5px] font-bold text-ink transition hover:-translate-y-0.5 hover:border-[#a855f7] disabled:opacity-50 disabled:hover:translate-y-0">
          ✦ Find what&rsquo;s new
        </button>
        <span className="text-[11px] text-ink-faint">⌘/Ctrl + Enter · takes a minute, it searches the web live</span>
      </div>

      {/* AUTOMATION collapsed by default (Gary: the section was too long). One toggle under the buttons reveals the
          schedule + recipients + the CEO-article cadence for the selected brain. */}
      {clientId && (
        <div className="mt-3 border-t border-line pt-3">
          <button onClick={() => setShowAuto((v) => !v)}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-dim hover:text-ink">
            <span className={`inline-flex shrink-0 text-[#a855f7] transition-transform ${showAuto ? "rotate-90" : ""}`} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 6l6 6-6 6" /></svg>
            </span>
            Automation and delivery
            <span className="text-[11.5px] font-normal text-ink-faint">· schedule this brain, set recipients, auto-draft the CEO article</span>
          </button>
          {showAuto && <div className="mt-4"><IntelEmailControl clientId={clientId} clientName={brainName} /></div>}
        </div>
      )}

      {busy && <div className="mt-4 text-base text-accent"><Working messages={WORKING_MARKET} /></div>}
      {err && <p className="mt-4 text-base text-alert">{err}</p>}

      {findings && !busy && (
        <div className="mt-5 space-y-3">
          {findings.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-base text-ink-dim">Nothing solid came back on that. A quiet answer is a real one, the pod never pads or invents. Try a sharper question.</p>
          ) : findings.map((f, i) => {
            const move = String(f.campaign_response || "");
            const tag = /\bdefensive\b/i.test(move) && /\bproactive\b/i.test(move) ? "defensive + proactive" : /\bdefensive\b/i.test(move) ? "defensive" : /\bproactive\b/i.test(move) ? "proactive" : "";
            return (
              <div key={i} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="flex-1 text-lg font-bold text-ink">{f.headline}</h4>
                  {tag && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide ${tag.includes("defensive") ? "bg-[#f87171]/15 text-[#fca5a5]" : "bg-[#4ade80]/15 text-[#86efac]"}`}>{tag}</span>}
                </div>
                {f.why_it_matters && <p className="mt-1.5 text-base text-ink-dim"><b className="text-ink">Why it matters</b> · {f.why_it_matters}</p>}
                {f.detail && <p className="mt-1.5 whitespace-pre-wrap text-base text-ink-dim">{f.detail}</p>}
                {f.impact_risk && <p className="mt-2 rounded-lg border border-[#fbbf24]/25 bg-[#fbbf24]/[0.05] px-3 py-2 text-base text-ink-dim"><b className="text-[#fcd34d]">What it could do</b> · {f.impact_risk}</p>}
                {f.campaign_response && <p className="mt-1.5 rounded-lg border border-accent/25 bg-accent/[0.05] px-3 py-2 text-base text-ink-dim"><b className="text-accent">The move</b> · {f.campaign_response}</p>}
                {f.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {f.sources.map((s, j) => <a key={j} href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{s.name || "source"} ↗</a>)}
                  </div>
                )}

                {/* CEO THOUGHT-LEADERSHIP (Gary): draft this finding into the client CEO's LinkedIn piece, then email it. */}
                {f.id && (
                  <div className="mt-3 border-t border-line pt-3">
                    {sentFor === f.id ? (
                      <p className="text-base font-semibold text-[#86efac]">✓ Article emailed to the CEO. A copy is in your inbox.</p>
                    ) : draftFor === f.id ? (
                      <div>
                        {drafting ? (
                          <p className="text-base text-accent">Drafting the CEO&rsquo;s article…</p>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="tabular text-sm uppercase tracking-[0.16em] text-ink-faint">CEO article{ceoName ? ` · ${ceoName}` : ""} · edit before sending</span>
                              {art && <span className="text-sm text-ink-faint">Image idea: {art}</span>}
                            </div>
                            <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={12}
                              className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base leading-relaxed text-ink outline-none focus:border-accent" />
                            <label className="mt-3 block">
                              <span className="tabular block text-sm uppercase tracking-[0.16em] text-ink-faint">Send to (CEO email, comma-separated)</span>
                              <input value={recips} onChange={(e) => setRecips(e.target.value)} placeholder="kagiso@mtn.com, ea@mtn.com"
                                className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-base text-ink outline-none focus:border-accent" />
                            </label>
                            {draftErr && <p className="mt-2 text-base text-alert">{draftErr}</p>}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button onClick={() => sendArticle(f)} disabled={sending || !recips.trim()}
                                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#ec4899] to-[#a855f7] px-5 py-2 text-base font-bold text-white shadow-[0_8px_24px_-12px_#a855f7] hover:opacity-90 disabled:opacity-50">
                                {sending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                                {sending ? "Sending…" : "Approve & send to CEO"}
                              </button>
                              <button onClick={() => draftArticle(f)} disabled={drafting || sending} className="rounded-lg border border-line px-4 py-2 text-base text-ink-dim hover:text-ink disabled:opacity-50">Redraft</button>
                              <button onClick={() => { setDraftFor(null); setDraftErr(""); }} className="rounded-lg px-3 py-2 text-base text-ink-faint hover:text-ink">Cancel</button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {addedIds.has(f.id) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#4ade80]/40 bg-[#4ade80]/10 px-4 py-2 text-base font-semibold text-[#86efac]">✓ Added to brain</span>
                        ) : (
                          <button onClick={() => addToBrain(f)} disabled={addingId === f.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink-dim hover:text-ink hover:border-line-strong disabled:opacity-50">
                            {addingId === f.id ? "Adding…" : "＋ Add to brain"}
                          </button>
                        )}
                        <button onClick={() => draftArticle(f)} disabled={drafting}
                          className="inline-flex items-center gap-2 rounded-lg border border-accent/50 px-4 py-2 text-base font-semibold text-accent hover:bg-accent/10 disabled:opacity-50">
                          ✍️ Write me a LinkedIn article
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-sm text-ink-faint">These also land in <a href="/strategist" className="text-accent hover:underline">The Strategist · Daily Intelligence</a> queue to accept or bin.</p>
        </div>
      )}
    </div>
  );
}
