"use client";

import { useEffect, useState } from "react";

// Full-screen image OR video viewer with download. Close on Esc or backdrop click.
export default function Lightbox({ url, onClose, fill = false }: { url: string; onClose: () => void; fill?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function download() {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = url.split("/").pop()?.split("?")[0] || "frame.jpg";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6" onClick={onClose}>
      <div className="relative max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        {/* Spinner only for IMAGES (they pop in once decoded). Video streams natively - show it straight
            away with its own controls/buffering UI, never hidden behind a spinner (that read as "buffering forever"). */}
        {!loaded && !isVideo && (
          <div className="flex h-[60vh] w-[60vw] max-w-3xl items-center justify-center rounded-lg border border-line bg-surface-1">
            <span className="spinner-ring text-3xl text-[#c79bff]" />
          </div>
        )}
        {isVideo
          // fill = crop the raw clip to a 9:16 frame, exactly like the final stitch does - hides HeyGen Avatar
          // IV's baked-in pillarbox bars (Avatar IV renders 16:9 only) so the zoom matches the published cut.
          ? <video src={url} controls autoPlay playsInline preload="auto" className={fill ? "aspect-[9/16] max-h-[82vh] w-auto rounded-lg border border-line bg-black object-cover" : "max-h-[82vh] w-auto rounded-lg border border-line bg-black object-contain"} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt="frame" onLoad={() => setLoaded(true)} className={`max-h-[82vh] w-auto rounded-lg border border-line object-contain ${loaded ? "" : "hidden"}`} />}
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={download} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold">Download</button>
          <a href={url} target="_blank" rel="noopener" className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">Open original</a>
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">Close</button>
        </div>
      </div>
    </div>
  );
}
