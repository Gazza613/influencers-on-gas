"use client";

import { useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";

// Reusable image uploader → Vercel Blob (direct client upload, so large PNGs work).
// Drag/drop or click; shows a preview and a quirky uploading state. Calls onUploaded(url).
export default function Uploader({ kind = "ref", label, onUploaded, current }: { kind?: string; label: string; onUploaded: (url: string) => void; current?: string | null }) {
  const [url, setUrl] = useState<string | null>(current ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) { setErr("That's not an image. Pop in a JPG, PNG or WebP."); return; }
    if (file.size > 10 * 1024 * 1024) { setErr("That image is over 10MB. Pop in a smaller one."); return; }
    setBusy(true); setErr("");
    const safe = (file.name || "image").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40);
    try {
      const blob = await blobUpload(`influencers/${kind}/${safe}`, file, {
        access: "public", handleUploadUrl: "/api/upload", clientPayload: kind,
      });
      setUrl(blob.url); onUploaded(blob.url);
    } catch (e) {
      setErr(String((e as Error)?.message || e).slice(0, 160) || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onClick={() => !busy && ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
        className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 p-3 hover:border-line-strong"
      >
        {busy ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-1 text-[#c79bff]"><span className="spinner-ring text-xl" /></div>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="reference" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-1 text-lg text-ink-faint">📷</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink">{busy ? "Beaming it up…" : url ? `${label} ✓` : label}</div>
          <div className="text-[11px] text-ink-faint">{busy ? "Hang tight, uploading your image." : url ? "Tap to replace." : "Tap or drop an image (max 10MB)."}</div>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {err && <p className="mt-1 text-[11px] text-alert">{err}</p>}
    </div>
  );
}
