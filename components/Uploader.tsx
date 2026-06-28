"use client";

import { useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";

// Reusable image uploader → Vercel Blob (direct client upload, so large PNGs work).
// Drag/drop or click; shows a preview and a quirky uploading state. Calls onUploaded(url).
// Capture a real, NON-BLACK still from a video FILE (locally, before upload) so a tile never sits on a
// black intro frame. Same-origin blob: URL → canvas isn't tainted → we can read pixels + export a JPEG.
// Robust to two failure modes: (1) drawing before the seeked frame is painted — we wait for the actual
// frame via requestVideoFrameCallback; (2) the sampled point being dark — we measure brightness and try
// several timestamps, keeping the brightest.
export async function capturePoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false;
    let objUrl = "";
    const finish = (b: Blob | null) => { if (settled) return; settled = true; if (objUrl) URL.revokeObjectURL(objUrl); resolve(b); };
    try {
      objUrl = URL.createObjectURL(file);
      const vid = document.createElement("video");
      vid.muted = true; vid.preload = "auto"; vid.playsInline = true; vid.src = objUrl;
      const points = [0.25, 0.45, 0.6, 0.12, 0.8];
      let pi = 0, dur = 5;
      let best: { blob: Blob; bright: number } | null = null;

      const seekNext = () => { try { vid.currentTime = Math.max(0.1, Math.min(dur - 0.1, dur * points[pi])); } catch { finish(best?.blob ?? null); } };

      const grab = () => {
        try {
          const w = vid.videoWidth || 720, h = vid.videoHeight || 1280;
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d"); if (!ctx) return finish(null);
          ctx.drawImage(vid, 0, 0, w, h);
          // Average brightness from a tiny downscale (cheap).
          const sw = 32, sh = 56, s = document.createElement("canvas"); s.width = sw; s.height = sh;
          const sctx = s.getContext("2d"); let bright = 999;
          if (sctx) { sctx.drawImage(vid, 0, 0, sw, sh); const d = sctx.getImageData(0, 0, sw, sh).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; bright = sum / ((d.length / 4) * 3); }
          c.toBlob((blob) => {
            if (blob && (!best || bright > best.bright)) best = { blob, bright };
            if (bright > 30 || pi >= points.length - 1) finish(best?.blob ?? blob);
            else { pi++; seekNext(); }
          }, "image/jpeg", 0.82);
        } catch { finish(best?.blob ?? null); }
      };

      const onSeeked = () => {
        const rvfc = (vid as unknown as { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback;
        if (typeof rvfc === "function") rvfc.call(vid, () => grab());
        else requestAnimationFrame(() => requestAnimationFrame(grab));
      };
      vid.onloadeddata = () => { dur = vid.duration || 5; pi = 0; seekNext(); };
      vid.onseeked = onSeeked;
      vid.onerror = () => finish(best?.blob ?? null);
      setTimeout(() => finish(best?.blob ?? null), 12000); // never hang the upload
    } catch { finish(null); }
  });
}

export default function Uploader({ kind = "ref", label, onUploaded, current, multiple = false, accept = "image", withPoster = false }: { kind?: string; label: string; onUploaded: (url: string, posterUrl?: string) => void; current?: string | null; multiple?: boolean; accept?: "image" | "audio" | "video"; withPoster?: boolean }) {
  const [url, setUrl] = useState<string | null>(current ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const isAudio = accept === "audio";
  const isVideo = accept === "video";
  const maxMb = isVideo ? 60 : isAudio ? 25 : 10;

  async function uploadOne(file: File): Promise<boolean> {
    const prefix = isAudio ? "audio/" : isVideo ? "video/" : "image/";
    if (!file.type.startsWith(prefix)) { setErr(isAudio ? "That's not audio. Pop in an MP3, WAV or M4A." : isVideo ? "That's not a video. Pop in an MP4 or MOV." : "That's not an image. Pop in a JPG, PNG or WebP."); return false; }
    if (file.size > maxMb * 1024 * 1024) { setErr(`"${file.name}" is over ${maxMb}MB. Pop in a smaller one.`); return false; }
    const safe = (file.name || (isAudio ? "audio" : isVideo ? "video" : "image")).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40);
    const blob = await blobUpload(`influencers/${kind}/${safe}`, file, {
      access: "public", handleUploadUrl: "/api/upload", clientPayload: kind,
    });
    // For videos, capture + upload a poster still so the thumbnail never shows a black frame.
    let posterUrl: string | undefined;
    if (withPoster && isVideo) {
      const pb = await capturePoster(file).catch(() => null);
      if (pb) {
        try {
          const pf = await blobUpload(`influencers/${kind}-poster/${safe}.jpg`, pb, { access: "public", handleUploadUrl: "/api/upload", clientPayload: `${kind}-poster` });
          posterUrl = pf.url;
        } catch { /* poster is best-effort */ }
      }
    }
    onUploaded(blob.url, posterUrl);
    if (!multiple) setUrl(blob.url); // single mode shows the preview; multiple stays ready
    return true;
  }

  async function handle(files: File[]) {
    if (!files.length) return;
    setBusy(true); setErr("");
    try {
      // Bulk: upload every selected/dropped image (sequential, so errors are clear).
      for (const f of (multiple ? files : files.slice(0, 1))) {
        try { await uploadOne(f); } catch (e) { setErr(String((e as Error)?.message || e).slice(0, 160) || "Upload failed"); }
      }
    } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }

  const showPreview = !multiple && url;
  return (
    <div>
      <div
        onClick={() => !busy && ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handle(Array.from(e.dataTransfer.files || [])); }}
        className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 p-3 hover:border-line-strong"
      >
        {busy ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-1 text-[#c79bff]"><span className="spinner-ring text-xl" /></div>
        ) : showPreview && isAudio ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-1 text-lg text-[#c79bff]">🎙️</div>
        ) : showPreview && isVideo ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-1 text-lg text-[#c79bff]">🎬</div>
        ) : showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url!} alt="reference" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-1 text-lg text-ink-faint">{multiple ? "＋" : isAudio ? "🎙️" : isVideo ? "🎬" : "📷"}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink">{busy ? "Beaming them up…" : showPreview ? `${label} ✓` : label}</div>
          <div className="text-[11px] text-ink-faint">{busy ? "Hang tight, uploading." : showPreview ? "Tap to replace." : isAudio ? `Tap or drop your VO file (MP3/WAV, max ${maxMb}MB).` : isVideo ? `Tap or drop a video (MP4/MOV, max ${maxMb}MB).` : multiple ? "Tap to choose several, or drop images here (max 10MB each)." : "Tap or drop an image (max 10MB)."}</div>
          {showPreview && isAudio && <audio src={url!} controls className="mt-1 h-7 w-full" onClick={(e) => e.stopPropagation()} />}
          {showPreview && isVideo && <video src={url!} controls className="mt-1 max-h-32 rounded" onClick={(e) => e.stopPropagation()} />}
        </div>
      </div>
      <input ref={ref} type="file" accept={isAudio ? "audio/*" : isVideo ? "video/*" : "image/*"} multiple={multiple} className="hidden" onChange={(e) => handle(Array.from(e.target.files || []))} />
      {err && <p className="mt-1 text-[11px] text-alert">{err}</p>}
    </div>
  );
}
