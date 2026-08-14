"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { flex } from "@/lib/flex";
import IntelEmailControl from "@/components/IntelEmailControl";

// WORTH REVIEWING. The Journalist and The Strategist research daily and file what they find here. They
// PROPOSE - a human accepts or bins. Nothing reaches the client brain without that gate.
//
// Every item carries its real source and an honest confidence grade, because an unsourced "insight" is worse
// than no insight: it becomes a fact nobody can trace and every future piece of work inherits it.

// The Researcher's five fixed sections. Kept here (not imported from lib/research, a server module) so this
// client component stays clean.
const SECTIONS: { id: string; label: string; accent: string }[] = [
  { id: "threat", label: "Threats", accent: "#f87171" },
  { id: "opportunity", label: "Opportunities", accent: "#4ade80" },
  { id: "gap", label: "Gaps", accent: "#fbbf24" },
  { id: "positioning", label: "Positioning", accent: "#60a5fa" },
  { id: "trend", label: "Trends & campaigns to steal", accent: "#c79bff" },
];

type Intel = {
  id: string; role: string; section?: string | null; request?: string | null; verification?: string | null; headline: string; why_it_matters: string; detail: string | null;
  source_url: string | null; source_name: string | null;
  sources: { name: string; url: string }[];
  published_at: string | null; period: string | null;
  confidence: string; material: boolean; status: string; found_at: string;
  // INTERNAL: what this could do to MoMo SA, and the campaign move it argues for. Never the CEO's public voice.
  impact_risk: string | null; campaign_response: string | null;
  // The kept CEO draft, so it survives a logout.
  newsletter: string | null; newsletter_art: string | null; newsletter_options: string[] | null;
};

// TWO dates, and conflating them is how stale information becomes "current":
//   found_at     - when WE researched it
//   published_at - when the SOURCE was published / the thing actually happened
// A 2019 article discovered today is not news. The research window is now 30 days (Gary), so anything past that
// is flagged and can never sit in the queue looking as fresh as something published this morning.
const STALE_DAYS = 30;
function dateBits(i: Intel): { published: string; found: string; ageDays: number | null; stale: boolean } {
  // UK long form, the way we write dates: "17th July 2026".
  const fmt = (d: string) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const day = dt.getUTCDate();
    const th = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
    return `${day}${th} ${dt.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${dt.getUTCFullYear()}`;
  };
  const found = i.found_at ? fmt(i.found_at) : "";
  if (!i.published_at) return { published: "", found, ageDays: null, stale: false };
  const ageDays = Math.floor((Date.now() - new Date(i.published_at).getTime()) / 86_400_000);
  return { published: fmt(i.published_at), found, ageDays, stale: ageDays > STALE_DAYS };
}
type Client = { id: string; name: string };

const CONF: Record<string, string> = {
  high: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]",
  medium: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]",
  low: "border-[#f87171]/40 bg-[#f87171]/10 text-[#fca5a5]",
};

export default function IntelQueue({ clients, configured = [], canPublish, role }: { clients: Client[]; configured?: string[]; canPublish?: string[]; role: "journalist" | "strategist" | "researcher" }) {
  // The Researcher is COMMISSIONED, not watched: an on-demand focus line lets you point a dossier at a
  // question ("their new bank partnership", "gaps vs Capitec"). Empty = the full standing remit.
  const isResearcher = role === "researcher";
  // REFRESH WITHOUT RELOADING. The brain list and the briefs are server-rendered, so a page opened before a
  // brain was added or briefed keeps showing the old list - which has now twice looked like a bug when the
  // data was correct all along.
  //
  // The instinctive fix, pressing F5, is the one thing that does NOT work here: a reload re-gates and signs
  // you out (the security posture Gary asked for), so you lose your place and still have to navigate back.
  // router.refresh() re-runs the server component and updates the props in place, with no page load and so no
  // re-gate.
  const router = useRouter();
  // Land on MTN MoMo by default (Gary), then let the dropdown reach the rest. MoMo is the flagship brain and
  // the one with the fullest doctrine, so it is the sane thing to open on - the same default the funnel
  // builder already lands on. Fall back to the first briefed brain if MoMo is not in the list, and to the
  // first of any if none is briefed, so the picker is never empty.
  const [clientId, setClientId] = useState(() => {
    const momo = clients.find((c) => /mo\s*mo|mtn/i.test(c.name));
    const briefed = clients.find((c) => configured.includes(c.id));
    return (momo || briefed || clients[0])?.id || "";
  });
  const [items, setItems] = useState<Intel[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const [focus, setFocus] = useState("");
  // LIVE PROGRESS while a deep dive runs (Researcher only). The run streams its real searches and findings, so
  // the desk narrates the work instead of showing a dead spinner. Null when nothing is running.
  const [progress, setProgress] = useState<null | { label: string; searches: string[]; sources: number; filed: { section: string; headline: string }[] }>(null);
  const [elapsed, setElapsed] = useState(0);
  const [exported, setExported] = useState("");
  // FILTERS (Researcher desk): narrow the runs by section and by when they were researched.
  const [secFilter, setSecFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  // GROUND-TRUTH WEBSITE (Gary): the team offers up the client's real site, and both desks anchor to it so they
  // can never research a same-named but different business. Loaded per client, saved on demand.
  const [website, setWebsite] = useState("");
  const [siteSaved, setSiteSaved] = useState(false);
  useEffect(() => {
    if (!isResearcher || !clientId) return;
    let live = true;
    fetch(`/api/studio/client-website?clientId=${clientId}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (live) { setWebsite(d?.website || ""); setSiteSaved(false); } }).catch(() => {});
    return () => { live = false; };
  }, [clientId, isResearcher]);
  async function saveWebsite() {
    const r = await fetch("/api/studio/client-website", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, website }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setWebsite(r.website || ""); setSiteSaved(true); setTimeout(() => setSiteSaved(false), 1800); router.refresh(); }
    else flex(r?.error || "Couldn't save the website.");
  }

  useEffect(() => {
    if (!progress) { setElapsed(0); return; }
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [progress]);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    // The Researcher has its own on-demand queue; the daily desks share the intel queue.
    const url = role === "researcher" ? `/api/studio/research?clientId=${id}` : `/api/studio/intel?clientId=${id}`;
    const d = await fetch(url, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setItems(((d?.intel as Intel[]) || []).filter((i) => i.role === role));
  }, [role]);

  useEffect(() => { refresh(clientId); }, [clientId, refresh]);

  async function decide(id: string, status: "accepted" | "binned") {
    setBusy(true);
    await fetch("/api/studio/intel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, id, status }),
    }).catch(() => {});
    setBusy(false);
    await refresh(clientId);
  }

  // Manual trigger. The Researcher COMMISSIONS a fresh dossier on demand (metered, deep); the daily desks run
  // the shared cron pass. Either way, report honestly - a run that found nothing and a run that broke must
  // never look the same from the outside.
  async function runNow(focusArg?: string) {
    // focusArg lets "Go deeper" commission a run seeded from a finding without waiting on the focus state to
    // settle. A click event is not a string, so the guard keeps onClick={runNow} working too.
    const useFocus = typeof focusArg === "string" ? focusArg : focus;
    setRunning(true); setNote("");
    if (isResearcher) {
      // Read the run as a live stream (SSE). Each event narrates real work; a done event carries the count.
      setProgress({ label: "Commissioning the deep research", searches: [], sources: 0, filed: [] });
      let count = 0, errored = "";
      try {
        const resp = await fetch(`/api/studio/research`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, focus: useFocus }),
        });
        if (!resp.ok || !resp.body) throw new Error(`The deep research could not start (${resp.status}).`);
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let e: { t: string; label?: string; q?: string; n?: number; section?: string; headline?: string; count?: number; message?: string };
            try { e = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (e.t === "phase") setProgress((p) => p ? { ...p, label: e.label || p.label } : p);
            else if (e.t === "search") setProgress((p) => p ? { ...p, searches: [...p.searches, e.q || ""].slice(-6) } : p);
            else if (e.t === "sources") setProgress((p) => p ? { ...p, sources: e.n || p.sources } : p);
            else if (e.t === "finding") setProgress((p) => p ? { ...p, filed: [...p.filed, { section: e.section || "positioning", headline: e.headline || "" }] } : p);
            else if (e.t === "done") count = e.count || 0;
            else if (e.t === "error") errored = e.message || "The deep research failed.";
          }
        }
      } catch (err) {
        errored = (err as Error)?.message || "Couldn't run the deep research.";
      }
      setRunning(false); setProgress(null);
      if (errored) { setNote(errored); flex(errored); await refresh(clientId); return; }
      setNote(count ? "" : "The deep research ran clean and found nothing worth filing. That is a real answer, not a gap.");
      flex(`Deep research done. Filed ${count} finding${count === 1 ? "" : "s"} across the five sections.`);
      await refresh(clientId);
      return;
    }
    const r = await fetch(`/api/cron/daily-intel?clientId=${clientId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setRunning(false);
    if (!r?.ok) { flex(r?.error || "Couldn't run the research."); return; }
    const ran = (r.ran as { journalist?: number; strategist?: number; errors?: string[] }[])?.[0];
    if (ran?.errors?.length) { setNote(`A role failed: ${ran.errors[0]}`); flex(ran.errors[0]); }
    else {
      const mine = role === "journalist" ? ran?.journalist ?? 0 : ran?.strategist ?? 0;
      setNote(mine ? "" : "Ran clean and found nothing new today. That is a real answer, not a gap.");
      flex(`Research complete. The Journalist filed ${ran?.journalist ?? 0}, The Strategist filed ${ran?.strategist ?? 0}.`);
    }
    await refresh(clientId);
  }

  // LEAD WITH THE MOST RECENT (Gary). Newest publication first; anything we could not date sinks to the bottom,
  // because we cannot claim it is current.
  const byRecency = (a: Intel, b: Intel) => {
    const av = a.published_at ? new Date(a.published_at).getTime() : -Infinity;
    const bv = b.published_at ? new Date(b.published_at).getTime() : -Infinity;
    return bv - av;
  };
  // The Researcher orders by WHEN WE RESEARCHED IT (found_at), so the latest deep dive sits at the top - a
  // just-commissioned dossier is what you want to read, not the oldest source in the pile (Gary).
  const byFound = (a: Intel, b: Intel) => new Date(b.found_at).getTime() - new Date(a.found_at).getTime();
  const clientName = clients.find((c) => c.id === clientId)?.name || "us";
  // Whether THIS brain has a CEO voice to publish an article in. When false, the publish button is replaced by
  // a plain line saying what to add, rather than letting the click fail with a small toast (Gary). If the prop
  // is not supplied at all (legacy desks), we leave the button as it was.
  const canPublishHere = canPublish === undefined ? true : canPublish.includes(clientId);

  // The example prompt has to belong to the SELECTED brain, or it misleads: a MoMo "gaps vs Capitec" line under
  // BrightRock points the researcher at the wrong category (Gary caught exactly this). We only put a named rival
  // on a brain we are sure of - anything else gets a brand-neutral prompt rather than a wrong one.
  const focusExample = /mo\s*mo|mtn/i.test(clientName)
    ? "e.g. gaps vs Capitec Pay on trust, or a bank wallet's new move worth answering. Leave blank for the full standing remit."
    : /brightrock/i.test(clientName)
    ? "e.g. how Discovery or Sanlam are framing income protection, or a life-stage moment the category ignores. Leave blank for the full standing remit."
    : `e.g. a specific competitor's recent move, or an angle on ${clientName} you want dug into. Leave blank for the full standing remit.`;
  // A brain with no brief for THIS desk can never produce a finding. Saying "nothing in the queue" for one
  // describes a run that did not happen as though it had run and found nothing - two very different things.
  const isConfigured = configured.length === 0 || configured.includes(clientId);
  const material = items.filter((i) => i.material).sort(byRecency);
  const rest = items.filter((i) => !i.material).sort(byRecency);

  // GO DEEPER. Commission a fresh run pointed straight at one finding - "what more is there, and what do we do
  // about it". It seeds the focus box (so you see what was asked) and runs immediately, without waiting on state.
  function deepen(i: Intel) {
    if (running) return;
    const seed = `Go deeper on this finding and what we should do about it: "${i.headline}". Context: ${i.why_it_matters}`.slice(0, 580);
    setFocus(seed);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    runNow(seed);
  }

  // THE FILTERED VIEW. Section and date-range dropdowns narrow what the desk shows, counts and exports (Gary).
  // Date is by WHEN WE RESEARCHED IT (found_at) - "these research runs" - not the source's own publish date.
  function inRange(i: Intel): boolean {
    if (dateFilter === "all") return true;
    const t = new Date(i.found_at).getTime();
    if (Number.isNaN(t)) return false;
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const back = (n: number) => startToday - n * 86400000;
    switch (dateFilter) {
      case "today": return t >= startToday;
      case "yesterday": return t >= back(1) && t < startToday;
      case "7d": return t >= back(7);
      case "14d": return t >= back(14);
      case "30d": return t >= back(30);
      case "lastmonth": {
        const firstThis = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        return t >= firstLast && t < firstThis;
      }
      default: return true;
    }
  }
  const shown = items.filter((i) => (secFilter === "all" || (i.section || "positioning") === secFilter) && inRange(i));

  // EXPORT. Copy = clean Markdown (drops into email/Slack). Download = Word (.doc), an editable, shareable
  // document for a brief or a client deck. Both honour the current filters, are grouped as the desk reads them,
  // keep sources as links, and label the internal impact/response lines so a paste never leaks them by accident.
  function researchMarkdown(): string {
    const out: string[] = [`# ${clientName} - Research`, ""];
    for (const s of SECTIONS) {
      const inSec = shown.filter((i) => (i.section || "positioning") === s.id).sort(byFound);
      if (!inSec.length) continue;
      out.push(`## ${s.label}`, "");
      for (const i of inSec) {
        out.push(`### ${i.headline}`);
        const meta = [i.published_at ? `Published ${i.published_at}` : "", i.confidence ? `Confidence ${i.confidence}` : "", i.request ? `Focus: ${i.request}` : ""].filter(Boolean).join(" · ");
        if (meta) out.push(`_${meta}_`);
        out.push("");
        if (i.why_it_matters) out.push(`**Why it matters:** ${i.why_it_matters}`, "");
        if (i.detail) out.push(i.detail, "");
        if (i.impact_risk) out.push(`**Internal - impact:** ${i.impact_risk}`);
        if (i.campaign_response) out.push(`**Internal - response:** ${i.campaign_response}`);
        const srcs = sourcesOf(i);
        if (srcs.length) { out.push("", "Sources:"); srcs.forEach((x) => out.push(`- [${x.name}](${x.url})`)); }
        out.push("");
      }
    }
    return out.join("\n").trim() + "\n";
  }
  function researchHtml(): string {
    const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const p: string[] = [
      `<h1 style="font-family:Arial,sans-serif;color:#0b1220;margin:0 0 4px;">${esc(clientName)} — Research</h1>`,
      `<p style="font-family:Arial,sans-serif;color:#667085;margin:0 0 18px;">Generated ${esc(new Date().toLocaleDateString("en-ZA"))}</p>`,
    ];
    for (const s of SECTIONS) {
      const inSec = shown.filter((i) => (i.section || "positioning") === s.id).sort(byFound);
      if (!inSec.length) continue;
      p.push(`<h2 style="font-family:Arial,sans-serif;color:${s.accent};border-bottom:2px solid ${s.accent};padding-bottom:4px;margin:22px 0 8px;">${esc(s.label)} (${inSec.length})</h2>`);
      for (const i of inSec) {
        p.push(`<h3 style="font-family:Arial,sans-serif;color:#0b1220;margin:14px 0 2px;">${esc(i.headline)}</h3>`);
        const meta = [i.published_at ? `Published ${i.published_at}` : "", i.confidence ? `Confidence ${i.confidence}` : "", i.request ? `Focus: ${i.request}` : ""].filter(Boolean).join(" · ");
        if (meta) p.push(`<p style="font-family:Arial,sans-serif;color:#98a2b3;font-size:12px;margin:0 0 6px;">${esc(meta)}</p>`);
        if (i.why_it_matters) p.push(`<p style="font-family:Arial,sans-serif;margin:0 0 6px;"><b>Why it matters:</b> ${esc(i.why_it_matters)}</p>`);
        if (i.detail) p.push(`<p style="font-family:Arial,sans-serif;margin:0 0 6px;">${esc(i.detail).replace(/\n/g, "<br/>")}</p>`);
        if (i.impact_risk) p.push(`<p style="font-family:Arial,sans-serif;color:#475467;margin:0 0 2px;"><b>Internal - impact:</b> ${esc(i.impact_risk)}</p>`);
        if (i.campaign_response) p.push(`<p style="font-family:Arial,sans-serif;color:#475467;margin:0 0 6px;"><b>Internal - response:</b> ${esc(i.campaign_response)}</p>`);
        const srcs = sourcesOf(i);
        if (srcs.length) p.push(`<p style="font-family:Arial,sans-serif;font-size:12px;margin:0 0 4px;">Sources: ${srcs.map((x) => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join(" · ")}</p>`);
      }
    }
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(clientName)} Research</title></head><body>${p.join("\n")}</body></html>`;
  }
  async function copyResearch() {
    try { await navigator.clipboard?.writeText(researchMarkdown()); setExported("copied"); }
    catch { setExported("failed"); }
    setTimeout(() => setExported(""), 1800);
  }
  function downloadResearch() {
    const slug = clientName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "research";
    const blob = new Blob(["﻿" + researchHtml()], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-research.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 p-4">
        <div className="flex items-center gap-3">
          <span className="tabular text-lg uppercase tracking-[0.2em] text-ink-faint">Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-lg text-ink outline-none focus:border-[#60a5fa]">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {/* Re-reads the brain list and the briefs in place. F5 would sign you out, so this is the gesture
              that actually does what refreshing is meant to do. */}
          <button onClick={() => router.refresh()} title="Re-read the brain list and briefs"
            className="rounded-lg border border-line px-3 py-1.5 text-lg font-semibold text-ink-dim transition hover:border-line-strong hover:text-ink">
            ↻ Refresh
          </button>
        </div>
        <button onClick={() => runNow()} disabled={running || !clientId}
          className="inline-flex items-center gap-2 rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-lg font-bold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-40">
          {running && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
          {running ? "Researching…" : (isResearcher ? "✦ Deep Dive Research" : "↻ Run research now")}
        </button>
      </div>

      {/* WHO GETS THE STRATEGIST EMAIL, AND HOW OFTEN. On/off + daily/weekly cadence and the recipient list, per
          brain. This is the cost dial: 'off' skips the whole paid run on the automated sweep (Gary). */}
      {role === "strategist" && clientId && (
        <IntelEmailControl clientId={clientId} clientName={clientName} />
      )}

      {/* GROUND-TRUTH WEBSITE. The team confirms the client's real site; every run anchors to it and validates
          each source is that exact organisation, so the pod can never drift to a same-named business (Gary). */}
      {isResearcher && (
        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <label className="tabular block text-sm uppercase tracking-[0.2em] text-ink-faint">Client website (the ground truth)</label>
          <p className="mt-1 text-[14px] text-ink-faint">Both the Researcher and Strategist stay strictly inside this site and reject any same-named but different business.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={website} onChange={(e) => { setWebsite(e.target.value); setSiteSaved(false); }}
              placeholder="https://www.the-amber-room.co.za/"
              className="min-w-[280px] flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg text-ink outline-none focus:border-[#a855f7]" />
            <button onClick={saveWebsite} disabled={running}
              className="rounded-lg border border-[#a855f7]/40 px-3 py-2 text-lg font-bold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-40">
              {siteSaved ? "Saved ✓" : "Save website"}
            </button>
          </div>
          {!website && <p className="mt-1.5 text-[14px] text-[#fcd34d]">⚠ No website set. Without it the pod anchors only to the crawled pages, and a same-named business could slip in. Set it before running.</p>}
        </div>
      )}

      {/* The Researcher is commissioned. An optional focus line points the dossier at a question; left empty it
          works the brain's full standing remit. Each run is metered, deep web research - so it is a considered
          button, not one you press idly. */}
      {isResearcher && (
        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <label className="tabular block text-sm uppercase tracking-[0.2em] text-ink-faint">Focus for this deep research (optional)</label>
          <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2}
            placeholder={focusExample}
            className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg leading-relaxed text-ink outline-none focus:border-[#a855f7]" />
          <p className="mt-1.5 text-[15px] text-ink-faint">Deep, on-demand web research across five sections: threats, opportunities, gaps, positioning, and trends to steal. Each run is metered and appears in Cost Control.</p>
        </div>
      )}

      {/* LIVE PROGRESS. The run narrates itself: the current phase, the real searches as they fire, sources
          read, and each finding the moment it is filed. This is the difference between "world-class deep dive"
          as copy and as an actual experience. */}
      {progress && (
        <div className="rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#c79bff]" />
              <span className="text-lg font-semibold text-ink">{progress.label}</span>
            </div>
            <span className="tabular text-lg text-ink-dim">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              {progress.sources ? ` · ${progress.sources} source${progress.sources === 1 ? "" : "s"} read` : ""}
            </span>
          </div>
          {progress.searches.length > 0 && (
            <div className="mt-3 space-y-1">
              {progress.searches.map((q, i) => (
                <p key={i} className="truncate text-[15px] text-ink-dim"><span className="text-ink-faint">↳ searching</span> {q}</p>
              ))}
            </div>
          )}
          {progress.filed.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              {progress.filed.map((f, i) => {
                const sec = SECTIONS.find((s) => s.id === f.section);
                return (
                  <p key={i} className="flex items-start gap-2 text-[15px] text-ink">
                    <span className="tabular mt-0.5 shrink-0 text-xs uppercase tracking-wider" style={{ color: sec?.accent || "#c79bff" }}>{sec?.label || f.section}</span>
                    <span className="truncate">{f.headline}</span>
                  </p>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-[13px] text-ink-faint">Deep web research runs live and takes a few minutes. Findings appear here as they are filed, then settle into the sections below.</p>
        </div>
      )}

      {note && <p className="rounded-lg border border-[#fbbf24]/35 bg-[#fbbf24]/[0.07] px-3 py-2 text-[22px] text-[#fcd34d]">{note}</p>}

      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
          {isConfigured ? (
            <p className="text-lg text-ink-dim">
              {isResearcher
                ? <>No research yet. Add a focus if you like, then hit <b className="text-ink">Deep Dive Research</b>.</>
                : <>Nothing in the queue. The scheduled run follows this brain&apos;s Intelligence email setting above (08:30 SAST), or hit <b className="text-ink">Run research now</b>.</>}
            </p>
          ) : isResearcher ? (
            <>
              <p className="text-lg text-ink">
                <b>{clientName}</b> has nothing to research yet: no crawled knowledge and no Researcher brief.
              </p>
              <p className="mt-2 text-lg text-ink-dim">
                Feed this brain first: crawl its site under <b className="text-ink">Ask the Brain</b>, or add a
                Researcher brief. Once it has either, the Researcher can run a full deep dive on it.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg text-ink">
                <b>{clientName}</b> has no {role === "journalist" ? "Journalist" : "Strategist"} brief yet, so this desk has nothing to research for it.
              </p>
              <p className="mt-2 text-lg text-ink-dim">
                A brief is what tells the pod what this brain is about and what is out of bounds. Until one
                exists no research can run, and none of another brain&apos;s will ever be borrowed.
              </p>
            </>
          )}
        </div>
      ) : isResearcher ? (
        // THE DOSSIER, in its five fixed sections so two dossiers read the same way. A section with nothing is
        // simply not shown - the Researcher is told padding a section is a failure, so an empty one is honest.
        <>
          {/* FILTERS + EXPORT. Section and date dropdowns narrow the runs; Copy = Markdown, Download = Word. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-ink-faint">{shown.length} finding{shown.length === 1 ? "" : "s"} in these research runs</span>
            <select value={secFilter} onChange={(e) => setSecFilter(e.target.value)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-[15px] text-ink-dim outline-none focus:border-[#a855f7]">
              <option value="all">All sections</option>
              {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-[15px] text-ink-dim outline-none focus:border-[#a855f7]">
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="14d">Last 14 days</option>
              <option value="30d">Last 30 days</option>
              <option value="lastmonth">Last month</option>
            </select>
            <span className="flex-1" />
            <button onClick={copyResearch}
              className="rounded-lg border border-line px-3 py-1 text-[16px] font-semibold text-ink-dim transition hover:border-line-strong hover:text-ink">
              {exported === "copied" ? "Copied ✓" : exported === "failed" ? "Copy failed" : "⧉ Copy research"}
            </button>
            <button onClick={downloadResearch}
              className="rounded-lg border border-line px-3 py-1 text-[16px] font-semibold text-ink-dim transition hover:border-line-strong hover:text-ink">
              ⭳ Download Word
            </button>
          </div>
          {shown.length === 0 && (
            <p className="rounded-xl border border-line bg-surface-1 p-4 text-center text-lg text-ink-dim">Nothing matches these filters. Widen the section or the date range.</p>
          )}
          {SECTIONS.map((s) => {
            const inSec = shown.filter((i) => (i.section || "positioning") === s.id).sort(byFound);
            if (!inSec.length) return null;
            return (
              <div key={s.id}>
                <p className="tabular mb-2 mt-6 text-lg uppercase tracking-[0.2em]" style={{ color: s.accent }}>{s.label} — {inSec.length}</p>
                <div className="space-y-3">{inSec.map((i) => <Card key={i.id} i={i} busy={busy} decide={decide} clientId={clientId} clientName={clientName} deepen={deepen} running={running} canPublish={canPublishHere} />)}</div>
              </div>
            );
          })}
        </>
      ) : (
        <>
          {material.length > 0 && (
            <div>
              <p className="tabular mb-2 text-lg uppercase tracking-[0.2em] text-[#86efac]">Material — {material.length}</p>
              <div className="space-y-3">{material.map((i) => <Card key={i.id} i={i} busy={busy} decide={decide} clientId={clientId} clientName={clientName} />)}</div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              <p className="tabular mb-2 mt-6 text-lg uppercase tracking-[0.2em] text-ink-faint">Noted, not material — {rest.length}</p>
              <div className="space-y-3">{rest.map((i) => <Card key={i.id} i={i} busy={busy} decide={decide} clientId={clientId} clientName={clientName} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ i, busy, decide, clientId, clientName, deepen, running, canPublish = true }: { i: Intel; busy: boolean; decide: (id: string, s: "accepted" | "binned") => void; clientId: string; clientName: string; deepen?: (i: Intel) => void; running?: boolean; canPublish?: boolean }) {
  // THE CEO'S NEWSLETTER (Gary). Only on Journalist findings - a Strategist finding is internal, blunt and names
  // competitors, so it is exactly what must never reach the CEO's public voice.
  // Seeded from the SAVED draft (Gary): the piece and its creative used to live only in React state, so logging
  // out threw them away and there was nothing to take to the CEO.
  const [letter, setLetter] = useState<string>(i.newsletter || "");
  const [writing, setWriting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [art, setArt] = useState<string>(i.newsletter_art || "");   // the SELECTED creative
  const [options, setOptions] = useState<string[]>(i.newsletter_options || []); // the CEO build returns three
  const [drawing, setDrawing] = useState(false);
  // A prominent, in-card error for the CEO article (Gary: the toast was too small to read). It sits right by
  // the button, not in the corner of the screen.
  const [nlError, setNlError] = useState("");
  // Kept so the image can be RERUN without rewriting the article (Gary) - the piece is fine, it is the render
  // you did not like.
  const [artBrief, setArtBrief] = useState<{ subject: string; callout: string } | null>(null);

  // ONE CLICK, BOTH THINGS (Gary). The piece lands FIRST and fast, then its creative follows in its own short
  // request - so you are reading the article while the image renders, instead of staring at a spinner for both.
  // The same call that writes the piece art-directs it, so the image cannot end up illustrating a different
  // article to the one beside it.
  // Keep whatever changed, so it is still here after a logout. Best effort: a failed save must never lose the
  // draft that is already on screen.
  async function keepDraft(patch: { newsletter?: string; art?: string; options?: string[] }) {
    await fetch("/api/studio/intel/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, id: i.id, ...patch }),
    }).catch(() => {});
  }

  async function removeDraft() {
    setLetter(""); setArt(""); setOptions([]); setArtBrief(null);
    await fetch(`/api/studio/intel/draft?clientId=${clientId}&id=${i.id}`, { method: "DELETE" }).catch(() => {});
  }

  async function writeNewsletter() {
    setWriting(true); setArt(""); setOptions([]); setNlError("");
    const d = await fetch("/api/studio/intel/newsletter", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, id: i.id }),
    }).then((r) => r.json()).catch(() => null);
    setWriting(false);
    if (!d?.newsletter) { const msg = d?.error || "Could not write the article."; setNlError(msg); flex(msg); return; }
    setLetter(d.newsletter);
    await keepDraft({ newsletter: d.newsletter });

    const brief = { subject: d?.art?.subject || "", callout: d?.art?.callout || "" };
    if (!brief.subject) return;
    setArtBrief(brief);
    await drawCreative(brief);
  }

  // The image on its own. Every run is a fresh generation, so this is a genuine second take.
  async function drawCreative(brief: { subject: string; callout: string }) {
    setDrawing(true); setOptions([]);
    // A HARD CEILING so the spinner can never hang (Gary watched one for ten minutes). If the render outlives
    // this, the connection is almost certainly already dead at the gateway, and a spinner that never resolves
    // tells you nothing. Give up cleanly and say so.
    const c = await fetch("/api/studio/intel/newsletter-creative", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, subject: brief.subject, callout: brief.callout }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    }).then((r) => r.json()).catch((e) => ({
      error: (e as Error)?.name === "TimeoutError"
        ? "The creative took too long and was cut off. The article is safe - hit Rerun image."
        : "The creative request failed. The article is safe - hit Rerun image.",
    }));
    setDrawing(false);
    // The CEO build returns THREE options to choose from; the generic path returns one.
    const urls: string[] = Array.isArray(c?.urls) && c.urls.length ? c.urls : c?.url ? [c.url] : [];
    if (urls.length) {
      setArt(urls[0]); setOptions(urls.length > 1 ? urls : []);
      await keepDraft({ art: urls[0], options: urls.length > 1 ? urls : [] });
    }
    else flex(`The article is ready. The creative did not render: ${c?.error || "unknown error"}`);
  }
  return (
    <div className={`rounded-xl border p-4 ${i.material ? "border-[#4ade80]/30 bg-[#4ade80]/[0.04]" : "border-line bg-surface-1"}`}>
      {/* THE REQUEST TAG (Gary). Which deep dive this finding came from - the focus you typed, or the standing
          remit - so you can always refer back to what was asked, even when a section mixes several dossiers. */}
      {i.request && (
        <div className="mb-2">
          <span className="tabular inline-flex items-center gap-1.5 rounded-full border border-[#c79bff]/40 bg-[#c79bff]/10 px-2.5 py-0.5 text-[16px] font-semibold text-[#c79bff]">
            ✦ Researched: {i.request}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[28px] font-bold leading-snug text-ink">{i.headline}</p>
        <span className={`tabular shrink-0 rounded-full border px-2 py-0.5 text-[18px] font-bold ${CONF[i.confidence] || CONF.medium}`}>{i.confidence}</span>
      </div>

      {/* DATE TAGS. When the source was published, and when we found it. They are not the same thing, and
          treating them as one is how something from 2019 ends up being read as this morning's news. */}
      {(() => {
        const d = dateBits(i);
        return (
          // BOTH DATES AS LABELLED TAGS, under the headline (Gary): when the source was published, and when we
          // found it. "found" as loose grey text read like a footnote and got missed.
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {d.published ? (
              <span className={`tabular rounded border px-1.5 py-0.5 text-[18px] font-semibold ${d.stale ? "border-[#fbbf24]/45 bg-[#fbbf24]/10 text-[#fcd34d]" : "border-line text-ink-dim"}`}>
                Published {d.published}{d.stale && d.ageDays !== null ? ` · ${d.ageDays} days old` : ""}
              </span>
            ) : (
              <span className="tabular rounded border border-[#f87171]/45 bg-[#f87171]/10 px-1.5 py-0.5 text-[18px] font-semibold text-[#fca5a5]">
                Published date not established
              </span>
            )}
            <span className="tabular rounded border border-line px-1.5 py-0.5 text-[18px] font-semibold text-ink-faint">
              Found {d.found}
            </span>
            {i.period && (
              <span className="tabular rounded border border-line px-1.5 py-0.5 text-[18px] font-semibold text-ink-faint">
                Data covers {i.period}
              </span>
            )}
            {/* SOURCE VERIFICATION. We fetched the cited page and read its real date - this says how far that
                got. "Source verified" means the page was reached and it supports the claim; "Source not reached"
                means it bot-blocked our fetch (kept, but check it by hand). Refuted findings never reach here. */}
            {i.verification === "verified" && (
              <span className="tabular rounded border border-[#4ade80]/45 bg-[#4ade80]/10 px-1.5 py-0.5 text-[18px] font-semibold text-[#86efac]">✓ Source verified</span>
            )}
            {i.verification === "partial" && (
              <span className="tabular rounded border border-line px-1.5 py-0.5 text-[18px] font-semibold text-ink-dim">Source reached</span>
            )}
            {i.verification === "unverified" && (
              <span className="tabular rounded border border-[#fbbf24]/45 bg-[#fbbf24]/10 px-1.5 py-0.5 text-[18px] font-semibold text-[#fcd34d]">⚠ Source not reached</span>
            )}
          </div>
        );
      })()}

      <p className="mt-2 text-[24px] leading-relaxed text-ink-dim"><b className="text-ink">Why it matters:</b> {i.why_it_matters}</p>
      {i.detail && <p className="mt-2 text-[22px] leading-relaxed text-ink-dim">{i.detail}</p>}

      {/* THE INTERNAL ASSESSMENT - what this could actually do to MoMo SA, and the campaign move it argues for.
          Set apart on purpose: it is GAS's own commercial thinking, NOT part of the sourced reporting above and
          - on a Journalist finding - never the CEO's public voice, which is FAIS-bound. */}
      {(i.impact_risk || i.campaign_response) && (() => {
        const move = i.campaign_response || "";
        const def = /\bdefensive\b/i.test(move), pro = /\bproactive\b/i.test(move);
        const tag = def && pro ? "defensive + proactive" : def ? "defensive" : pro ? "proactive" : "";
        // Label by role: the Strategist guides our activations and the positioning we take to MoMo's internal
        // teams; the Journalist is about the CEO's public narrative. Same fields, different jobs.
        const isStrat = i.role === "strategist";
        return (
          <div className="mt-3 rounded-r-lg border-l-2 border-[#818cf8] bg-surface-2/60 px-3 py-2.5">
            <p className="tabular text-[18px] uppercase tracking-[0.16em] text-[#a5b4fc]">
              Our read{tag ? ` · ${tag}` : ""}
            </p>
            {i.impact_risk && (
              <p className="mt-1.5 text-[22px] leading-relaxed text-ink-dim">
                <b className="text-ink">What it could do to {clientName}:</b> {i.impact_risk}
              </p>
            )}
            {i.campaign_response && (
              <p className="mt-1.5 text-[22px] leading-relaxed text-ink-dim">
                <b className="text-ink">{isStrat ? "What we should do" : "What the CEO could say"}:</b> {i.campaign_response}
              </p>
            )}
          </div>
        );
      })()}

      {/* SOURCES. Every finding shows where it came from. An unsourced "insight" is worse than no insight - it
          becomes a fact nobody can trace, and every future article and strategy inherits it. If a finding has
          no source, say so plainly rather than letting it pass as verified. */}
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="tabular text-[18px] uppercase tracking-[0.16em] text-ink-faint">Sources</p>
        {sourcesOf(i).length === 0 ? (
          <p className="mt-1 text-[18px] font-bold text-[#fca5a5]">⚠ No source. Do not treat this as verified.</p>
        ) : (
          <ol className="mt-1 space-y-0.5">
            {sourcesOf(i).map((s, n) => (
              <li key={s.url + n} className="text-[18px] leading-relaxed">
                <span className="tabular text-ink-faint">{n + 1}.</span>{" "}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-[#93c5fd] underline decoration-[#93c5fd]/40 hover:decoration-[#93c5fd]">
                  {s.name || s.url}
                </a>
                <span className="ml-1.5 text-ink-faint">{host(s.url)}</span>
                {/* The date the content was POSTED, right next to the link (Gary) - so you can see how current
                    a source is without opening it. */}
                <span className="ml-1.5 text-ink-faint">
                  · posted {dateBits(i).published || "date not established"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* THE CEO'S NEWSLETTER (Gary). Journalist findings only - a Strategist finding is internal and names
          competitors, which is precisely what must never reach the CEO's public voice. */}
      {letter && (
        <div className="mt-3 rounded-lg border border-[#818cf8]/40 bg-surface-2/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="tabular text-[17px] uppercase tracking-[0.16em] text-[#a5b4fc]">Draft newsletter · the CEO&apos;s voice</p>
            <div className="flex items-center gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(letter); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                className="rounded-md border border-line px-2.5 py-1 text-[18px] font-bold text-ink-dim hover:text-ink">
                {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={() => setLetter("")} className="text-[18px] font-semibold text-ink-faint underline hover:text-ink">Close</button>
              {/* CLOSE hides it for now; REMOVE discards the kept draft for good (Gary: keep or remove). */}
              <button onClick={removeDraft} className="text-[18px] font-semibold text-[#fca5a5] underline hover:text-[#f87171]">Remove</button>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[20px] leading-relaxed text-ink-dim">{letter}</p>

          {/* THE CREATIVE that runs with it: MoMo's own design, real logo stamped, no offer anywhere. */}
          {drawing && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-4 text-[18px] text-ink-dim">
              <svg className="h-4 w-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Rendering the creative for this piece…
            </div>
          )}
          {art && !drawing && (
            <div className="mt-3">
              <img src={art} alt="" className="w-full max-w-sm rounded-lg border border-line" />
              {/* THREE OPTIONS (CEO build): pick the best. The selected one is highlighted. */}
              {options.length > 1 && (
                <div className="mt-2">
                  <p className="text-[17px] text-ink-faint">Pick the best of {options.length}:</p>
                  <div className="mt-1 flex gap-2">
                    {options.map((u, n) => (
                      <button key={u} onClick={() => { setArt(u); keepDraft({ art: u }); }}
                        className={`overflow-hidden rounded-md border-2 ${art === u ? "border-[#818cf8]" : "border-line"}`}>
                        <img src={u} alt={`Option ${n + 1}`} className="h-16 w-16 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-1.5 flex items-center gap-3">
                <a href={art} target="_blank" rel="noreferrer" className="text-[18px] font-semibold text-[#93c5fd] underline">Open full size ↗</a>
                {/* Rerun the IMAGE only - the article stays exactly as written (Gary). */}
                {artBrief && (
                  <button onClick={() => drawCreative(artBrief)} disabled={drawing}
                    className="rounded-md border border-line px-2.5 py-1 text-[18px] font-bold text-ink-dim hover:text-ink disabled:opacity-40">
                    ↻ Rerun image
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="mt-2 text-[17px] text-ink-faint">A draft, not a post. Read every line before it goes out under his name.</p>
        </div>
      )}

      {nlError && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-[#f87171]/45 bg-[#f87171]/10 px-3 py-2.5">
          <p className="text-[19px] leading-snug text-[#fca5a5]">{nlError}</p>
          <button onClick={() => setNlError("")} className="shrink-0 text-[17px] font-semibold text-ink-faint underline hover:text-ink">Dismiss</button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {/* Publish as a CEO article - from a Journalist finding, or now a Researcher one (its primary home).
            A Strategist finding is internal and names competitors, so it is deliberately never eligible. The
            button only shows when the brain HAS a CEO voice; without one, a plain line says what to add rather
            than letting the click fail with a tiny toast (Gary). */}
        {(i.role === "journalist" || i.role === "researcher") && (
          canPublish ? (
            <button onClick={writeNewsletter} disabled={writing}
              className="mr-auto inline-flex items-center gap-2 rounded-lg border border-[#818cf8]/40 px-3 py-1 text-[18px] font-bold text-[#a5b4fc] hover:bg-[#818cf8]/10 disabled:opacity-40">
              {writing && (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {writing ? "Writing…" : letter ? "Rewrite the article" : "✎ Publish as a CEO article"}
            </button>
          ) : (
            <span className="mr-auto text-[16px] text-ink-faint">Add CEO writing rules to <b className="text-ink-dim">{clientName}</b>&apos;s brain to publish articles.</span>
          )
        )}
        {deepen && (
          <button onClick={() => deepen(i)} disabled={busy || running} title="Commission a fresh run pointed straight at this finding"
            className="rounded-lg border border-[#a855f7]/40 px-3 py-1 text-[18px] font-bold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-40">
            ✦ Go deeper
          </button>
        )}
        <button onClick={() => decide(i.id, "accepted")} disabled={busy}
          className="rounded-lg border border-[#4ade80]/40 px-3 py-1 text-[18px] font-bold text-[#86efac] hover:bg-[#4ade80]/10 disabled:opacity-40">
          ✓ Accept into the brain
        </button>
        <button onClick={() => decide(i.id, "binned")} disabled={busy}
          className="rounded-lg border border-line px-3 py-1 text-[18px] font-bold text-ink-faint hover:text-ink disabled:opacity-40">
          Bin
        </button>
      </div>
    </div>
  );
}

// Older findings were stored with a single source; newer ones carry the full list. Read both.
function sourcesOf(i: Intel): { name: string; url: string }[] {
  if (Array.isArray(i.sources) && i.sources.length) return i.sources;
  if (i.source_url) return [{ name: i.source_name || i.source_url, url: i.source_url }];
  return [];
}

function host(url: string): string {
  try { return `· ${new URL(url).hostname.replace(/^www\./, "")}`; } catch { return ""; }
}
