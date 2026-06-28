"use client";

import { useEffect, useRef, useState } from "react";
import type { ShowcaseVideo } from "@/lib/showcase";

// Many reels open on a black intro fade, so frame 0 is black. Rest the tile on a real content frame
// (~1-2s in) instead, so previews never show a black screen.
const POSTER_T = (el: HTMLVideoElement) => {
  const d = el.duration;
  return Number.isFinite(d) && d > 0 ? Math.min(2, d * 0.2) : 1.2;
};

// Premium, client-facing reel: tiles preview muted on hover; tap the speaker to play WITH SOUND right in
// the grid (one at a time), or click the tile for a full-size player.
export default function ShowcaseReel({ videos }: { videos: ShowcaseVideo[] }) {
  const [active, setActive] = useState<ShowcaseVideo | null>(null);
  const [soundId, setSoundId] = useState<string | null>(null); // the single tile currently playing with sound
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {videos.map((v) => (
          <Tile
            key={v.id}
            v={v}
            soundOn={soundId === v.id}
            onSound={(on) => setSoundId(on ? v.id : null)}
            onOpen={() => { setSoundId(null); setActive(v); }}
          />
        ))}
      </div>
      {active && (
        <div onClick={() => setActive(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="relative">
            <video
              src={active.final_video_url ?? undefined}
              poster={active.poster_url || undefined}
              controls autoPlay playsInline
              onEnded={(e) => { const el = e.currentTarget; el.currentTime = POSTER_T(el); el.pause(); }}
              className="aspect-[9/16] max-h-[88vh] rounded-2xl bg-black shadow-[0_30px_120px_rgba(168,85,247,0.35)]"
            />
            {active.title && <div className="mt-3 text-center text-sm font-semibold text-white/80">{active.title}</div>}
            <button onClick={() => setActive(null)} aria-label="Close" className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-base font-bold text-black shadow-lg">✕</button>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ v, onOpen, soundOn, onSound }: { v: ShowcaseVideo; onOpen: () => void; soundOn: boolean; onSound: (on: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Keep the element's muted state in sync with the single-sound selection; when sound turns on, play it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = !soundOn;
    if (soundOn) el.play().catch(() => {});
  }, [soundOn]);
  return (
    <div className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition duration-300 hover:-translate-y-1 hover:border-[#a855f7]/60 hover:shadow-[0_24px_70px_rgba(168,85,247,0.3)]">
      <video
        ref={ref}
        src={v.final_video_url ?? undefined}
        poster={v.poster_url || undefined}
        muted playsInline preload={v.poster_url ? "metadata" : "auto"}
        onLoadedMetadata={v.poster_url ? undefined : (e) => { const el = e.currentTarget; el.currentTime = POSTER_T(el); }}
        onLoadedData={v.poster_url ? undefined : (e) => { const el = e.currentTarget; if (el.currentTime < 0.05) el.currentTime = POSTER_T(el); }}
        onMouseEnter={() => { const el = ref.current; if (el) el.play().catch(() => {}); }}
        onMouseLeave={() => { const el = ref.current; if (el && !soundOn) { el.pause(); el.currentTime = POSTER_T(el); } }}
        onEnded={(e) => {
          // Finished: rest on a CONTENT frame (never a black start/end frame). A muted hover-preview
          // loops from there; a sound-on play resets, pauses and clears the sound.
          const el = e.currentTarget; el.currentTime = POSTER_T(el);
          if (soundOn) { el.pause(); onSound(false); } else { el.play().catch(() => {}); }
        }}
        onClick={onOpen}
        className="h-full w-full cursor-zoom-in object-cover transition duration-500 group-hover:scale-[1.03]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />

      {/* Sound toggle - play with audio right in the grid, no need to open it */}
      <button
        onClick={(e) => { e.stopPropagation(); onSound(!soundOn); }}
        aria-label={soundOn ? "Mute" : "Play with sound"}
        className={`absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full text-sm backdrop-blur transition ${soundOn ? "bg-gradient-to-br from-[#a855f7] to-[#60a5fa] text-white shadow-[0_0_16px_rgba(168,85,247,0.6)]" : "bg-black/55 text-white hover:bg-black/75"}`}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>

      {/* Expand affordance - small eye, always visible */}
      <button onClick={onOpen} aria-label="Expand" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-xs text-white/90 backdrop-blur transition hover:bg-black/70">👁</button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pr-12 text-left">
        <div className="truncate text-[13px] font-bold text-white drop-shadow">{v.title || "Untitled"}</div>
      </div>
    </div>
  );
}
