"use client";
import { useState } from "react";
import Working from "@/components/Working";
import IntelEmailControl from "@/components/IntelEmailControl";
import LinkedInAutomation from "@/components/LinkedInAutomation";
import LivingResearch from "@/components/LivingResearch";

// ASK THE MARKET A QUESTION (Gary). The Strategist desk, on demand: type a market question about a client and get
// the same sourced assessment the daily email gives - what changed, what it could do, and the DEFENSIVE/PROACTIVE
// move - without waiting for the schedule. Runs the real desk (scope-locked, never invents), so the answer is
// trustworthy and its findings also land in the /strategist review queue.
//
// It also drafts the client CEO/MD's LinkedIn thought-leadership piece (admin-only), either from a surfaced
// finding or from a topic typed into the "LinkedIn article" button, then generates the exec's branded creative
// (CEO or MD, 1x1 and/or 16x9) and emails the whole thing as a white, post-ready piece.

type Client = { id: string; name: string };
type Finding = {
  id?: string;
  headline: string; why_it_matters: string; detail: string | null;
  impact_risk: string | null; campaign_response: string | null; material: boolean;
  verification?: string | null;
  sources: { name: string; url: string }[];
};
type Ratio = "1x1" | "16x9";
type Creative = { url: string; ratio: Ratio };

const WORKING_MARKET = [
  "Scanning the market right now…",
  "Reading what the rivals just did…",
  "Weighing what it means for the client…",
  "Grading the move: defensive or proactive…",
  "Writing it up with the sources…",
];
const WORKING_LINKEDIN = [
  "Researching the topic, last three months…",
  "Verifying every source before we use it…",
  "Finding the strongest grounded angle…",
  "Drafting the thought-leadership piece…",
];

const LINKEDIN_BLUE = "#0A66C2";

export default function MarketQuestion({ clients, isAdmin = false }: { clients: Client[]; isAdmin?: boolean }) {
  // On the landing view the brain always defaults to GAS Marketing (Gary), our own brain, then the team switches.
  const gasDefault = clients.find((c) => /gas\s*marketing/i.test(c.name))?.id || clients.find((c) => /\bgas\b/i.test(c.name))?.id;
  const [clientId, setClientId] = useState(gasDefault || clients[0]?.id || "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [err, setErr] = useState("");
  // The CEO/MD thought-leadership draft flow (one open at a time). draftFor is the studio_intel finding id being
  // drafted - a real id whether it came from a surfaced finding or the LinkedIn-article research.
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [liDraft, setLiDraft] = useState(false);   // is the active draft the standalone LinkedIn-article one?
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [art, setArt] = useState("");
  const [artCallout, setArtCallout] = useState("");
  const [recips, setRecips] = useState("");
  const [draftErr, setDraftErr] = useState("");
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState("");
  // Who publishes: the per-brain default, overridable here. The toggle only shows when the brain has both set.
  const [publisher, setPublisher] = useState<"ceo" | "md">("ceo");
  const [ceoName, setCeoName] = useState("");
  const [mdName, setMdName] = useState("");
  // The exec's branded creative: pick the shapes, generate, choose which to attach + embed.
  const [ratios, setRatios] = useState<Ratio[]>(["1x1"]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [creativeErr, setCreativeErr] = useState("");
  // The LinkedIn-article free-prompt.
  const [liTopic, setLiTopic] = useState("");
  // Empty-input hints: instead of a silent greyed button, a click on an empty run explains what to type.
  const [askHint, setAskHint] = useState(false);
  const [liHint, setLiHint] = useState(false);
  const [liBusy, setLiBusy] = useState(false);
  // Add-to-Brain (accepts the finding so it is kept for the brain rather than binned).
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState("");
  const [showAuto, setShowAuto] = useState(false); // the automation/schedule block is collapsed to keep the panel short

  const CEO_API = "/api/studio/intel/ceo-article";
  const publisherName = publisher === "md" ? mdName : ceoName;

  // Reset the whole draft workspace (creative, chosen, publisher stays as loaded).
  function resetDraftWorkspace() {
    setCreatives([]); setChosen([]); setCreativeErr(""); setDrawing(false); setRatios(["1x1"]);
  }

  // Load the saved recipients + CEO/MD identity + the brain's default publisher, to prefill the draft screen.
  async function loadDraftMeta() {
    const rec = await fetch(`${CEO_API}?clientId=${encodeURIComponent(clientId)}`).then((r) => r.json()).catch(() => null);
    if (!rec) return;
    setCeoName(rec.ceoName || ""); setMdName(rec.mdName || "");
    setPublisher(rec.publisher === "md" ? "md" : "ceo");
    if (Array.isArray(rec.recipients) && rec.recipients.length && !recips) setRecips(rec.recipients.join(", "));
  }

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

  // Draft the CEO/MD's article from a surfaced finding, and prefill the saved identity + recipient(s).
  async function draftArticle(f: Finding) {
    if (!f.id || drafting) return;
    setDraftFor(f.id); setLiDraft(false); setDrafting(true); setDraftErr(""); setDraftText(""); setSentFor("");
    resetDraftWorkspace();
    const [d] = await Promise.all([
      fetch(CEO_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", clientId, id: f.id }) }).then((r) => r.json()).catch(() => null),
      loadDraftMeta(),
    ]);
    setDrafting(false);
    if (!d?.ok) { setDraftErr(d?.error || "Couldn't draft that."); return; }
    setDraftText(d.post || ""); setArt(d.art?.subject || ""); setArtCallout(d.art?.callout || "");
  }

  // The LinkedIn-article button: research a typed topic (grounded, last 3 months) and draft directly.
  async function draftFromTopic() {
    if (liBusy || !clientId || !liTopic.trim()) return;
    setLiBusy(true); setDraftErr(""); setDraftText(""); setSentFor(""); resetDraftWorkspace();
    const [d] = await Promise.all([
      fetch("/api/studio/intel/linkedin-article", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, topic: liTopic }),
      }).then((r) => r.json()).catch(() => null),
      loadDraftMeta(),
    ]);
    setLiBusy(false);
    if (!d?.ok) { setDraftErr(d?.error || "Couldn't research that topic."); setDraftFor("li-pending"); setLiDraft(true); return; }
    setDraftFor(d.id); setLiDraft(true);
    setDraftText(d.post || ""); setArt(d.art?.subject || ""); setArtCallout(d.art?.callout || "");
    if (d.publisher === "md" || d.publisher === "ceo") setPublisher(d.publisher);
  }

  // Generate the exec's branded creative(s) in the picked shape(s).
  async function drawCreative() {
    if (drawing || !ratios.length) return;
    setDrawing(true); setCreativeErr(""); setCreatives([]); setChosen([]);
    const title = draftText.split(/\n{2,}/)[0]?.replace(/^#{1,3}\s+/, "").trim() || "";
    const c = await fetch("/api/studio/intel/newsletter-creative", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, subject: art || title, callout: artCallout || title, publisher, ratios }),
      signal: AbortSignal.timeout(6 * 60 * 1000),
    }).then((r) => r.json()).catch((e) => ({
      error: (e as Error)?.name === "TimeoutError" ? "The creative took too long and was cut off. The article is safe - hit Generate again." : "The creative request failed. The article is safe - try again.",
    }));
    setDrawing(false);
    if (c?.error || !Array.isArray(c?.creatives) && !c?.url) { setCreativeErr(c?.error || "The creative did not come back."); return; }
    const made: Creative[] = Array.isArray(c.creatives) && c.creatives.length
      ? c.creatives.map((x: { url: string; ratio: Ratio }) => ({ url: x.url, ratio: x.ratio }))
      : (Array.isArray(c.urls) ? c.urls : c.url ? [c.url] : []).map((u: string) => ({ url: u, ratio: "1x1" as Ratio }));
    setCreatives(made);
    // Auto-select the first of each shape so a send always has something to attach.
    const firstByRatio = new Map<Ratio, string>();
    for (const m of made) if (!firstByRatio.has(m.ratio)) firstByRatio.set(m.ratio, m.url);
    setChosen([...firstByRatio.values()]);
  }

  function toggleChosen(url: string) {
    setChosen((prev) => prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]);
  }
  function toggleRatio(r: Ratio) {
    setRatios((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }

  // Send the (edited) article to the exec's email(s); bcc's the sender. Embeds the chosen 16x9 and attaches all
  // chosen creatives, so the piece arrives post-ready.
  async function sendArticle(id: string) {
    if (!id || sending) return;
    const recipients = recips.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) { setDraftErr("Add at least one recipient email."); return; }
    setSending(true); setDraftErr("");
    const chosenCreatives = creatives.filter((c) => chosen.includes(c.url));
    const heroUrl = chosenCreatives.find((c) => c.ratio === "16x9")?.url || "";
    const d = await fetch(CEO_API, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", clientId, id, recipients, post: draftText, publisher, heroUrl, creativeUrls: chosen }),
    }).then((r) => r.json()).catch(() => null);
    setSending(false);
    if (!d?.ok) { setDraftErr(d?.error || "Couldn't send."); return; }
    setSentFor(id); setDraftFor(null); setLiDraft(false);
  }

  // TWO MODES for the market run (Gary): "question" answers a specific ask (~90 days); "discover" proactively
  // finds what is NEW with no question (~14 days).
  async function ask(mode: "question" | "discover" = "question") {
    if (busy || !clientId) return;
    if (mode === "question" && !q.trim()) return;
    setBusy(true); setErr(""); setFindings(null); setDraftFor(null); setLiDraft(false); setSentFor(""); setDraftErr(""); setAddedIds(new Set());
    const d = await fetch(`/api/studio/intel/ask`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, question: mode === "question" ? q : "", mode }),
    }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { setErr(d?.error || "Couldn't run that."); return; }
    setFindings(Array.isArray(d.findings) ? d.findings : []);
  }

  const brainName = clients.find((c) => c.id === clientId)?.name || "this brain";
  const whoLabel = publisher === "md" ? "MD" : "CEO";

  // THE SHARED DRAFT EDITOR, used by both a surfaced finding and the standalone LinkedIn-article draft. `id` is the
  // studio_intel finding id; `onRedraft` re-runs the right drafting path.
  function draftEditor(id: string, onRedraft: () => void) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="tabular text-sm uppercase tracking-[0.16em] text-ink-faint">{whoLabel} article{publisherName ? ` · ${publisherName}` : ""} · edit before sending</span>
          {art && <span className="text-sm text-ink-faint">Image idea: {art}</span>}
        </div>

        {/* WHO PUBLISHES: CEO or MD. Only shown when the brain has both on file. */}
        {ceoName && mdName && (
          <div className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
            {(["ceo", "md"] as const).map((p) => (
              <button key={p} onClick={() => setPublisher(p)}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${publisher === p ? "bg-accent/20 text-accent" : "text-ink-dim hover:text-ink"}`}>
                {p === "ceo" ? "CEO" : "MD"}{p === "ceo" ? (ceoName ? ` · ${ceoName}` : "") : (mdName ? ` · ${mdName}` : "")}
              </button>
            ))}
          </div>
        )}

        <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={12}
          className="mt-2.5 w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base leading-relaxed text-ink outline-none focus:border-accent" />

        {/* THE EXEC'S BRANDED CREATIVE: pick the shapes, generate, choose which to attach + embed. */}
        <div className="mt-3 rounded-lg border border-line bg-surface-2/60 p-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="tabular text-sm uppercase tracking-[0.16em] text-ink-faint">Creative</span>
            {(["1x1", "16x9"] as const).map((r) => (
              <button key={r} onClick={() => toggleRatio(r)}
                className={`rounded-md border px-2.5 py-1 text-sm font-semibold transition ${ratios.includes(r) ? "border-accent/60 bg-accent/15 text-accent" : "border-line text-ink-dim hover:text-ink"}`}>
                {ratios.includes(r) ? "✓ " : ""}{r === "1x1" ? "Square 1:1" : "Landscape 16:9"}
              </button>
            ))}
            <button onClick={drawCreative} disabled={drawing || !ratios.length}
              className="inline-flex items-center gap-2 rounded-md border border-accent/50 px-3 py-1 text-sm font-semibold text-accent hover:bg-accent/10 disabled:opacity-50">
              {drawing && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />}
              {drawing ? "Generating…" : creatives.length ? "Regenerate" : "Generate creative"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">Built from {whoLabel === "MD" ? "the MD's" : "the CEO's"} real photo and the client&rsquo;s brand. Tick the ones to attach; the 16:9 rides at the top of the email.</p>
          {creativeErr && <p className="mt-2 text-sm text-alert">{creativeErr}</p>}
          {creatives.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2.5">
              {creatives.map((c, i) => {
                const on = chosen.includes(c.url);
                return (
                  <button key={i} onClick={() => toggleChosen(c.url)}
                    className={`group relative overflow-hidden rounded-lg border-2 transition ${on ? "border-accent" : "border-line hover:border-line-strong"}`}
                    style={{ width: c.ratio === "16x9" ? 168 : 104, height: 104 }} title={c.ratio}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{c.ratio === "16x9" ? "16:9" : "1:1"}</span>
                    {on && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="mt-3 block">
          <span className="tabular block text-sm uppercase tracking-[0.16em] text-ink-faint">Send to ({whoLabel} email, comma-separated)</span>
          <input value={recips} onChange={(e) => setRecips(e.target.value)} placeholder="name@company.com"
            className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-base text-ink outline-none focus:border-accent" />
        </label>
        {draftErr && <p className="mt-2 text-base text-alert">{draftErr}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => sendArticle(id)} disabled={sending || !recips.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#7c3aed] px-5 py-2 text-base font-bold text-white shadow-[0_8px_24px_-12px_#a855f7] hover:opacity-90 disabled:opacity-50">
            {sending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {sending ? "Sending…" : `Approve & send to ${whoLabel}`}
          </button>
          <button onClick={onRedraft} disabled={drafting || liBusy || sending} className="rounded-lg border border-line px-4 py-2 text-base text-ink-dim hover:text-ink disabled:opacity-50">Redraft</button>
          <button onClick={() => { setDraftFor(null); setLiDraft(false); setDraftErr(""); }} className="rounded-lg px-3 py-2 text-base text-ink-faint hover:text-ink">Cancel</button>
        </div>
      </>
    );
  }

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
            {/* The section headline wears the same creative as the pod tiles: 26px, the key words in the
                pink -> purple -> blue brand gradient (Gary). */}
            <h3 className="text-[26px] font-bold leading-none tracking-tight text-ink">
              {/* Desktop: Live + gradient. Mobile: shorter 'Market Intelligence' on one line, Market in white. */}
              <span className="hidden sm:inline">Live <span className="brand-grad">Market Intelligence</span></span>
              <span className="whitespace-nowrap sm:hidden">Market <span className="brand-grad">Intelligence</span></span>
            </h3>
            <p className="mt-1.5 text-sm text-ink-dim">The market, on demand.</p>
          </div>
        </div>
        <span className="w-full text-left text-[11px] font-semibold uppercase leading-relaxed tracking-[0.1em] text-ink-dim sm:w-auto sm:text-right">Sourced, never invented.</span>
      </div>
      {/* TWO MODES, not three flat buttons (Gary): the market surfaces it (research), or you set the topic
          (LinkedIn article). The distinction is made structural below - two labelled cards. */}
      {isAdmin && <p className="mt-3.5 text-[14px] leading-relaxed text-ink-dim">Two ways to run it: <b className="text-ink">research the market</b> and let it surface what matters, or <b className="text-ink">write a LinkedIn article</b> on a topic you set.</p>}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="tabular block text-[10px] uppercase tracking-[0.2em] text-ink-faint">Brain</span>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setFindings(null); setErr(""); setDraftFor(null); setLiDraft(false); }}
            className="mt-1.5 rounded-lg border border-[#a855f7]/30 bg-[#0d0a16] px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-[#a855f7]">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {/* CARD 1 - RESEARCH THE MARKET. The market surfaces what matters (research-driven). */}
      <div className="mt-4 rounded-xl border border-[#a855f7]/30 p-4" style={{ background: "rgba(168,85,247,0.05)" }}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          </span>
          <div>
            <h4 className="text-[20px] font-bold text-ink">Research the market</h4>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-dim sm:max-w-[75%]"><b className="text-ink">The market surfaces it.</b> Ask a specific question and the pod researches the last 3 months to answer it, with the move it argues for. Or Find what&rsquo;s new, which needs no question and proactively surfaces the freshest shifts, threats and openings from the past 2 weeks.</p>
          </div>
        </div>
        <textarea value={q} onChange={(e) => { setQ(e.target.value); setAskHint(false); }} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask("question"); }}
          placeholder={`e.g. What has changed in ${brainName}'s market recently, and what should we do about it? What did a key rival just do?`}
          className="mt-3 w-full rounded-lg border border-[#a855f7]/30 bg-[#0d0a16] px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none focus:border-[#a855f7]" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <button onClick={() => { if (!q.trim()) { setAskHint(true); return; } ask("question"); }} disabled={busy}
              className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#7c3aed] px-5 py-2.5 text-[13.5px] font-bold text-white shadow-[0_8px_24px_-12px_#a855f7] transition hover:-translate-y-0.5 disabled:hover:translate-y-0 ${!q.trim() && !busy ? "opacity-50 saturate-50" : ""}`}>
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {busy ? "Scanning…" : "Ask the market"}
            </button>
            {askHint && !q.trim() && !busy && (
              <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-[#a855f7]/50 bg-[#1a1030] px-3 py-2 text-[12.5px] leading-snug text-ink shadow-xl">
                Type your market question in the box above first, then Ask the market.
              </div>
            )}
          </div>
          {/* Solid PINK - distinct from Ask (purple), so the two research modes read apart. */}
          <button onClick={() => ask("discover")} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#ec4899] to-[#db2777] px-5 py-2.5 text-[13.5px] font-bold text-white shadow-[0_8px_24px_-12px_#ec4899] transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0">
            ✦ Find what&rsquo;s new
          </button>
        </div>
      </div>

      {/* THE LINKEDIN-ARTICLE SECTION (admin-only), FIXED underneath because it runs the other way round to the two
          market-research buttons above: YOU set the topic, rather than the market surfacing one (Gary). */}
      {isAdmin && !liDraft && (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: LINKEDIN_BLUE + "66", background: LINKEDIN_BLUE + "0d" }}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: LINKEDIN_BLUE }}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z" /></svg>
            </span>
            <div>
              <h4 className="text-[20px] font-bold" style={{ color: LINKEDIN_BLUE }}>LinkedIn Article</h4>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-dim sm:max-w-[75%]"><b className="text-ink">You choose the topic.</b> Ask the market and Find what&rsquo;s new pull from live market research (the last 3 months and 2 weeks); this one runs the other way, drafting your {whoLabel}&rsquo;s piece on a topic you set, grounded in the brain&rsquo;s own material with verified market context where it exists.</p>
            </div>
          </div>
          <textarea value={liTopic} onChange={(e) => { setLiTopic(e.target.value); setLiHint(false); }} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) draftFromTopic(); }}
            placeholder={`e.g. why ${brainName}'s customers are shifting to X, and what it means for them`}
            className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-base leading-relaxed text-ink outline-none focus:border-[#0A66C2]" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <button onClick={() => { if (!liTopic.trim()) { setLiHint(true); return; } draftFromTopic(); }} disabled={liBusy}
                className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-base font-bold text-white transition hover:-translate-y-0.5 disabled:hover:translate-y-0 ${!liTopic.trim() && !liBusy ? "opacity-50 saturate-50" : ""}`}
                style={{ backgroundColor: LINKEDIN_BLUE, boxShadow: "0 8px 24px -12px " + LINKEDIN_BLUE }}>
                {liBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {liBusy ? "Researching…" : "Research & draft"}
              </button>
              {liHint && !liTopic.trim() && !liBusy && (
                <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border px-3 py-2 text-[12.5px] leading-snug text-ink shadow-xl" style={{ borderColor: LINKEDIN_BLUE + "80", background: "#0d1a2b" }}>
                  Type the topic you want the piece to be about in the box above first, then Research &amp; draft.
                </div>
              )}
            </div>
            <span className="text-[11px] text-ink-faint">Grounded in the brain and verified sources. Never fabricated to fit the prompt.</span>
          </div>
          {liBusy && <div className="mt-3 text-base text-accent"><Working messages={WORKING_LINKEDIN} /></div>}
          {draftErr && !liBusy && <p className="mt-2 text-base text-alert">{draftErr}</p>}
        </div>
      )}

      {/* THE STANDALONE LINKEDIN DRAFT (once research + draft came back). */}
      {liDraft && draftFor && (
        <div className="mt-3.5 rounded-xl border p-4" style={{ borderColor: LINKEDIN_BLUE + "66", background: LINKEDIN_BLUE + "0d" }}>
          {sentFor === draftFor ? (
            <p className="text-base font-semibold text-[#86efac]">✓ Article emailed to the {whoLabel}. A copy is in your inbox.</p>
          ) : draftFor === "li-pending" ? (
            <p className="text-base text-alert">{draftErr}</p>
          ) : draftEditor(draftFor, draftFromTopic)}
        </div>
      )}

      {/* AUTOMATION collapsed by default (Gary: the section was too long). One toggle under the buttons reveals the
          schedule + recipients + the CEO-article cadence for the selected brain. */}
      {clientId && (
        <div className="mt-3 border-t border-line pt-3">
          <button onClick={() => setShowAuto((v) => !v)}
            className="flex w-full items-start gap-2 text-left text-ink-dim hover:text-ink sm:items-center">
            <span className={`mt-0.5 inline-flex shrink-0 text-[#a855f7] transition-transform sm:mt-0 ${showAuto ? "rotate-90" : ""}`} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 6l6 6-6 6" /></svg>
            </span>
            {/* Mobile: title on its own line, sub-text left-aligned beneath. Desktop: one bigger line. */}
            <span className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="text-[14px] font-bold text-ink sm:text-[16px]">Automation and Delivery</span>
              <span className="text-[12px] font-normal text-ink-faint sm:text-[13.5px]">
                <span className="sm:hidden">Schedule this brain, set recipients, auto-draft the CEO article</span>
                <span className="hidden sm:inline">· schedule this brain, set recipients, auto-draft the CEO article</span>
              </span>
            </span>
          </button>
          {showAuto && (
            <div className="mt-4 space-y-4">
              <IntelEmailControl clientId={clientId} clientName={brainName} />
              {/* LinkedIn Article automation is topic-driven and admin-only, so it sits in its own block. */}
              {isAdmin && <LinkedInAutomation clientId={clientId} />}
            </div>
          )}
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
                  {/* Machine-verification verdict: we checked the cited page. Verified = it supports the claim. */}
                  {f.verification === "verified" ? (
                    <span className="shrink-0 rounded-full bg-[#4ade80]/15 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide text-[#86efac]">✓ Verified</span>
                  ) : f.verification === "unverified" ? (
                    <span className="shrink-0 rounded-full bg-[#fbbf24]/15 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide text-[#fcd34d]" title="The cited source could not be fetched to confirm it (may be bot-blocked). Treat with care.">Unverified</span>
                  ) : null}
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

                {/* CEO/MD THOUGHT-LEADERSHIP (Gary): draft this finding into the exec's LinkedIn piece, then email it.
                    Drafting + sending is admin-only; members keep Add-to-brain. */}
                {f.id && (
                  <div className="mt-3 border-t border-line pt-3">
                    {sentFor === f.id ? (
                      <p className="text-base font-semibold text-[#86efac]">✓ Article emailed to the {whoLabel}. A copy is in your inbox.</p>
                    ) : draftFor === f.id && !liDraft ? (
                      <div>
                        {drafting ? (
                          <p className="text-base text-accent">Drafting the {whoLabel}&rsquo;s article…</p>
                        ) : draftEditor(f.id, () => draftArticle(f))}
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
                        {isAdmin && (
                          <button onClick={() => draftArticle(f)} disabled={drafting}
                            className="inline-flex items-center gap-2 rounded-lg border border-accent/50 px-4 py-2 text-base font-semibold text-accent hover:bg-accent/10 disabled:opacity-50">
                            ✍️ Draft the {whoLabel}&rsquo;s article
                          </button>
                        )}
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
