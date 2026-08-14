"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flex } from "@/lib/flex";
import Working, { WORKING_NEWSLETTER } from "@/components/Working";
import { askConfirm } from "@/lib/confirm";
import LivingResearch from "@/components/LivingResearch";

// A CONSISTENT SECTION MARKER, the same treatment the Brain page uses so the two steps read as one system: a
// rounded violet tile holding a 2px line icon. `d` is a constant SVG path string, never user text.
function SectionTile({ d }: { d: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#a855f7]/15 text-[#c79bff]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />
    </span>
  );
}
const ICON = {
  facts: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>`,
  competitors: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  brief: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h7"/>`,
  gate: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>`,
  // Sliders: brief/tune the run before you commission it.
  brief_setup: `<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/>`,
} as const;

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
  newsletter?: string | null; newsletter_art?: string | null; newsletter_options?: string[];
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
  const [spend, setSpend] = useState<{ monthCents: number; todayCents: number; runsThisMonth: number; runCents: number | null } | null>(null);
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
  // CEO NEWSLETTER (Gary): tag a fact -> write the CEO's LinkedIn piece + its creative, then approve/reject/rewrite.
  const [nl, setNl] = useState<null | { claim: Claim; post: string; art: { subject: string; callout: string } | null; img: string | null; imgs: string[]; busy: boolean; imgBusy: boolean; saving: boolean; saved: boolean; err: string; note: string; showNote: boolean }>(null);
  // The newsletter preview is DRAGGABLE (Gary: "drag the preview box down using the bottom-right dragger") - the
  // header moves it, and the panel itself resizes from its bottom-right corner (native CSS resize).
  const [nlBox, setNlBox] = useState({ x: 0, y: 0 });
  const nlDrag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const clientName = clients.find((c) => c.id === clientId)?.name || "the client";
  const isConfigured = configured.length === 0 || configured.includes(clientId);

  // The LIVE selected client, so an async response that resolves after the user switched brains is discarded
  // rather than overwriting the new brain's view with the old brain's run/claims (a real cross-brain display bug).
  const clientRef = useRef(clientId);
  useEffect(() => { clientRef.current = clientId; }, [clientId]);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    const d = await fetch(`/api/studio/researcher/collect?clientId=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (clientRef.current !== id) return;   // the user switched brains while this was in flight - drop it
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
    const forClient = clientId;
    polledRef.current = runId;
    setDocBusy(true);
    // The brief writes prose (Opus) then renders + files, which can take a minute or two. Poll patiently (~4 min)
    // for the durable job to land the PDF - the moment run.pdf_url appears we show Download and stop. Only if it
    // truly never lands do we fall back to a synchronous build. Poll the exact run, so a newer run can't confuse it.
    for (let i = 0; i < 48; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (clientRef.current !== forClient) return;   // switched brains - stop touching this brain's view
      const d = await fetch(`/api/studio/researcher/collect?clientId=${forClient}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (clientRef.current !== forClient) return;
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
    const forClient = clientId;
    for (let i = 0; i < 400; i++) {   // ~33 min at 5s; the run's own backstop reclaims a genuinely hung job at 45
      await new Promise((r) => setTimeout(r, 5000));
      if (clientRef.current !== forClient) return null;   // switched brains - abandon this poll, don't overwrite
      const d = await fetch(`/api/studio/researcher/collect?clientId=${forClient}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (clientRef.current !== forClient) return null;
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

  const loadSpend = useCallback(async (runId?: string) => {
    // Scope the per-run cost to this client too, so a run id can only surface its own brain's spend.
    const q = runId ? `?runId=${encodeURIComponent(runId)}&clientId=${encodeURIComponent(clientId)}` : "";
    const d = await fetch(`/api/studio/researcher/spend${q}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d && typeof d.monthCents === "number") setSpend(d);
  }, [clientId]);
  useEffect(() => { loadSpend(run?.id); }, [loadSpend, run?.id]);

  // WEEKLY AUTO-RUN toggle (Gary): per client, Monday 08:30 SAST. Loaded for the selected client, off by default.
  const [weekly, setWeekly] = useState<{ on: boolean; busy: boolean }>({ on: false, busy: false });
  useEffect(() => {
    if (!clientId) return;
    let live = true;
    fetch(`/api/studio/researcher/weekly?clientId=${clientId}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (live) setWeekly({ on: !!d?.enabled, busy: false }); }).catch(() => {});
    return () => { live = false; };
  }, [clientId]);
  async function toggleWeekly() {
    if (weekly.busy) return;
    const next = !weekly.on;
    setWeekly({ on: next, busy: true });
    const d = await fetch(`/api/studio/researcher/weekly`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, enabled: next }),
    }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { setWeekly({ on: !next, busy: false }); flex(d?.error || "Couldn't change the weekly run."); return; }
    setWeekly({ on: d.enabled, busy: false });
    flex(d.enabled ? "Weekly auto-run ON. This brain runs every Monday 08:30 and emails you to approve." : "Weekly auto-run OFF. No scheduled runs for this brain.");
  }

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
    loadSpend(final.id);   // refresh the cost meter, including what THIS run spent
    // The Research Document builds in a durable background job; poll for it (synchronous fallback inside).
    if (!final.pdf_url) pollDocument(final.id);
  }

  async function gate(action: "approve" | "reject") {
    if (!run) return;
    if (action === "reject" && !(await askConfirm({ title: `Reject research v${run.version}?`, body: "It is archived and the pipeline stops here for this client. You can commission a fresh run any time.", tone: "danger", confirmLabel: "Reject" }))) return;
    if (action === "approve" && !(await askConfirm({ title: `Approve research v${run.version} as the fact base?`, body: "It locks as the fact base, the Strategist can start from it, and every fact is added to the brain so the whole platform can retrieve it. Approve facts you have checked.", confirmLabel: "Approve" }))) return;
    setBusy(true);
    const r = await fetch(`/api/studio/researcher/gate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, runId: run.id, action }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { flex(r?.error || "Couldn't record that."); return; }
    if (action === "approve") {
      const n = Number(r.brainFacts) || 0;
      flex(n > 0 ? `Approved. The fact base is locked and ${n} fact${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} being added to the brain.` : "Approved. The fact base is locked.");
    } else flex("Rejected and archived.");
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
  // Write the CEO's LinkedIn newsletter from ONE fact, in the brain's voice, then render its creative. `note` folds
  // in a rewrite instruction. The piece lands first (fast); the image follows as its own short request.
  async function openNewsletter(c: Claim, note?: string) {
    // If this fact already has a SAVED draft (survived a logout) and this isn't an explicit rewrite, reopen it as it
    // was - the piece, the chosen creative and the other renders - rather than spending on a fresh generation.
    if (!note && c.newsletter) {
      const opts = Array.isArray(c.newsletter_options) ? c.newsletter_options : [];
      setNl({ claim: c, post: c.newsletter, art: null, img: c.newsletter_art || opts[0] || null, imgs: opts, busy: false, imgBusy: false, saving: false, saved: true, err: "", note: "", showNote: false });
      return;
    }
    setNl({ claim: c, post: "", art: null, img: null, imgs: [], busy: true, imgBusy: false, saving: false, saved: false, err: "", note: "", showNote: false });
    const r = await fetch(`/api/studio/researcher/newsletter`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, claimId: c.id, notes: note || "" }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setNl((s) => s ? { ...s, busy: false, err: r?.error || "Couldn't write the piece." } : s); return; }
    setNl((s) => s ? { ...s, busy: false, post: r.newsletter, art: r.art, imgBusy: true } : s);
    const img = await fetch(`/api/studio/intel/newsletter-creative`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, subject: r.art?.subject, callout: r.art?.callout }),
    }).then((x) => x.json()).catch(() => null);
    // The creative returns THREE renders when a CEO photo is on file (buildCeoCreatives); fall back to the single url.
    const imgs: string[] = img?.ok ? (Array.isArray(img.urls) && img.urls.length ? img.urls : img.url ? [img.url] : []) : [];
    setNl((s) => s ? { ...s, imgBusy: false, img: imgs[0] || null, imgs } : s);
  }

  // APPROVE saves the piece + the chosen creative + the other options ONTO the fact, so it survives a logout and
  // reopens where it was (Gary). REJECT clears any saved draft. Both scoped to this brain's fact.
  async function approveNewsletter() {
    if (!nl) return;
    setNl((s) => s ? { ...s, saving: true } : s);
    const r = await fetch(`/api/studio/researcher/newsletter/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, claimId: nl.claim.id, newsletter: nl.post, art: nl.img || "", options: nl.imgs }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setNl((s) => s ? { ...s, saving: false, err: r?.error || "Couldn't save the piece." } : s); return; }
    // Reflect the save on the fact so a reopen loads it and a small marker shows it is kept.
    setClaims((cs) => cs.map((x) => x.id === nl.claim.id ? { ...x, newsletter: nl.post, newsletter_art: nl.img || null, newsletter_options: nl.imgs } : x));
    setNl(null);
    flex("Approved and saved to this fact. It survives logout and is ready for the CEO: copy the post, download the image.");
  }
  async function rejectNewsletter() {
    if (!nl) return;
    if (nl.saved || nl.claim.newsletter) {
      await fetch(`/api/studio/researcher/newsletter/save?clientId=${encodeURIComponent(clientId)}&claimId=${encodeURIComponent(nl.claim.id)}`, { method: "DELETE" }).catch(() => {});
      setClaims((cs) => cs.map((x) => x.id === nl.claim.id ? { ...x, newsletter: null, newsletter_art: null, newsletter_options: [] } : x));
    }
    setNl(null);
  }

  const bySection = (id: string) => claims.filter((c) => c.section === id);
  const rejectedCount = claims.filter((c) => c.rejected && !c.in_brain).length;
  const inBrainCount = claims.filter((c) => c.in_brain).length;
  // A "gap" is the Researcher honestly reporting what it could NOT find - not a fact. Facts and gaps are counted
  // separately so a thin-record client (all gaps) never reads as "8 claims" and then shows an empty fact base.
  const gapClaims = claims.filter((c) => c.section === "gaps" && !c.rejected && !c.in_brain);
  const factCount = claims.filter((c) => !c.rejected && !c.in_brain && c.section !== "gaps" && c.section !== "unverified").length;
  const liveCount = factCount;   // real facts in the live review list (gaps/unverified are shown separately)

  // Bring EVERY carried-forward "in the brain" fact back to the live review list at once. Fixes the confusing
  // empty fact base on a re-run, when a previous run had kept facts that this run auto-tagged as already-kept.
  async function restoreAllToReview() {
    const kept = claims.filter((c) => c.in_brain);
    if (!kept.length) return;
    setClaims((cs) => cs.map((x) => x.in_brain ? { ...x, in_brain: false } : x));
    const results = await Promise.all(kept.map((c) => fetch(`/api/studio/researcher/claim`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, claimId: c.id, action: "remove_brain" }),
    }).then((r) => r.ok).catch(() => false)));
    // If any restore failed, the optimistic UI is now ahead of the server, so reconcile from the source of truth.
    if (results.some((ok) => !ok)) { flex("Some facts could not be restored. Refreshing."); await load(clientId); }
    else flex(`Restored ${kept.length} fact${kept.length === 1 ? "" : "s"} to the review list.`);
  }

  const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // THE LIVING HERO's readiness fraction (0..1), the Researcher's answer to the Brain's strength bar: dim when
  // nothing has run, an active sweep while collecting, and fuller the more verified facts are standing. A locked
  // fact base reads brightest of all.
  const busyRun = running || collecting;
  const approved = run?.status === "gate1_approved";
  const lit = busyRun ? 0.5
    : approved ? Math.min(1, 0.6 + factCount / 45)
    : canGate ? Math.min(1, 0.45 + factCount / 50)
    : run ? 0.4
    : 0.12;
  // The one-line state under the hero title, honest to exactly where the run is.
  const heroLine = busyRun ? `Researching ${clientName}. This runs in the background, safe to navigate away.`
    : approved ? `Fact base locked. ${factCount} verified fact${factCount === 1 ? "" : "s"} are in the brain and ready for the Strategist.`
    : canGate ? `Version ${run?.version} is ready for your review: ${factCount} verified fact${factCount === 1 ? "" : "s"}${gapClaims.length ? `, ${gapClaims.length} gap${gapClaims.length === 1 ? "" : "s"}` : ""}. Approve, rerun with notes, or reject below.`
    : run?.status === "failed" ? "The last run did not finish, and nothing was charged. Run it again when you are ready."
    : run ? `Version ${run.version} on file. Collect again for a fresh version whenever the ground truth moves.`
    : `Ready to collect a verified, source-tiered fact base on ${clientName}. Every claim carries a source and a Tier 1/2/3 grade.`;

  return (
    <div className="mt-8">
      {/* THE LIVING HERO. The Researcher's answer to the Brain's readiness card: the radar visual on the left, the
          commission state + the primary Run control on the right, so the team sees what the step IS the moment
          they land, and the run affordance is the biggest thing on the page. */}
      <div className={`gas-rise relative overflow-hidden rounded-2xl border p-6 transition ${approved ? "border-[#4ade80]/40 bg-[#4ade80]/[0.05]" : busyRun ? "border-[#a855f7]/45 bg-[#a855f7]/[0.06]" : "border-[#a855f7]/25 bg-surface-1"}`}>
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.18), transparent 70%)", opacity: 0.35 + 0.6 * Math.min(1, lit) }} />
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-7">
          <div className="relative h-32 w-32 shrink-0 text-ink-faint">
            <LivingResearch lit={lit} active={busyRun} />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 sm:justify-start">
              <h2 className="text-[27px] font-extrabold tracking-tight text-ink">Commission the Researcher</h2>
              {run && status && <span className={`rounded-full border px-3 py-1 text-[15px] font-semibold ${status.cls}`}>v{run.version} · {status.label}</span>}
            </div>
            <p className="mt-1.5 text-[18px] leading-relaxed text-ink-dim">{heroLine}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <button onClick={() => runCollect()} disabled={running || collecting || !isConfigured}
                className={`rounded-lg px-5 py-2.5 text-[18px] font-bold transition ${
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
              {run && !collecting && (
                <span className="text-[16px] text-ink-faint">
                  {factCount} fact{factCount === 1 ? "" : "s"}{gapClaims.length > 0 && <> · <span className="text-[#fcd34d]">{gapClaims.length} gap{gapClaims.length === 1 ? "" : "s"}</span></>} · collected {ukDate(run.created_at)}
                  {spend && typeof spend.runCents === "number" && spend.runCents > 0 && <> · <span className="tabular text-ink-dim">this run cost {rand(spend.runCents)}</span></>}
                </span>
              )}
            </div>
            {/* The tier legend, tying the radar's coloured points to the grades in the fact base below. */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[14px] text-ink-faint sm:justify-start">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />Tier 1 · load-bearing</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" />Tier 2 · reliable</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />Tier 3 · directional</span>
            </div>
          </div>
        </div>
      </div>
      {!isConfigured && <p className="mt-2 text-[16px] text-[#fca5a5]">This brain has nothing to research yet. Add the client and crawl their site into the brain first.</p>}

      {/* COST METER */}
      {spend && (
        <div className="mt-5 mb-1 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-line bg-surface-1 px-4 py-2.5">
          <span className="text-[15px] font-semibold uppercase tracking-wide text-ink-faint">Researcher spend</span>
          <span className="tabular"><b className="text-[22px] font-bold text-ink">{rand(spend.monthCents)}</b> <span className="text-[15px] text-ink-faint">this month</span></span>
          <span className="tabular text-[17px] text-ink-dim">{rand(spend.todayCents)} <span className="text-[15px] text-ink-faint">today</span></span>
          <span className="text-[15px] text-ink-faint">{spend.runsThisMonth} run{spend.runsThisMonth === 1 ? "" : "s"} this month</span>
        </div>
      )}
      {/* SETUP - one balanced card, top-aligned, so nothing floats in dead space: the brain and how it runs on the
          left, its ground-truth sources on the right. Inputs are full-width to fill their column. */}
      <div className="mt-6 rounded-2xl border border-line bg-surface-1 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <SectionTile d={ICON.brief_setup} />
          <div>
            <div className="tabular text-[13px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Setup</div>
            <h2 className="text-[23px] font-extrabold tracking-tight text-ink">Brief the Researcher</h2>
          </div>
        </div>
        <p className="mt-2 text-[16px] text-ink-dim">Point it at the right organisation: confirm the brain, its ground-truth sites and social accounts, add a focus if you want, then commission the run above.</p>

        <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {/* LEFT: the brain, and how it runs */}
          <div className="space-y-5">
            <label className="block">
              <span className="text-[15px] font-semibold uppercase tracking-wide text-ink-faint">Client</span>
              <select value={clientId} disabled={running || collecting} title={running || collecting ? "A run is in progress. It finishes on its own, even if you navigate away." : undefined}
                onChange={(e) => { if (e.target.value === "__new__") setShowCreate(true); else setClientId(e.target.value); }}
                className="mt-1 block w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[17px] outline-none focus:border-accent disabled:opacity-60">
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{configured.includes(c.id) ? "" : " (not researchable yet)"}</option>)}
                <option value="__new__">+ New brain…</option>
              </select>
            </label>

            {/* FOCUS (Gary): an optional steer before the run. Hidden once a run is in flight. */}
            {!running && (
              <div>
                <label className="block text-[15px] font-semibold uppercase tracking-wide text-ink-faint">Focus for this run (optional)</label>
                <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={3}
                  placeholder="Optional. Steer this run at a specific angle: a competitor, a product or service line, a region or location, a time period, or a question you want answered. Leave blank to run the full brief."
                  className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[17px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
                <p className="mt-1 text-[15px] text-ink-faint">An emphasis, not a filter: every section is still collected, and nothing is ever invented to fit the focus.</p>
              </div>
            )}

            {/* WEEKLY AUTO-RUN (Gary): opt this brain into a Monday 08:30 run, off by default so nothing is charged
                without opting in. It emails you when it lands, then you approve or reject at Gate 1 as usual. */}
            {isConfigured && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
                <button role="switch" aria-checked={weekly.on} onClick={toggleWeekly} disabled={weekly.busy}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${weekly.on ? "bg-[#4ade80]" : "bg-surface-2 ring-1 ring-line"} disabled:opacity-60`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${weekly.on ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold text-ink">Weekly auto-run · Monday 08:30</div>
                  <div className="text-[15px] text-ink-faint">
                    {weekly.on
                      ? "ON. This brain researches every Monday morning and emails you to approve. Only new facts surface."
                      : "OFF. Turn on to research this brain automatically each week, so you never forget and never overspend."}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: the ground truth */}
          <div className="space-y-5">
            <div>
              <span className="text-[15px] font-semibold uppercase tracking-wide text-ink-faint">Ground-truth website(s)</span>
              <div className="mt-1.5 space-y-2">
                {sites.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={s} onChange={(e) => { const next = [...sites]; next[i] = e.target.value; setSites(next); }}
                      placeholder={i === 0 ? "https://www.the-amber-room.co.za/" : "https://another-official-site.co.za"}
                      className="block w-full min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[17px] outline-none focus:border-accent" />
                    {sites.length > 1 && <button onClick={() => setSites(sites.filter((_, j) => j !== i))} aria-label="Remove website" className="shrink-0 text-ink-faint hover:text-alert">✕</button>}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => setSites([...sites, ""])} className="text-[15px] font-semibold text-accent hover:underline">+ Add another website</button>
                <button onClick={saveSites} className="rounded-lg border border-line px-3 py-1.5 text-[15px] font-semibold text-ink-dim hover:text-ink">{siteSaved ? "✓ Saved" : "Save"}</button>
              </div>
            </div>

            {/* SOCIAL ACCOUNTS (Gary): the client's own social profiles, mined for cadence, content themes and audience. */}
            <div>
              <span className="text-[15px] font-semibold uppercase tracking-wide text-ink-faint">Social media accounts</span>
              <div className="mt-1.5 space-y-2">
                {socials.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={s} onChange={(e) => { const next = [...socials]; next[i] = e.target.value; setSocials(next); }}
                      placeholder={i === 0 ? "https://www.instagram.com/theclient" : "https://www.linkedin.com/company/theclient"}
                      className="block w-full min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[17px] outline-none focus:border-accent" />
                    {socials.length > 1 && <button onClick={() => setSocials(socials.filter((_, j) => j !== i))} aria-label="Remove social account" className="shrink-0 text-ink-faint hover:text-alert">✕</button>}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => setSocials([...socials, ""])} className="text-[15px] font-semibold text-accent hover:underline">+ Add a social account</button>
                <button onClick={saveSocials} className="rounded-lg border border-line px-3 py-1.5 text-[15px] font-semibold text-ink-dim hover:text-ink">{socSaved ? "✓ Saved" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[15px] text-ink-faint">The website(s) are the anchor: The Researcher reports only the organisation at those addresses, and reads every one of them. Social accounts are mined for cadence, content themes and audience signals.</p>
      </div>

      {/* NEW BRAIN */}
      {showCreate && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-surface-1 p-5">
          <div className="text-[18px] font-bold text-ink">New brain</div>
          <p className="mt-0.5 text-[15px] text-ink-faint">Create a client. Add every official website they run, the first is the primary ground-truth anchor.</p>
          <input value={nb.name} onChange={(e) => setNb({ ...nb, name: e.target.value })} placeholder="Client name"
            className="mt-3 block w-full max-w-md rounded-lg border border-line bg-surface-2 px-3 py-2 text-[18px] outline-none focus:border-accent" />
          <div className="mt-3 space-y-2">
            {nb.sites.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={s} onChange={(e) => { const sites = [...nb.sites]; sites[i] = e.target.value; setNb({ ...nb, sites }); }}
                  placeholder={i === 0 ? "https://primary-website.co.za" : "https://another-site.co.za"}
                  className="block w-full max-w-md rounded-lg border border-line bg-surface-2 px-3 py-2 text-[17px] outline-none focus:border-accent" />
                {nb.sites.length > 1 && <button onClick={() => setNb({ ...nb, sites: nb.sites.filter((_, j) => j !== i) })} aria-label="Remove website" className="text-ink-faint hover:text-alert">✕</button>}
              </div>
            ))}
            <button onClick={() => setNb({ ...nb, sites: [...nb.sites, ""] })} className="text-[15px] font-semibold text-accent hover:underline">+ Add another website</button>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={createBrain} disabled={creating} className="rounded-lg bg-accent px-5 py-2.5 text-[17px] font-bold text-black disabled:opacity-50">{creating ? "Creating…" : "Create brain"}</button>
            <button onClick={() => { setShowCreate(false); setNb({ name: "", sites: [""] }); }} className="rounded-lg border border-line px-4 py-2.5 text-[17px] font-semibold text-ink-dim hover:text-ink">Cancel</button>
          </div>
        </div>
      )}

      {/* The run control, focus and weekly auto-run now live in the hero and the Setup card above. */}

      {/* DURABLE RUN IN PROGRESS (resumed after navigating away, or running in another tab). Safe to leave. */}
      {collecting && !running && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-surface-1 p-5 glow-accent">
          <div className="flex items-center gap-2 text-[18px] font-bold text-ink"><span className="spinner-ring spinner-ring--solid" /> Researching {clientName}…</div>
          <p className="mt-1 text-[17px] text-ink-dim">{run?.progress?.label || "Collecting facts"}{typeof run?.progress?.sources === "number" ? ` · ${run.progress.sources} sources` : ""}{typeof run?.progress?.filed === "number" && run.progress.filed > 0 ? ` · ${run.progress.filed} filed` : ""}</p>
          <p className="mt-2 text-[15px] text-ink-faint">This runs in the background, so you can safely navigate away, the research is saved when it finishes. This view updates on its own.</p>
        </div>
      )}
      {run?.status === "failed" && !running && (
        <p className="mt-3 rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2.5 text-[16px] text-[#fca5a5]">The last run did not finish{run.error ? `: ${run.error}` : "."} Nothing was charged for an unsaved result. You can run it again.</p>
      )}
      {note && <p className="mt-3 rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2.5 text-[16px] text-[#fca5a5]">{note}</p>}

      {/* THE RESEARCH DOCUMENT */}
      {run && !running && !collecting && (
        <div className="mt-4 rounded-xl border border-line bg-surface-1 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <SectionTile d={ICON.brief} />
              <div>
                <div className="text-[18px] font-bold text-ink">Research Brief</div>
                <div className="mt-0.5 text-[15px] text-ink-faint">
                  {docBusy ? "Writing and rendering the brief, this takes a minute or two. The Download button appears here when it is ready, and it is also emailed to you." : run.pdf_url ? "A GAS-branded research brief, written for your strategist." : "Not built for this version yet, use Generate."}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {run.pdf_url && <a href={run.pdf_url} target="_blank" rel="noreferrer" className="rounded-lg bg-accent px-4 py-2 text-[16px] font-bold text-black">Download PDF</a>}
              {run.drive_url && <a href={run.drive_url} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-4 py-2 text-[16px] font-semibold text-ink-dim hover:text-ink">Open in Drive</a>}
              <button onClick={() => buildDoc(run.id)} disabled={docBusy}
                className="rounded-lg border border-line px-4 py-2 text-[16px] font-semibold text-ink-dim hover:text-ink disabled:opacity-50">
                {docBusy ? "…" : run.pdf_url ? "Regenerate" : "Generate document"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-ink-faint">
            {run.notified_at ? <span className="text-[#86efac]">✓ Gary notified by email</span> : delivery && !delivery.email ? <span>Email notice off, set Gmail credentials to enable.</span> : null}
            {run.drive_url ? <span className="text-[#86efac]">✓ Filed to Google Drive</span> : delivery && !delivery.drive ? <span>Drive filing not switched on yet, share a folder with the service account to enable.</span> : null}
          </div>
        </div>
      )}

      {/* LIVE PROGRESS */}
      {progress && (
        <div className="mt-4 rounded-xl border border-line bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div className="text-[18px] font-semibold text-ink">{progress.label}</div>
            <div className="tabular text-[15px] text-ink-faint">{fmtElapsed(elapsed)} · {progress.sources} sources · {progress.filed} filed</div>
          </div>
          {progress.searches.length > 0 && (
            <ul className="mt-3 space-y-1">
              {progress.searches.map((q, i) => <li key={i} className="truncate text-[15px] text-ink-dim">🔍 {q}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* GATE 1 ACTIONS */}
      {canGate && (
        <div className="mt-6 rounded-xl border border-[#fbbf24]/30 bg-[#fbbf24]/[0.06] p-5">
          <div className="flex items-center gap-3">
            <SectionTile d={ICON.gate} />
            <div>
              <div className="text-[18px] font-bold text-ink">Gate 1 · your review</div>
              <p className="mt-1 text-[17px] text-ink-dim">Approve the facts you have checked. Rerun with notes if anything is wrong, that files a fresh version and never overwrites this one.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={() => gate("approve")} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4ade80] px-5 py-2.5 text-[18px] font-bold text-black disabled:opacity-50">
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />}Approve</button>
            <button onClick={() => setShowNotes((s) => !s)} disabled={busy}
              className="rounded-lg border border-line px-5 py-2.5 text-[18px] font-semibold text-ink hover:border-accent">Rerun with notes</button>
            <button onClick={() => gate("reject")} disabled={busy}
              className="rounded-lg border border-[#f87171]/40 px-5 py-2.5 text-[18px] font-semibold text-[#fca5a5] hover:bg-[#f87171]/10">Reject</button>
            {busy && <span className="text-[16px] text-ink-dim">Locking the fact base and adding it to the brain…</span>}
          </div>
          {showNotes && (
            <div className="mt-4">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="What to fix, referencing the section. e.g. 'Foundations: wrong founder, it is Suzanne Stevens.' 'Drop the theamberroom.co.za items, wrong business.'"
                className="block w-full rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-[17px] outline-none focus:border-accent" />
              <button onClick={() => runCollect(notes)} disabled={running || !notes.trim()}
                className="mt-2 rounded-lg bg-accent px-4 py-2 text-[16px] font-bold text-black disabled:opacity-50">Rerun with these notes</button>
            </div>
          )}
        </div>
      )}
      {run?.status === "gate1_approved" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#4ade80]/30 bg-[#4ade80]/[0.06] p-4 text-[17px] text-[#86efac]">
          <span><b>Fact base locked.</b> The facts are in the brain and the Strategist can build from research v{run.version}. Collect again only if the ground truth has moved.</span>
          <button onClick={() => router.push("/strategist/plan")} className="shrink-0 rounded-lg bg-[#4ade80] px-4 py-2 text-[16px] font-bold text-black hover:opacity-90">Go to the Strategist →</button>
        </div>
      )}

      {/* COMPETITOR SET */}
      {run && (
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <SectionTile d={ICON.competitors} />
            <div>
              <h2 className="text-[23px] font-extrabold tracking-tight text-ink">Competitor set</h2>
              <p className="mt-0.5 text-[16px] text-ink-dim">Auto-detected from the category. Add or remove before you approve, adding one commissions a targeted pass on the next run.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {competitors.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-[16px]">
                {c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-accent">{c.name}</a> : <span className="font-semibold text-ink">{c.name}</span>}
                {c.added_by === "auto" && <span className="text-[13px] text-ink-faint">auto</span>}
                <button onClick={() => removeCompetitor(c)} aria-label={`Remove ${c.name}`} className="text-ink-faint hover:text-alert">✕</button>
              </span>
            ))}
            {competitors.length === 0 && <span className="text-[16px] text-ink-faint">None yet, they land on the first run.</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} placeholder="Competitor name"
              className="w-52 rounded-md border border-line bg-surface-1 px-3 py-2 text-[17px] outline-none focus:border-accent" />
            <input value={newComp.website} onChange={(e) => setNewComp({ ...newComp, website: e.target.value })} placeholder="their website (optional)"
              className="w-64 rounded-md border border-line bg-surface-1 px-3 py-2 text-[17px] outline-none focus:border-accent" />
            <button onClick={addCompetitor} className="rounded-md border border-line px-4 py-2 text-[16px] font-semibold text-ink-dim hover:text-ink">+ Add</button>
          </div>
        </div>
      )}

      {/* THE FACT BASE, BY SECTION */}
      {run && claims.length > 0 && (
        <div className="mt-8 space-y-9">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <SectionTile d={ICON.facts} />
              <h2 className="text-[23px] font-extrabold tracking-tight text-ink">The fact base</h2>
            </div>
            <span className="text-[16px] text-ink-faint">
              {inBrainCount > 0 && <span className="text-[#86efac]">{inBrainCount} in the brain. </span>}
              {rejectedCount > 0 && <span className="text-[#fca5a5]">{rejectedCount} rejected. </span>}
              {(inBrainCount > 0 || rejectedCount > 0) && <><button onClick={() => run && buildDoc(run.id)} className="underline hover:text-accent">Regenerate the document</button> to update the PDF.</>}
            </span>
          </div>
          {liveCount === 0 && inBrainCount > 0 && (
            <div className="rounded-xl border border-[#86efac]/30 bg-[#86efac]/[0.06] p-4 text-[16px] leading-relaxed text-ink">
              All {inBrainCount} fact{inBrainCount === 1 ? "" : "s"} from this run {inBrainCount === 1 ? "was" : "were"} carried forward as <b className="text-[#86efac]">already in the brain</b> (you kept {inBrainCount === 1 ? "it" : "them"} on an earlier run), so the review list below is empty. That is why there is nothing to approve.{" "}
              <button onClick={restoreAllToReview} className="font-semibold text-[#86efac] underline hover:text-[#86efac]/80">Restore {inBrainCount === 1 ? "it" : "them all"} to review</button> to check {inBrainCount === 1 ? "it" : "them"} again here.
            </div>
          )}
          {/* THIN PUBLIC RECORD: the Researcher found no verified facts, only gaps. It refuses to invent facts, so
              an empty fact base here is honest, not broken. Explain it and point at the fix rather than leave a
              blank screen (this is exactly what happened on a small/new client like StellR). */}
          {factCount === 0 && inBrainCount === 0 && gapClaims.length > 0 && (
            <div className="rounded-xl border border-[#fbbf24]/40 bg-[#fbbf24]/[0.06] p-4 text-[16px] leading-relaxed text-ink">
              <b className="text-[#fcd34d]">No verified facts yet, only gaps.</b> This client&apos;s public record is thin, so the Researcher could not stand up a single sourced fact, and it will never invent one. What it looked for and could not find is listed below. To get facts: <b>feed the Brain</b> the client&apos;s own material (their site scrape, documents, decks) and run again, add a sharper <b>focus</b>, or <b>rerun with notes</b> pointing it at where the information lives.
            </div>
          )}
          {SECTIONS.map((sec) => {
            const rows = bySection(sec.id).filter((c) => !c.rejected && !c.in_brain);   // tagged facts leave the live list
            if (rows.length === 0) return null;
            const isUnverified = sec.id === "unverified";
            return (
              <section key={sec.id}>
                <div className="flex items-baseline justify-between border-b-2 border-line pb-2">
                  <h3 className={`text-[23px] font-extrabold tracking-tight ${isUnverified ? "text-[#fca5a5]" : "text-ink"}`}>{sec.label}</h3>
                  <span className="text-[15px] text-ink-faint">{rows.length}</span>
                </div>
                <p className="mt-1.5 text-[15px] text-ink-faint">{sec.blurb}</p>
                <ul className="mt-4 space-y-3">
                  {rows.map((c) => (
                    <li key={c.id} className="rounded-xl border border-line/70 bg-surface-1 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <p className="flex-1 text-[18px] leading-relaxed text-ink">
                          {c.subject && !new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(c.subject) && (
                            <span className="mr-2 rounded bg-surface-2 px-2 py-0.5 align-middle text-[14px] font-semibold text-ink-dim">{c.subject}</span>
                          )}
                          {c.claim}
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <button onClick={() => openNewsletter(c)} className={`rounded-lg border px-3 py-1.5 text-[15px] font-semibold hover:bg-[#a855f7]/10 ${c.newsletter ? "border-[#86efac]/50 text-[#86efac]" : "border-[#a855f7]/40 text-[#c79bff]"}`} title={c.newsletter ? "A CEO newsletter is saved on this fact - open to view, edit or download" : "Write the CEO's LinkedIn newsletter from this fact, then approve, reject or rewrite"}>{c.newsletter ? "CEO Newsletter ✓" : "CEO Newsletter"}</button>
                          <button onClick={() => brainClaim(c, true)} className="rounded-lg border border-[#86efac]/40 px-3 py-1.5 text-[15px] font-semibold text-[#86efac] hover:bg-[#86efac]/10" title="Keep this fact and mute it in future runs - it moves to the Kept tray so the next run shows only genuinely-new facts. It does NOT duplicate anything: approving the run at Gate 1 is what hands the whole fact base to the Strategist.">Keep · mute in reruns</button>
                          <button onClick={() => rejectClaim(c, true)} className="rounded-lg border border-[#f87171]/40 px-3 py-1.5 text-[15px] font-semibold text-[#fca5a5] hover:bg-[#f87171]/10" title="Drop this fact - it disappears and is never referenced again">Reject</button>
                        </div>
                      </div>
                      {c.conflict && <div className="mt-2 text-[15px] text-[#fcd34d]">⚠ Sources conflict: {c.conflict}</div>}
                      {isUnverified && c.unverified_reason && <div className="mt-2 text-[15px] text-ink-faint">Why unverified: {c.unverified_reason}</div>}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px]">
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
          {/* GAPS - what the Researcher could NOT verify. Not facts, so shown apart, in amber, as open questions
              to confirm with the client. Visible now (they used to fall into a section that never rendered). */}
          {gapClaims.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between border-b-2 border-[#fbbf24]/30 pb-2">
                <h3 className="text-[23px] font-extrabold tracking-tight text-[#fcd34d]">Gaps · what could not be verified</h3>
                <span className="text-[15px] text-ink-faint">{gapClaims.length}</span>
              </div>
              <p className="mt-1.5 text-[15px] text-ink-faint">Open questions, not findings. Confirm these with the client, or feed the Brain material that answers them and run again.</p>
              <ul className="mt-4 space-y-2">
                {gapClaims.map((c) => (
                  <li key={c.id} className="rounded-xl border border-[#fbbf24]/20 bg-surface-1 p-4 text-[17px] leading-relaxed text-ink-dim">{c.claim}</li>
                ))}
              </ul>
            </section>
          )}
          {/* IN THE BRAIN - facts Gary has kept. Out of the live list so the next run's genuinely-new facts stand
              out, recoverable with Restore. */}
          {inBrainCount > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[#86efac]/30 pb-2">
                <h3 className="text-[20px] font-bold text-[#86efac]">In the Brain · {inBrainCount}</h3>
                <span className="text-[15px] text-ink-faint">Kept. These drop out of the live list so the next run only shows what is new.</span>
              </div>
              <ul className="mt-3 space-y-2">
                {claims.filter((c) => c.in_brain).map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 rounded-lg border border-[#86efac]/20 bg-surface-1/30 px-4 py-2.5">
                    <p className="flex-1 text-[16px] leading-relaxed text-ink-dim">{c.claim}</p>
                    <button onClick={() => brainClaim(c, false)} className="shrink-0 rounded-lg border border-line px-3 py-1 text-[15px] font-semibold text-ink-dim hover:text-ink">Restore</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* REJECTED - out of the way, recoverable, and a permanent do-not-reference memory. */}
          {rejectedCount > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[#f87171]/30 pb-2">
                <h3 className="text-[20px] font-bold text-[#fca5a5]">Rejected · {rejectedCount}</h3>
                <span className="text-[15px] text-ink-faint">Stored. The Researcher will never surface these again, on any future run.</span>
              </div>
              <ul className="mt-3 space-y-2">
                {claims.filter((c) => c.rejected && !c.in_brain).map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 rounded-lg border border-line/40 bg-surface-1/30 px-4 py-2.5">
                    <p className="flex-1 text-[16px] leading-relaxed text-ink-faint line-through">{c.claim}</p>
                    <button onClick={() => rejectClaim(c, false)} className="shrink-0 rounded-lg border border-line px-3 py-1 text-[15px] font-semibold text-ink-dim hover:text-ink">Undo</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {run && claims.length === 0 && !running && !collecting && run.status !== "failed" && (
        <p className="mt-8 text-[16px] text-ink-dim">This version filed no claims. Run again, or check the client has crawled material and a website set.</p>
      )}

      {/* CEO NEWSLETTER preview: the post + its creative, with approve / reject / rewrite. */}
      {nl && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8" onClick={() => setNl(null)}>
          <div
            className="flex max-h-[92vh] w-full max-w-3xl resize flex-col overflow-auto rounded-2xl border border-[#a855f7]/30 bg-surface-1 shadow-2xl"
            style={{ transform: `translate(${nlBox.x}px, ${nlBox.y}px)` }}
            onClick={(e) => e.stopPropagation()}>
            {/* Drag handle: the header. Grab it to move the box; resize from the bottom-right corner (native). */}
            <div
              onPointerDown={(e) => { nlDrag.current = { sx: e.clientX, sy: e.clientY, ox: nlBox.x, oy: nlBox.y }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
              onPointerMove={(e) => { const d = nlDrag.current; if (d) setNlBox({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }); }}
              onPointerUp={() => { nlDrag.current = null; }}
              className="flex cursor-move items-center justify-between border-b border-line px-6 py-4 select-none">
              <h3 className="text-[20px] font-bold text-[#c79bff]">CEO Newsletter <span className="ml-1 text-[14px] font-normal text-ink-faint">⠿ drag to move</span></h3>
              <button onClick={() => setNl(null)} className="rounded px-2 text-[18px] text-ink-faint hover:text-ink" aria-label="Close">✕</button>
            </div>
            <div className="p-6">
            <p className="mt-0 text-[15px] text-ink-faint">In the CEO&apos;s voice, from: &ldquo;{nl.claim.claim.slice(0, 90)}{nl.claim.claim.length > 90 ? "…" : ""}&rdquo;</p>

            {nl.err ? (
              <div className="mt-4 rounded-lg border border-alert/40 bg-alert/5 p-4 text-[16px] text-alert">{nl.err}</div>
            ) : nl.busy ? (
              <div className="mt-8 flex justify-center text-[18px] text-[#c79bff]"><Working messages={WORKING_NEWSLETTER} /></div>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  {nl.imgBusy ? (
                    <div className="flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-2 text-[16px] text-[#c79bff]"><span className="h-5 w-5 mr-2 animate-spin rounded-full border-2 border-[#c79bff]/30 border-t-[#c79bff]" />Rendering three options…</div>
                  ) : nl.img ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={nl.img} alt="CEO newsletter creative" className="w-full rounded-xl border border-line" />
                      {/* THREE OPTIONS (Gary): the creative returns three renders when a CEO photo is on file. Pick one. */}
                      {nl.imgs.length > 1 && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {nl.imgs.map((u, i) => (
                            <button key={u} onClick={() => setNl((s) => s ? { ...s, img: u } : s)} title={`Option ${i + 1}`}
                              className={`overflow-hidden rounded-lg border-2 transition ${nl.img === u ? "border-[#c79bff]" : "border-line hover:border-line-strong"}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt={`Option ${i + 1}`} className="aspect-square w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        <a href={nl.img} download target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-[#c79bff] hover:underline">Download image</a>
                        {nl.imgs.length > 1 && <span className="text-[15px] text-ink-faint">Option {Math.max(0, nl.imgs.indexOf(nl.img)) + 1} of {nl.imgs.length}</span>}
                      </div>
                    </>
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-xl border border-line bg-surface-2 p-4 text-center text-[16px] text-ink-faint">No image. Upload a CEO photo to this brain to composite the real portrait.</div>
                  )}
                </div>
                <div>
                  <div className="tabular text-[14px] uppercase tracking-[0.16em] text-ink-faint">The post</div>
                  <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap text-[16px] leading-relaxed text-ink">{nl.post}</p>
                  <button onClick={() => { navigator.clipboard?.writeText(nl.post); flex("Post copied."); }} className="mt-2 text-[15px] font-semibold text-[#c79bff] hover:underline">Copy post</button>
                </div>
              </div>
            )}

            {!nl.busy && !nl.err && (
              <>
                {nl.showNote && (
                  <div className="mt-4 flex gap-2">
                    <input value={nl.note} onChange={(e) => setNl((s) => s ? { ...s, note: e.target.value } : s)} placeholder="What should change? e.g. lead with the number, make it warmer"
                      className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[16px] outline-none focus:border-line-strong" />
                    <button onClick={() => openNewsletter(nl.claim, nl.note)} className="btn-brand rounded-lg px-4 py-2 text-[16px] font-bold">Rewrite</button>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button onClick={approveNewsletter} disabled={nl.saving} className="rounded-lg border border-[#86efac]/50 px-4 py-2 text-[16px] font-bold text-[#86efac] hover:bg-[#86efac]/10 disabled:opacity-50">{nl.saving ? "Saving…" : nl.saved ? "Save changes" : "Approve"}</button>
                  <button onClick={rejectNewsletter} className="rounded-lg border border-[#f87171]/50 px-4 py-2 text-[16px] font-bold text-[#fca5a5] hover:bg-[#f87171]/10">Reject</button>
                  <button onClick={() => setNl((s) => s ? { ...s, showNote: !s.showNote } : s)} className="rounded-lg border border-line px-4 py-2 text-[16px] font-bold text-ink hover:border-line-strong">Rewrite</button>
                  {nl.saved && <span className="text-[15px] text-[#86efac]">✓ Saved to this fact</span>}
                </div>
                <p className="mt-2 text-[15px] text-ink-faint">Approve keeps the piece and the chosen image on this fact, so it survives a logout and is ready to hand to the CEO.</p>
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
