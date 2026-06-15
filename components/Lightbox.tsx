"use client";

import { useEffect } from "react";

// Full-screen image viewer with download. Close on Esc or backdrop click.
export default function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="frame" className="max-h-[82vh] w-auto rounded-lg border border-line object-contain" />
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={download} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">Download</button>
          <a href={url} target="_blank" rel="noopener" className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">Open original</a>
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">Close</button>
        </div>
      </div>
    </div>
  );
}
