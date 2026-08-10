"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flex } from "@/lib/flex";
import { askConfirm } from "@/lib/confirm";

// THE RESEARCHER (V3) + GATE 1. The Researcher COLLECTS facts, it never analyses (that is the Strategist's job).
// This screen commissions a collect, shows the fact base as typed claims - claim on the left, source and TIER
// inline on the right, so Gary can check what he is approving at a glance (spec 4.2) - and carries the Gate 1
// decision: Approve (locks the fact base, lets the Strategist start), Rerun with notes (a new version, never an
// overwrite), or Reject. The competitor set is editable right here.

type Client = { id: string; name: string };
type Run = { id: string; version: number; status: string; website: string | null; notes: string | null; created_at: string; vertical?: string | null; pdf_url?: string | null; drive_url?: string | null; word_url?: string | null; notified_at?: string | null; progress?: { label?: string; sources?: number; filed?: number } | null; error?: string | null };
type Claim = {
  id: string; section: string; subject: string | null; claim: string;
  source_name: string | null; source_url: string | null; source_date: string | null;
  tier: number | null; verified: boolean; unverified_reason: string | null; conflict: string | null;
  rejected?: boolean; in_brain?: boolean;
};
type Competitor = { id: string; name: string; website: string | null; added_by: string | null };

// The ten sections of the Research Document, in render order (spec 3.8). Kept here so this client component does
// not import the server engine. Unverified is last and visually set apart - nothing in it is a fact.
const SECTIONS: { id: string; label: string; blurb: string }[] = [
  { id: "snapshot", label: "Who they are", blurb: "What they sell, and where they play" },
  { id: "foundations", label: "Company foundations", blurb: "History, ownership, structure" },
  { id: "leadership", label: "Leadership and management team", blurb: "The people who run it, and their backgrounds" },
  { id: "products", label: "Products, services and commercial model", blurb: "Range, pricing, how they make money and sell" },
  { id: "market", label: "Market and category", blurb: "The market and category they compete in" },
  { id: "positioning", label: "How they position themselves", blurb: "Their stated promise, USPs and tone" },
  { id: "audience", label: "Audience and customers", blurb: "Who they serve, and their segments" },
  { id: "digital", label: "Digital footprint", blurb: "Website, SEO basics, social activity" },
  { id: "contact", label: "Contact and channels", blurb: "Phone, email, address, hours, WhatsApp, socials" },
  { id: "marketing", label: "Current marketing and advertising", blurb: "The client's own channels, campaigns, promos, paid" },
  { id: "competitor", label: "Competitor intelligence", blurb: "Observable public activity, client and competitors" },
  { id: "competitor_set", label: "Competitor set", blurb: "A factual profile per competitor" },
  { id: "activity", label: "Recent activity (90 days)", blurb: "Dated, sourced developments" },
  { id: "press", label: "Press and media", blurb: "Releases, news, interviews, awards, mentions, any date" },
  { id: "customer_voice", label: "Customer voice", blurb: "Reviews, ratings, public sentiment" },
  { id: "faqs", label: "Published FAQs", blurb: "The brand's own questions and answers" },
  { id: "regulatory", label: "Regulatory, compliance and advertising rules", blurb: "Licence + advertising rules (regulated clients only)" },
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
  failed: { label: "Run did not finish", cls: "border-[#f87171]/40 bg-[#f87171]/10 text-[#fca5a5]" },
};

function ukDate(s: string | null): string {
  if (!s) return "";
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  const day = dt.getUTCDate();
  const th = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${th} ${dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })} ${dt.getUTCFullYear()}`;
}

// Readable elapsed: 45 -> "45s", 80 -> "1m 20s", 3720 -> "1h 2m" (Gary: 80 seconds should read 1 minute 20 seconds).
function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return sec ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
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
  const [justDone, setJustDone] = useState(false);   // green "complete" flash on the button when a run finishes
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [focus, setFocus] = useState("");   // optional up-front steer for this run (e.g. specific suburbs)
  const [newComp, setNewComp] = useState({ name: "", website: "" });
  const [progress, setProgress] = useState<null | { label: string; searches: string[]; sources: number; filed: number }>(null);
  const [elapsed, setElapsed] = useState(0);
  // THE RESEARCH DOCUMENT (spec 3.8, 3.9): built after a run completes - a GAS-CI PDF, filed to Drive when
  // configured, with an email notice to Gary. delivery says which channels are actually live, so the UI never
  // implies a Drive/email that is not switched on.
  const [docBusy, setDocBusy] = useState(false);
  const [delivery, setDelivery] = useState<{ drive: boolean; email: boolean } | null>(null);
  // COST METER (Gary): the Researcher's spend, so the team sees it as they run. Refreshed after every run.
  const [spend, setSpend] = useState<{ monthCents: number; todayCents: number; runsThisMonth: number } | null>(null);
  // NEW BRAIN (Gary): create a client from the dropdown - name + one or more websites.
  const [showCreate, setShowCreate] = useState(false);
  const [nb, setNb] = useState<{ name: string; sites: string[] }>({ name: "", sites: [""] });
  const [creating, setCreating] = useState(false);
  // Ground-truth website (Gary, material): the team offers up the client's real site so the collect can never
  // research a same-named but different business. Reuses the existing client-website endpoint.
  const [sites, setSites] = useState<string[]>([""]);   // the client's ground-truth websites (some run several)
  const [siteSaved, setSiteSaved] = useState(false);
  const [socials, setSocials] = useState<string[]>([""]);   // the client's official social accounts (Gary: mine these too)
  const [socSaved, setSocSaved] = useState(false);

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
    fetch(`/api/studio/researcher/document`, { cache: "no-store" }).then((r) => r.json()).then((d) => setDelivery(d?.delivery || null)).catch(() => {});
  }, []);

  // Build (or rebuild) the Research Document: render PDF, store, file to Drive, email Gary. Called automatically
  // once a fresh collect finishes, and on demand via "Regenerate".
  const buildDoc = useCallback(async (runId: string, silent = false) => {
    setDocBusy(true);
    const r = await fetch(`/api/studio/researcher/document`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, runId }),
    }).then((x) => x.json()).catch(() => null);
    setDocBusy(false);
    if (r?.ok) { if (!silent) flex(`Research Document ready${r.emailed ? ", and Gary was notified" : ""}.`); await load(clientId); }
    else if (!silent) flex(r?.error || "Couldn't build the document.");
  }, [clientId, load]);

  // After a collect, the document builds in a DURABLE Inngest job (retryable render/Drive/email). Poll for it,
  // and if it does not land in ~24s (or Inngest is unavailable), fall back to a synchronous build so a PDF is
  // never missing.
  const polledRef = useRef<string | null>(null);   // which run we're already polling for a PDF (avoids duplicates)
  const pollDocument = useCallback(async (runId: string) => {
    polledRef.current = runId;
    setDocBusy(true);
    // The brief writes prose (Opus) then renders + files, which can take a minute or two. Poll patiently (~4 min)
    // for the durable job to land the PDF - the moment run.pdf_url appears we show Download and stop. Only if it
    // truly never lands do we fall back to a synchronous build. Poll the exact run, so a newer run can't confuse it.
    for (let i = 0; i < 48; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const d = await fetch(`/api/studio/researcher/collect?clientId=${clientId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (d?.run?.id === runId) {
        setRun(d.run); setClaims(Array.isArray(d.claims) ? d.claims : []); setCompetitors(Array.isArray(d.competitors) ? d.competitors : []);
        if (d.run.pdf_url) { setDocBusy(false); return; }
      }
    }
    await buildDoc(runId, true);
  }, [clientId, buildDoc]);

  // Poll a 'collecting' run until it lands (or fails). The collect is a DURABLE, phase-stepped Inngest job now,
  // decoupled from any request, so it can run well past the old ~13-minute ceiling. We reflect the run's progress
  // column into the live panel as we go (no SSE any more). Returns the final run, or null if it never settles.
  const pollCollectingRun = useCallback(async (runId: string): Promise<Run | null> => {
    for (let i = 0; i < 400; i++) {   // ~33 min at 5s; the run's own backstop reclaims a genuinely hung job at 45
      await new Promise((r) => setTimeout(r, 5000));
      const d = await fetch(`/api/studio/researcher/collect?clientId=${clientId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!d?.run || d.run.id !== runId) continue;
      setRun(d.run); setClaims(Array.isArray(d.claims) ? d.claims : []); setCompetitors(Array.isArray(d.competitors) ? d.competitors : []);
      if (d.run.progress) setProgress({ label: d.run.progress.label || "Working", searches: [], sources: d.run.progress.sources || 0, filed: d.run.progress.filed || 0 });
      if (d.run.status !== "collecting") return d.run;
    }
    return null;
  }, [clientId]);

  // If a run is READY but its PDF is not built yet (e.g. the page was reloaded while the document was still
  // rendering), resume polling automatically, so the Download button always turns up without any action.
  useEffect(() => {
    if (run && run.status === "ready" && !run.pdf_url && !running && !docBusy && polledRef.current !== run.id) {
      pollDocument(run.id);
    }
  }, [run, running, docBusy, pollDocument]);

  // DURABLE RUN RESUME (Gary: navigating away must not lose the run). If we land on a run that is still
  // 'collecting' (the durable Inngest job is still working, started in this or another tab/session), poll until it
  // finishes, then load its claims - so returning to the page picks the run back up, not an error or a dead spinner.
  const collectPollRef = useRef<string | null>(null);
  useEffect(() => {
    if (!run || run.status !== "collecting" || running || collectPollRef.current === run.id) return;
    collectPollRef.current = run.id;
    let live = true;
    (async () => {
      const final = await pollCollectingRun(run.id);
      if (!live) return;
      collectPollRef.current = null;
      if (final && final.status === "ready") { loadSpend(); if (!final.pdf_url) pollDocument(final.id); }
    })();
    return () => { live = false; collectPollRef.current = null; };
    // loadSpend intentionally omitted from deps (declared just below; stable useCallback) to avoid a TDZ at render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, running, pollCollectingRun, pollDocument]);

  const loadSpend = useCallback(async () => {
    const d = await fetch(`/api/studio/researcher/spend`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d && typeof d.monthCents === "number") setSpend(d);
  }, []);
  useEffect(() => { loadSpend(); }, [loadSpend]);

  async function createBrain() {
    const name = nb.name.trim();
    const sites = nb.sites.map((s) => s.trim()).filter(Boolean);
    if (!name) { flex("A client name is needed."); return; }
    if (!sites.length) { flex("At least one website is needed, it is the ground-truth anchor."); return; }
    setCreating(true);
    const r = await fetch(`/api/studio/researcher/brain`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, websites: sites }),
    }).then((x) => x.json()).catch(() => null);
    setCreating(false);
    if (!r?.ok) { flex(r?.error || "Couldn't create the brain."); return; }
    setShowCreate(false); setNb({ name: "", sites: [""] });
    flex(`Brain created: ${r.name}. Run the Researcher on it.`);
    setClientId(r.id);   // select the new one; it appears once the server list refreshes
    router.refresh();
  }

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    fetch(`/api/studio/client-website?clientId=${clientId}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (live) { const w = Array.isArray(d?.websites) && d.websites.length ? d.websites : (d?.website ? [d.website] : [""]); setSites(w.length ? w : [""]); setSiteSaved(false); const s = Array.isArray(d?.socials) && d.socials.length ? d.socials : [""]; setSocials(s.length ? s : [""]); setSocSaved(false); } }).catch(() => {});
    return () => { live = false; };
  }, [clientId]);

  // ONE continuous timer per run. It must key on `running`, NOT `progress` - progress changes on every search and
  // phase, and keying on it restarted the clock from zero each time (Gary). startedRef is stamped once, in runCollect.
  const startedRef = useRef(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedRef.current) / 1000))), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function saveSites() {
    const list = sites.map((s) => s.trim()).filter(Boolean);
    const r = await fetch("/api/studio/client-website", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, websites: list }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setSites(r.websites?.length ? r.websites : [""]); setSiteSaved(true); setTimeout(() => setSiteSaved(false), 1800); }
    else flex(r?.error || "Couldn't save the websites.");
  }

  async function saveSocials() {
    const list = socials.map((s) => s.trim()).filter(Boolean);
    const r = await fetch("/api/studio/client-website", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, socials: list }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setSocials(r.socials?.length ? r.socials : [""]); setSocSaved(true); setTimeout(() => setSocSaved(false), 1800); }
    else flex(r?.error || "Couldn't save the social accounts.");
  }

  // Commission a collect. withNotes runs a "Rerun with notes" - a fresh VERSION addressing corrections, never an
  // overwrite. The collect fires a DURABLE, phase-stepped Inngest job and returns immediately; we then POLL the run
  // to completion (it runs server-side regardless of this tab, so closing it no longer loses the work or the spend).
  async function runCollect(withNotes?: string) {
    setRunning(true); setNote(""); setShowNotes(false); setJustDone(false);
    startedRef.current = Date.now(); setElapsed(0);
    setProgress({ label: `Collecting facts on ${clientName}`, searches: [], sources: 0, filed: 0 });
    let runId = "";
    try {
      const resp = await fetch(`/api/studio/researcher/collect`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, notes: withNotes || "", focus: focus.trim() }),
      });
      const d = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(d?.error || `The Researcher could not start (${resp.status}).`);
      runId = d?.runId || "";
      await load(clientId);   // reflect the new 'collecting' run at once
    } catch (err) {
      setRunning(false); setProgress(null);
      const msg = (err as Error)?.message || "Couldn't run the Researcher.";
      setNote(msg); flex(msg); await load(clientId);
      return;
    }
    // Poll the durable job to completion. It keeps running on the server even if this tab closes.
    const final = runId ? await pollCollectingRun(runId) : null;
    setRunning(false); setProgress(null);
    if (!final) {
      const msg = "This run is taking longer than usual. It keeps running in the background, so check back shortly.";
      setNote(msg); flex(msg); await load(clientId); return;
    }
    if (final.status === "failed") { const msg = final.error || "The Researcher failed."; setNote(msg); flex(msg); await load(clientId); return; }
    flex(`Research v${final.version} is ready for your review.`);
    await load(clientId);
    setJustDone(true); setTimeout(() => setJustDone(false), 9000);   // green "complete" flash
    loadSpend();   // refresh the cost meter with what this run spent
    // The Research Document builds in a durable background job; poll for it (synchronous fallback inside).
    if (!final.pdf_url) pollDocument(final.id);
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

  // Drop (or restore) a SINGLE fact, surgically, keeping the rest of the fact base. Optimistic - the row updates
  // at once; rejected facts are excluded from the document and the Strategist hand-off. Regenerate to refresh the PDF.
  async function rejectClaim(c: Claim, reject: boolean) {
    setClaims((cs) => cs.map((x) => x.id === c.id ? { ...x, rejected: reject, in_brain: reject ? false : x.in_brain } : x));
    const r = await fetch(`/api/studio/researcher/claim`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, claimId: c.id, action: reject ? "reject" : "restore" }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setClaims((cs) => cs.map((x) => x.id === c.id ? { ...x, rejected: !reject } : x)); flex("Couldn't update that fact."); }
  }

  // Tag a SINGLE fact "in the brain" (or take it back out). Like a reject, it clears the fact out of the live
  // review list into its own "In the Brain" tray, so on the NEXT run only the untagged, genuinely-new facts show.
  // A fact can be in-brain OR rejected, never both - tagging one clears the other.
  async function brainClaim(c: Claim, add: boolean) {
    setClaims((cs) => cs.map((x) => x.id === c.id ? { ...x, in_brain: add, rejected: add ? false : x.rejected } : x));
    const r = await fetch(`/api/studio/researcher/claim`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, claimId: c.id, action: add ? "add_brain" : "remove_brain" }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setClaims((cs) => cs.map((x) => x.id === c.id ? { ...x, in_brain: !add } : x)); flex("Couldn't update that fact."); }
  }

  const status = run ? (STATUS[run.status] || STATUS.collecting) : null;
  const canGate = run?.status === "ready";
  // A durable run still collecting server-side (this session's SSE, or one resumed after navigating away).
  const collecting = run?.status === "collecting";
  const bySection = (id: string) => claims.filter((c) => c.section === id);
  const rejectedCount = claims.filter((c) => c.rejected && !c.in_brain).length;
  const inBrainCount = claims.filter((c) => c.in_brain).length;

  const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mt-8">
      {/* COST METER */}
      {spend && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-line bg-surface-1 px-4 py-2.5">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Researcher spend</span>
          <span className="tabular"><b className="text-xl font-bold text-ink">{rand(spend.monthCents)}</b> <span className="text-sm text-ink-faint">this month</span></span>
          <span className="tabular text-base text-ink-dim">{rand(spend.todayCents)} <span className="text-sm text-ink-faint">today</span></span>
          <span className="text-sm text-ink-faint">{spend.runsThisMonth} run{spend.runsThisMonth === 1 ? "" : "s"} this month</span>
        </div>
      )}
      {/* CLIENT + GROUND TRUTH */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="block">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Client</span>
          <select value={clientId} onChange={(e) => { if (e.target.value === "__new__") setShowCreate(true); else setClientId(e.target.value); }}
            className="mt-1 block w-72 rounded-lg border border-line bg-surface-1 px-3 py-2 text-lg outline-none focus:border-accent">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{configured.includes(c.id) ? "" : " (not researchable yet)"}</option>)}
            <option value="__new__">+ New brain…</option>
          </select>
        </label>
        <div>
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Ground-truth website(s)</span>
          <div className="mt-1 space-y-2">
            {sites.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={s} onChange={(e) => { const next = [...sites]; next[i] = e.target.value; setSites(next); }}
                  placeholder={i === 0 ? "https://www.the-amber-room.co.za/" : "https://another-official-site.co.za"}
                  className="block w-80 rounded-lg border border-line bg-surface-1 px-3 py-2 text-base outline-none focus:border-accent" />
                {sites.length > 1 && <button onClick={() => setSites(sites.filter((_, j) => j !== i))} aria-label="Remove website" className="text-ink-faint hover:text-alert">✕</button>}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => setSites([...sites, ""])} className="text-sm font-semibold text-accent hover:underline">+ Add another website</button>
            <button onClick={saveSites} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-dim hover:text-ink">{siteSaved ? "✓ Saved" : "Save"}</button>
          </div>
          {/* SOCIAL ACCOUNTS (Gary): the client's own social profiles, mined for cadence, content themes and audience. */}
          <div className="mt-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Social media accounts</span>
            <div className="mt-1 space-y-2">
              {socials.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={s} onChange={(e) => { const next = [...socials]; next[i] = e.target.value; setSocials(next); }}
                    placeholder={i === 0 ? "https://www.instagram.com/theclient" : "https://www.linkedin.com/company/theclient"}
                    className="block w-80 rounded-lg border border-line bg-surface-1 px-3 py-2 text-base outline-none focus:border-accent" />
                  {socials.length > 1 && <button onClick={() => setSocials(socials.filter((_, j) => j !== i))} aria-label="Remove social account" className="text-ink-faint hover:text-alert">✕</button>}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button onClick={() => setSocials([...socials, ""])} className="text-sm font-semibold text-accent hover:underline">+ Add a social account</button>
              <button onClick={saveSocials} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-dim hover:text-ink">{socSaved ? "✓ Saved" : "Save"}</button>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-faint">The website(s) are the anchor: The Researcher reports only the organisation at those addresses, and reads every one of them. Social accounts are mined for cadence, content themes and audience signals.</p>

      {/* NEW BRAIN */}
      {showCreate && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-surface-1 p-5">
          <div className="text-lg font-bold text-ink">New brain</div>
          <p className="mt-0.5 text-sm text-ink-faint">Create a client. Add every official website they run, the first is the primary ground-truth anchor.</p>
          <input value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} placeholder="Client name"
            className="mt-3 block w-full max-w-md rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg outline-none focus:border-accent" />
          <div className="mt-3 space-y-2">
            {nb.sites.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={s} onChange={(e) => { const sites = [...nb.sites]; sites[i] = e.target.value; setNb({ ...nb, sites }); }}
                  placeholder={i === 0 ? "https://primary-website.co.za" : "https://another-site.co.za"}
                  className="block w-full max-w-md rounded-lg border border-line bg-surface-2 px-3 py-2 text-base outline-none focus:border-accent" />
                {nb.sites.length > 1 && <button onClick={() => setNb({ ...nb, sites: nb.sites.filter((_, j) => j !== i) })} aria-label="Remove website" className="text-ink-faint hover:text-alert">✕</button>}
              </div>
            ))}
            <button onClick={() => setNb({ ...nb, sites: [...nb.sites, ""] })} className="text-sm font-semibold text-accent hover:underline">+ Add another website</button>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={createBrain} disabled={creating} className="rounded-lg bg-accent px-5 py-2.5 text-base font-bold text-black disabled:opacity-50">{creating ? "Creating…" : "Create brain"}</button>
            <button onClick={() => { setShowCreate(false); setNb({ name: "", sites: [""] }); }} className="rounded-lg border border-line px-4 py-2.5 text-base font-semibold text-ink-dim hover:text-ink">Cancel</button>
          </div>
        </div>
      )}

      {/* FOCUS (Gary): an optional steer before the run - e.g. specific suburbs for an estate agency, a product
          line, a region. Prioritises that angle without narrowing the brief. Hidden once a run is in flight. */}
      {!running && (
        <div className="mt-5">
          <label className="block text-sm font-semibold uppercase tracking-wide text-ink-faint">Focus for this run (optional)</label>
          <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2}
            placeholder="Steer the research. e.g. 'Focus on the Southern Suburbs: Constantia, Claremont, Newlands, Bishopscourt.' Leave blank for a full run."
            className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface-1 px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
          <p className="mt-1 text-sm text-ink-faint">An emphasis, not a filter: every section is still collected, and nothing is ever made up to fit the focus.</p>
        </div>
      )}

      {/* RUN BAR - obvious visual feedback for the team (Gary): glow + spinner while running, green when done. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={() => runCollect()} disabled={running || collecting || !isConfigured}
          className={`rounded-lg px-5 py-2.5 text-lg font-bold transition ${
            running || collecting ? "bg-accent text-black glow-accent"
            : justDone ? "next-pulse"
            : `bg-accent text-black ${!isConfigured ? "opacity-50" : ""}`
          }`}>
          {running
            ? <span className="inline-flex items-center gap-2"><span className="spinner-ring spinner-ring--solid" style={{ fontSize: "1.05em" }} /> Collecting… <span className="tabular font-semibold opacity-80">{fmtElapsed(elapsed)}</span></span>
            : collecting ? <span className="inline-flex items-center gap-2"><span className="spinner-ring spinner-ring--solid" style={{ fontSize: "1.05em" }} /> Researching…</span>
            : justDone ? "✓ Research complete"
            : run ? "Collect again (new version)" : "Run the Researcher"}
        </button>
        {run && status && (
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${status.cls}`}>
            v{run.version} · {status.label}
          </span>
        )}
        {run && !collecting && <span className="text-sm text-ink-faint">{claims.length} claim{claims.length === 1 ? "" : "s"} · collected {ukDate(run.created_at)}</span>}
      </div>
      {!isConfigured && <p className="mt-2 text-base text-[#fca5a5]">This brain has nothing to research yet. Add the client and crawl their site into the brain first.</p>}

      {/* DURABLE RUN IN PROGRESS (resumed after navigating away, or running in another tab). Safe to leave. */}
      {collecting && !running && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-surface-1 p-5 glow-accent">
          <div className="flex items-center gap-2 text-lg font-bold text-ink"><span className="spinner-ring spinner-ring--solid" /> Researching {clientName}…</div>
          <p className="mt-1 text-base text-ink-dim">{run?.progress?.label || "Collecting facts"}{typeof run?.progress?.sources === "number" ? ` · ${run.progress.sources} sources` : ""}{typeof run?.progress?.filed === "number" && run.progress.filed > 0 ? ` · ${run.progress.filed} filed` : ""}</p>
          <p className="mt-2 text-sm text-ink-faint">This runs in the background, so you can safely navigate away, the research is saved when it finishes. This view updates on its own.</p>
        </div>
      )}
      {run?.status === "failed" && !running && (
        <p className="mt-3 rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2.5 text-base text-[#fca5a5]">The last run did not finish{run.error ? `: ${run.error}` : "."} Nothing was charged for an unsaved result. You can run it again.</p>
      )}
      {note && <p className="mt-3 rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2.5 text-base text-[#fca5a5]">{note}</p>}

      {/* THE RESEARCH DOCUMENT */}
      {run && !running && !collecting && (
        <div className="mt-4 rounded-xl border border-line bg-surface-1 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-ink">Research Brief</div>
              <div className="mt-0.5 text-sm text-ink-faint">
                {docBusy ? "Writing and rendering the brief, this takes a minute or two. The Download button appears here when it is ready, and it is also emailed to you." : run.pdf_url ? "A GAS-branded research brief, written for your strategist." : "Not built for this version yet, use Generate."}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {run.pdf_url && <a href={run.pdf_url} target="_blank" rel="noreferrer" className="rounded-lg bg-accent px-4 py-2 text-base font-bold text-black">Download PDF</a>}
              {run.drive_url && <a href={run.drive_url} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink-dim hover:text-ink">Open in Drive</a>}
              <button onClick={() => buildDoc(run.id)} disabled={docBusy}
                className="rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink-dim hover:text-ink disabled:opacity-50">
                {docBusy ? "…" : run.pdf_url ? "Regenerate" : "Generate document"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-faint">
            {run.notified_at ? <span className="text-[#86efac]">✓ Gary notified by email</span> : delivery && !delivery.email ? <span>Email notice off, set Gmail credentials to enable.</span> : null}
            {run.drive_url ? <span className="text-[#86efac]">✓ Filed to Google Drive</span> : delivery && !delivery.drive ? <span>Drive filing not switched on yet, share a folder with the service account to enable.</span> : null}
          </div>
        </div>
      )}

      {/* LIVE PROGRESS */}
      {progress && (
        <div className="mt-4 rounded-xl border border-line bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-ink">{progress.label}</div>
            <div className="tabular text-sm text-ink-faint">{fmtElapsed(elapsed)} · {progress.sources} sources · {progress.filed} filed</div>
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
        <div className="mt-8 space-y-9">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl font-bold text-ink">The fact base</h2>
            <span className="text-base text-ink-faint">
              {inBrainCount > 0 && <span className="text-[#86efac]">{inBrainCount} in the brain. </span>}
              {rejectedCount > 0 && <span className="text-[#fca5a5]">{rejectedCount} rejected. </span>}
              {(inBrainCount > 0 || rejectedCount > 0) && <><button onClick={() => run && buildDoc(run.id)} className="underline hover:text-accent">Regenerate the document</button> to update the PDF.</>}
            </span>
          </div>
          {SECTIONS.map((sec) => {
            const rows = bySection(sec.id).filter((c) => !c.rejected && !c.in_brain);   // tagged facts leave the live list
            if (rows.length === 0) return null;
            const isUnverified = sec.id === "unverified";
            return (
              <section key={sec.id}>
                <div className="flex items-baseline justify-between border-b-2 border-line pb-2">
                  <h3 className={`text-2xl font-bold ${isUnverified ? "text-[#fca5a5]" : "text-ink"}`}>{sec.label}</h3>
                  <span className="text-base text-ink-faint">{rows.length}</span>
                </div>
                <p className="mt-1.5 text-base text-ink-faint">{sec.blurb}</p>
                <ul className="mt-4 space-y-3">
                  {rows.map((c) => (
                    <li key={c.id} className="rounded-xl border border-line/70 bg-surface-1 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <p className="flex-1 text-xl leading-relaxed text-ink">
                          {c.subject && !new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(c.subject) && (
                            <span className="mr-2 rounded bg-surface-2 px-2 py-0.5 align-middle text-sm font-semibold text-ink-dim">{c.subject}</span>
                          )}
                          {c.claim}
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <button onClick={() => brainClaim(c, true)} className="rounded-lg border border-[#86efac]/40 px-3 py-1.5 text-sm font-semibold text-[#86efac] hover:bg-[#86efac]/10" title="Keep this fact - it moves to In the Brain and drops out of the next run's new list">Add to Brain</button>
                          <button onClick={() => rejectClaim(c, true)} className="rounded-lg border border-[#f87171]/40 px-3 py-1.5 text-sm font-semibold text-[#fca5a5] hover:bg-[#f87171]/10" title="Drop this fact - it disappears and is never referenced again">Reject</button>
                        </div>
                      </div>
                      {c.conflict && <div className="mt-2 text-base text-[#fcd34d]">⚠ Sources conflict: {c.conflict}</div>}
                      {isUnverified && c.unverified_reason && <div className="mt-2 text-base text-ink-faint">Why unverified: {c.unverified_reason}</div>}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                        {c.tier && TIER[c.tier] && <span title={TIER[c.tier].title} className={`rounded border px-2 py-0.5 font-semibold ${TIER[c.tier].cls}`}>{TIER[c.tier].label}</span>}
                        {c.verified ? <span title="Source fetched and confirmed" className="font-semibold text-[#86efac]">✓ verified</span> : <span className="text-ink-faint">unconfirmed</span>}
                        {c.source_date && <span className="tabular text-ink-faint">{ukDate(c.source_date)}</span>}
                        {c.source_url
                          ? <a href={c.source_url} target="_blank" rel="noreferrer" className="max-w-[20rem] truncate text-accent hover:underline">{c.source_name || "source"}</a>
                          : <span className="text-ink-faint">{c.source_name || "no source"}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {/* IN THE BRAIN - facts Gary has kept. Out of the live list so the next run's genuinely-new facts stand
              out, recoverable with Restore. */}
          {inBrainCount > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[#86efac]/30 pb-2">
                <h3 className="text-xl font-bold text-[#86efac]">In the Brain · {inBrainCount}</h3>
                <span className="text-sm text-ink-faint">Kept. These drop out of the live list so the next run only shows what is new.</span>
              </div>
              <ul className="mt-3 space-y-2">
                {claims.filter((c) => c.in_brain).map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 rounded-lg border border-[#86efac]/20 bg-surface-1/30 px-4 py-2.5">
                    <p className="flex-1 text-base leading-relaxed text-ink-dim">{c.claim}</p>
                    <button onClick={() => brainClaim(c, false)} className="shrink-0 rounded-lg border border-line px-3 py-1 text-sm font-semibold text-ink-dim hover:text-ink">Restore</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* REJECTED - out of the way, recoverable, and a permanent do-not-reference memory. */}
          {rejectedCount > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[#f87171]/30 pb-2">
                <h3 className="text-xl font-bold text-[#fca5a5]">Rejected · {rejectedCount}</h3>
                <span className="text-sm text-ink-faint">Stored. The Researcher will never surface these again, on any future run.</span>
              </div>
              <ul className="mt-3 space-y-2">
                {claims.filter((c) => c.rejected && !c.in_brain).map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 rounded-lg border border-line/40 bg-surface-1/30 px-4 py-2.5">
                    <p className="flex-1 text-base leading-relaxed text-ink-faint line-through">{c.claim}</p>
                    <button onClick={() => rejectClaim(c, false)} className="shrink-0 rounded-lg border border-line px-3 py-1 text-sm font-semibold text-ink-dim hover:text-ink">Undo</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {run && claims.length === 0 && !running && !collecting && run.status !== "failed" && (
        <p className="mt-8 text-base text-ink-dim">This version filed no claims. Run again, or check the client has crawled material and a website set.</p>
      )}
    </div>
  );
}
