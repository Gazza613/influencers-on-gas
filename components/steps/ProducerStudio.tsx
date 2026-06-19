"use client";

import { useState } from "react";

type Scene = {
  beat: string; role: "a-roll" | "b-roll" | "graphic"; start: string; end: string; location: string;
  talent: string[]; shot: string; blocking: string; performance: string; graphics: string[];
  vo_line: string; caption: string; motion_prompt: string; music_sfx: string; transition: string;
};
type Storyboard = { title: string; format: string; duration_seconds: number; tone: string; music_bed: string; full_vo: string; legal: string; scenes: Scene[] };
type Shot = { scene: number; role: string; beat: string; url: string | null; error?: string | null };
type Clip = { scene: number; role: string; beat: string; kind: string; url: string | null; status: string; error?: string | null };
type Production = { brief?: Record<string, unknown>; storyboard?: Storyboard; status?: string; shots?: Shot[]; shots_status?: string; clips?: Clip[]; clips_status?: string; final_url?: string | null; assembly_status?: string; assembly_error?: string | null; showreel_status?: string } | null;

const ROLE = {
  "a-roll": { label: "A-ROLL · presenter", cls: "bg-[#a855f7]/15 text-[#c79bff] border-[#a855f7]/30" },
  "b-roll": { label: "B-ROLL · scene", cls: "bg-[#60a5fa]/15 text-[#93c5fd] border-[#60a5fa]/30" },
  graphic: { label: "GRAPHIC", cls: "bg-active/15 text-active border-active/30" },
} as const;

export default function ProducerStudio({ influencerId, name, initialProduction }: { influencerId: string; name: string; initialProduction: Production }) {
  const [production, setProduction] = useState<Production>(initialProduction);
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

  const sb = production?.storyboard;
  const shots = production?.shots ?? [];
  const shooting = production?.shots_status === "running";
  const shotFor = (i: number) => shots.find((s) => s.scene === i);
  const clips = production?.clips ?? [];
  const rendering = production?.clips_status === "running";
  const clipFor = (i: number) => clips.find((c) => c.scene === i);
  const shotsReady = shots.some((s) => s.url);
  const clipsReady = clips.some((c) => c.url);
  const assembling = production?.assembly_status === "running";
  const finalUrl = production?.final_url || null;

  async function poll(setter: (d: Production) => void, statusKey: "shots_status" | "clips_status" | "assembly_status") {
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

  async function renderClips() {
    if (rendering) return;
    setErr("");
    setProduction((p) => (p ? { ...p, clips: [], clips_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/clips`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start rendering."); setProduction((p) => (p ? { ...p, clips_status: "idle" } : p)); return; }
    await poll(setProduction, "clips_status");
  }

  async function stitchCut() {
    if (assembling) return;
    setErr("");
    setProduction((p) => (p ? { ...p, final_url: null, assembly_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/assemble`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the stitch."); setProduction((p) => (p ? { ...p, assembly_status: "idle" } : p)); return; }
    await poll(setProduction, "assembly_status");
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
    if (!brand.trim() || !offer.trim() || busy) { if (!brand.trim() || !offer.trim()) setErr("Sami needs at least the brand and the core offer."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/storyboard`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, offer, benefits, cta, ctaCode, durationSeconds: duration, format, setting, tone, logo, legal }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.production?.storyboard) { setProduction(r.production); setEditing(false); }
    else setErr(r?.error || "Sami couldn't draft the storyboard. Try again.");
  }

  return (
    <div className="space-y-5">
      {/* Sami */}
      <div className="flex items-start gap-3 rounded-xl border border-[#a855f7]/30 bg-gradient-to-r from-[#a855f7]/12 to-[#60a5fa]/8 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#a855f7]/20 text-2xl">🎬</div>
        <div>
          <div className="text-sm font-extrabold text-white">Sami <span className="font-semibold text-[#c79bff]">· your AI Producer</span></div>
          <p className="mt-1 text-sm text-ink-dim">
            {editing
              ? `Tell me about the ad and I'll direct a full storyboard for ${name}, shot by shot, in our house style. Then we shoot it.`
              : `Here's the storyboard I've directed for ${name}. Review the scenes, regenerate anything, and when you're happy we'll shoot the shots.`}
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
          <Area label="Mandatory legal line (verbatim, optional)" v={legal} set={setLegal} placeholder="Used exactly as written on the end card." />
          {err && <p className="text-xs text-alert">{err}</p>}
          <button onClick={generate} disabled={busy} className="btn-brand rounded-lg px-5 py-3 text-sm font-bold disabled:opacity-50">{busy ? "Sami is directing the storyboard…" : "🎬 Direct the storyboard"}</button>
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
                      {clip?.url ? (
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
                        <img src={shot.url} alt={`scene ${i + 1}`} className="aspect-[9/16] w-full rounded-lg border border-line object-cover" />
                      ) : shooting ? (
                        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 text-center text-[10px] text-ink-faint"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#a855f7]/40 border-t-[#a855f7]" />shooting…</div>
                      ) : shot?.error ? (
                        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-alert/30 bg-surface-2 text-center text-[10px] text-alert">shot failed</div>
                      ) : (
                        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface-2 text-center text-[10px] text-ink-faint">not shot yet</div>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="tabular text-xs font-bold text-ink">Scene {i + 1}</span>
                    <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint">{s.start}–{s.end}</span>
                    <span className="text-[11px] font-semibold text-ink-dim">{s.beat}</span>
                    <span className={`tabular rounded border px-1.5 py-0.5 text-[9px] font-bold ${role.cls}`}>{role.label}</span>
                  </div>
                  <div className="text-[13px] text-ink-dim"><span className="text-ink-faint">📍 {s.location}</span></div>
                  <div className="mt-1 text-[13px] text-ink-dim"><span className="text-ink-faint">🎥</span> {s.shot}</div>
                  <div className="mt-1 text-[13px] text-ink-dim"><span className="text-ink-faint">🎬</span> {s.blocking} <span className="text-ink-faint">· {s.performance}</span></div>
                  {s.vo_line && <div className="mt-2 rounded-lg border border-[#a855f7]/20 bg-[#a855f7]/5 px-3 py-2 text-[13px] text-ink">🎙️ “{s.vo_line}”</div>}
                  {s.caption && <div className="mt-1 text-[12px] text-ink-faint">CC: {s.caption}</div>}
                  {s.motion_prompt && <div className="mt-1 text-[12px] text-ink-faint">↗ Motion: {s.motion_prompt}</div>}
                  {s.graphics?.length > 0 && <div className="mt-1 text-[12px] text-ink-faint">▣ {s.graphics.join(" · ")}</div>}
                  <div className="mt-1 text-[12px] text-ink-faint">🎵 {s.music_sfx} {s.transition ? `· ⟶ ${s.transition}` : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {sb.legal && <div className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] text-ink-faint"><b>Legal (verbatim):</b> {sb.legal}</div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#a855f7]/30 bg-[#a855f7]/5 p-5">
              <div className="tabular text-xs uppercase tracking-[0.2em] text-[#c79bff]">Step 1 · Shoot the board</div>
              <p className="mt-1 text-sm text-ink-dim">A coherent still for every scene from {name}&apos;s locked identity, one consistent world across the board.</p>
              <button onClick={shootShots} disabled={shooting} className="btn-brand mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{shooting ? "🎬 Shooting the board…" : shotsReady ? "↻ Re-shoot the board" : "🎬 Shoot the shots"}</button>
            </div>
            <div className={`rounded-xl border p-5 ${shotsReady ? "border-[#60a5fa]/30 bg-[#60a5fa]/5" : "border-line bg-surface-1 opacity-60"}`}>
              <div className="tabular text-xs uppercase tracking-[0.2em] text-[#93c5fd]">Step 2 · Render the clips</div>
              <p className="mt-1 text-sm text-ink-dim">Sami brings every frame to life: a-roll scenes talk in {name}&apos;s voice (HeyGen), b-roll scenes get natural motion (Kling). A few minutes per scene.</p>
              <button onClick={renderClips} disabled={rendering || !shotsReady} className="btn-brand mt-3 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{rendering ? "🎞️ Rendering the clips…" : clipsReady ? "↻ Re-render the clips" : "🎞️ Render the clips"}</button>
              {!shotsReady && <p className="mt-2 text-[11px] text-ink-faint">Shoot the board first.</p>}
            </div>
          </div>

          {/* Step 3 · the stitch */}
          <div className={`rounded-xl border p-5 ${clipsReady ? "border-ready/30 bg-ready/5" : "border-line bg-surface-1 opacity-60"}`}>
            <div className="tabular text-xs uppercase tracking-[0.2em] text-ready">Step 3 · Stitch the cut</div>
            <p className="mt-1 text-sm text-ink-dim">Sami edits it together: clips in order, a continuous voiceover, burned-in captions, the {production?.brief?.brand ? `${production.brief.brand} ` : ""}brand bug, and a music bed mixed underneath, into one finished {sb.format} ad.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={stitchCut} disabled={assembling || !clipsReady} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{assembling ? "✂️ Stitching the cut…" : finalUrl ? "↻ Re-stitch" : "✂️ Stitch the cut"}</button>
              {!clipsReady && <span className="text-[11px] text-ink-faint">Render the clips first.</span>}
              {production?.assembly_error && !assembling && <span className="text-[11px] text-alert">{production.assembly_error}</span>}
            </div>
            {finalUrl && (
              <div className="mt-4">
                <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ready">The finished cut</div>
                <video src={finalUrl} controls playsInline className={`rounded-xl border border-ready/40 bg-black ${sb.format.includes("1:1") ? "aspect-square w-72" : "aspect-[9/16] w-64"}`} />
                <div className="mt-2">
                  <a href={finalUrl} download className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink">↓ Download</a>
                </div>
              </div>
            )}
          </div>

          {/* Final step · the showreel gate */}
          {finalUrl && (
            <div className="rounded-xl border border-line bg-surface-1 p-5">
              <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Final step · the showreel</div>
              <p className="mt-1 text-sm text-ink-dim">Sami&apos;s last call: accept the cut into the showreel, or decline it. Only accepted cuts reach the <a href="/showcase" className="text-accent">showcase wall</a> and the shareable reel.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={() => decideShowreel("accept")} className={`rounded-lg border px-4 py-2 text-sm font-bold ${production?.showreel_status === "accepted" ? "border-ready bg-ready/15 text-ready" : "border-ready/40 text-ready hover:bg-ready/10"}`}>✓ Accept into showreel</button>
                <button onClick={() => decideShowreel("decline")} className={`rounded-lg border px-4 py-2 text-sm font-bold ${production?.showreel_status === "declined" ? "border-active bg-active/15 text-active" : "border-active/40 text-active hover:bg-active/10"}`}>✕ Decline</button>
                {production?.showreel_status === "accepted" && <span className="tabular text-[11px] font-semibold text-ready">● In the showreel</span>}
                {production?.showreel_status === "declined" && <span className="tabular text-[11px] font-semibold text-active">● Kept out</span>}
              </div>
            </div>
          )}
        </div>
      ) : null}
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
