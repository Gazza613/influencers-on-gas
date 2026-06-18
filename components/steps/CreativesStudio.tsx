"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Lightbox from "@/components/Lightbox";
import Uploader from "@/components/Uploader";
import WorkingPanel from "@/components/WorkingPanel";
import { CREW } from "@/lib/crew";
import { flex, pick, QA_LINES } from "@/lib/flex";

type Creative = {
  id?: string;
  url: string | null;
  ratio: string;
  resolution: string;
  scene: string;
  at: number;
  status?: "approved" | "failed_qa" | "failed_generation";
  qa?: { pass: boolean; score10: number; issues: string[] } | null;
  error?: string | null;
};
type Rate = { credits: number; cents: number };
type Rates = { soul_2: Rate; soul_cinematic: Rate; upscale: Rate };

const PER_RATIO = 3; // distinct shots generated per format
const RATIOS = [
  { key: "9:16", label: "9:16", sub: "Reels · Stories · TikTok" },
  { key: "1:1", label: "1:1", sub: "Feeds · LinkedIn" },
  { key: "16:9", label: "16:9", sub: "YouTube · Google · LinkedIn" },
];
const PLATFORMS: { key: string; label: string; ratios: string[] }[] = [
  { key: "instagram", label: "Instagram", ratios: ["9:16", "1:1"] },
  { key: "facebook", label: "Facebook", ratios: ["9:16", "1:1"] },
  { key: "tiktok", label: "TikTok", ratios: ["9:16"] },
  { key: "linkedin", label: "LinkedIn", ratios: ["1:1", "16:9"] },
  { key: "google", label: "Google Ads", ratios: ["16:9", "1:1"] },
];
const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CREATIVE_NARRATION = [
  "Reading your scene brief and art-directing the shoot…",
  "Posing your locked influencer, same face, every single frame…",
  "Framing each format: vertical for Reels, square for feed, wide for ads…",
  "Dialling in the light, the colour and the wardrobe…",
  "🔎 AI Vision QA inspecting every shot, clothed, single frame, true proportions…",
  "Re-rolling anything that doesn't make the cut, no compromises…",
];

export default function CreativesStudio({ influencerId, initial }: { influencerId: string; initial: { creatives: Creative[]; status: string } }) {
    const [view, setView] = useState<"all" | "passed" | "needs">("all");
  const [platforms, setPlatforms] = useState<Set<string>>(new Set());
  const [ratios, setRatios] = useState<Set<string>>(new Set(["9:16", "1:1"]));
  const [tier, setTier] = useState<"soul_2" | "soul_cinematic">("soul_2");
  const [extras, setExtras] = useState(true);
  const [scene, setScene] = useState("");
  const [refining, setRefining] = useState(false);
  const [clothingRef, setClothingRef] = useState<string | null>(null);
  const [locationRef, setLocationRef] = useState<string | null>(null);
  const [identityLock, setIdentityLock] = useState<"strong" | "flexible">("strong");

  const [rates, setRates] = useState<Rates | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>(normalize(initial.creatives || []));
  const [videoSelects, setVideoSelects] = useState<string[]>([]);
  const [qa, setQa] = useState<{ reviewed: number; approved: number; rejected: number } | null>(null);
  const [status, setStatus] = useState(initial.status || "idle");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [upscaling, setUpscaling] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);

  const running = status === "running";

  function normalize(list: Creative[]): Creative[] {
    return list.map((c, i) => ({
      id: c.id || `${c.at || Date.now()}-${i}`,
      url: c.url ?? null,
      ratio: c.ratio || "9:16",
      resolution: c.resolution || "2k",
      scene: c.scene || "",
      at: c.at || Date.now(),
      status: c.status || (c.url ? "approved" : "failed_generation"),
      qa: c.qa ?? null,
      error: c.error ?? null,
    }));
  }

  const prevCount = useRef(initial.creatives?.length || 0);
  const prevStatus = useRef(initial.status || "idle");
  async function refresh() {
    const d = await fetch(`/api/influencers/${influencerId}/creatives`).then((r) => r.json()).catch(() => null);
    if (d) {
      const list = normalize(d.creatives || []);
      // Flash a QA call-out for each newly-landed shot while a run is in progress.
      const fresh = list.length - prevCount.current;
      if (fresh > 0 && prevStatus.current === "running") {
        for (let i = 0; i < Math.min(fresh, 3); i++) setTimeout(() => flex(pick(QA_LINES)), i * 500);
      }
      // Milestone burst when the run completes.
      if (prevStatus.current === "running" && d.status === "done") {
        const approved = d.qa?.approved ?? list.length;
        flex(`✨ ${approved} shot${approved === 1 ? "" : "s"} approved by AI Vision QA`, { milestone: true });
      }
      prevCount.current = list.length;
      prevStatus.current = d.status || "idle";
      if (d.rates) setRates(d.rates); setCreatives(list); setVideoSelects(d.videoSelects || []); setQa(d.qa || null); setStatus(d.status || "idle");
    }
    return d;
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function poll(tries = 0): Promise<void> {
    if (tries > 160) { setStatus("idle"); setErr("That run took too long and was reset, you can generate again."); fetch(`/api/influencers/${influencerId}/creatives`, { method: "DELETE" }).catch(() => {}); return; }
    await new Promise((r) => setTimeout(r, 5000));
    const d = await refresh();
    if (!d) return poll(tries + 1);
    if (d.status === "failed") { setErr(d.error || "Render failed"); return; }
    // Stop on ANY non-running state (done / idle / aborted) so it can never loop forever.
    if (d.status !== "running") return;
    return poll(tries + 1);
  }

  // Platforms drive the formats: the selected formats are exactly the union of the chosen
  // platforms' ratios, recomputed on every toggle so switching platforms always updates.
  function togglePlatform(p: { key: string; ratios: string[] }) {
    const next = new Set(platforms);
    next.has(p.key) ? next.delete(p.key) : next.add(p.key);
    setPlatforms(next);
    setRatios(new Set([...next].flatMap((k) => PLATFORMS.find((x) => x.key === k)?.ratios ?? [])));
  }
  function toggleRatio(r: string) { setRatios((s) => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n; }); }

  const nFormats = ratios.size;
  const images = nFormats * PER_RATIO;
  const tierRate = rates ? rates[tier] : null;
  const estCents = rates && tierRate ? images * tierRate.cents : 0;
  const estCredits = rates && tierRate ? images * tierRate.credits : 0;

  async function perfect() {
    if (refining) return;
    setRefining(true); setErr("");
    const d = await fetch(`/api/influencers/${influencerId}/creatives/refine`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene }),
    }).then((r) => r.json()).catch(() => null);
    setRefining(false);
    if (d?.refined) setScene(d.refined); else setErr(d?.error || "Could not perfect the prompt");
  }

  async function generate() {
    if (!nFormats || running) return;
    setErr(""); setStatus("running");
    const r = await fetch(`/api/influencers/${influencerId}/creatives`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratios: [...ratios], resolution: "2k", scene, count: PER_RATIO, model: tier, clothingRef, locationRef, extras, identityLock }),
    });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start"); setStatus("idle"); return; }
    flex(`${CREW.creatives.emoji} ${CREW.creatives.name}, your ${CREW.creatives.role}: ${CREW.creatives.greeting}`);
    poll();
  }

  async function abort() {
    if (!confirm("Abort this render? Anything already finished is kept; you can run again.")) return;
    await fetch(`/api/influencers/${influencerId}/creatives`, { method: "DELETE" }).catch(() => {});
    setStatus("idle"); setErr("");
  }

  function togglePick(id: string) { setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function patchPersona(patch: Record<string, unknown>) {
    await fetch(`/api/influencers/${influencerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaPatch: patch }) }).catch(() => {});
  }
  async function removePicked() {
    const keep = creatives.filter((c) => !picked.has(c.id || ""));
    setCreatives(keep); setPicked(new Set());
    await patchPersona({ creatives: keep, video_selects: videoSelects.filter((u) => keep.some((c) => c.url === u)) });
  }
  // Remove a single tile (used to dismiss failed shots that cannot be selected).
  async function removeOne(id: string) {
    const keep = creatives.filter((c) => (c.id || "") !== id);
    setCreatives(keep);
    setPicked((s) => { const n = new Set(s); n.delete(id); return n; });
    await patchPersona({ creatives: keep, video_selects: videoSelects.filter((u) => keep.some((c) => c.url === u)) });
  }
  async function markForVideo() {
    const add = creatives.filter((c) => picked.has(c.id || "") && !!c.url).map((c) => c.url as string);
    const next = [...new Set([...videoSelects, ...add])];
    setVideoSelects(next); setPicked(new Set());
    await patchPersona({ video_selects: next });
  }
  // Upscale the selected 2K keepers to 4K on demand (one paid upscale each, only on shots
  // the producer actually chose). Each upgraded shot moves to the 4K Finals section.
  async function upscalePicked() {
    const ids = creatives.filter((c) => picked.has(c.id || "") && !!c.url && c.resolution !== "4k").map((c) => c.id || "");
    if (!ids.length) return;
    setUpscaling((s) => new Set([...s, ...ids]));
    setPicked(new Set());
    for (const cid of ids) {
      const r = await fetch(`/api/influencers/${influencerId}/creatives/upscale`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cid }),
      }).then((x) => x.json()).catch(() => null);
      if (r?.creative) setCreatives((cs) => cs.map((c) => ((c.id || "") === cid ? { ...c, ...r.creative } : c)));
      else setErr("A 4K upscale did not come back, please try that shot again.");
      setUpscaling((s) => { const n = new Set(s); n.delete(cid); return n; });
    }
  }
  // Finish-based grade: 4K = green Excellent; 2K keeper = orange Good; QA-flagged = red Average.
  function gradeOf(c: Creative): { t: string; cls: string } {
    if (c.resolution === "4k") return { t: "Excellent", cls: "bg-ready/85 shadow-[0_0_10px_rgba(52,199,89,0.6)]" };
    const s = c.qa?.score10 ?? 7;
    if (c.status === "failed_qa" || s < 6) return { t: "Average", cls: "bg-alert/85" };
    return { t: "Good", cls: "bg-[#ff6a00] shadow-[0_0_10px_rgba(255,106,0,0.75)]" };
  }
  const renderTile = (c: Creative, i: number) => {
    const id = c.id || `${c.url || "none"}-${i}`;
    const sel = picked.has(id);
    const forVideo = !!c.url && videoSelects.includes(c.url);
    const canPick = !!c.url && !broken.has(c.url);
    const u = c.url || "";
    const busy = upscaling.has(id);
    const g = gradeOf(c);
    return (
      <div key={id} className={`shimmer group relative overflow-hidden rounded-lg border-2 ${sel ? "border-[#a855f7]" : "border-line"}`}>
        {!c.url ? (
          <div className="flex aspect-square w-full flex-col items-center justify-center bg-surface-2 text-center text-[10px] text-ink-faint">
            <span className="mb-1 rounded bg-alert/20 px-2 py-0.5 text-[9px] font-semibold text-alert">generation failed</span>
            <span>{c.error || "No image returned"}</span>
          </div>
        ) : broken.has(u) ? (
          <div className="flex aspect-square w-full flex-col items-center justify-center bg-surface-2 text-center text-[10px] text-ink-faint">
            <span className="mb-1 rounded bg-alert/20 px-2 py-0.5 text-[9px] font-semibold text-alert">image failed to load</span>
            <span>{c.error || "image didn&apos;t load"}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u} alt={c.scene} className="aspect-square w-full cursor-pointer object-cover" onClick={() => setZoom(u)} onError={() => setBroken((b) => new Set(b).add(u))} />
        )}
        {busy && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/60 text-[10px] font-semibold text-white">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            upscaling to 4K…
          </div>
        )}
        {canPick ? (
          <button
            onClick={(e) => { e.stopPropagation(); togglePick(id); }}
            aria-pressed={sel}
            title={sel ? "Selected" : "Select this shot"}
            className={`absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full border text-sm transition active:scale-90 ${sel ? "border-[#a855f7] bg-[#a855f7] text-white shadow-[0_0_12px_rgba(168,85,247,0.6)]" : "border-white/80 bg-black/55 text-white/55 hover:bg-black/70 hover:text-white"}`}
          >✓</button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); removeOne(id); }}
            title="Delete this failed shot"
            className="absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-alert/70 bg-black/60 text-sm text-alert transition hover:bg-alert/20 active:scale-90"
          >✕</button>
        )}
        <div className="absolute left-1.5 top-1.5 flex gap-1">
          <span className="tabular rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white">{c.ratio}</span>
          <span className="tabular rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">{c.resolution}</span>
        </div>
        {forVideo && <span className="absolute bottom-1.5 left-1.5 rounded bg-ready/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">★ video</span>}
        {c.url && !broken.has(c.url) && (c.status === "approved" || c.status === "failed_qa") && (
          <span className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${g.cls}`} title={(c.qa?.issues || []).join(" · ") || "AI Vision QA grade"}>
            {g.t}
          </span>
        )}
        {c.url && !broken.has(c.url) && c.status === "failed_generation" && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-alert" title={c.error || "Generation failed"}>
            failed
          </span>
        )}
        {c.url && !broken.has(c.url) && (
          <button onClick={() => setZoom(c.url)} title="Review full size"
            className="absolute inset-0 m-auto hidden h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/55 text-lg text-white backdrop-blur-sm transition group-hover:flex hover:bg-black/75">👁</button>
        )}
      </div>
    );
  };

  const visible = creatives.filter((c) => {
    if (view === "passed") return c.status === "approved";
    if (view === "needs") return c.status === "failed_qa" || c.status === "failed_generation";
    return true;
  });
  // Split into 2K previews (plus any failed shots, which keep their delete control) and 4K finals.
  const isFourK = (c: Creative) => !!c.url && !broken.has(c.url) && c.resolution === "4k";
  const fourK = visible.filter(isFourK);
  const twoK = visible.filter((c) => !isFourK(c));
  const pickedTwoK = creatives.some((c) => picked.has(c.id || "") && !!c.url && c.resolution !== "4k");

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">Creatives · social outputs</div>
        <p className="mt-2 text-sm text-ink-dim">
          Render social-ready shots of this locked influencer. Pick platforms or formats, optionally steer the wardrobe
          and scene, and we generate <span className="text-ink">{PER_RATIO} different shots per format</span> with the
          identity locked in. Backgrounds stay sharp and everyone stays fully clothed.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#a855f7]/25 bg-[#a855f7]/8 px-3 py-2 text-[13px] leading-relaxed text-ink-dim">
          <span className="text-lg leading-none">🔎</span>
          <span><span className="text-[#c79bff] font-semibold">AI Vision QA</span> reviews every single shot before you see it, wardrobe, composition, proportions and realism are all checked, and anything that doesn&apos;t pass is rejected and re-rolled automatically. You only ever get keepers.</span>
        </div>

        {/* Platforms (toggle) */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Platforms (tap to add / remove)</div>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = platforms.has(p.key);
              return (
                <button key={p.key} onClick={() => togglePlatform(p)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-[#a855f7] bg-[#a855f7]/15 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong hover:text-ink"}`}>
                  {on ? "✓ " : "+ "}{p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Formats (reflect platform selection, individually toggleable) */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Formats</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RATIOS.map((r) => {
              const on = ratios.has(r.key);
              return (
                <button key={r.key} onClick={() => toggleRatio(r.key)} className={`rounded-lg border px-3 py-2 text-left transition ${on ? "border-[#a855f7] bg-[#a855f7]/12" : "border-line hover:border-line-strong"}`}>
                  <div className={`text-sm font-bold ${on ? "text-[#c79bff]" : "text-ink-dim"}`}>{r.label} {on && "✓"}</div>
                  <div className="text-[10px] text-ink-faint">{r.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality tier (Soul model) */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Quality</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([["soul_2", "Realism (recommended)", "Authentic iPhone-style UGC, the default social look"], ["soul_cinematic", "Cinematic", "Film-grade lighting and colour, premium hero shots"]] as const).map(([k, label, hint]) => (
              <button key={k} onClick={() => setTier(k)} className={`rounded-lg border px-3 py-2 text-left transition ${tier === k ? "border-[#a855f7] bg-[#a855f7]/12" : "border-line hover:border-line-strong"}`}>
                <div className={`text-sm font-bold ${tier === k ? "text-[#c79bff]" : "text-ink-dim"}`}>{label}</div>
                <div className="text-[10px] text-ink-faint">{hint}</div>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">Both lock your trained Soul for identical identity across every shot, the consistency video production needs.</p>
        </div>

        {/* Scene + Perfect with AI */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="tabular text-[10px] uppercase tracking-[0.2em] text-ink-faint">Scene / brief (optional)</span>
            <button onClick={perfect} disabled={refining} className="inline-flex items-center gap-1.5 rounded-md border border-[#a855f7]/30 px-2.5 py-1 text-[11px] font-semibold text-[#c79bff] hover:border-[#a855f7]/60 hover:bg-[#a855f7]/10 disabled:opacity-50">
              {refining && <span className="spinner-ring" />}{refining ? "Perfecting…" : "✨ Perfect with AI"}
            </button>
          </div>
          <textarea value={scene} onChange={(e) => setScene(e.target.value)} rows={3}
            placeholder="e.g. holding a takeaway coffee on a Braamfontein street at golden hour, smiling at camera"
            className="glow-accent w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink outline-none" />
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
            Describe the outfit, location, who is around, the framing and the mood. The face stays locked, so you do not
            need to describe it. Keep it focused: a tight brief is followed more closely than a long one. Hit
            <span className="text-[#c79bff] font-semibold"> ✨ Perfect with AI</span> to shape a rough idea into a clean brief.
          </p>
        </div>

        {/* Background extras */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Background</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([["true", "Include extras", "A diverse SA crowd in the background, in focus"], ["false", "No extras", "Just the influencer, clean background"]] as const).map(([k, label, hint]) => {
              const on = (k === "true") === extras;
              return (
                <button key={k} onClick={() => setExtras(k === "true")} className={`rounded-lg border px-3 py-2 text-left transition ${on ? "border-[#a855f7] bg-[#a855f7]/12" : "border-line hover:border-line-strong"}`}>
                  <div className={`text-sm font-bold ${on ? "text-[#c79bff]" : "text-ink-dim"}`}>{label}</div>
                  <div className="text-[10px] text-ink-faint">{hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Identity lock */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Identity lock</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([["strong", "Strong likeness (recommended)", "Anchors hard to the locked face. Most consistent, but the shot leans toward the reference."], ["flexible", "Follow my scene", "Leans on the trained identity only. Follows your brief most closely, but the face can vary a little."]] as const).map(([k, label, hint]) => {
              const on = identityLock === k;
              return (
                <button key={k} onClick={() => setIdentityLock(k)} className={`rounded-lg border px-3 py-2 text-left transition ${on ? "border-[#a855f7] bg-[#a855f7]/12" : "border-line hover:border-line-strong"}`}>
                  <div className={`text-sm font-bold ${on ? "text-[#c79bff]" : "text-ink-dim"}`}>{label}</div>
                  <div className="text-[10px] text-ink-faint">{hint}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">Tip: a well-retrained influencer holds her face even on &ldquo;Follow my scene&rdquo;. Use Strong if you see her drifting.</p>
        </div>

        {/* Optional clothing + location */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Uploader kind="clothing" label="Clothing reference (optional)" current={clothingRef} onUploaded={setClothingRef} />
          <Uploader kind="location" label="Scene / location reference (optional)" current={locationRef} onUploaded={setLocationRef} />
        </div>

        {/* Generate */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={generate} disabled={!nFormats || running} className="btn-brand rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50">
            {running ? "Rendering…" : creatives.length ? `✨ Generate ${images} more` : `✨ Generate ${images} creatives`}
          </button>
          {running && (
            <button onClick={abort} className="rounded-lg border border-alert/60 px-4 py-2.5 text-sm font-bold text-alert hover:bg-alert/10">■ Abort</button>
          )}
          {rates && nFormats > 0 && (
            <span className="tabular flex items-center gap-2 rounded-full border border-[#a855f7]/45 bg-[#a855f7]/12 px-3 py-1.5 text-xs font-semibold text-[#c79bff]">
              <span className="text-ink-faint">{nFormats} format{nFormats === 1 ? "" : "s"} × {PER_RATIO} = {images} shots</span>
              <span className="text-sm text-ink">≈ {rand(estCents)}</span>
              {estCredits > 0 && <span className="text-ink-faint">· {estCredits} credits</span>}
            </span>
          )}
        </div>
        {rates && nFormats > 0 && (
          <p className="mt-1.5 text-[11px] text-ink-faint">Each run (and each &ldquo;generate more&rdquo;) costs the above. Track every cent in <Link href="/cost-control" className="text-[#c79bff] hover:underline">Cost Control</Link>.</p>
        )}
        {err && <p className="mt-2 text-xs text-alert">{err}</p>}

        {running && (
          <div className="mt-4">
            <WorkingPanel title="Creatives" lines={CREATIVE_NARRATION} crew={CREW.creatives} pct={null}
              onAbort={abort}
              note={`Generating and QA-checking each shot in 2K, they appear below as they pass review. Pick your keepers and upscale those to 4K afterwards. Stuck? Hit Abort and run again.`} />
          </div>
        )}
      </div>

      {/* In-progress placeholders so it's clear shots are rendering + being QA'd (not ready to click). */}
      {running && (
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Rendering &amp; reviewing · {images} shots</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: images }).map((_, i) => (
              <div key={i} className="shimmer flex aspect-square items-center justify-center rounded-lg border border-line">
                <span className="flex flex-col items-center gap-1.5 text-[10px] text-ink-faint"><span className="spinner-ring text-base text-[#c79bff]" /> reviewing…</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gallery */}
      {creatives.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          {qa && qa.reviewed > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-ready/30 bg-ready/5 px-3 py-2 text-[11px]">
            <span className="text-base leading-none">🔎</span>
            <span className="text-ink-dim">
              <span className="font-semibold text-ready">AI Vision QA</span> reviewed <span className="text-ink">{qa.reviewed}</span> shot{qa.reviewed === 1 ? "" : "s"} · <span className="text-ready">{qa.approved} good</span>{qa.rejected > 0 && <> · <span className="text-active">{qa.rejected} to reroll</span></>}{Number((qa as { failed_generation?: number } | null)?.failed_generation || 0) > 0 && <> · <span className="text-alert">{Number((qa as { failed_generation?: number }).failed_generation || 0)} did not render</span></>}.
            </span>
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Your creatives · {creatives.length}</div>
            <div className="flex items-center gap-1">
              {([ ["all", "All"], ["passed", "Good"], ["needs", "Needs reroll"] ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className={`rounded-md border px-2 py-1 text-[11px] ${view === k ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-faint hover:text-ink"}`}
                >{label}</button>
              ))}
            </div>
            {picked.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-dim">{picked.size} selected</span>
                {pickedTwoK && <button onClick={upscalePicked} className="rounded-md border border-[#a855f7]/50 px-2.5 py-1 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10">↑ Upscale to 4K</button>}
                <button onClick={markForVideo} className="rounded-md border border-ready/40 px-2.5 py-1 text-xs font-semibold text-ready hover:bg-ready/10">★ For video</button>
                <button onClick={removePicked} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-alert/50 hover:text-alert">Remove</button>
                <button onClick={() => setPicked(new Set())} className="text-xs text-ink-faint hover:text-ink">clear</button>
              </div>
            )}
          </div>
          <p className="mb-3 text-[11px] text-ink-faint">Shots render fast in 2K. Tick the keepers, then <span className="text-[#c79bff]">↑ Upscale to 4K</span> to finish only the ones you choose (no wasted cost). Upgraded shots move to 4K Finals. ★ keep your best for video, or remove the rest. Click an image to view full size and download.</p>
          {twoK.length > 0 && (
            <div className="mb-5">
              <div className="tabular mb-2 text-[10px] uppercase tracking-[0.2em] text-[#ff8a3c]">2K previews · {twoK.length}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{twoK.map(renderTile)}</div>
            </div>
          )}
          {fourK.length > 0 && (
            <div>
              <div className="tabular mb-2 text-[10px] uppercase tracking-[0.2em] text-ready">★ 4K finals · {fourK.length}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{fourK.map(renderTile)}</div>
            </div>
          )}
        </div>
      )}

      {/* Video production hand-off */}
      {videoSelects.length > 0 && (
        <div className="rounded-xl border border-ready/30 bg-ready/5 p-5">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ready">★ Selected for video production · {videoSelects.length}</div>
          <p className="mt-1 text-sm text-ink-dim">
            These shots are earmarked for video production and b-roll (a mix of scenes and angles makes the video stronger).
            The produce pipeline will pull them in when it arrives in the Studio.
          </p>
        </div>
      )}

      {zoom && <Lightbox url={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
