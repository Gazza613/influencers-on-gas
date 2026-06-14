"use client";

import { useState } from "react";

type Voice = { voice_id: string; name: string; labels: Record<string, string> };

export default function VoicePicker({ influencerId, voiceId }: { influencerId: string; voiceId: string | null }) {
  const [current, setCurrent] = useState(voiceId);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    setOpen(false);
  }

  const currentName = voices?.find((v) => v.voice_id === current)?.name;

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="text-[11px] text-ink-dim">Voice (ElevenLabs)</div>
      <div className={`mt-1 text-sm font-semibold ${current ? "text-ready" : "text-ink-faint"}`}>
        {current ? `Ready ✓${currentName ? " — " + currentName : ""}` : "Not assigned"}
      </div>
      {!open && (
        <button onClick={load} disabled={busy} className="mt-2 rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-ink">
          {busy ? "Loading…" : current ? "Change voice" : "Assign voice"}
        </button>
      )}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}
      {open && voices && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-line">
          {voices.length === 0 && <div className="p-2 text-xs text-ink-faint">No voices on the account.</div>}
          {voices.map((v) => (
            <button
              key={v.voice_id}
              onClick={() => pick(v.voice_id)}
              disabled={busy}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-surface-2 ${current === v.voice_id ? "text-ready" : "text-ink"}`}
            >
              <span>{v.name}</span>
              {current === v.voice_id && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
