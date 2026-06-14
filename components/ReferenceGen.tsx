"use client";

import { useEffect, useRef, useState } from "react";

type Ref = { url: string; hero?: boolean };

const CAST_TOTAL = 6; // candidate looks to choose from
const SET_TOTAL = 9; // chosen hero + 6 face-coverage + 2 scene shots

const CAST_QUIPS = [
  "Casting your influencer…",
  "Auditioning some faces…",
  "Lining up the talent…",
  "Scouting the perfect look…",
  "Bringing the options to life…",
];
const BUILD_QUIPS = [
  "Locking in the chosen face…",
  "Shooting every angle…",
  "Getting the close-up skin detail…",
  "On location for the scene shots…",
  "Dialling in the lighting…",
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
  candidates: initialCandidates,
  lookRefs,
  soulId,
}: {
  influencerId: string;
  status: string;
  identityPrompt: string | null;
  candidates: Ref[];
  lookRefs: Ref[];
  soulId: string | null;
}) {
  const [st, setSt] = useState(status);
  const [prompt, setPrompt] = useState(identityPrompt);
  const [candidates, setCandidates] = useState<Ref[]>(initialCandidates || []);
  const [chosen, setChosen] = useState<string | null>(null);
  const [frames, setFrames] = useState<Ref[]>(lookRefs || []);
  const [selected, setSelected] = useState<Set<string>>(new Set((lookRefs || []).map((r) => r.url)));
  const [trained, setTrained] = useState(!!soulId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [quip, setQuip] = useState(0);

  const TERMINAL = ["cast_ready", "frames_ready", "ready", "gen_failed", "soul_failed"];
  const casting = st === "casting";
  const building = st === "generating";
  const training = st === "training";
  const hasSet = frames.length > 0;
  const activeQuips = training ? TRAIN_QUIPS : building ? BUILD_QUIPS : CAST_QUIPS;
  const working = busy || casting || building || training;

  // Rotate the engaging copy while a job runs.
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (working) {
      tick.current = setInterval(() => setQuip((q) => (q + 1) % activeQuips.length), 3500);
      return () => { if (tick.current) clearInterval(tick.current); };
    }
    setQuip(0);
  }, [working, activeQuips.length]);

  async function poll(tries = 0): Promise<void> {
    if (tries > 200) { setBusy(false); return; } // ~16 min ceiling
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      if (inf.persona?.identity_prompt) setPrompt(inf.persona.identity_prompt);
      if (Array.isArray(inf.persona?.candidates)) setCandidates(inf.persona.candidates);
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

  async function cast() {
    setBusy(true); setErr(""); setChosen(null);
    const r = await fetch(`/api/influencers/${influencerId}/generate`, { method: "POST" });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start casting"); setBusy(false); return; }
    setSt("casting"); setCandidates([]); poll();
  }

  async function build() {
    if (!chosen || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/build`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chosenUrl: chosen }),
    });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not build the identity set"); setBusy(false); return; }
    setSt("generating"); setFrames([{ url: chosen, hero: true }]); poll();
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
  const castPct = Math.min(100, Math.round((candidates.length / CAST_TOTAL) * 100));
  const setPct = Math.min(100, Math.round((frames.length / SET_TOTAL) * 100));

  // Cast board appears once candidates exist and we haven't built a set yet.
  const showChoose = !hasSet && candidates.length > 0 && !casting;

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">{hasSet ? "Photoshoot" : "Casting"}</div>
        <span className={`text-xs ${st === "ready" || st === "frames_ready" || st === "cast_ready" ? "text-ready" : st.includes("failed") ? "text-alert" : "text-active"}`}>{st}</span>
      </div>

      {/* Step hint */}
      <p className="mt-1 text-[11px] text-ink-faint">
        {trained && !training ? "Identity locked." :
         hasSet ? "Photoshoot — pick the best 5+ frames (face shots train the identity best), then train." :
         showChoose ? "Casting — choose your model. We’ll then run the photoshoot on that face." :
         "Casting — generate a set of looks, choose your model, then run the photoshoot & train."}
      </p>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {!hasSet && (
          <button onClick={cast} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {casting ? "Casting…" : candidates.length ? "Re-cast looks" : "Generate looks"}
          </button>
        )}
        {showChoose && (
          <button onClick={build} disabled={busy || !chosen}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-line-strong disabled:opacity-50">
            {chosen ? "Start photoshoot with this model →" : "Pick a model to continue"}
          </button>
        )}
        {hasSet && !trained && (
          <button onClick={train} disabled={busy || selected.size < 5}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {training ? "Training identity… (~10 min)" : `Train identity (${selected.size} selected)`}
          </button>
        )}
      </div>

      {/* Progress */}
      {working && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink">{activeQuips[quip]}</span>
            {casting && <span className="tabular text-ink-faint">{candidates.length}/{CAST_TOTAL} looks</span>}
            {building && <span className="tabular text-ink-faint">{frames.length}/{SET_TOTAL} frames</span>}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-1">
            {training ? (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            ) : casting ? (
              candidates.length ? <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${castPct}%` }} /> : <div className="h-full w-1/4 animate-pulse rounded-full bg-accent" />
            ) : building ? (
              frames.length ? <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${setPct}%` }} /> : <div className="h-full w-1/4 animate-pulse rounded-full bg-accent" />
            ) : <div className="h-full w-1/4 animate-pulse rounded-full bg-accent" />}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            {training ? "Training runs in the background — you can leave this page." :
             building ? "Photoshoot in progress — angles, close-ups & your scene. Frames appear as they’re ready." :
             "Casting looks — they appear as they’re ready."}
          </p>
        </div>
      )}

      {trained && !training && <p className="mt-3 text-xs text-ready">✓ Identity trained — the chosen face is now locked across every video.</p>}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}

      {/* Casting board — choose one */}
      {!hasSet && candidates.length > 0 && (
        <>
          <p className="mt-4 text-[11px] font-semibold text-ink-dim">Choose the face {chosen ? "" : "(tap one)"}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {candidates.map((c, i) => {
              const sel = chosen === c.url;
              return (
                <button key={i} onClick={() => !busy && setChosen(c.url)} className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={`look ${i + 1}`}
                    className={`aspect-[9/16] w-full rounded-lg border-2 object-cover transition ${sel ? "border-accent" : "border-line opacity-80 hover:opacity-100"}`} />
                  {sel && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] text-white">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Identity set — select frames for training */}
      {hasSet && (
        <>
          {!trained && <p className="mt-4 text-[11px] text-ink-faint">All frames are the same chosen person. Tap to deselect any odd ones, then train on 5–20.</p>}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {frames.map((f, i) => {
              const sel = selected.has(f.url);
              return (
                <button key={i} onClick={() => !trained && toggle(f.url)} className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`frame ${i + 1}`}
                    className={`aspect-[9/16] w-full rounded-lg border-2 object-cover transition ${sel && !trained ? "border-accent" : "border-line opacity-80"}`} />
                  {!trained && (
                    <span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${sel ? "bg-accent text-white" : "bg-black/50 text-ink-faint"}`}>{sel ? "✓" : ""}</span>
                  )}
                  {f.hero && <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Chosen</span>}
                </button>
              );
            })}
          </div>
        </>
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
