"use client";

import { useState, type ReactNode } from "react";
import Uploader from "@/components/Uploader";
import Lightbox from "@/components/Lightbox";

type Scene = {
  beat: string; role: "a-roll" | "b-roll" | "graphic"; start: string; end: string; location: string;
  talent: string[]; shot: string; blocking: string; performance: string; graphics: string[];
  vo_line: string; caption: string; motion_prompt: string; music_sfx: string; transition: string;
  vo_audio_url?: string; phone_screen_url?: string;
};
type Storyboard = { title: string; format: string; duration_seconds: number; tone: string; music_bed: string; full_vo: string; legal: string; scenes: Scene[] };
type Shot = { scene: number; role: string; beat: string; url: string | null; error?: string | null; reshooting?: boolean };
type Clip = { scene: number; role: string; beat: string; kind: string; url: string | null; status: string; error?: string | null };
type Production = { brief?: Record<string, unknown>; storyboard?: Storyboard; status?: string; shots?: Shot[]; shots_status?: string; clips?: Clip[]; clips_status?: string; final_url?: string | null; assembly_status?: string; assembly_error?: string | null; showreel_status?: string; music_url?: string | null; ambient_url?: string | null; audio_status?: string } | null;

const ROLE = {
  "a-roll": { label: "A-ROLL · presenter", cls: "bg-[#a855f7]/15 text-[#c79bff] border-[#a855f7]/30" },
  "b-roll": { label: "B-ROLL · scene", cls: "bg-[#60a5fa]/15 text-[#93c5fd] border-[#60a5fa]/30" },
  graphic: { label: "GRAPHIC", cls: "bg-active/15 text-active border-active/30" },
} as const;

export default function ProducerStudio({ influencerId, name, initialProduction, initialVoiceId = "", initialVoiceName = "" }: { influencerId: string; name: string; initialProduction: Production; initialVoiceId?: string; initialVoiceName?: string }) {
  const [production, setProduction] = useState<Production>(initialProduction);
  const [voiceId, setVoiceId] = useState(initialVoiceId);
  const [voiceName, setVoiceName] = useState(initialVoiceName);
  const [voiceBusy, setVoiceBusy] = useState(false);
  async function autoVoice() {
    setVoiceBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto" }) }).then((x) => x.json()).catch(() => null);
    setVoiceBusy(false);
    if (r?.voice_id) { setVoiceId(r.voice_id); setVoiceName(r.voice_name || "Matched voice"); } else setErr(r?.error || "Couldn't auto-match a voice. Try Video & Voice.");
  }
  const [editing, setEditing] = useState(!initialProduction?.storyboard);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [brand, setBrand] = useState(String((initialProduction?.brief as { brand?: string })?.brand || ""));
  const [offer, setOffer] = useState(String((initialProduction?.brief as { offer?: string })?.offer || ""));
  const [benefits, setBenefits] = useState(String((initialProduction?.brief as { benefits?: string })?.benefits || ""));
  const [cta, setCta] = useState(String((initialProduction?.brief as { cta?: string })?.cta || ""));
  const [ctaCode, setCtaCode] = useState(String((initialProduction?.brief as { ctaCode?: string })?.ctaCode || ""));
  const [duration, setDuration] = useState<number>(Number((initialProduction?.brief as { durationSeconds?: number })?.durationSeconds) || 45);
  const [format, setFormat] = useState<"9:16" | "1:1">("9:16");
  const [setting, setSetting] = useState(String((initialProduction?.brief as { setting?: string })?.setting || ""));
  const [tone, setTone] = useState(String((initialProduction?.brief as { tone?: string })?.tone || "warm, confident, effortless"));
  const [logo, setLogo] = useState(String((initialProduction?.brief as { logo?: string })?.logo || ""));
  const [legal, setLegal] = useState(String((initialProduction?.brief as { legal?: string })?.legal || ""));
  const [clothingRef, setClothingRef] = useState<string | null>(String((initialProduction?.brief as { clothingRef?: string })?.clothingRef || "") || null);
  const [locationRef, setLocationRef] = useState<string | null>(String((initialProduction?.brief as { locationRef?: string })?.locationRef || "") || null);
  const [logoUrl, setLogoUrl] = useState<string | null>(String((initialProduction?.brief as { logoUrl?: string })?.logoUrl || "") || null);
  const [promoUrl, setPromoUrl] = useState<string | null>(String((initialProduction?.brief as { promoUrl?: string })?.promoUrl || "") || null);
  const [captions, setCaptions] = useState<boolean>((initialProduction?.brief as { captions?: boolean })?.captions !== false);

  const sb = production?.storyboard;
  const shots = production?.shots ?? [];
  const shooting = production?.shots_status === "running";
  const shotFor = (i: number) => shots.find((s) => s.scene === i);
  const clips = production?.clips ?? [];
  const rendering = production?.clips_status === "running";
  const clipFor = (i: number) => clips.find((c) => c.scene === i);
  const shotsReady = shots.some((s) => s.url);
  const needsVoice = !!sb && sb.scenes.some((s) => s.role === "a-roll" && (s.vo_line || "").trim().length > 0);
  const voiceMissing = needsVoice && !voiceId;
  const assembling = production?.assembly_status === "running";
  const finalUrl = production?.final_url || null;

  // ── 8-step wizard state ───────────────────────────────────────────────────
  const sceneList = sb?.scenes ?? [];
  const aRollIdx = sceneList.map((s, i) => ({ s, i })).filter((x) => x.s.role === "a-roll");
  const bRollIdx = sceneList.map((s, i) => ({ s, i })).filter((x) => x.s.role === "b-roll");
  const clipDone = (idx: number) => clips.some((c) => c.scene === idx && c.url);
  const aRollNone = !!sb && aRollIdx.length === 0;
  const bRollNone = !!sb && bRollIdx.length === 0;
  const aRollReady = !!sb && (aRollNone || (aRollIdx.length > 0 && aRollIdx.every((x) => clipDone(x.i))));
  const bRollReady = !!sb && (bRollNone || (bRollIdx.length > 0 && bRollIdx.every((x) => clipDone(x.i))));
  const audioBusy = production?.audio_status === "running";
  const audioReady = production?.audio_status === "done" && !!(production?.music_url || production?.ambient_url);
  // Artifact-ready per step (the natural gate). "done" tick shows once approved.
  const ready: Record<string, boolean> = {
    concept: !!sb, voice: !voiceMissing && !!sb, keyframes: shotsReady,
    aroll: aRollReady, broll: bRollReady, audio: audioReady, stitch: !!finalUrl,
    showreel: production?.showreel_status === "accepted" || production?.showreel_status === "declined",
  };
  const ORDER = ["concept", "voice", "keyframes", "aroll", "broll", "audio", "stitch", "showreel"] as const;
  // Seed approvals: any step whose SUCCESSOR already has its artifact is auto-approved (you moved
  // past it); the frontier step waits for an explicit Accept. Recomputed when production changes.
  const seedApproved = () => {
    const set = new Set<string>();
    ORDER.forEach((k, idx) => { const next = ORDER[idx + 1]; if (next && ready[next]) set.add(k); });
    return set;
  };
  const [approved, setApproved] = useState<Set<string>>(seedApproved);
  const [denied, setDenied] = useState<Set<string>>(new Set());
  const [renderingRole, setRenderingRole] = useState<"" | "a-roll" | "b-roll">("");
  function accept(k: string) { setApproved((s) => new Set(s).add(k)); setDenied((s) => { const n = new Set(s); n.delete(k); return n; }); }
  function deny(k: string) { setDenied((s) => new Set(s).add(k)); setApproved((s) => { const n = new Set(s); n.delete(k); return n; }); }
  // A step's visual state: done (approved), active (artifact ready or all prior approved), else locked.
  function stepState(k: typeof ORDER[number]): "locked" | "active" | "done" {
    if (approved.has(k)) return "done";
    const idx = ORDER.indexOf(k);
    const priorOk = idx === 0 || approved.has(ORDER[idx - 1]);
    return priorOk ? "active" : "locked";
  }
  const unlocked = (k: typeof ORDER[number]) => stepState(k) !== "locked";
  // Accept / Not-yet gate for a step. Shows once the step's artifact exists; Accept turns it green
  // and unlocks the next step, Not-yet shows an edit hint and keeps the next step locked.
  function renderGate(k: string, hint: string) {
    if (!ready[k]) return null;
    if (approved.has(k)) return (
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[12px] font-semibold text-ready">✓ Approved
        <button onClick={() => deny(k)} className="ml-1 rounded border border-line px-2 py-0.5 text-[10px] font-medium text-ink-faint hover:text-ink">undo</button>
      </div>
    );
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => accept(k)} className="rounded-lg border border-ready/50 px-3 py-1.5 text-xs font-bold text-ready hover:bg-ready/10">✓ Accept &amp; continue</button>
          <button onClick={() => deny(k)} className="rounded-lg border border-active/40 px-3 py-1.5 text-xs font-bold text-active hover:bg-active/10">✕ Not yet</button>
        </div>
        {denied.has(k) && <p className="mt-2 text-[11px] text-active">{hint}</p>}
      </div>
    );
  }

  async function poll(setter: (d: Production) => void, statusKey: "shots_status" | "clips_status" | "assembly_status" | "audio_status") {
    for (let i = 0; i < 120; i++) {
      await new Promise((res) => setTimeout(res, 6000));
      const d = await fetch(`/api/influencers/${influencerId}/storyboard`).then((x) => x.json()).catch(() => null);
      if (d?.production) { setter(d.production); if (d.production[statusKey] !== "running") break; }
    }
  }

  async function shootShots() {
    if (shooting) return;
    setErr("");
    setProduction((p) => (p ? { ...p, shots: [], shots_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/shots`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start shooting."); setProduction((p) => (p ? { ...p, shots_status: "idle" } : p)); return; }
    await poll(setProduction, "shots_status");
  }

  async function renderRole(role: "a-roll" | "b-roll") {
    if (rendering) return;
    setErr(""); setRenderingRole(role);
    setProduction((p) => (p ? { ...p, clips_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/clips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roles: [role] }) }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start rendering."); setProduction((p) => (p ? { ...p, clips_status: "idle" } : p)); setRenderingRole(""); return; }
    await poll(setProduction, "clips_status");
    setRenderingRole("");
  }

  async function genAudio() {
    if (audioBusy) return;
    setErr("");
    setProduction((p) => (p ? { ...p, audio_status: "running", music_url: null, ambient_url: null } : p));
    const r = await fetch(`/api/influencers/${influencerId}/audio`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the audio."); setProduction((p) => (p ? { ...p, audio_status: "idle" } : p)); return; }
    await poll(setProduction, "audio_status");
  }

  async function stitchCut() {
    if (assembling) return;
    setErr("");
    setProduction((p) => (p ? { ...p, final_url: null, assembly_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/assemble`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the stitch."); setProduction((p) => (p ? { ...p, assembly_status: "idle" } : p)); return; }
    await poll(setProduction, "assembly_status");
  }

  const [zoom, setZoom] = useState<string | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [ed, setEd] = useState({ location: "", blocking: "", shot: "", motion: "", vo: "", caption: "", voAudio: "", phone: "" });
  const [aiInstr, setAiInstr] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  function openEdit(i: number, s: Scene) {
    if (editIdx === i) { setEditIdx(null); return; }
    setEditIdx(i); setAiInstr("");
    setEd({ location: s.location || "", blocking: s.blocking || "", shot: s.shot || "", motion: s.motion_prompt || "", vo: s.vo_line || "", caption: s.caption || "", voAudio: s.vo_audio_url || "", phone: s.phone_screen_url || "" });
  }
  function applyEditsLocally(i: number) {
    setProduction((p) => (p && p.storyboard ? { ...p, storyboard: { ...p.storyboard, scenes: p.storyboard.scenes.map((s, idx) => (idx === i ? { ...s, location: ed.location, blocking: ed.blocking, shot: ed.shot, motion_prompt: ed.motion, vo_line: ed.vo, caption: ed.caption, vo_audio_url: ed.voAudio, phone_screen_url: ed.phone } : s)) } } : p));
  }
  async function aiRewrite(i: number) {
    setAiBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/shots/scene/script`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: i, instruction: aiInstr }),
    }).then((x) => x.json()).catch(() => null);
    setAiBusy(false);
    if (typeof r?.vo_line === "string") setEd((e) => ({ ...e, vo: r.vo_line, caption: r.caption || e.caption }));
    else setErr(r?.error || "The producer couldn't rewrite that. Try again.");
  }
  async function saveScene(i: number) {
    setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/shots/scene`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: i, reshoot: false, location: ed.location, blocking: ed.blocking, shot: ed.shot, motion_prompt: ed.motion, vo_line: ed.vo, caption: ed.caption, vo_audio_url: ed.voAudio, phone_screen_url: ed.phone }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.saved) { applyEditsLocally(i); setEditIdx(null); } else setErr(r?.error || "Couldn't save.");
  }
  async function reshootScene(i: number) {
    setErr(""); setEditIdx(null);
    setProduction((p) => (p ? { ...p, shots: (p.shots ?? []).map((s) => (s.scene === i ? { ...s, reshooting: true } : s)) } : p));
    const r = await fetch(`/api/influencers/${influencerId}/shots/scene`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: i, location: ed.location, blocking: ed.blocking, shot: ed.shot, motion_prompt: ed.motion, vo_line: ed.vo, caption: ed.caption, vo_audio_url: ed.voAudio, phone_screen_url: ed.phone }),
    }).then((x) => x.json()).catch(() => null);
    applyEditsLocally(i);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the re-shoot."); setProduction((p) => (p ? { ...p, shots: (p.shots ?? []).map((s) => (s.scene === i ? { ...s, reshooting: false } : s)) } : p)); return; }
    for (let k = 0; k < 45; k++) {
      await new Promise((res) => setTimeout(res, 6000));
      const d = await fetch(`/api/influencers/${influencerId}/storyboard`).then((x) => x.json()).catch(() => null);
      if (d?.production) { setProduction(d.production); const sh = (d.production.shots ?? []).find((s: Shot) => s.scene === i); if (!sh?.reshooting) break; }
    }
  }

  async function resetStuck() {
    setErr("");
    await fetch(`/api/influencers/${influencerId}/production/reset`, { method: "POST" }).catch(() => {});
    const d = await fetch(`/api/influencers/${influencerId}/storyboard`).then((x) => x.json()).catch(() => null);
    if (d?.production) setProduction(d.production);
  }

  async function decideShowreel(decision: "accept" | "decline") {
    setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/showreel`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.showreel_status) setProduction((p) => (p ? { ...p, showreel_status: r.showreel_status } : p));
    else setErr(r?.error || "Couldn't record the decision.");
  }

  async function generate() {
    if (!brand.trim() || !offer.trim() || busy) { if (!brand.trim() || !offer.trim()) setErr("I need at least the brand and the core offer."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/storyboard`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, offer, benefits, cta, ctaCode, durationSeconds: duration, format, setting, tone, logo, legal, clothingRef: clothingRef || "", locationRef: locationRef || "", logoUrl: logoUrl || "", promoUrl: promoUrl || "", captions }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.production?.storyboard) { setProduction(r.production); setEditing(false); setApproved(new Set()); setDenied(new Set()); }
    else setErr(r?.error || "Couldn't draft the storyboard. Try again.");
  }

  return (
    <div className="space-y-5">
      {/* The Producer */}
      <div className="flex items-start gap-3 rounded-xl border border-[#a855f7]/30 bg-gradient-to-r from-[#a855f7]/12 to-[#60a5fa]/8 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#a855f7]/20 text-2xl">🎬</div>
        <div>
          <div className="text-sm font-extrabold text-white">Your Producer</div>
          <p className="mt-1 text-sm text-ink-dim">
            {editing
              ? `Tell me about the ad and I'll direct a full storyboard for ${name}, shot by shot, in our house style. Then we shoot it together.`
              : `Here's the storyboard I've directed for ${name}. Review the scenes, regenerate anything, and when you're happy we'll shoot it.`}
          </p>
        </div>
      </div>

      {editing ? (
        /* Brief */
        <div className="space-y-4 rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">The brief</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand / product" v={brand} set={setBrand} placeholder="e.g. MTN MoMo App" />
            <Field label="Core offer / hook" v={offer} set={setOffer} placeholder="e.g. register and get 1GB free" />
          </div>
          <Area label="Key benefits (comma separated)" v={benefits} set={setBenefits} placeholder="airtime, data, payments, vouchers, all in one app" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Primary CTA" v={cta} set={setCta} placeholder="Download the MTN MoMo App, register today" />
            <Field label="CTA mechanic / code" v={ctaCode} set={setCtaCode} placeholder="dial *120*151#" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Setting / world (one place, used throughout)" v={setting} set={setSetting} placeholder="upscale sunlit coffee shop, daytime" />
            <Field label="Tone words" v={tone} set={setTone} placeholder="warm, confident, effortless" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Persistent branding / logo" v={logo} set={setLogo} placeholder='"MoMo from MTN" logo top-left' />
            <div>
              <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Duration</div>
              <div className="flex gap-2">
                {[15, 30, 45, 60].map((d) => (
                  <button key={d} onClick={() => setDuration(d)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${duration === d ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{d}s</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Format</div>
              <div className="flex gap-2">
                {(["9:16", "1:1"] as const).map((f) => (
                  <button key={f} onClick={() => setFormat(f)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${format === f ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{f}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Optional reference uploads — steer the SHOOT's wardrobe + world */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Uploader kind="clothing" label="Clothing reference (optional)" current={clothingRef} onUploaded={setClothingRef} />
            <Uploader kind="location" label="Scene / location reference (optional)" current={locationRef} onUploaded={setLocationRef} />
          </div>

          {/* Brand overlays: logo TOP-LEFT + promo image TOP-RIGHT (both burned onto the cut, auto-sized) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Uploader kind="logo" label="Brand logo — top-left (transparent PNG, optional)" current={logoUrl} onUploaded={setLogoUrl} />
            <Uploader kind="promo" label="Promo image — top-right (optional)" current={promoUrl} onUploaded={setPromoUrl} />
          </div>
          <p className="-mt-1 text-[10px] text-ink-faint">Both are placed and sized for you, top corners, so they sit cleanly and stay legible over the video. No logo? The brand name shows as small text instead.</p>

          {/* Captions on/off */}
          <div>
            <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Captions</div>
            <div className="flex gap-2">
              {([[true, "Captions on"], [false, "Captions off"]] as const).map(([v, label]) => (
                <button key={label} onClick={() => setCaptions(v)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${captions === v ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{label}</button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-ink-faint">On burns the VO subtitles onto the cut; off leaves it clean.</p>
          </div>

          <Area label="Compliance / legal line (verbatim, optional)" v={legal} set={setLegal} placeholder="Used exactly as written on the end card. Optional." />
          {err && <p className="text-xs text-alert">{err}</p>}
          <button onClick={generate} disabled={busy} className="btn-brand rounded-lg px-5 py-3 text-sm font-bold disabled:opacity-50">{busy ? "Directing the storyboard…" : "🎬 Direct the storyboard"}</button>
        </div>
      ) : sb ? (
        /* Storyboard */
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-1 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-extrabold text-white">{sb.title}</div>
                <div className="tabular mt-1 text-[11px] uppercase tracking-[0.15em] text-ink-faint">{sb.format} · {sb.duration_seconds}s · {sb.scenes.length} scenes · {sb.tone}</div>
              </div>
              <div className="flex gap-2">
                {(shooting || rendering || assembling) && <button onClick={resetStuck} className="rounded-lg border border-alert/50 px-3 py-1.5 text-xs font-semibold text-alert hover:bg-alert/10" title="Clear a stuck job so the buttons unlock (keeps everything already produced)">⟳ Reset if stuck</button>}
                <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink">✎ New brief</button>
                <button onClick={generate} disabled={busy} className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{busy ? "Re-directing…" : "↻ Regenerate"}</button>
              </div>
            </div>
            {sb.music_bed && <p className="mt-2 text-[12px] text-ink-faint">🎵 {sb.music_bed}</p>}
          </div>

          <div className="space-y-3">
            {sb.scenes.map((s, i) => {
              const role = ROLE[s.role] ?? ROLE["a-roll"];
              const shot = shotFor(i);
              const clip = clipFor(i);
              return (
                <div key={i} className="flex gap-4 rounded-xl border border-line bg-surface-1 p-4">
                  {s.role !== "graphic" && (
                    <div className="w-32 shrink-0">
                      {shot?.reshooting ? (
                        <div className="relative">
                          {shot.url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={shot.url} alt="" className="aspect-[9/16] w-full rounded-lg border border-line object-cover opacity-25" />
                            : <div className="aspect-[9/16] w-full rounded-lg border border-line bg-surface-2" />}
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-[10px] text-[#c79bff]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#a855f7]/40 border-t-[#a855f7]" />re-shooting…</div>
                        </div>
                      ) : clip?.url ? (
                        <div className="relative">
                          <video src={clip.url} controls playsInline className="aspect-[9/16] w-full rounded-lg border border-ready/40 bg-black object-cover" />
                          <span className="absolute left-1 top-1 rounded bg-ready/80 px-1 py-0.5 text-[8px] font-bold text-black">{clip.kind === "a-roll" ? "▶ A-ROLL" : "▶ B-ROLL"}</span>
                        </div>
                      ) : rendering && clip?.status !== "failed" ? (
                        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 text-center text-[10px] text-ink-faint"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#60a5fa]/40 border-t-[#60a5fa]" />rendering…</div>
                      ) : clip?.status === "failed" ? (
                        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-alert/30 bg-surface-2 p-1 text-center text-[9px] text-alert" title={clip.error || ""}>clip failed{shot?.url && <span className="text-ink-faint">(still ok)</span>}</div>
                      ) : shot?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shot.url} alt={`scene ${i + 1}`} onClick={() => setZoom(shot.url!)} className="aspect-[9/16] w-full cursor-zoom-in rounded-lg border border-line object-cover transition hover:brightness-110" title="Click to preview full size" />
                      ) : shooting ? (
                        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 text-center text-[10px] text-ink-faint"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#a855f7]/40 border-t-[#a855f7]" />shooting…</div>
                      ) : shot?.error ? (
                        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-alert/30 bg-surface-2 text-center text-[10px] text-alert">shot failed</div>
                      ) : (
                        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface-2 text-center text-[10px] text-ink-faint">not shot yet</div>
                      )}
                      {/* per-scene re-shoot toggle (only once a shot exists for this scene) */}
                      {shot && !shot.reshooting && !shooting && (
                        <button onClick={() => openEdit(i, s)} className="mt-1.5 w-full rounded-md border border-[#a855f7]/40 px-2 py-1 text-[10px] font-semibold text-[#c79bff] hover:bg-[#a855f7]/10">↻ Re-shoot</button>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="tabular text-xs font-bold text-ink">Scene {i + 1}</span>
                    <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint">{s.start}–{s.end}</span>
                    <span className="text-[11px] font-semibold text-ink-dim">{s.beat}</span>
                    <span className={`tabular rounded border px-1.5 py-0.5 text-[9px] font-bold ${role.cls}`}>{role.label}</span>
                    {s.role !== "graphic" && <button onClick={() => openEdit(i, s)} className="ml-auto rounded-md border border-[#a855f7]/40 px-2 py-0.5 text-[10px] font-semibold text-[#c79bff] hover:bg-[#a855f7]/10">{editIdx === i ? "Close" : "✎ Edit script"}</button>}
                  </div>
                  <div className="text-[13px] text-ink-dim"><span className="text-ink-faint">📍 {s.location}</span></div>
                  <div className="mt-1 text-[13px] text-ink-dim"><span className="text-ink-faint">🎥</span> {s.shot}</div>
                  <div className="mt-1 text-[13px] text-ink-dim"><span className="text-ink-faint">🎬</span> {s.blocking} <span className="text-ink-faint">· {s.performance}</span></div>
                  {s.vo_line && <div className="mt-2 rounded-lg border border-[#a855f7]/20 bg-[#a855f7]/5 px-3 py-2 text-[13px] text-ink">🎙️ “{s.vo_line}”</div>}
                  {s.caption && <div className="mt-1 text-[12px] text-ink-faint">CC: {s.caption}</div>}
                  {s.motion_prompt && <div className="mt-1 text-[12px] text-ink-faint">↗ Motion: {s.motion_prompt}</div>}
                  {s.graphics?.length > 0 && <div className="mt-1 text-[12px] text-ink-faint">▣ {s.graphics.join(" · ")}</div>}
                  <div className="mt-1 text-[12px] text-ink-faint">🎵 {s.music_sfx} {s.transition ? `· ⟶ ${s.transition}` : ""}</div>
                  {clip?.status === "failed" && clip.error && <div className="mt-2 break-words rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-alert">⚠ Clip failed: {clip.error}</div>}
                  {editIdx === i && (
                    <div className="mt-3 space-y-3 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/5 p-3">
                      {/* Script */}
                      <div className="space-y-2">
                        <div className="tabular text-[10px] uppercase tracking-[0.2em] text-[#c79bff]">Script for this scene</div>
                        <Area label="Voiceover line (spoken)" v={ed.vo} set={(x) => setEd((e) => ({ ...e, vo: x }))} />
                        <Field label="Caption (burned-in)" v={ed.caption} set={(x) => setEd((e) => ({ ...e, caption: x }))} />
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[150px] flex-1"><Field label="Ask the producer to rewrite (optional)" v={aiInstr} set={setAiInstr} placeholder="e.g. punchier, lead with the free data" /></div>
                          <button onClick={() => aiRewrite(i)} disabled={aiBusy} className="rounded-lg border border-[#a855f7]/40 px-3 py-2 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{aiBusy ? "✨ Writing…" : "✨ Rewrite with AI"}</button>
                        </div>
                        <Uploader kind="vo" accept="audio" label="Upload my own VO (ElevenLabs file) — recommended" current={ed.voAudio || null} onUploaded={(u) => setEd((e) => ({ ...e, voAudio: u }))} />
                        <p className="text-[10px] text-ink-faint">Optional. If you drop your own read here, I lip-sync the clip to it; otherwise I generate the voice in-platform.</p>
                      </div>
                      {/* Image direction */}
                      <div className="space-y-2 border-t border-line pt-3">
                        <div className="tabular text-[10px] uppercase tracking-[0.2em] text-[#c79bff]">Image direction (changing these needs a re-shoot)</div>
                        <Field label="Location" v={ed.location} set={(x) => setEd((e) => ({ ...e, location: x }))} />
                        <Uploader kind="phone" accept="image" label="Phone screen image (optional) — shown on the phone if she holds one" current={ed.phone || null} onUploaded={(u) => setEd((e) => ({ ...e, phone: u }))} />
                        <Area label="Action / blocking" v={ed.blocking} set={(x) => setEd((e) => ({ ...e, blocking: x }))} />
                        <Field label="Shot / framing" v={ed.shot} set={(x) => setEd((e) => ({ ...e, shot: x }))} />
                        <Field label="Motion" v={ed.motion} set={(x) => setEd((e) => ({ ...e, motion: x }))} />
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button onClick={() => saveScene(i)} className="rounded-lg border border-ready/50 px-3 py-1.5 text-xs font-bold text-ready hover:bg-ready/10">Save changes</button>
                        <button onClick={() => reshootScene(i)} className="btn-brand rounded-lg px-3 py-1.5 text-xs font-bold">↻ Re-shoot this scene</button>
                        <button onClick={() => setEditIdx(null)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:text-ink">Cancel</button>
                      </div>
                      <p className="text-[10px] text-ink-faint">Save changes keeps the image and just updates the script. Re-shoot re-renders only this scene. The rest stay untouched.</p>
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>

          {sb.legal && <div className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] text-ink-faint"><b>Legal (verbatim):</b> {sb.legal}</div>}

          {/* ── The 8-step gated production wizard ── */}
          <div className="space-y-3">
            {/* 1 · Concept & script */}
            <StepShell n={1} title="Concept & script" desc={`The storyboard and script I've directed for ${name}, in our house style. Review the scenes above — edit any with ✎ Edit script, or ↻ Regenerate — then approve.`} state={stepState("concept")}>
              {renderGate("concept", "No problem — tweak any scene above or hit ↻ Regenerate at the top, then Accept when it reads right.")}
            </StepShell>

            {/* 2 · Voice */}
            <StepShell n={2} title="Voice" desc={`Pick the voice ${name} speaks in — every talking (a-roll) scene is lip-synced to it.`} state={stepState("voice")}>
              {unlocked("voice") ? (
                <>
                  {!needsVoice ? (
                    <p className="text-[12px] text-ink-faint">No talking scenes in this storyboard, so no voice is needed.</p>
                  ) : voiceId ? (
                    <p className="text-[12px] text-ink-faint">🎙️ Voice: <span className="text-ink-dim">{voiceName || "set"}</span> · <a href={`/setup/influencers/${influencerId}/video`} className="text-accent">change</a></p>
                  ) : (
                    <div className="rounded-lg border border-active/30 bg-active/5 p-3 text-[12px]">
                      <p className="text-ink-dim">Match a voice automatically, or open the full voice control to search the library, design or clone one.</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <button onClick={autoVoice} disabled={voiceBusy} className="btn-brand rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50">{voiceBusy ? "Matching…" : "✨ Auto-match a voice"}</button>
                        <a href={`/setup/influencers/${influencerId}/video`} className="text-xs font-semibold text-accent">Choose / design a voice →</a>
                      </div>
                    </div>
                  )}
                  {renderGate("voice", "Set a voice above (auto-match or choose one), then Accept.")}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 3 · Keyframes */}
            <StepShell n={3} title="Keyframes — shoot the board" desc={`I shoot one coherent still for every scene from ${name}'s locked identity, holding a single consistent world across the board. Preview and re-shoot any scene above.`} state={stepState("keyframes")}>
              {unlocked("keyframes") ? (
                <>
                  <button onClick={shootShots} disabled={shooting} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{shooting ? "🎬 Shooting the board…" : shotsReady ? "↻ Re-shoot the board" : "🎬 Shoot the board"}</button>
                  {renderGate("keyframes", "Re-shoot the board or any single scene above until the look is right, then Accept.")}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 4 · A-roll */}
            <StepShell n={4} title="A-roll — the talking scenes" desc={`I bring the talking scenes to life: ${name} speaks to camera, lip-synced to the voice, with a living, moving background.`} state={stepState("aroll")}>
              {unlocked("aroll") ? (
                <>
                  {aRollNone ? (
                    <p className="text-[12px] text-ink-faint">No talking (a-roll) scenes in this storyboard — nothing to render here.</p>
                  ) : (
                    <>
                      <button onClick={() => renderRole("a-roll")} disabled={rendering} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{renderingRole === "a-roll" ? "🎞️ Rendering the a-roll…" : aRollReady ? "↻ Re-render the a-roll" : "🎞️ Render the a-roll"}</button>
                      <ClipStrip clips={clips} role="a-roll" />
                    </>
                  )}
                  {renderGate("aroll", "Re-shoot a scene above (it clears the stale clip) or re-render the a-roll, then Accept.")}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 5 · B-roll */}
            <StepShell n={5} title="B-roll — the scene shots" desc="The non-talking scenes get natural motion — moving backgrounds, people, light — and chain seamlessly into the next shot." state={stepState("broll")}>
              {unlocked("broll") ? (
                <>
                  {bRollNone ? (
                    <p className="text-[12px] text-ink-faint">No b-roll scenes in this storyboard — nothing to render here.</p>
                  ) : (
                    <>
                      <button onClick={() => renderRole("b-roll")} disabled={rendering} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{renderingRole === "b-roll" ? "🎞️ Rendering the b-roll…" : bRollReady ? "↻ Re-render the b-roll" : "🎞️ Render the b-roll"}</button>
                      <ClipStrip clips={clips} role="b-roll" />
                    </>
                  )}
                  {renderGate("broll", "Re-shoot a scene above or re-render the b-roll, then Accept.")}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 6 · Music & ambient */}
            <StepShell n={6} title="Music & ambient" desc="I generate the music bed and the ambient room tone for the world. Have a listen before we cut it together." state={stepState("audio")}>
              {unlocked("audio") ? (
                <>
                  <button onClick={genAudio} disabled={audioBusy} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{audioBusy ? "🎵 Generating audio…" : audioReady ? "↻ Re-generate audio" : "🎵 Generate music & ambient"}</button>
                  {audioReady && (
                    <div className="mt-3 space-y-2">
                      {production?.music_url && <div><div className="tabular text-[10px] uppercase tracking-[0.2em] text-ink-faint">Music bed</div><audio src={production.music_url} controls className="mt-1 h-8 w-full max-w-sm" /></div>}
                      {production?.ambient_url && <div><div className="tabular text-[10px] uppercase tracking-[0.2em] text-ink-faint">Ambient tone</div><audio src={production.ambient_url} controls className="mt-1 h-8 w-full max-w-sm" /></div>}
                    </div>
                  )}
                  {renderGate("audio", "Re-generate the audio if it's not right, then Accept. The cut reuses exactly these beds.")}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 7 · Stitch */}
            <StepShell n={7} title="Stitch the cut" desc={`I edit it together: clips in order, a continuous voiceover, burned-in captions, the ${production?.brief?.brand ? `${production.brief.brand} ` : ""}brand bug, and the music + ambient mixed underneath — one finished ${sb.format} ad.`} state={stepState("stitch")}>
              {unlocked("stitch") ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={stitchCut} disabled={assembling} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{assembling ? "✂️ Stitching the cut…" : finalUrl ? "↻ Re-stitch" : "✂️ Stitch the cut"}</button>
                    {production?.assembly_error && !assembling && <span className="text-[11px] text-alert">{production.assembly_error}</span>}
                  </div>
                  {finalUrl && (
                    <div className="mt-4">
                      <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ready">The finished cut</div>
                      <video src={finalUrl} controls playsInline className={`rounded-xl border border-ready/40 bg-black ${sb.format.includes("1:1") ? "aspect-square w-72" : "aspect-[9/16] w-64"}`} />
                      <div className="mt-2"><a href={finalUrl} download className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink">↓ Download</a></div>
                    </div>
                  )}
                  {renderGate("stitch", "Re-stitch if the cut isn't right (you can re-render any clip or the audio first), then Accept.")}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 8 · Showreel */}
            <StepShell n={8} title="Showreel" desc={<>My last call with you: accept the cut into the showreel, or decline it. Only accepted cuts reach the <a href="/showcase" className="text-accent">showcase wall</a> and the shareable reel.</>} state={stepState("showreel")}>
              {unlocked("showreel") ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => { decideShowreel("accept"); accept("showreel"); }} className={`rounded-lg border px-4 py-2 text-sm font-bold ${production?.showreel_status === "accepted" ? "border-ready bg-ready/15 text-ready" : "border-ready/40 text-ready hover:bg-ready/10"}`}>✓ Accept into showreel</button>
                  <button onClick={() => { decideShowreel("decline"); accept("showreel"); }} className={`rounded-lg border px-4 py-2 text-sm font-bold ${production?.showreel_status === "declined" ? "border-active bg-active/15 text-active" : "border-active/40 text-active hover:bg-active/10"}`}>✕ Decline</button>
                  {production?.showreel_status === "accepted" && <span className="tabular text-[11px] font-semibold text-ready">● In the showreel</span>}
                  {production?.showreel_status === "declined" && <span className="tabular text-[11px] font-semibold text-active">● Kept out</span>}
                </div>
              ) : <LockHint />}
            </StepShell>
          </div>
        </div>
      ) : null}
      {zoom && <Lightbox url={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

// One wizard step: numbered badge (green tick when approved), title, description, body. The
// `state` drives the chrome — active glows, done goes green, locked dims.
function StepShell({ n, title, desc, state, children }: { n: number; title: string; desc: ReactNode; state: "locked" | "active" | "done"; children?: ReactNode }) {
  const ring = state === "active" ? "border-[#a855f7] ring-2 ring-[#a855f7]/50 shadow-[0_0_22px_rgba(168,85,247,0.35)]" : state === "done" ? "border-ready/40 bg-ready/[0.04]" : "border-line opacity-55";
  const badge = state === "done" ? "bg-ready text-black" : state === "active" ? "bg-[#a855f7] text-white" : "bg-surface-2 text-ink-faint";
  return (
    <div className={`rounded-xl border bg-surface-1 p-5 ${ring}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`}>{state === "done" ? "✓" : n}</span>
        <div className="text-sm font-extrabold text-ink">{title}</div>
        {state === "done" && <span className="tabular ml-auto text-[10px] font-semibold uppercase tracking-wide text-ready">approved</span>}
      </div>
      <p className="mt-1.5 text-sm text-ink-dim">{desc}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
function LockHint() {
  return <p className="text-[11px] text-ink-faint">🔒 Approve the previous step to unlock this one.</p>;
}
// A row of small video previews for one role's rendered clips.
function ClipStrip({ clips, role }: { clips: Clip[]; role: "a-roll" | "b-roll" }) {
  const mine = clips.filter((c) => c.kind === role && c.url).sort((a, b) => a.scene - b.scene);
  if (!mine.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {mine.map((c) => (
        <video key={c.scene} src={c.url!} controls playsInline className="aspect-[9/16] w-20 rounded-lg border border-ready/40 bg-black object-cover" />
      ))}
    </div>
  );
}
function Field({ label, v, set, placeholder }: { label: string; v: string; set: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">{label}</div>
      <input value={v} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
    </div>
  );
}
function Area({ label, v, set, placeholder }: { label: string; v: string; set: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">{label}</div>
      <textarea value={v} onChange={(e) => set(e.target.value)} rows={2} placeholder={placeholder} className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
    </div>
  );
}
