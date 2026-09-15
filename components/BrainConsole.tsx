"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";
import { brainStrength, STRENGTH_WEIGHT } from "@/lib/brain-strength";
import BrainKnowledge from "@/components/BrainKnowledge";
import BrainLibrary from "@/components/BrainLibrary";
import LivingBrain from "@/components/LivingBrain";
import WorkingPanel from "@/components/WorkingPanel";

type Source = { id: string; type: string; uri: string; status: string; chunk_count?: number; error?: string | null; last_synced_at?: string | null };

// "crawled 3 days ago", and a stale flag past ~90 days so a site read months ago is not silently trusted as current.
// FRESHNESS OF A SOURCE. Returns the relative label ("3 days ago"), the actual crawl DATE for the team to read
// (Gary), the age in days, and two thresholds: `due` at 30 days (a subtle nudge that a website could do with a
// fresh crawl) and `stale` at 90 days (clearly old). A website's content drifts, so 30 days is the gentle
// re-crawl reminder Gary asked for.
function freshness(iso?: string | null): { label: string; date: string; days: number; due: boolean; stale: boolean } | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  const label = days <= 0 ? "just now" : days === 1 ? "1 day ago" : days < 31 ? `${days} days ago` : days < 62 ? "1 month ago" : `${Math.floor(days / 30)} months ago`;
  const date = new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  return { label, date, days, due: days >= 30, stale: days >= 90 };
}

type Mode = "website" | "feed" | "documents" | "text" | "compliance" | "positioning";

// A professional 2px-stroke mark per source type, in the brain's violet->cyan family (via currentColor).
function SourceIcon({ m }: { m: Mode }) {
  const paths: Record<Mode, string> = {
    website: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.5 5.8 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.8-3.5-9s1-6.5 3.5-9Z"/>`,
    feed: `<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5"/>`,
    documents: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>`,
    text: `<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>`,
    compliance: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .58-.91l7-3.5a1 1 0 0 1 .84 0l7 3.5A1 1 0 0 1 20 6Z"/><path d="m9 12 2 2 4-4"/>`,
    positioning: `<path d="m12 3 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.9l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76z"/>`,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]" aria-hidden dangerouslySetInnerHTML={{ __html: paths[m] }} />;
}

// A CONSISTENT SECTION MARKER (Gary: professional, aligned iconography so every section stands out a little
// better). A rounded violet tile holding a 2px line icon in the brain's violet->cyan family - the same treatment
// as the "Feed the knowledge" header, reused across every panel. `d` is a constant SVG path string (never user
// text), the same safe pattern as SourceIcon above.
function SectionTile({ d }: { d: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#a855f7]/15 text-[#c79bff]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />
    </span>
  );
}
// The section marks, kept together so the set stays visually coherent.
const ICON = {
  sources: `<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M20 5v6c0 1.66-3.58 3-8 3s-8-1.34-8-3V5"/><path d="M20 11v6c0 1.66-3.58 3-8 3s-8-1.34-8-3v-6"/>`,
  coverage: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>`,
} as const;

export default function BrainConsole({ brainId, initialSources, chunkCount = 0, initialDoctrine = "", isAdmin = false }: { brainId: string; initialSources: Source[]; chunkCount?: number; initialDoctrine?: string; isAdmin?: boolean }) {
  const [sources, setSources] = useState<Source[]>(initialSources);
  // FRESHNESS SLA: how often this brain auto-recrawls its website sources (0 = off). Loaded once; admin can set it.
  const [autoRecrawl, setAutoRecrawl] = useState(0);
  const [savingFresh, setSavingFresh] = useState(false);
  useEffect(() => {
    fetch(`/api/brains/${brainId}/freshness`).then((r) => r.json()).then((d) => setAutoRecrawl(Number(d?.autoRecrawlDays) || 0)).catch(() => {});
  }, [brainId]);
  async function saveFreshness(days: number) {
    setSavingFresh(true);
    const d = await fetch(`/api/brains/${brainId}/freshness`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) }).then((r) => r.json()).catch(() => null);
    setSavingFresh(false);
    if (d?.ok) setAutoRecrawl(Number(d.autoRecrawlDays) || 0);
  }
  // THE CLIENT'S OFFICIAL WEBSITE - the ground-truth anchor the research pods lock onto (Gary: there was nowhere
  // to set it on the Brain page). Loaded once; admin can set it right here.
  const [website, setWebsite] = useState("");
  const [savingWeb, setSavingWeb] = useState(false);
  const [webSaved, setWebSaved] = useState(false);
  // THE CLIENT'S OFFICIAL SOCIALS - now set HERE on the Brain, the single home for the ground truth (Gary). One per
  // line. The research pods mine them for the right entity's public activity alongside the website.
  const [socials, setSocials] = useState("");
  const [savingSoc, setSavingSoc] = useState(false);
  const [socSaved, setSocSaved] = useState(false);
  useEffect(() => {
    fetch(`/api/studio/client-website?clientId=${brainId}`).then((r) => r.json()).then((d) => {
      setWebsite(d?.website || "");
      setSocials(Array.isArray(d?.socials) ? d.socials.join("\n") : "");
    }).catch(() => {});
  }, [brainId]);
  async function saveWebsite() {
    setSavingWeb(true); setWebSaved(false);
    const d = await fetch(`/api/studio/client-website`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: brainId, website: website.trim() }) }).then((r) => r.json()).catch(() => null);
    setSavingWeb(false);
    if (d?.ok) { setWebsite(d.website || ""); setWebSaved(true); }
  }
  async function saveSocials() {
    setSavingSoc(true); setSocSaved(false);
    const list = socials.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const d = await fetch(`/api/studio/client-website`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: brainId, socials: list }) }).then((r) => r.json()).catch(() => null);
    setSavingSoc(false);
    if (d?.ok) { setSocials(Array.isArray(d.socials) ? d.socials.join("\n") : ""); setSocSaved(true); }
  }
  const [mode, setMode] = useState<Mode>("website");
  const [progress, setProgress] = useState("");
  const [sites, setSites] = useState<string[]>([""]);      // multi-site website scrape
  const [fullSite, setFullSite] = useState(true);          // full-site crawl vs a single page
  const [feedUrl, setFeedUrl] = useState("");              // RSS/Atom feed URL
  const [text, setText] = useState("");
  const [compliance, setCompliance] = useState("");
  const [doctrine, setDoctrine] = useState(initialDoctrine); // the saved brand book (drives strength + hasDoctrine)
  const [docEntry, setDocEntry] = useState(""); // the "add a rule" input, blank and cleared after each save
  const [fedMsg, setFedMsg] = useState(""); // a visible "fed to the brain" confirmation after a teach/paste save
  const router = useRouter(); // to re-render the SERVER header (the top "NN passages" total) after the count changes
  const [savingDoc, setSavingDoc] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");
  // MARKET SWEEP (Gary): a wide 24-month sweep run from the Brain. Confirmed facts embed straight in; the rest land
  // in a review tray to accept (embed) or reject. Accepted facts appear in Knowledge Sources and lift the strength.
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sweepMsg, setSweepMsg] = useState("");
  const [sweepErr, setSweepErr] = useState("");
  const [sweepReview, setSweepReview] = useState<{ id: string; headline: string; why_it_matters: string; detail: string; verification: string | null; sources: { name?: string; url?: string }[] }[]>([]);
  const [sweepItemBusy, setSweepItemBusy] = useState("");

  const [reindexing, setReindexing] = useState(false);
  // A crawl that JUST finished, so the team gets a clear "done, what next?" step instead of guessing (Gary).
  const [justCompleted, setJustCompleted] = useState<{ count: number } | null>(null);

  // BRAIN READINESS (world-class UX): the one thing the team needs to know before building on a brain is "is it
  // strong enough?". We derive a live checklist + score from what the brain actually holds, so the page guides
  // completion instead of being a passive form. Asset presence (logo/CEO/team) is fetched once; sources + doctrine
  // update live as you feed it.
  const [assetKinds, setAssetKinds] = useState<Record<string, number>>({});
  const feedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    fetch(`/api/brains/${brainId}/assets`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      const counts: Record<string, number> = {};
      for (const g of (d?.groups || [])) counts[String(g.kind)] = Array.isArray(g.assets) ? g.assets.length : 0;
      setAssetKinds(counts);
    }).catch(() => {});
  }, [brainId]);
  // WHAT THIS BRAIN CAN ANSWER ON: a passive topic map, cached server-side and regenerated on drift/refresh.
  const [coverage, setCoverage] = useState<{ topics: string[]; loading: boolean }>({ topics: [], loading: true });
  const loadCoverage = (refresh = false) => {
    setCoverage((c) => ({ ...c, loading: true }));
    fetch(`/api/brains/${brainId}/coverage${refresh ? "?refresh=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setCoverage({ topics: Array.isArray(d?.topics) ? d.topics : [], loading: false }))
      .catch(() => setCoverage((c) => ({ ...c, loading: false })));
  };
  useEffect(() => { loadCoverage(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brainId]);
  const goto = (m: Mode) => { setMode(m); feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Track each source's last-seen status so we can flash + toast the moment a crawl finishes (Gary: "I need to
  // SEE when the brain is completed"). And keep polling long enough for a real crawl: an 80-page site can take
  // 6-8 minutes, and the old 60x4s=4min cap gave up BEFORE it finished, freezing the row on "indexing... 0 chunks".
  const seenStatus = useRef<Record<string, string>>({});
  const serverSynced = useRef(false);   // ensures the drift-driven router.refresh() fires at most once
  const [flashDone, setFlashDone] = useState<Set<string>>(new Set());
  async function refresh(tries = 0): Promise<void> {
    const r = await fetch(`/api/brains/${brainId}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    const next: Source[] = Array.isArray(d.sources) ? d.sources : [];
    const newlyDone: string[] = [];
    for (const s of next) {
      if (seenStatus.current[s.id] === "pending" && s.status === "indexed") newlyDone.push(s.id);
      seenStatus.current[s.id] = s.status;
    }
    setSources(next);
    // If the live total drifts from the server-rendered snapshot (a re-crawl deduped the counts down while this
    // page sat in the client Router Cache), refresh the server component ONCE so the header "NN passages" total
    // (app/setup/brains/[id] line 41) also snaps to the truth. Guarded so it fires at most once, never loops.
    const liveTotal = next.reduce((a, s) => a + Number(s.chunk_count ?? 0), 0);
    if (!serverSynced.current && liveTotal !== Number(chunkCount)) {
      serverSynced.current = true;
      router.refresh();
    }
    if (newlyDone.length) {
      setFlashDone((cur) => new Set([...cur, ...newlyDone]));
      // Number() is load-bearing: a count from Postgres can arrive as a string, and `0 + "5" + "10"` would
      // concatenate to "0510" rather than sum to 15 (the old "01372" bug). Coerce every term.
      const total = next.filter((s) => newlyDone.includes(s.id)).reduce((a, s) => a + Number(s.chunk_count ?? 0), 0);
      setJustCompleted({ count: total });   // drives the "done, what next?" step card below
      flex(`✓ Brain ready. ${total} passage${total === 1 ? "" : "s"} indexed and retrievable.`);
      setTimeout(() => setFlashDone((cur) => { const n = new Set(cur); newlyDone.forEach((id) => n.delete(id)); return n; }), 15000);
      // Re-render the SERVER header so the top "NN passages" TOTAL reflects the new count (it was stale at 228
      // after a re-crawl while the live card already showed the new figure - Gary).
      router.refresh();
    }
    if (next.some((s) => s.status === "pending") && tries < 200) {   // ~13 min, enough for a full-site crawl
      await new Promise((res) => setTimeout(res, 4000));
      return refresh(tries + 1);
    }
  }

  // Always reconcile the passage counts against the live DB on load, and resume polling if a crawl is still
  // running. The brain page is a cached server component, so its rendered per-source counts can be stale after
  // a re-crawl deduped them down (Gary saw 198/28 on screen while the DB actually held the cleaned 58/24). One
  // silent fetch on mount fixes the count to the truth; refresh() self-stops when nothing is pending, so this is
  // a single query when idle, not a loop. seenStatus is seeded first, so no spurious "brain ready" toast fires.
  useEffect(() => {
    for (const s of initialSources) seenStatus.current[s.id] = s.status;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RUN THE MARKET SWEEP. Wide 24-month sweep; confirmed facts embed straight into the brain, the rest come back
  // to review. After it lands, refresh() so the new market sources + the lifted strength show immediately.
  async function runSweep() {
    if (sweepBusy) return;
    setSweepBusy(true); setSweepErr(""); setSweepMsg(""); setSweepReview([]);
    const d = await fetch(`/api/brains/${brainId}/market-sweep`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sweep" }),
    }).then((r) => r.json()).catch(() => null);
    setSweepBusy(false);
    if (!d?.ok) { setSweepErr(d?.error || "Couldn't run the market sweep."); return; }
    const review = Array.isArray(d.review) ? d.review : [];
    if (review.length === 0) {
      setSweepMsg("The sweep found no new market facts this time. That can happen when the market has been quiet, and it never invents facts to pad the result. Nothing was added.");
    } else {
      setSweepMsg(`Market sweep done: ${review.length} ${review.length === 1 ? "finding" : "findings"} to review below. Nothing is in the brain yet - accept the ones you want, decline the rest.`);
    }
    setSweepReview(review);
  }
  async function acceptSweep(id: string) {
    if (sweepItemBusy) return;
    setSweepItemBusy(id);
    const d = await fetch(`/api/brains/${brainId}/market-sweep`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", intelId: id }),
    }).then((r) => r.json()).catch(() => null);
    setSweepItemBusy("");
    if (d?.ok) { setSweepReview((list) => list.filter((x) => x.id !== id)); await refresh(); router.refresh(); }
    else setSweepErr(d?.error || "Couldn't add that finding.");
  }
  async function rejectSweep(id: string) {
    if (sweepItemBusy) return;
    setSweepItemBusy(id);
    const d = await fetch(`/api/brains/${brainId}/market-sweep`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reject", intelId: id }),
    }).then((r) => r.json()).catch(() => null);
    setSweepItemBusy("");
    if (d?.ok) setSweepReview((list) => list.filter((x) => x.id !== id));
  }

  // WEBSITE(S). Multi-site: each row is scraped. Full-site crawls every page it can reach (no path scope);
  // single-page reads just that URL. Both keep each page's own title + URL so a passage traces back to source.
  async function addWebsites() {
    const list = sites.map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
    if (!list.length) { setAddErr("Enter at least one website URL (https://…)."); return; }
    if (adding) return;
    setAdding(true); setAddErr(""); setJustCompleted(null);
    const failed: string[] = [];
    for (const site of list) {
      const r = await fetch(`/api/brains/${brainId}/sources`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullSite ? { type: "crawl", uri: site, includePath: "" } : { type: "website", uri: site }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) failed.push(`${site}: ${d?.error || "could not add"}`);
    }
    if (failed.length) setAddErr(failed.join(" · "));
    else { setSites([""]); flex(fullSite ? "Scraping the site now, every page it can reach." : "Reading the page now."); }
    await refresh(); setAdding(false);
  }

  // ADD AN RSS / ATOM FEED (Gary: broader source intake). The pod reads the feed's own item content and keeps it
  // current on the freshness cadence, adding only new items each time.
  async function addFeed() {
    const url = feedUrl.trim();
    if (!/^https?:\/\//i.test(url)) { setAddErr("Enter a valid public RSS/Atom feed URL (https://…)."); return; }
    if (adding) return;
    setAdding(true); setAddErr(""); setJustCompleted(null);
    const r = await fetch(`/api/brains/${brainId}/sources`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "feed", uri: url }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setAddErr(d?.error || "Could not add that feed.");
    else { setFeedUrl(""); flex("Reading the feed now, and keeping it current."); }
    await refresh(); setAdding(false);
  }

  // PASTE / COMPLIANCE. Both are pasted text; compliance is tagged kind:"compliance" so creative and the
  // proposal's governance page can retrieve that kind of passage specifically.
  async function addText(kind?: "compliance") {
    const val = (kind === "compliance" ? compliance : text).trim();
    if (val.length < 20) { setAddErr("Paste a bit more text to learn from."); return; }
    if (adding) return;
    setAdding(true); setAddErr(""); setFedMsg("");
    const r = await fetch(`/api/brains/${brainId}/sources`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", text: val, ...(kind ? { kind } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setAddErr(d?.error || "Could not add"); setAdding(false); return; }
    if (kind === "compliance") setCompliance(""); else setText("");
    setFedMsg(kind === "compliance" ? "Compliance copy fed to the brain. Add the next, or move on." : "Fed to the brain. Add the next, or move on.");
    await refresh(); setAdding(false);
  }

  // POSITIONING & RULES (the brand doctrine, folded in). Saves to the brand kit and embeds it into the brain in
  // one action, so it is retrievable, no separate "sync" step.
  async function saveDoctrine() {
    if (savingDoc) return;
    const entry = docEntry.trim();
    if (entry.length < 20) { setAddErr("Write a bit more positioning to learn from."); return; }
    setSavingDoc(true); setAddErr(""); setFedMsg("");
    // APPEND to the brand book (Gary's flow: type a rule, save, blank for the next), so nothing already saved is
    // lost and re-clicking cannot re-embed the same text. The doctrine sync replaces the doctrine chunks with the
    // full updated book, so it never stacks duplicates.
    const full = [doctrine.trim(), entry].filter(Boolean).join("\n\n").slice(0, 4000);
    const s = await fetch(`/api/studio/brand-kit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: brainId, tone_notes: full }) }).catch(() => null);
    if (!s?.ok) { setSavingDoc(false); flex("Could not save the positioning."); return; }
    const e = await fetch(`/api/brains/${brainId}/sync-doctrine`, { method: "POST" }).catch(() => null);
    const d = await e?.json().catch(() => ({}));
    setSavingDoc(false);
    if (e?.ok) {
      setDoctrine(full); setDocEntry(""); setFedMsg("Fed to the brain. Add the next rule, or move on.");
      // Doctrine chunks have no source row, so refresh() (which reconciles sources) will not move the totals.
      // Refresh the server component directly so the header count(*) and the strength score pick up the new
      // doctrine passages (B3).
      serverSynced.current = false;
      router.refresh();
    } else flex(d?.error || "Saved, but could not embed it.");
  }

  // DOCUMENTS (articles, PDFs, decks, notes). Each file goes STRAIGHT to Blob from the browser - a serverless
  // request body caps around 4.5MB and a research PDF sails past it - then we register it, and it ingests as it
  // lands. Files are handled one at a time with the failures NAMED: dropping ten PDFs in and being told only
  // that "something went wrong" would be useless.
  async function addFiles(list: FileList | null) {
    if (!list?.length || adding) return;
    setAdding(true); setAddErr(""); setProgress("");
    const failed: string[] = [];
    let done = 0;
    for (const f of Array.from(list)) {
      setProgress(`${f.name} (${done + 1}/${list.length})`);
      try {
        const blob = await upload(`brains/${brainId}/${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/brains/blob-upload",
        });
        const r = await fetch(`/api/brains/${brainId}/sources`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "file", uri: blob.url, text: f.name }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) failed.push(`${f.name}: ${d?.error || "could not add"}`);
      } catch (e) {
        failed.push(`${f.name}: ${String((e as Error)?.message || e).slice(0, 90)}`);
      }
      done++;
    }
    setProgress("");
    if (failed.length) setAddErr(failed.join(" · "));
    else flex(`${done} document${done === 1 ? "" : "s"} added. The brain is reading ${done === 1 ? "it" : "them"} now.`);
    await refresh();
    setAdding(false);
  }

  async function removeSource(s: Source) {
    if (!(await askConfirm({ title: "Delete this source and everything it taught the brain?", body: `${s.uri} - This wipes its chunks and embeddings. It cannot be undone.`, tone: "danger", confirmLabel: "Delete" }))) return;
    // Confirm the delete SUCCEEDED before removing the row: swallowing the error made a failed delete look done
    // (a phantom removal that reappears on reload), which is worse than an honest error (B4).
    const r = await fetch(`/api/brains/${brainId}/sources?sourceId=${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) { const d = await r?.json().catch(() => ({})); flex(d?.error || "Could not delete that source. Please try again."); return; }
    setSources((list) => list.filter((x) => x.id !== s.id));
    router.refresh(); // keep the top header total in step with the delete
  }

  async function nukeAll() {
    if (!(await askConfirm({ title: "NUKE all knowledge in this brain?", body: "Every source, chunk and embedding is permanently deleted. The brain stays but forgets everything. This cannot be undone.", tone: "danger", confirmLabel: "Nuke" }))) return;
    const r = await fetch(`/api/brains/${brainId}/sources?sourceId=all`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) { const d = await r?.json().catch(() => ({})); flex(d?.error || "Could not clear the brain. Please try again."); return; }
    setSources([]);
    router.refresh();
  }

  // RE-CRAWL one website source in place (a site changed). Clears its passages, sets it re-reading, re-fires the
  // ingest - then the existing poll picks up the "pending" status and shows it indexing through to a fresh Ready.
  async function recrawl(s: Source) {
    setJustCompleted(null);
    setSources((list) => list.map((x) => x.id === s.id ? { ...x, status: "pending", chunk_count: 0 } : x));
    const r = await fetch(`/api/brains/${brainId}/sources/recrawl`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: s.id }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { flex(r?.error || "Couldn't re-crawl that source."); await refresh(); return; }
    flex("Re-crawling. It reads the live site again now.");
    seenStatus.current[s.id] = "pending";
    refresh();
  }

  // RE-INDEX: re-embed the brain's existing chunks with the current embedding model. Needed once after an
  // embedding-model change, otherwise retrieval compares incompatible vectors and quietly returns noise.
  // Lossless: only the vectors are rebuilt, the stored text is untouched.
  async function reindex() {
    if (reindexing) return;
    if (!(await askConfirm({ title: "Re-index this brain?", body: "Rebuilds every chunk's embedding with the current model so retrieval works properly, in the background. Your sources and text are not touched.", confirmLabel: "Re-index" }))) return;
    setReindexing(true);
    const r = await fetch(`/api/brains/${brainId}/reindex`, { method: "POST" }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setReindexing(false);
    // Now a durable background job (audit B5), so we confirm it STARTED rather than report a finished count.
    if (r?.ok) { flex("Re-indexing in the background. Retrieval will be accurate once it finishes."); }
    else flex(d?.error || "Could not start the re-index.");
  }

  async function deleteBrainNow() {
    if (!(await askConfirm({ title: "Delete this entire brain?", body: "The brain and ALL its data are permanently removed. This cannot be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    const r = await fetch(`/api/brains/${brainId}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) window.location.href = "/setup/brains";
    else flex("Could not delete the brain. Please try again.");
  }


  // Live readiness signals.
  // chunkCount can arrive as a string from Postgres, so coerce before it feeds the `=== 0` empty check and the
  // .toLocaleString() below - otherwise a brand-new brain reads "0" (string), `empty` is false, and the
  // onboarding hero never shows.
  // The brain's TRUE clean-passage total: the sum across sources PLUS the null-source chunks (brand doctrine and
  // saved answers, which belong to no source row). chunkCount is the server-rendered count(*) for the whole brain,
  // so max() of the two counts doctrine in and stays correct if the live source sum has moved ahead of a stale
  // server total. Without this, the header said 86 while the card said 82 and doctrine added 0 to strength (B3).
  const sourceChunks = sources.reduce((a, s) => a + Number(s.chunk_count ?? 0), 0);
  const liveChunks = Math.max(sourceChunks, Number(chunkCount) || 0);
  const indexedSources = sources.filter((s) => s.status === "indexed").length;
  const crawling = sources.some((s) => s.status === "pending");
  const hasSite = sources.some((s) => (s.type === "crawl" || s.type === "website") && s.status === "indexed" && (s.chunk_count ?? 0) > 1);
  const hasDocs = sources.some((s) => (s.type === "file" || s.type === "text") && s.status === "indexed");
  const hasDoctrine = doctrine.trim().length > 0;
  const hasAssets = (assetKinds.logo || 0) + (assetKinds.ceo_photo || 0) + (assetKinds.md_photo || 0) + (assetKinds.team_photo || 0) > 0;
  const checklist: { key: string; label: string; met: boolean; go: () => void }[] = [
    { key: "site", label: "Website crawled", met: hasSite, go: () => goto("website") },
    { key: "docs", label: "Documents or notes", met: hasDocs, go: () => goto("documents") },
    { key: "doctrine", label: "Brand book", met: hasDoctrine, go: () => goto("positioning") },
    { key: "assets", label: "Logo & photos", met: hasAssets, go: () => scrollToId("brand-library") },
  ];
  const metCount = checklist.filter((c) => c.met).length;
  // Order done-first so the strength bar fills continuously (2/4 = a solid 50%, no gaps) and the tags read as a
  // timeline of what is in vs still to add.
  const ordered = [...checklist].sort((a, b) => Number(b.met) - Number(a.met));
  const empty = sources.length === 0 && !hasDoctrine && liveChunks === 0;
  // Ready needs real KNOWLEDGE (a crawled site OR documents) plus 3 of the 4 inputs - not a website specifically.
  // Requiring hasSite dead-ended a legitimate doc-only brain that could never go green (H3).
  const ready = (hasSite || hasDocs) && metCount >= 3;
  const lit = empty ? 0.06 : Math.max(metCount / checklist.length, liveChunks > 0 ? 0.22 : 0);
  // A single 0-100 STRENGTH score for THIS brain (Gary): weighted by the four inputs, with the crawled website the
  // anchor most of the knowledge comes from, plus a depth bonus for how much is actually indexed. So a well-fed
  // brain reads as strong even before every input type is added, and the number reflects the knowledge on file,
  // not just how many boxes are ticked. The bar fills to this same score.
  // KNOWLEDGE-WEIGHTED STRENGTH (Gary: a strong, accurate indicator of true capacity). Coverage of the input types
  // PLUS how much CLEAN retrievable knowledge the brain actually holds. Depth uses a sqrt curve over the
  // de-duplicated passage count (fast early credit, diminishing returns), so genuine growth moves the score while
  // junk/volume padding cannot game it (the ingest pass strips boilerplate + dupes). Photos are creative source,
  // not Q&A knowledge, so they carry little weight and a 2nd photo does not change the score - by design.
  // The SAME score the brains overview shows: one shared formula (lib/brain-strength) so the two never disagree.
  // hasSite here matches the overview's has_site (indexed site with >1 chunk), so the inputs are identical too.
  const strengthPct = brainStrength({ hasSite, hasDocs, hasDoctrine, hasAssets, liveChunks });
  const depthPts = Math.round(Math.min(1, Math.sqrt(liveChunks / 1000)) * 33); // for the breakdown line only
  // The single biggest thing still to add, so the indicator is actionable, not just a number.
  const nextGap = checklist.filter((c) => !c.met).map((c) => ({ label: c.label, pts: STRENGTH_WEIGHT[c.key as keyof typeof STRENGTH_WEIGHT] || 0 })).sort((a, b) => b.pts - a.pts)[0];

  return (
    <div className="mt-6 space-y-6">
      {/* BRAIN READINESS - the living-brain header. The neural graphic comes alive as the brain is fed, so "is it
          strong enough to build on, and what is it missing?" reads at a glance and feels like a growing asset. */}
      <div className={`gas-rise relative overflow-hidden rounded-2xl border p-6 transition ${ready ? "border-[#4ade80]/40 bg-[#4ade80]/[0.05]" : empty ? "border-[#a855f7]/45 bg-[#a855f7]/[0.06]" : "border-[#a855f7]/25 bg-surface-1"}`}>
        {/* Signature violet aura behind the card, brighter the more the brain knows. */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.18), transparent 70%)", opacity: 0.4 + 0.6 * Math.min(1, lit) }} />
        {/* The brain's overall STRENGTH as a single percentage (Gary), top-right. Reflects the knowledge on file. */}
        {!empty && (
          <div className="absolute right-5 top-5 text-right leading-none">
            <div className={`tabular text-[34px] font-semibold ${ready ? "text-[#86efac]" : "text-[#c79bff]"}`}>{strengthPct}<span className="text-[20px]">%</span></div>
            <div className="tabular mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">strength</div>
          </div>
        )}
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7">
          {/* THE LIVING BRAIN. */}
          <div className="relative h-32 w-32 shrink-0 text-ink-faint">
            <LivingBrain lit={lit} />
            {!empty && (
              <div className="pointer-events-none absolute inset-x-0 -bottom-1 text-center">
                <span className={`tabular rounded-full px-2.5 py-0.5 text-[15px] font-extrabold ${ready ? "bg-[#4ade80]/20 text-[#86efac]" : "bg-[#a855f7]/20 text-[#c79bff]"}`}>{metCount}/4</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            {empty ? (
              <>
                <h2 className="text-[27px] font-extrabold tracking-tight text-ink">Let&apos;s bring this brain to life</h2>
                <p className="mt-1.5 text-[18px] leading-relaxed text-ink-dim">Start with the client&apos;s website, the anchor everything else is checked against. Paste it below and it crawls in, JavaScript and Cloudflare sites included, usually a few minutes.</p>
                <button onClick={() => goto("website")} className="btn-brand mt-4 rounded-lg px-5 py-2.5 text-[18px] font-bold">Start with their website ↓</button>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 sm:justify-start">
                  <h2 className="text-[27px] font-extrabold tracking-tight text-ink">Brain strength</h2>
                  <span className="tabular text-[18px] text-ink-faint"><b className="text-ink">{liveChunks.toLocaleString("en-ZA")}</b> passages · <b className="text-ink">{indexedSources}</b> source{indexedSources === 1 ? "" : "s"}{crawling && <span className="text-active"> · indexing…</span>}</span>
                </div>
                <p className="mt-1 text-[18px] text-ink-dim">
                  {ready ? "Strong enough to build on. Test it below, then commission the Researcher." : "Fill the gaps to make it strong enough for the Researcher to build on."}
                </p>
                {/* One continuous strength bar - fills to the done fraction (2/4 = a solid 50%), no gaps. */}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full ${ready ? "bg-[#4ade80]" : "bg-gradient-to-r from-[#a855f7] to-[#22d3ee]"}`}
                    style={{ width: `${strengthPct}%`, transition: "width 0.6s ease-out" }} />
                </div>
                {/* What makes up the score, so the indicator is transparent and actionable (Gary). */}
                <p className="mt-2 text-[14px] text-ink-faint">
                  {liveChunks.toLocaleString("en-ZA")} clean passage{liveChunks === 1 ? "" : "s"} · knowledge depth adds {depthPts} of 33
                  {nextGap ? <> · <span className="text-ink-dim">add {nextGap.label.toLowerCase()} for +{nextGap.pts}</span></> : <> · fully stocked</>}
                </p>
                {/* The checklist, done items first (a timeline), each unmet item jumps to where you fix it. */}
                <div className="mt-3.5 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {ordered.map((c) => (
                    <button key={c.key} onClick={c.go} aria-label={c.met ? `${c.label}: done` : `Add ${c.label}`}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7] ${c.met ? "border-[#4ade80]/30 bg-[#4ade80]/[0.08] text-[#86efac]" : "border-line text-ink-dim hover:border-[#a855f7]/50 hover:text-ink"}`}>
                      <span aria-hidden>{c.met ? "✓" : "＋"}</span>{c.label}
                    </button>
                  ))}
                </div>
                {ready && (
                  <a href={`/researcher?client=${brainId}`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#4ade80] px-4 py-2 text-[18px] font-bold text-black transition hover:opacity-90">Commission the Researcher →</a>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* IT IS WORKING - the unmissable live state (Gary: indexing + spinner were too subtle, the team could not
          tell it was running and re-ran by mistake). The platform's standard crew panel: a pulsing orb, a
          counting-up clock + LIVE pill, rotating narration of what it is doing, and a moving bar. */}
      {crawling && (
        <WorkingPanel
          title="Building the brain"
          lines={[
            "Reading every page it can reach…",
            "Chunking the copy into clean passages…",
            "Embedding each passage into this brain…",
            "Indexing so every pod can retrieve it…",
          ]}
          note="Runs in the background, so it is safe to close the tab. It keeps going, and there is no need to run it again."
          eta="a few minutes"
          estimateSeconds={300}
          sub={`${liveChunks.toLocaleString("en-ZA")} passage${liveChunks === 1 ? "" : "s"} in so far`}
        />
      )}

      {/* DONE - WHAT NEXT? A clear step, not just a toast (Gary): once a scrape finishes, the team is told the
          brain is updated and given the two real moves - go to the Researcher, or add more data first. */}
      {!crawling && justCompleted && (
        <div className="gas-rise relative overflow-hidden rounded-2xl border border-[#4ade80]/45 bg-[#4ade80]/[0.06] p-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full blur-[80px]" style={{ background: "radial-gradient(circle, rgba(74,222,128,0.18), transparent 70%)" }} />
          <div className="relative flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4ade80]/20 text-[22px] text-[#86efac]">✓</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[22px] font-extrabold tracking-tight text-ink">Brain updated</h3>
              <p className="mt-1 text-[17px] leading-relaxed text-ink-dim">
                <b className="tabular text-ink">{justCompleted.count.toLocaleString("en-ZA")}</b> new passage{justCompleted.count === 1 ? "" : "s"} indexed and retrievable by every pod. You can move on now, or add more data first.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <a href={`/researcher?client=${brainId}`} className="inline-flex items-center gap-2 rounded-lg bg-[#4ade80] px-4 py-2 text-[17px] font-bold text-black transition hover:opacity-90">Go to the Researcher →</a>
                <button onClick={() => { setJustCompleted(null); goto("website"); }} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-[17px] font-semibold text-ink-dim transition hover:border-[#a855f7]/50 hover:text-ink">＋ Add more data</button>
                <button onClick={() => setJustCompleted(null)} className="ml-auto inline-flex items-center rounded-lg px-3 py-2 text-[15px] text-ink-faint transition hover:text-ink-dim">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add knowledge */}
      <div ref={feedRef} className="overflow-hidden rounded-2xl border border-[#a855f7]/25 bg-surface-1 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#a855f7]/15 text-[#c79bff]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden><path d="M12 3a4 4 0 0 0-4 4 3.5 3.5 0 0 0-2 6.3A3.5 3.5 0 0 0 8 20a4 4 0 0 0 8 0 3.5 3.5 0 0 0 2-6.7A3.5 3.5 0 0 0 16 7a4 4 0 0 0-4-4Z" /><path d="M12 7v13M8.5 10.5 12 12l3.5-1.5" /></svg>
          </span>
          <div>
            <h2 className="text-[23px] font-extrabold tracking-tight text-ink">Feed the knowledge</h2>
            <p className="text-[18px] text-ink-dim">Everything here becomes the brain&apos;s memory: chunked, embedded, and retrievable by every pod.</p>
          </div>
        </div>

        {/* THE CLIENT'S OFFICIAL WEBSITE - the ground-truth anchor (Gary). Setting it here locks the research pods
            to the right company (never a same-named other business), so it belongs right where the brain is fed. */}
        {isAdmin && (
          <div className="mt-4 rounded-xl border border-line bg-surface-2/50 p-3.5">
            <label className="block">
              <span className="tabular block text-[13px] font-bold uppercase tracking-[0.16em] text-ink-faint">Client&apos;s official website</span>
              <span className="mt-0.5 block text-[15px] text-ink-dim">The ground-truth anchor. The Researcher and Strategist lock to this site, so they never research a same-named but different business.</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input value={website} onChange={(e) => { setWebsite(e.target.value); setWebSaved(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveWebsite(); } }}
                  placeholder="https://client-official-site.co.za"
                  className="min-w-[260px] flex-1 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-[18px] text-ink outline-none focus:border-line-strong" />
                <button onClick={saveWebsite} disabled={savingWeb} className="btn-brand rounded-lg px-4 py-2 text-[17px] font-bold disabled:opacity-50">{savingWeb ? "Saving…" : webSaved ? "✓ Saved" : "Save site"}</button>
              </div>
            </label>
            {/* OFFICIAL SOCIALS - the single home for these too (Gary). The research pods mine them for the client's
                own public activity, and they help pin the RIGHT entity when the name is shared. One per line. */}
            <label className="mt-4 block border-t border-line pt-3.5">
              <span className="tabular block text-[13px] font-bold uppercase tracking-[0.16em] text-ink-faint">Official social accounts</span>
              <span className="mt-0.5 block text-[15px] text-ink-dim">Their real LinkedIn, Facebook, Instagram, X and so on, one per line. Mined alongside the website for the client&apos;s own activity.</span>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <textarea value={socials} onChange={(e) => { setSocials(e.target.value); setSocSaved(false); }} rows={3}
                  placeholder={"https://www.linkedin.com/company/…\nhttps://www.instagram.com/…"}
                  className="min-w-[260px] flex-1 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-[16px] leading-relaxed text-ink outline-none focus:border-line-strong" />
                <button onClick={saveSocials} disabled={savingSoc} className="btn-brand rounded-lg px-4 py-2 text-[17px] font-bold disabled:opacity-50">{savingSoc ? "Saving…" : socSaved ? "✓ Saved" : "Save socials"}</button>
              </div>
            </label>
          </div>
        )}

        {/* TWO HONEST ZONES (world-class IA): "Feed it" is raw source material; "Teach it" is the structured rules
            and positioning the brain applies. The brand library (the artwork) is its own zone lower down. Splitting
            them means the team holds one mental model at a time instead of six chips in a row. */}
        <div className="mt-5 space-y-4">
          {([["Feed it", "raw source material", [["website", "Website"], ["feed", "RSS feed"], ["documents", "Documents"], ["text", "Paste text"]]],
             ["Teach it", "rules & positioning it applies", [["positioning", "Positioning & rules"], ["compliance", "Compliance"]]]] as const).map(([zone, note, modes]) => (
            <div key={zone}>
              <div className="tabular text-[13px] font-bold uppercase tracking-[0.16em] text-ink-faint">{zone} <span className="ml-1 font-normal normal-case tracking-normal text-ink-faint">· {note}</span></div>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {modes.map(([m, label]) => (
                  <button key={m} onClick={() => setMode(m as Mode)} aria-pressed={mode === m}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[17px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7] ${mode === m ? "bg-[#a855f7]/15 text-[#c79bff] ring-1 ring-[#a855f7]/40" : "border border-line text-ink-dim hover:border-line-strong hover:text-ink"}`}>
                    <SourceIcon m={m as Mode} />{label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
        {mode === "documents" ? (
          <>
            {/* PDFs, decks, notes. Uploads straight to Blob and ingests as each one lands. */}
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-surface-2/50 px-4 py-8 text-center hover:border-[#a855f7]/50">
              <input type="file" multiple accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} disabled={adding} className="hidden" />
              <span className="text-[18px] font-bold text-ink">Choose documents, or drop them here</span>
              <span className="text-[18px] text-ink-dim">PDFs, decks, research, notes. Each one ingests as it lands.</span>
              <span className="mt-1 text-[18px] text-ink-faint">PDF · TXT · MD · CSV, up to 50MB each</span>
            </label>
            {progress && <p className="mt-2 text-[18px] text-ink-dim">Uploading {progress}…</p>}
          </>
        ) : mode === "website" ? (
          <>
            {/* ALREADY CRAWLED (Gary: a done section is confusing without a last-run flag). Shows what is already
                in the brain for this type + when, with Re-crawl, so nobody re-adds a site they already ran. */}
            {(() => {
              const web = sources.filter((s) => s.type === "website" || s.type === "crawl");
              if (!web.length) return null;
              // How many crawled sites are 30+ days old, so the team gets one quiet heads-up at the top rather
              // than having to scan every row (Gary: "a subtle alert for them").
              const dueCount = web.filter((s) => { const f = freshness(s.last_synced_at); return f?.due && s.status !== "pending"; }).length;
              return (
                <div className="mb-4 rounded-xl border border-[#4ade80]/25 bg-[#4ade80]/[0.04] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="tabular text-[13px] font-bold uppercase tracking-[0.14em] text-[#86efac]">✓ Already crawled</div>
                    {/* KEEP FRESH AUTOMATICALLY (admin cost dial): auto-recrawl these sites on an SLA so the brain
                        never quietly goes stale. Off by default; when on, the manual Re-crawl still works too. */}
                    {isAdmin && (
                      <label className="flex items-center gap-2 text-[14px] text-ink-dim">
                        <span>Keep fresh:</span>
                        <select value={autoRecrawl} disabled={savingFresh}
                          onChange={(e) => saveFreshness(Number(e.target.value))}
                          className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[14px] text-ink outline-none focus:border-[#4ade80] disabled:opacity-50">
                          <option value={0}>Off</option>
                          <option value={14}>Every 14 days</option>
                          <option value={30}>Every 30 days</option>
                          <option value={60}>Every 60 days</option>
                          <option value={90}>Every 90 days</option>
                        </select>
                      </label>
                    )}
                  </div>
                  {autoRecrawl > 0
                    ? <p className="mt-1.5 text-[15px] text-[#86efac]"><span aria-hidden>↻ </span>Auto-recrawling any site older than {autoRecrawl} days, so the brain stays current on its own.</p>
                    : dueCount > 0 && (
                      <p className="mt-1.5 text-[15px] text-[#fcd34d]">
                        <span aria-hidden>↻ </span>{dueCount === 1 ? "1 site is" : `${dueCount} sites are`} 30+ days old. A fresh crawl keeps the brain current{isAdmin ? ", or turn on Keep fresh above" : ""}.
                      </p>
                    )}
                  <ul className="mt-2 space-y-1.5">
                    {web.map((s) => {
                      const f = freshness(s.last_synced_at);
                      return (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[16px]">
                          <span className="min-w-0 flex-1 truncate text-ink-dim">{s.uri}</span>
                          {s.status === "pending"
                            ? <span className="inline-flex items-center gap-1.5 text-active"><span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />indexing…</span>
                            : <span className="shrink-0">
                                <span className={f?.due ? "font-semibold text-[#fcd34d]" : "text-ink-faint"}>
                                  {f ? <>crawled {f.date} <span className="text-ink-faint/80">· {f.label}</span>{f.due ? " · due a refresh" : ""}</> : "crawled recently"}
                                </span> · <button onClick={() => recrawl(s)} className="font-semibold text-ink-dim hover:text-ink">Re-crawl</button>
                              </span>}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-[15px] text-ink-faint">Add a website below only if it is a NEW site. To refresh one you already added, Re-crawl it.</p>
                </div>
              );
            })()}
            {/* Full site crawls every page it can reach (no path scope); single page reads just that URL. Each
                page keeps its own title + URL so a passage always traces back to its source. */}
            <div className="inline-flex rounded-lg border border-line p-1 text-[16px]">
              <button onClick={() => setFullSite(true)} aria-pressed={fullSite} className={`rounded-md px-3 py-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7] ${fullSite ? "bg-[#a855f7]/15 text-[#c79bff]" : "text-ink-dim hover:text-ink"}`}>Full site, all pages</button>
              <button onClick={() => setFullSite(false)} aria-pressed={!fullSite} className={`rounded-md px-3 py-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7] ${!fullSite ? "bg-[#a855f7]/15 text-[#c79bff]" : "text-ink-dim hover:text-ink"}`}>Single page</button>
            </div>
            {sites.map((s, i) => (
              <div key={i} className="mt-2.5 flex gap-2">
                <input value={s} onChange={(e) => setSites((list) => list.map((x, j) => (j === i ? e.target.value : x)))} placeholder="https://the-client.com"
                  className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[18px] outline-none focus:border-line-strong" />
                {sites.length > 1 && <button onClick={() => setSites((list) => list.filter((_, j) => j !== i))} aria-label="Remove this website" className="shrink-0 rounded-lg border border-line px-3 text-ink-faint hover:border-alert/50 hover:text-alert">✕</button>}
              </div>
            ))}
            <button onClick={() => setSites((list) => [...list, ""])} className="mt-2.5 text-[17px] font-semibold text-[#c79bff] hover:underline">+ Add another website</button>
            <div><button onClick={addWebsites} disabled={adding} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[18px] font-bold disabled:opacity-50">{adding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{adding ? "Reading and adding the pages…" : fullSite ? "Scrape and add every page" : "Add these pages"}</button></div>
            <p className="mt-2.5 text-[18px] text-ink-dim">{fullSite ? "Reads every page it can reach, up to 80 per site. Takes a few minutes and keeps running if you close the tab." : "Reads just the page at each URL."}</p>
          </>
        ) : mode === "feed" ? (
          <>
            <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFeed(); } }}
              placeholder="https://example.com/feed.xml (RSS or Atom)"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[18px] outline-none focus:border-line-strong" />
            <button onClick={addFeed} disabled={adding} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[18px] font-bold disabled:opacity-50">{adding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{adding ? "Reading the feed…" : "Add this feed"}</button>
            <p className="mt-2.5 text-[18px] text-ink-dim">Reads the feed&apos;s own articles and keeps it current on the brain&apos;s refresh cadence, adding only new items each time. A news site&apos;s RSS, a regulator&apos;s updates page feed, an industry blog.</p>
          </>
        ) : mode === "compliance" ? (
          <>
            <textarea value={compliance} onChange={(e) => setCompliance(e.target.value)} rows={5} placeholder="Paste the client's mandatory compliance copy: disclaimers, licence wording, advertising rules…"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[18px] leading-relaxed outline-none focus:border-line-strong" />
            <button onClick={() => addText("compliance")} disabled={adding} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[18px] font-bold disabled:opacity-50">{adding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{adding ? "Adding…" : "Add compliance copy"}</button>
            <p className="mt-2.5 text-[18px] text-ink-dim">Tagged as <b className="text-ink-dim">compliance</b> so creative and the proposal&apos;s governance page can pull it specifically.</p>
          </>
        ) : mode === "positioning" ? (
          <>
            <textarea value={docEntry} onChange={(e) => { setDocEntry(e.target.value); if (fedMsg) setFedMsg(""); }} rows={5} placeholder="Add a positioning point, brand rule or proof point. e.g. a claim we can make, how they talk, or something we must never say…"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[18px] leading-relaxed outline-none focus:border-line-strong" />
            <button onClick={saveDoctrine} disabled={savingDoc || !docEntry.trim()} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[18px] font-bold disabled:opacity-50">{savingDoc && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{savingDoc ? "Feeding the brain…" : "Save & teach the brain"}</button>
            <p className="mt-2.5 text-[18px] text-ink-dim">This is the <b className="text-ink-dim">brand book</b>: positioning, rules and proof points, what they stand for, how they talk, what must never be said. Each save <b className="text-ink-dim">adds</b> to it; everything already saved shows in <b className="text-ink-dim">What the brain knows</b> below, where you can remove any of it.{doctrine.trim() ? " The brand book already has content on file." : ""}</p>
          </>
        ) : (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste brand notes, proof points, a transcript, a key document…"
              className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[18px] leading-relaxed outline-none focus:border-line-strong" />
            <button onClick={() => addText()} disabled={adding} className="btn-brand mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[18px] font-bold disabled:opacity-50">{adding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{adding ? "Adding…" : "Add to brain"}</button>
          </>
        )}
        </div>

        {addErr && <p className="mt-3 text-[18px] text-alert">{addErr}</p>}
        {fedMsg && <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#4ade80]/40 bg-[#4ade80]/10 px-4 py-2.5 text-[18px] font-semibold text-[#86efac]"><span aria-hidden>✓</span>{fedMsg}</p>}
        {/* The isolation guarantee, said out loud where someone is about to hand us a client's private material. */}
        <p className="mt-4 text-[18px] text-ink-faint">
          Everything added here is chunked and embedded into <b className="text-ink-dim">this brain only</b>. No other brain can read it.
        </p>
      </div>

      {/* MARKET SWEEP (Gary): feed the brain its market. A wide 24-month sweep; confirmed facts embed straight in
          (they appear in Knowledge Sources below and lift the strength), the rest are accepted or rejected here. */}
      {isAdmin && (
        <div className="rounded-xl border border-line bg-surface-1 p-6">
          <div className="flex items-center gap-3">
            <SectionTile d={ICON.sources} />
            <div>
              <div className="tabular text-[18px] font-semibold uppercase tracking-[0.14em] text-ink-dim">Market intelligence</div>
              <p className="mt-0.5 text-[16px] text-ink-dim">A one-off ~24-month sweep of this client and their market. Confirmed facts are added to the brain automatically, so they strengthen it and appear in Knowledge Sources; the rest come back to accept or reject. Do this once when you set the brain up.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={runSweep} disabled={sweepBusy}
              className="btn-brand inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[18px] font-bold disabled:opacity-50">
              {sweepBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {sweepBusy ? "Sweeping the market…" : "Run a market sweep"}
            </button>
            {sweepBusy && <span className="text-[15px] text-ink-faint">This runs a wide, thorough search and can take a couple of minutes. You can leave this page.</span>}
          </div>
          {sweepErr && <p className="mt-3 text-[16px] text-alert">{sweepErr}</p>}
          {sweepMsg && <p className="mt-3 rounded-lg border border-[#a855f7]/25 bg-[#a855f7]/10 px-4 py-3 text-[16px] leading-relaxed text-ink-dim">{sweepMsg}</p>}
          {sweepReview.length > 0 && (
            <div className="mt-4">
              <div className="tabular text-[15px] uppercase tracking-[0.16em] text-ink-faint">Review, then accept into the brain or reject</div>
              <ul className="mt-2 space-y-2">
                {sweepReview.map((f) => (
                  <li key={f.id} className="rounded-lg border border-line bg-surface-2/50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[18px] font-semibold text-ink">{f.headline}</div>
                        {f.why_it_matters && <div className="mt-0.5 text-[16px] leading-relaxed text-ink-dim">{f.why_it_matters}</div>}
                        {Array.isArray(f.sources) && f.sources.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[14px]">
                            {f.sources.filter((s) => s?.url).slice(0, 4).map((s, j) => (
                              <a key={j} href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{s.name || "source"} ↗</a>
                            ))}
                          </div>
                        )}
                        {(f.verification === "verified" || f.verification === "partial")
                          ? <span className="mt-1.5 inline-block rounded bg-ready/15 px-2 py-0.5 text-[13px] font-bold text-ready">✓ verified{f.verification === "partial" ? " (partial)" : ""}</span>
                          : <span className="mt-1.5 inline-block rounded bg-[#fbbf24]/15 px-2 py-0.5 text-[13px] font-bold text-[#fcd34d]">could not be machine-confirmed</span>}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => acceptSweep(f.id)} disabled={sweepItemBusy === f.id}
                          className="rounded-lg bg-[#22c55e] px-3.5 py-1.5 text-[15px] font-bold text-white hover:bg-[#16a34a] disabled:opacity-50">✓ Add</button>
                        <button onClick={() => rejectSweep(f.id)} disabled={sweepItemBusy === f.id}
                          className="rounded-lg border border-line px-3.5 py-1.5 text-[15px] font-semibold text-ink-dim hover:border-alert hover:text-alert disabled:opacity-50">Reject</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Sources */}
      <div className="rounded-xl border border-line bg-surface-1 p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <SectionTile d={ICON.sources} />
            <div className="tabular text-[18px] font-semibold uppercase tracking-[0.14em] text-ink-dim">Knowledge sources</div>
          </div>
          {sources.length > 0 && (
            <button onClick={reindex} disabled={reindexing} title="Rebuild every passage's embedding with the current model. Only needed after an embedding-model change; otherwise leave it. Your text is not touched." className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[15px] font-semibold text-ink-dim hover:text-ink disabled:opacity-50">{reindexing && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />}{reindexing ? "Re-indexing…" : "↻ Re-index"} <span className="text-ink-faint">· rarely needed</span></button>
          )}
        </div>
        {sources.length === 0 ? (
          <p className="mt-3 text-[18px] text-ink-dim">No sources yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="border-b border-line/60 py-2.5 text-[18px]">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <span className="min-w-0 flex-1 truncate text-ink">{s.type === "website" ? s.uri : s.uri || "Pasted note"}</span>
                <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px]">
                  <span className={s.status === "indexed" ? "font-semibold text-ink-dim" : "text-ink-faint"}>{s.chunk_count ?? 0} passages</span>
                  {s.status === "indexed" && (s.chunk_count ?? 0) <= 2 && (s.type === "crawl" || s.type === "website") && (
                    <span title="This site returned almost nothing, it may be bot-blocked or JavaScript-only. Check it opened." className="rounded bg-[#fbbf24]/15 px-2 py-0.5 font-bold text-[#fcd34d]">thin, check it</span>
                  )}
                  {s.status === "failed" ? (
                    <span className="rounded bg-alert/15 px-2 py-0.5 font-bold text-alert">failed</span>
                  ) : s.status === "indexed" ? (
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold text-ready bg-ready/15 ${flashDone.has(s.id) ? "animate-pulse ring-2 ring-ready/70" : ""}`}>✓ Ready</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded bg-active/10 px-2 py-0.5 font-semibold text-active">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />Reading &amp; indexing…
                    </span>
                  )}
                  <button onClick={() => removeSource(s)} title="Delete this source" aria-label="Delete this source" className="rounded px-1.5 py-0.5 text-ink-faint hover:bg-alert/15 hover:text-alert">✕</button>
                </span>
                </div>
                {/* Freshness + re-crawl, for website AND feed sources (a note/file has no live URL to re-read). */}
                {(s.type === "website" || s.type === "crawl" || s.type === "feed") && s.status !== "pending" && (() => {
                  const f = freshness(s.last_synced_at);
                  const verb = s.type === "feed" ? "read" : "crawled";
                  return (
                    <div className="mt-1 flex items-center gap-3 text-[15px] text-ink-faint">
                      {f && <span className={f.stale ? "font-semibold text-[#fcd34d]" : ""}>{verb} {f.label}{f.stale ? " · stale, worth a refresh" : ""}</span>}
                      <button onClick={() => recrawl(s)} className="font-semibold text-ink-dim hover:text-ink">↻ Re-crawl</button>
                    </div>
                  );
                })()}
                {/* The reason, in plain sight. A source that says only "failed" gives nobody anything to act on. */}
                {s.status === "failed" && s.error && (
                  <p className="mt-1.5 rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[18px] leading-relaxed text-alert">{s.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* WHAT IT KNOWS + WHAT IT BUILDS FROM. Both sit above "Test the brain" deliberately: when an answer
          comes back wrong the first question is "what is actually in there?", and that has to be one scroll
          away, not buried under the tools that add more. */}
      {/* WHAT THIS BRAIN CAN ANSWER ON - the passive coverage map, so strengths and holes are visible at a glance. */}
      {(coverage.loading || coverage.topics.length > 0) && (
        <div className="rounded-xl border border-line bg-surface-1 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <SectionTile d={ICON.coverage} />
              <div className="tabular text-[18px] font-semibold uppercase tracking-[0.14em] text-ink-dim">What this brain can answer on</div>
            </div>
            {!coverage.loading && <button onClick={() => loadCoverage(true)} className="text-[15px] font-semibold text-ink-faint hover:text-ink">↻ Refresh</button>}
          </div>
          {coverage.loading ? (
            <p className="mt-3 inline-flex items-center gap-2 text-[18px] text-ink-dim"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />Reading the brain to map its coverage…</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {coverage.topics.map((t, i) => (
                <span key={i} style={{ animation: `rise 0.4s ease-out ${i * 0.05}s both` }}
                  className="rounded-full border border-[#a855f7]/25 bg-[#a855f7]/[0.06] px-3 py-1.5 text-[17px] text-ink-dim">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <BrainKnowledge brainId={brainId} total={liveChunks} />
      <div id="brand-library"><BrainLibrary brainId={brainId} /></div>

      {/* DANGER ZONE - both destructive actions live here, tucked at the very bottom out of eye-line (they used to
          sit next to Re-index and here, doubled up). "Test the brain" is now the full Ask panel on the page below,
          so the old simple query box is removed to avoid two test boxes. */}
      <details className="rounded-xl border border-line bg-surface-1 p-4">
        <summary className="cursor-pointer text-[15px] font-semibold text-ink-faint hover:text-ink-dim">Danger zone</summary>
        <div className="mt-3 flex flex-wrap gap-3">
          <button onClick={nukeAll} className="rounded-lg border border-alert/40 px-4 py-2 text-[18px] font-semibold text-alert hover:bg-alert/10">Nuke all knowledge</button>
          <button onClick={deleteBrainNow} className="rounded-lg border border-alert/50 px-4 py-2 text-[18px] font-semibold text-alert hover:bg-alert/10">🗑 Delete this brain</button>
        </div>
        <p className="mt-2 text-[15px] text-ink-faint">Nuke wipes every source and passage but keeps the brain. Delete removes the brain entirely. Both are permanent.</p>
      </details>
    </div>
  );
}
