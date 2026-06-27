"use client";

import { useRef, useState } from "react";
import type { ShowcaseVideo } from "@/lib/showcase";

// Premium, client-facing reel: each tile plays muted on hover, click opens a full-size player with sound.
export default function ShowcaseReel({ videos }: { videos: ShowcaseVideo[] }) {
  const [active, setActive] = useState<ShowcaseVideo | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {videos.map((v) => <Tile key={v.id} v={v} onOpen={() => setActive(v)} />)}
      </div>
      {active && (
        <div onClick={() => setActive(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="relative">
            <video src={active.final_video_url ?? undefined} controls autoPlay playsInline className="aspect-[9/16] max-h-[88vh] rounded-2xl bg-black shadow-[0_30px_120px_rgba(168,85,247,0.35)]" />
            {active.title && <div className="mt-3 text-center text-sm font-semibold text-white/80">{active.title}</div>}
            <button onClick={() => setActive(null)} aria-label="Close" className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-base font-bold text-black shadow-lg">✕</button>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ v, onOpen }: { v: ShowcaseVideo; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => { const el = ref.current; if (el) { el.currentTime = 0; el.play().catch(() => {}); } }}
      onMouseLeave={() => { const el = ref.current; if (el) { el.pause(); } }}
      className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition duration-300 hover:-translate-y-1 hover:border-[#a855f7]/60 hover:shadow-[0_24px_70px_rgba(168,85,247,0.3)]"
    >
      <video ref={ref} src={v.final_video_url ?? undefined} muted loop playsInline preload="metadata" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />
      <div className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-sm text-white opacity-0 backdrop-blur transition group-hover:opacity-100">▶</div>
      <div className="absolute inset-x-0 bottom-0 p-3 text-left">
        <div className="truncate text-[13px] font-bold text-white drop-shadow">{v.title || "Untitled"}</div>
      </div>
    </button>
  );
}
