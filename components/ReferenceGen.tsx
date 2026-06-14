"use client";

import { useEffect, useRef, useState } from "react";

type Ref = { url: string; hero?: boolean };

const EXPECTED_FRAMES = 6;

const GEN_QUIPS = [
  "Warming up the studio lights…",
  "Casting your influencer…",
  "Finding their best angle…",
  "Dialling in the lighting…",
  "Coaching the perfect smile…",
  "Steaming the wardrobe…",
  "Touching up for the camera…",
  "Locking in the look…",
  "Almost ready for the close-up…",
];
const TRAIN_QUIPS = [
  "Teaching every angle of this face…",
  "Memorising the smile…",
  "Building a face the camera will never forget…",
  "Locking the identity in for good…",
  "This one takes about 10 minutes — worth the wait…",
];

export default function ReferenceGen({
  influencerId,
  status,
  identityPrompt,
  lookRefs,
  soulId,
}: {
  influencerId: string;
  status: string;
  identityPrompt: string | null;
  lookRefs: Ref[];
  soulId: string | null;
}) {
  const [st, setSt] = useState(status);
  const [prompt, setPrompt] = useState(identityPrompt);
  const [frames, setFrames] = useState<Ref[]>(lookRefs || []);
  const [selected, setSelected] = useState<Set<string>>(new Set((lookRefs || []).map((r) => r.url)));
  const [trained, setTrained] = useState(!!soulId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [quip, setQuip] = useState(0);

  const TERMINAL = ["frames_ready", "ready", "gen_failed", "soul_failed"];
  const generating = busy && st !== "training";
  const training = st === "training";
  const activeQuips = training ? TRAIN_QUIPS : GEN_QUIPS;

  // Rotate the engaging copy while a job is running.
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (busy || training) {
      tick.current = setInterval(() => setQuip((q) => (q + 1) % activeQuips.length), 3500);
      return () => { if (tick.current) clearInterval(tick.current); };
    }
    setQuip(0);
  }, [busy, training, activeQuips.length]);

  async function poll(tries = 0): Promise<void> {
    // ~13 min ceiling: covers Inngest's startup delay + the ~3 min 6-frame set
    // (training keeps its own state via higgsfield_soul_id even past this).
    if (tries > 150) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      if (inf.persona?.identity_prompt) setPrompt(inf.persona.identity_prompt);
      if (Array.isArray(inf.look_refs) && inf.look_refs.length) {
        setFrames(inf.look_refs);
        setSelected((sel) => (sel.size ? sel : new Set(inf.look_refs.map((x: Ref) => x.url))));
      }
      setTrained(!!inf.higgsfield_soul_id);
      if (TERMINAL.includes(inf.status)) {
        if (inf.status === "gen_failed") setErr(inf.persona?.gen_error || "Generation failed");
        if (inf.status === "soul_failed") setErr(inf.persona?.soul_error || "Soul training failed");
        setBusy(false);
        return;
      }
    }
    return poll(tries + 1);
  }

  async function generate() {
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/generate`, { method: "POST" });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start generation"); setBusy(false); return; }
    setSt("generating"); poll();
  }

  async function train() {
    if (selected.size < 5 || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/train`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: [...selected] }),
    });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start training"); setBusy(false); return; }
    setSt("training"); poll();
  }

  const toggle = (url: string) => setSelected((s) => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); return n; });
  const pct = Math.min(100, Math.round((frames.length / EXPECTED_FRAMES) * 100));

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Identity generation</div>
        <span className={`text-xs ${st === "ready" || st === "frames_ready" ? "text-ready" : st.includes("failed") ? "text-alert" : "text-active"}`}>{st}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={generate} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {busy && !training ? "Generating…" : frames.length ? "Re-generate frames" : "Generate reference frames"}
        </button>
        {frames.length > 0 && !trained && (
          <button onClick={train} disabled={busy || selected.size < 5}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-line-strong disabled:opacity-50">
            {training ? "Training identity… (~10 min)" : `Train identity (${selected.size} selected)`}
          </button>
        )}
      </div>

      {(generating || training) && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink">{activeQuips[quip]}</span>
            {generating && <span className="tabular text-ink-faint">{frames.length}/{EXPECTED_FRAMES} frames</span>}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-1">
            {training ? (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            ) : frames.length > 0 ? (
              <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/4 animate-pulse rounded-full bg-accent" />
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            {training ? "Training the identity — this runs in the background, you can leave this page." : "Generating a consistent set — frames appear as they're ready."}
          </p>
        </div>
      )}

      {trained && !training && <p className="mt-2 text-xs text-ready">✓ Identity trained — the face below is now locked across every video.</p>}
      {frames.length > 0 && !trained && <p className="mt-2 text-[11px] text-ink-faint">All frames are the same person (hero + variations). Tap to deselect any odd ones, then train on 5–20.</p>}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}

      {frames.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {frames.map((f, i) => {
            const sel = selected.has(f.url);
            return (
              <button key={i} onClick={() => !trained && toggle(f.url)} className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`reference ${i + 1}`}
                  className={`aspect-[9/16] w-full rounded-lg border-2 object-cover transition ${sel && !trained ? "border-accent" : "border-line opacity-80"}`} />
                {!trained && (
                  <span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${sel ? "bg-accent text-white" : "bg-black/50 text-ink-faint"}`}>
                    {sel ? "✓" : ""}
                  </span>
                )}
                {f.hero && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Face</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {prompt && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11px] font-semibold text-ink-dim">Hyper-realism identity prompt</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-dim">{prompt}</pre>
        </details>
      )}
    </div>
  );
}
