"use client";

import { useRef, useState } from "react";

type Voice = { voice_id: string; name: string; labels: Record<string, string>; preview_url: string | null };

export default function VoicePicker({ influencerId, voiceId }: { influencerId: string; voiceId: string | null }) {
  const [current, setCurrent] = useState(voiceId);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function load() {
    setErr("");
    setBusy(true);
    const r = await fetch("/api/voices", { cache: "no-store" });
    setBusy(false);
    if (r.ok) {
      setVoices((await r.json()).voices);
      setOpen(true);
    } else {
      setErr((await r.json().catch(() => ({})))?.error || "Could not load voices");
    }
  }

  async function pick(id: string) {
    setBusy(true);
    await fetch(`/api/influencers/${influencerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: id }),
    });
    setBusy(false);
    setCurrent(id);
  }

  function preview(v: Voice) {
    if (audioRef.current) audioRef.current.pause();
    if (playing === v.voice_id) { setPlaying(null); return; }
    if (!v.preview_url) return;
    const a = new Audio(v.preview_url);
    audioRef.current = a;
    setPlaying(v.voice_id);
    a.onended = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
  }

  const currentName = voices?.find((v) => v.voice_id === current)?.name;
  const labelLine = (v: Voice) =>
    [v.labels?.accent, v.labels?.age, v.labels?.gender, v.labels?.use_case].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="text-[11px] text-ink-dim">Voice</div>
      <div className={`mt-1 text-sm font-semibold ${current ? "text-ready" : "text-ink-faint"}`}>
        {current ? `Ready ✓${currentName ? " — " + currentName : ""}` : "Not assigned"}
      </div>
      {!open && (
        <button onClick={load} disabled={busy} className="mt-2 rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-ink">
          {busy ? "Loading…" : current ? "Change voice" : "Choose a voice"}
        </button>
      )}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}
      {open && voices && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
          {voices.length === 0 && <div className="p-3 text-xs text-ink-faint">No voices available.</div>}
          {voices.map((v) => (
            <div key={v.voice_id} className={`flex items-center gap-2 border-b border-line/50 px-3 py-2 last:border-0 ${current === v.voice_id ? "bg-surface-2" : ""}`}>
              <button
                onClick={() => preview(v)}
                disabled={!v.preview_url}
                title={v.preview_url ? "Preview" : "No preview available"}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-[11px] hover:border-line-strong disabled:opacity-30"
              >
                {playing === v.voice_id ? "❚❚" : "▶"}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink">{v.name}</div>
                {labelLine(v) && <div className="truncate text-[10px] capitalize text-ink-faint">{labelLine(v)}</div>}
              </div>
              <button
                onClick={() => pick(v.voice_id)}
                disabled={busy}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${current === v.voice_id ? "text-ready" : "bg-accent text-white"}`}
              >
                {current === v.voice_id ? "Selected ✓" : "Select"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
