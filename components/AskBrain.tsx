"use client";

import { useEffect, useRef, useState } from "react";
import Working, { WORKING_ASK, WORKING_ASK_WEB } from "@/components/Working";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

// ASK THE BRAIN. The team's everyday way into a client's knowledge, wherever they are working.
//
// The retrieval and the answering already existed on the brain's own page, but that page lives under Setup -
// which reads as configuration, not as a daily tool, so nobody would think to look there. Someone writing a
// script needs the zero-fee list as much as the research desks do.
//
// Every answer shows WHAT IT READ. An answer you cannot check is worse than no answer on a brain that
// carries a client's proprietary material, and the passages are what make a claim traceable.

type Client = { id: string; name: string };
type Mode = "brain" | "mixed" | "claude" | "live";

// FOUR SOURCES, and the reader must always know which one they got. Brain leads and is the default: leaving
// the fence is a deliberate act, never something that happens by leaving a control alone.
//
// The distinction that earns "live" its own mode: a FETCHED claim can be cited, a REMEMBERED one cannot.
// Claude's training data has a cutoff, so its recollection of a client can simply be out of date - it may
// describe eGifts24 under its previous ownership, because the Stellr acquisition is recent. Collapsing "I
// looked this up just now, here is the link" into the same label as "I think I remember this" would throw
// away the only difference that lets someone check it.
const MODES: { id: Mode; label: string; note: string }[] = [
  { id: "brain", label: "Brain only", note: "Only this client's own material. Says so when it does not know." },
  { id: "mixed", label: "Brain + Claude", note: "The brain first, general knowledge to fill gaps. Every claim is labelled." },
  { id: "claude", label: "Claude only", note: "General knowledge. No client material is read at all." },
  { id: "live", label: "Brain + live web", note: "The brain, plus the web searched right now. Fetched claims are cited; remembered ones are marked separately." },
];
type Hit = { content: string; metadata: Record<string, unknown>; score: number };

export default function AskBrain({ clients, initialClientId, lockClient }: { clients: Client[]; initialClientId?: string; lockClient?: boolean }) {
  const [clientId, setClientId] = useState(initialClientId || clients[0]?.id || "");
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sharpening, setSharpening] = useState(false);
  const [tip, setTip] = useState<{ from: string; why: string } | null>(null);
  const [err, setErr] = useState("");
  const [openSources, setOpenSources] = useState(false);
  const [mode, setMode] = useState<Mode>("brain");
  const [answeredMode, setAnsweredMode] = useState<Mode>("brain");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"" | "added" | "duplicate">("");

  const brainName = clients.find((c) => c.id === clientId)?.name || "this brain";

  // The LIVE brain, so an answer that returns AFTER the user switched brains is discarded rather than rendered
  // under the wrong brain's name - provenance is the whole point of this screen, so a mislabelled answer is a bug.
  const clientRef = useRef(clientId);
  useEffect(() => { clientRef.current = clientId; }, [clientId]);

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text || !clientId || busy) return;
    const forClient = clientId;
    setBusy(true); setErr(""); setAnswer(""); setHits([]); setAsked(text); setOpenSources(false); setSaved("");
    const d = await fetch(`/api/brains/${forClient}/query`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: text, mode }),
    }).then((r) => r.json()).catch(() => null);
    if (clientRef.current !== forClient) return;   // switched brains mid-ask - drop this answer entirely
    setBusy(false);
    if (!d || d.error) { setErr(d?.error || "Could not reach the brain."); return; }
    setAnswer(d.answer || "");
    setHits(d.hits || []);
    // The mode the ANSWER was produced under, not whatever the control says now - otherwise changing the
    // selector after the fact would silently relabel an answer that is already on screen.
    setAnsweredMode((d.mode as Mode) || mode);
  }

  // SAVE THIS ANSWER INTO THE BRAIN so it compounds (Gary). A blended/web/Claude answer carries knowledge the
  // client has not verified, so we make that explicit and store it as an unverified note, never as ground truth.
  // Dedup on the server means "already there" is a real answer, not a duplicate.
  async function addToBrain() {
    if (saving || !answer) return;
    if (answeredMode !== "brain") {
      const ok = await askConfirm({
        title: "Add this answer to the brain?",
        body: "This answer includes general or web knowledge that is NOT part of the client's verified material. It will be saved as an UNVERIFIED note, tagged with where it came from, so it can never be mistaken for the client's own doctrine. Check it before you rely on it.",
        confirmLabel: "Save as a note",
      });
      if (!ok) return;
    }
    setSaving(true);
    const d = await fetch(`/api/brains/${clientId}/ingest-answer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: asked, answer, mode: answeredMode }),
    }).then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (!d?.ok) { flex(d?.error || "Couldn't add that to the brain."); return; }
    if (d.duplicate) { setSaved("duplicate"); flex("Already in the brain, nothing added."); return; }
    setSaved("added");
    flex(d.unverified ? "Saved to the brain as an unverified note." : "Saved to the brain.");
  }

  // Rewrite the question so it retrieves better, and SHOW what changed - the point is that the team learns to
  // ask well, not that they lean on a button.
  async function sharpen() {
    if (!q.trim() || sharpening) return;
    setSharpening(true); setTip(null);
    const d = await fetch(`/api/brains/${clientId}/sharpen`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, mode }),
    }).then((r) => r.json()).catch(() => null);
    setSharpening(false);
    if (!d?.sharpened) return;
    if (d.changed) { setTip({ from: q, why: d.why || "" }); setQ(d.sharpened); }
    else setTip({ from: "", why: d.why || "That question is already specific enough to search well." });
  }

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-line bg-surface-1 p-6">
        <div className="flex flex-wrap items-end gap-3">
          {!lockClient && (
            <div>
              <label className="tabular block text-sm uppercase tracking-[0.2em] text-ink-faint">Brain</label>
              <select value={clientId} onChange={(e) => { setClientId(e.target.value); setAnswer(""); setHits([]); setTip(null); setErr(""); setSaved(""); setBusy(false); }}
                className="mt-1.5 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink outline-none focus:border-accent">
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <p className="pb-2 text-[15px] text-ink-faint">
            {mode === "claude"
              ? <>Claude&apos;s general knowledge only. <b className="text-ink-dim">{brainName}</b>&apos;s own material is not read in this mode.</>
              : <>Grounded in <b className="text-ink-dim">{brainName}</b>&apos;s own material. No other client&apos;s brain is ever read.</>}
          </p>
        </div>

        <div className="mt-4">
          <div className="tabular text-sm uppercase tracking-[0.2em] text-ink-faint">Where the answer comes from</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`rounded-lg px-3.5 py-2 text-[16px] font-semibold transition ${
                  mode === m.id ? "bg-[#a855f7]/15 text-[#c79bff] ring-1 ring-[#a855f7]/40" : "border border-line text-ink-dim hover:text-ink"}`}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[15px] text-ink-faint">{MODES.find((m) => m.id === mode)?.note}</p>
        </div>

        <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }}
          placeholder="Ask anything this brain should know. For example: which services have zero transaction fees?"
          className="mt-4 w-full rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-lg leading-relaxed text-ink outline-none focus:border-accent" />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => ask()} disabled={busy || !q.trim()}
            className="btn-brand inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-lg font-bold disabled:opacity-50">
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {busy ? (mode === "live" ? "Searching…" : "Reading…") : "Ask"}
          </button>
          <button onClick={sharpen} disabled={sharpening || !q.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#a855f7]/40 px-4 py-2.5 text-lg font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">
            {sharpening && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#c79bff]/30 border-t-[#c79bff]" />}
            {sharpening ? "Thinking…" : "✦ Sharpen my question"}
          </button>
          <span className="text-[14px] text-ink-faint">⌘/Ctrl + Enter to ask</span>
        </div>
        {busy && <div className="mt-3 text-lg text-[#c79bff]"><Working messages={mode === "live" ? WORKING_ASK_WEB : WORKING_ASK} /></div>}

        {/* What the sharpener changed, and why. Shown rather than applied silently. */}
        {tip && (
          <div className="mt-4 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/[0.07] px-4 py-3">
            {tip.from
              ? <>
                  <p className="text-[15px] text-ink-dim">Was: <span className="line-through opacity-70">{tip.from}</span></p>
                  <p className="mt-1 text-[15px] text-[#c79bff]">{tip.why}</p>
                </>
              : <p className="text-[15px] text-[#c79bff]">{tip.why}</p>}
          </div>
        )}

        {err && <p className="mt-4 text-[16px] text-alert">{err}</p>}
      </div>

      {answer && (
        <div className="mt-5 rounded-xl border border-[#a855f7]/35 bg-[#a855f7]/[0.07] p-6">
          {/* THE BADGE. Someone will screenshot an answer and act on it, so it has to carry its own provenance
              - a blended answer must never be mistaken for client doctrine once it leaves this screen. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="tabular text-sm uppercase tracking-[0.18em] text-[#c79bff]">
              {answeredMode === "claude" ? "Claude says" : `${brainName} says`}
            </span>
            <span className={`tabular rounded-full px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.14em] ${
              answeredMode === "brain" ? "bg-ready/15 text-ready"
              : answeredMode === "mixed" ? "bg-[#fbbf24]/15 text-[#fcd34d]"
              : answeredMode === "live" ? "bg-[#60a5fa]/15 text-[#93c5fd]"
              : "bg-active/15 text-active"}`}>
              {answeredMode === "brain" ? "brain only"
               : answeredMode === "mixed" ? "brain + claude"
               : answeredMode === "live" ? "brain + live web"
               : "claude only — no client material"}
            </span>
          </div>
          {/* In mixed mode the model tags each claim [brain] or [general]. Rendered as coloured chips rather
              than left as raw brackets, so provenance is read at a glance instead of skimmed past. */}
          <p className="whitespace-pre-wrap text-[19px] leading-relaxed text-ink">
            {answeredMode === "mixed" || answeredMode === "live"
              ? answer.split(/(\[brain\]|\[general\]|\[web\])/g).map((part, i) =>
                  part === "[brain]" ? <span key={i} className="mr-1 rounded bg-ready/15 px-1.5 py-0.5 text-[13px] font-bold uppercase tracking-wide text-ready">brain</span>
                  : part === "[web]" ? <span key={i} className="mr-1 rounded bg-[#60a5fa]/15 px-1.5 py-0.5 text-[13px] font-bold uppercase tracking-wide text-[#93c5fd]">web</span>
                  : part === "[general]" ? <span key={i} className="mr-1 rounded bg-[#fbbf24]/15 px-1.5 py-0.5 text-[13px] font-bold uppercase tracking-wide text-[#fcd34d]">general</span>
                  : <span key={i}>{part}</span>)
              : answer}
          </p>
          {(answeredMode === "mixed" || answeredMode === "live") && (
            <p className="mt-4 text-[14px] text-[#fcd34d]">
              Anything marked <b>general</b> did not come from {brainName} and was not looked up - it is
              recollection, and may be out of date. <b>Web</b> claims were fetched just now and carry a source.
              Check both before they reach a client.
            </p>
          )}
          {asked && <p className="mt-4 text-[14px] text-ink-faint">You asked: {asked}</p>}
          {/* ADD TO BRAIN: compound a useful answer back into the knowledge base. Non-brain answers save as an
              explicitly unverified note (provenance kept), and the server dedups so "already there" is real. */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#a855f7]/20 pt-4">
            {saved === "added" ? (
              <span className="text-[15px] font-semibold text-[#86efac]">✓ Saved to the brain{answeredMode !== "brain" ? " as an unverified note" : ""}</span>
            ) : saved === "duplicate" ? (
              <span className="text-[15px] text-ink-dim">Already in the brain, nothing added.</span>
            ) : (
              <button onClick={addToBrain} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-[#86efac]/50 px-4 py-2 text-[15px] font-bold text-[#86efac] hover:bg-[#86efac]/10 disabled:opacity-50">
                {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
                {saving ? "Saving…" : "＋ Add this answer to the brain"}
              </button>
            )}
            {answeredMode !== "brain" && saved !== "added" && (
              <span className="text-[13px] text-[#fcd34d]">Saved as unverified, since it is not the client&apos;s own verified material.</span>
            )}
          </div>
        </div>
      )}

      {/* THE RECEIPTS. Collapsed by default so they do not bury the answer, but always one click away: an
          answer nobody can check is worth little on a brain holding a client's proprietary material. */}
      {hits.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setOpenSources((o) => !o)} className="text-[16px] font-semibold text-ink-dim hover:text-ink">
            {openSources ? "Hide" : "Show"} what it read to answer that ({hits.length})
          </button>
          {openSources && (
            <ul className="mt-3 space-y-2.5">
              {hits.map((h, i) => (
                <li key={i} className="rounded-lg border border-line bg-surface-1 p-4">
                  <div className="tabular mb-1.5 text-[13px] text-ink-faint">
                    match {Math.round(h.score * 100)}%
                    {(h.metadata?.title as string) ? ` · ${h.metadata.title}` : ""}
                  </div>
                  <div className="text-[15px] leading-relaxed text-ink-dim">
                    {h.content.slice(0, 420)}{h.content.length > 420 ? "…" : ""}
                  </div>
                  {(h.metadata?.url as string) && (
                    <a href={h.metadata.url as string} target="_blank" rel="noreferrer"
                      className="mt-2 inline-block text-[14px] text-accent hover:underline">Open the source ↗</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
