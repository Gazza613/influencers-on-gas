"use client";

import { useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import Uploader from "@/components/Uploader";

// Use the producer's OWN recorded voice as the voiceover: upload one recording of the script, Scribe
// aligns it to the scenes (server), then we slice the recording per scene in the browser (Web Audio)
// and save the pieces — so the real voice drives a-roll lip-sync + b-roll narration, no cloning.
function sliceToWav(buffer: AudioBuffer, start: number, end: number): Blob {
  const sr = buffer.sampleRate;
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.min(buffer.length, Math.floor(end * sr));
  const len = Math.max(0, s1 - s0);
  const chs = buffer.numberOfChannels || 1;
  const data = new Float32Array(len);
  for (let c = 0; c < chs; c++) { const cd = buffer.getChannelData(c); for (let i = 0; i < len; i++) data[i] += cd[s0 + i] / chs; } // mix to mono
  const dataSize = len * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);
  const w = (off: number, str: string) => { for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + dataSize, true); w(8, "WAVE");
  w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < len; i++) { const s = Math.max(-1, Math.min(1, data[i])); dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([ab], { type: "audio/wav" });
}

export default function VoiceoverUpload({ influencerId, presetUrl, onDone }: { influencerId: string; presetUrl?: string; onDone: () => void }) {
  const [url, setUrl] = useState(presetUrl || "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  async function process() {
    if (!url || busy) return;
    setBusy(true); setErr(""); setStatus("Transcribing your recording (Scribe)…");
    try {
      const a = await fetch(`/api/influencers/${influencerId}/voiceover/align`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioUrl: url }) }).then((x) => x.json());
      if (!a?.ranges?.length) throw new Error(a?.error || "Couldn't align the recording to the script.");
      setStatus("Slicing your voice per scene…");
      const ab = await fetch(`/api/media-proxy?url=${encodeURIComponent(url)}`, { cache: "no-store" }).then((r) => r.arrayBuffer());
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new AC();
      const buffer = await ctx.decodeAudioData(ab);
      const scene_audio: { scene: number; url: string; duration: number }[] = [];
      for (const r of a.ranges as { scene: number; start: number; end: number; duration: number }[]) {
        const wav = sliceToWav(buffer, r.start, r.end);
        const up = await blobUpload(`influencers/scene-vo/s${r.scene}.wav`, wav, { access: "public", handleUploadUrl: "/api/upload", clientPayload: "scene-vo" });
        scene_audio.push({ scene: r.scene, url: up.url, duration: r.duration });
        setStatus(`Slicing your voice per scene… ${scene_audio.length}/${a.ranges.length}`);
      }
      ctx.close().catch(() => {});
      setStatus("Saving…");
      const s = await fetch(`/api/influencers/${influencerId}/voiceover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene_audio, voiceover_url: url }) }).then((x) => x.json());
      if (!s?.scenes) throw new Error(s?.error || "Couldn't save the voiceover.");
      setStatus(""); setBusy(false); onDone();
    } catch (e) {
      setBusy(false); setStatus(""); setErr(String((e as Error)?.message || e).slice(0, 200));
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2/40 p-3">
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Or upload your own voiceover</div>
      {presetUrl
        ? <p className="mb-2 text-[12px] text-ink-dim">We&apos;ll use <b>the recording you scripted from</b> — slicing your real voice into each scene now (no AI voice, no cloning). Or upload a different recording below.</p>
        : <p className="mb-2 text-[12px] text-ink-dim">Record yourself reading the script and upload it — we transcribe it (Scribe), slice it per scene, and use <b>your real voice</b> for every scene (no AI voice, no cloning). What you record is what ships.</p>}
      {url && <p className="mb-2 text-[11px] text-ready">✓ Recording ready{presetUrl && url === presetUrl ? " (from the script step)" : ""}.</p>}
      <Uploader kind="my-vo" accept="audio" label={url ? "Upload a different recording" : "Upload your voiceover recording"} onUploaded={(u) => { setUrl(u); setErr(""); }} />
      {url && (
        <button onClick={process} disabled={busy} className="btn-brand mt-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{busy ? `🎙️ ${status || "Working…"}` : "Use my voice (slice per scene)"}</button>
      )}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}
    </div>
  );
}
