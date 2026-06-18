"use client";

import { useEffect, useRef, useState } from "react";

type Voice = { id: string; name: string; preview: string | null };
type Clip = { id?: string; url?: string | null; line?: string; ratio?: string; status?: string; error?: string | null };

export default function VideoStudio({ influencerId, name, mode, initial }: {
  influencerId: string;
  name: string;
  mode: string;
  initial: { voice: Voice | null; aroll: Clip[]; signatureLine: string };
}) {
  const [voice, setVoice] = useState<Voice | null>(initial.voice);
  const [clips, setClips] = useState<Clip[]>(initial.aroll || []);
  const [line, setLine] = useState(initial.signatureLine || "");
  const [ratio, setRatio] = useState<"9:16" | "1:1">("9:16");
  const [voicing, setVoicing] = useState(false);
  const [gen, setGen] = useState(false);
  const [err, setErr] = useState("");

  const polling = useRef(false);
  const running = clips.some((c) => c.status === "running");

  useEffect(() => { if (running && !polling.current) poll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [running]);

  async function poll() {
    polling.current = true;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const d = await fetch(`/api/influencers/${influencerId}/aroll`).then((r) => r.json()).catch(() => null);
      if (d?.aroll) {
        setClips(d.aroll);
        if (d.voice) setVoice(d.voice);
        if (!d.aroll.some((c: Clip) => c.status === "running")) break;
      }
    }
    polling.current = false;
  }

  async function makeVoice() {
    setVoicing(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/voice`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto" }),
    }).then((x) => x.json()).catch(() => null);
    setVoicing(false);
    if (r?.voice_id) setVoice({ id: r.voice_id, name: r.voice_name, preview: r.preview_url ?? null });
    else setErr(r?.error || "Could not set up the voice.");
  }

  async function generate() {
    if (!line.trim() || gen) return;
    setGen(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/aroll`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line: line.trim(), ratio }),
    }).then((x) => x.json()).catch(() => null);
    setGen(false);
    if (r?.queued) { const d = await fetch(`/api/influencers/${influencerId}/aroll`).then((x) => x.json()).catch(() => null); if (d?.aroll) setClips(d.aroll); }
    else setErr(r?.error || "Could not start the clip.");
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">Video & Voice · a-roll</div>
        <p className="mt-2 text-sm text-ink-dim">Give {name} a voice, then generate a talking clip of {name} saying any line, lip-synced from the locked identity. Clips take a few minutes and appear below.</p>
      </div>

      {/* Voice */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular mb-2 text-xs uppercase tracking-[0.2em] text-ink-faint">① Voice</div>
        {voice ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg border border-ready/40 bg-ready/10 px-3 py-1.5 text-sm font-semibold text-ready">🔊 {voice.name}</span>
            {voice.preview && <audio src={voice.preview} controls className="h-9" />}
            <button onClick={makeVoice} disabled={voicing} className="text-xs text-ink-faint hover:text-ink disabled:opacity-50">{voicing ? "…" : "Change voice"}</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={makeVoice} disabled={voicing} className="btn-brand rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50">{voicing ? "Setting up…" : `Give ${name} a voice`}</button>
            <span className="text-[13px] text-ink-faint">{mode === "twin" ? "A matched voice for now; voice cloning from your own samples is coming next." : "A natural voice matched to this influencer."}</span>
          </div>
        )}
      </div>

      {/* A-roll */}
      <div className={`rounded-xl border border-line bg-surface-1 p-5 ${voice ? "" : "pointer-events-none opacity-50"}`}>
        <div className="tabular mb-2 text-xs uppercase tracking-[0.2em] text-ink-faint">② Talking clip (a-roll)</div>
        <textarea value={line} onChange={(e) => setLine(e.target.value)} rows={3} placeholder={`What should ${name} say to camera?`}
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(["9:16", "1:1"] as const).map((r) => (
              <button key={r} onClick={() => setRatio(r)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${ratio === r ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{r}</button>
            ))}
          </div>
          <button onClick={generate} disabled={!voice || !line.trim() || gen} className="btn-brand rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50">{gen ? "Starting…" : "🎬 Generate talking clip"}</button>
          <span className="text-[13px] text-ink-faint">Renders in a few minutes.</span>
        </div>
      </div>

      {err && <p className="text-xs text-alert">{err}</p>}

      {/* Clips */}
      {clips.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Clips · {clips.length}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clips.map((c, i) => (
              <div key={c.id || i} className="overflow-hidden rounded-lg border border-line bg-surface-2">
                {c.status === "ready" && c.url ? (
                  <video src={c.url} controls playsInline className="aspect-[9/16] w-full bg-black object-cover" />
                ) : c.status === "failed" ? (
                  <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 p-3 text-center text-[11px] text-ink-faint">
                    <span className="rounded bg-alert/20 px-2 py-0.5 text-[10px] font-semibold text-alert">clip failed</span>
                    <span>{c.error || "render failed"}</span>
                  </div>
                ) : (
                  <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 bg-black/40 text-center text-[11px] text-white/80">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span className="font-semibold">Rendering…</span>
                    <span className="text-white/60">a few minutes</span>
                  </div>
                )}
                <div className="p-2.5 text-[12px] text-ink-dim"><span className="tabular text-[10px] text-ink-faint">{c.ratio || "9:16"}</span> · {c.line}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
