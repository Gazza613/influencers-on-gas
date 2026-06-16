"use client";

import Link from "next/link";
import { useState } from "react";
import Lightbox from "@/components/Lightbox";
import Uploader from "@/components/Uploader";
import WorkingPanel from "@/components/WorkingPanel";
import { CREW } from "@/lib/crew";
import { flex, pick, PHOTO_LINES } from "@/lib/flex";

type Ref = { url: string; hero?: boolean };

const SET_TOTAL = 12; // chosen hero + 11 varied training frames (angle/light/expression/distance/hands/back)
const PHOTO_NARRATION = [
  "On set, locking the chosen face as the one true identity…",
  "Shooting the full turnaround: front, three-quarter, profile and back…",
  "Capturing close-up skin detail: pores, catchlights, the lot…",
  "Getting a clean hands frame so the fingers always come out right…",
  "Varying the light: soft daylight, warm indoor, golden hour…",
  "Catching real expressions: neutral, a smile, mid-conversation…",
  "Building a clean, forensic coverage set sharp enough to train a faithful Soul…",
];

export default function PhotoshootStep({
  influencerId, status: initialStatus, modelUrl, frames: initialFrames, selectedInit,
}: {
  influencerId: string;
  status: string;
  modelUrl: string | null;
  frames: Ref[];
  selectedInit: string[];
}) {
  const [st, setSt] = useState(initialStatus);
  const [frames, setFrames] = useState<Ref[]>(initialFrames || []);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedInit.length ? selectedInit : (initialFrames || []).map((f) => f.url)),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [locationRef, setLocationRef] = useState<string | null>(null);
  const [clothingRef, setClothingRef] = useState<string | null>(null);
  const [locationText, setLocationText] = useState("");
  const [clothingText, setClothingText] = useState("");
  const [broken, setBroken] = useState<Set<string>>(new Set());

  const hasSet = frames.length > 1;
  const building = st === "generating" || busy;

  async function poll(tries = 0): Promise<void> {
    if (tries > 200) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      if (Array.isArray(inf.look_refs) && inf.look_refs.length) {
        setFrames(inf.look_refs);
        setSelected((sel) => (sel.size ? sel : new Set(inf.look_refs.map((x: Ref) => x.url))));
      }
      if (inf.status === "gen_failed") { setErr(inf.persona?.gen_error || "The photoshoot stalled. Try again."); setBusy(false); return; }
      if (inf.status === "frames_ready") { flex(pick(PHOTO_LINES)); setBusy(false); return; }
    }
    return poll(tries + 1);
  }

  async function run() {
    if (!modelUrl || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/build`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chosenUrl: modelUrl, locationRef, clothingRef, locationText: locationText.trim(), clothingText: clothingText.trim() }),
    });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start the photoshoot"); setBusy(false); return; }
    setSt("generating"); setFrames([{ url: modelUrl, hero: true }]);
    flex(`${CREW.photoshoot.emoji} ${CREW.photoshoot.name}, your ${CREW.photoshoot.role}: ${CREW.photoshoot.greeting}`);
    poll();
  }

  function persist(next: Set<string>) {
    fetch(`/api/influencers/${influencerId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaPatch: { selected_frames: [...next] } }),
    }).catch(() => {});
  }
  const toggle = (url: string) => setSelected((s) => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); persist(n); return n; });

  const pct = Math.min(100, Math.round((frames.length / SET_TOTAL) * 100));

  if (!modelUrl) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
        <p className="text-sm text-ink-dim">Pick your model first, then come back for the photoshoot.</p>
        <Link href={`/setup/influencers/${influencerId}`} className="btn-brand mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold">← Back to casting</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* The model */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-1 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={modelUrl} alt="model" className="h-24 w-24 rounded-lg border border-line object-cover" />
        <div className="min-w-[200px] flex-1">
          <div className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">Your model</div>
          <p className="mt-1 text-sm text-ink-dim">
            This is the face every shot is built around. The photoshoot captures it across many angles, lighting setups,
            expressions and distances on a clean background, the proven recipe for a faithful identity. The face stays
            identical throughout, which is what lets your creatives restyle wardrobe and scenes freely afterwards.
          </p>
        </div>
      </div>

      {!hasSet && !building && (
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Photoshoot options (optional)</div>
          <p className="mt-1 text-[11px] text-ink-faint">Optional: feature a specific outfit or location in one of the shots, by uploading a reference <span className="text-ink-dim">or</span> describing it. The rest of the set still varies on purpose to build a flexible identity. Leave blank to let us choose.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Uploader kind="location" label="Location shot" current={locationRef} onUploaded={setLocationRef} />
              <input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="…or describe the location (e.g. a sunlit Cape Town café)"
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-[#a855f7]" />
            </div>
            <div className="space-y-2">
              <Uploader kind="clothing" label="Clothing style" current={clothingRef} onUploaded={setClothingRef} />
              <input value={clothingText} onChange={(e) => setClothingText(e.target.value)} placeholder="…or describe the outfit (e.g. cream linen suit, white trainers)"
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink outline-none focus:border-[#a855f7]" />
            </div>
          </div>
          <button onClick={run} className="btn-brand mt-4 rounded-lg px-4 py-2 text-sm font-bold">📸 Run the photoshoot</button>
        </div>
      )}

      {building && (
        <WorkingPanel title="Photoshoot" lines={PHOTO_NARRATION} crew={CREW.photoshoot} eta="about 2 min"
          pct={frames.length > 1 ? pct : null} sub={`${frames.length}/${SET_TOTAL} frames`}
          note="Angles, close-ups and your scene, frames appear as they land." />
      )}

      {err && <p className="text-xs text-alert">{err}</p>}

      {hasSet && (
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <p className="text-[11px] text-ink-faint">Every frame is the same person across different outfits and settings (that variety is intentional, it makes the identity flexible). Tap to deselect any odd ones, keep your strongest 5 or more, the sharper and more varied the set the better the lock-down.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {frames.map((f, i) => {
              const sel = selected.has(f.url);
              return (
                <div key={i} onClick={() => !broken.has(f.url) && toggle(f.url)} className="shimmer group relative block cursor-pointer overflow-hidden rounded-lg">
                  {broken.has(f.url) ? (
                    <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border-2 border-line bg-surface-2 px-2 text-center text-[10px] text-ink-faint">frame didn&apos;t load</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt={`frame ${i + 1}`} onError={() => setBroken((b) => new Set(b).add(f.url))}
                      className={`aspect-[9/16] w-full rounded-lg border-2 object-cover transition ${sel ? "border-[#a855f7]" : "border-line opacity-60"}`} />
                  )}
                  <span className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition ${sel ? "border-[#a855f7] bg-[#a855f7] text-white" : "border-white/60 bg-black/45 text-transparent"}`}>✓</span>
                  {f.hero && <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Chosen</span>}
                  <button onClick={(e) => { e.stopPropagation(); setZoom(f.url); }} title="View full size"
                    className="absolute bottom-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded-md bg-black/60 text-xs text-white group-hover:flex">⤢</button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-lg border border-ready/30 bg-ready/5 p-4">
            <p className="text-sm text-ink">
              {selected.size < 5
                ? `Select at least 5 frames to continue (${selected.size} so far).`
                : `${selected.size} frames selected. Last step: lock the identity down.`}
            </p>
            <Link
              href={`/setup/influencers/${influencerId}/lockdown`}
              aria-disabled={selected.size < 5}
              className={`mt-3 inline-block rounded-full px-5 py-2.5 text-sm font-bold ${selected.size < 5 ? "pointer-events-none bg-surface-2 text-ink-faint" : "next-pulse"}`}>
              Continue to lock down →
            </Link>
          </div>
        </div>
      )}

      {zoom && <Lightbox url={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
