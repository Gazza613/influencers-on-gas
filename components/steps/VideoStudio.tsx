"use client";

import { useEffect, useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";

type Voice = { id: string; name: string; preview: string | null };
type LibVoice = { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string | null };
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
  const [directed, setDirected] = useState("");
  const [tone, setTone] = useState("natural and warm");
  const [accent, setAccent] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sources, setSources] = useState<{ url: string; ratio: string }[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [voicing, setVoicing] = useState(false);
  const [gen, setGen] = useState(false);
  const [err, setErr] = useState("");
  // Voice picker
  const [vtab, setVtab] = useState<"library" | "design" | "auto" | "upload">("library");
  const [lib, setLib] = useState<LibVoice[]>([]);
  const [sel, setSel] = useState("");
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Design-a-voice
  const [desc, setDesc] = useState("");
  const [designing, setDesigning] = useState(false);
  const [designDesc, setDesignDesc] = useState("");
  const [designPreviews, setDesignPreviews] = useState<{ generatedVoiceId: string; url: string }[]>([]);

  async function designVoice() {
    if (!desc.trim() || designing) return;
    setDesigning(true); setErr(""); setDesignPreviews([]);
    const r = await fetch(`/api/influencers/${influencerId}/voice/design`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: desc.trim() }),
    }).then((x) => x.json()).catch(() => null);
    setDesigning(false);
    if (r?.previews?.length) { setDesignPreviews(r.previews); setDesignDesc(r.voice_description || ""); }
    else setErr(r?.error || "Could not design a voice.");
  }
  async function useDesigned(generatedVoiceId: string) {
    setVoicing(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/voice/design`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generatedVoiceId, voice_description: designDesc }),
    }).then((x) => x.json()).catch(() => null);
    setVoicing(false);
    if (r?.voice_id) { setVoice({ id: r.voice_id, name: r.voice_name, preview: r.preview_url ?? null }); setDesignPreviews([]); }
    else setErr(r?.error || "Could not save the designed voice.");
  }

  useEffect(() => { fetch("/api/voices").then((r) => r.json()).then((d) => { if (Array.isArray(d?.voices)) setLib(d.voices); }).catch(() => {}); }, []);
  // Source shots the producer can animate (the locked creatives). The clip uses this exact
  // frame, so the scene AND aspect come from it (no white space).
  useEffect(() => {
    fetch(`/api/influencers/${influencerId}/creatives`).then((r) => r.json()).then((d) => {
      const list = (Array.isArray(d?.creatives) ? d.creatives : []).filter((c: { url?: string; status?: string }) => c.url && c.status === "approved").map((c: { url: string; ratio: string }) => ({ url: c.url, ratio: c.ratio || "9:16" }));
      setSources(list);
      if (list.length && !sourceUrl) setSourceUrl(list[0].url);
    }).catch(() => {});
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [influencerId]);
  const ratio = sources.find((s) => s.url === sourceUrl)?.ratio || "9:16";

  async function setVoiceVia(payload: Record<string, unknown>) {
    setVoicing(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/voice`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then((x) => x.json()).catch(() => null);
    setVoicing(false);
    if (r?.voice_id) setVoice({ id: r.voice_id, name: r.voice_name, preview: r.preview_url ?? null });
    else setErr(r?.error || "Could not set the voice.");
  }
  async function uploadSample(file: File) {
    setUploading(true); setErr("");
    try { const b = await blobUpload(file.name, file, { access: "public", handleUploadUrl: "/api/upload", clientPayload: "voice" }); setSampleUrl(b.url); }
    catch (e) { setErr(String((e as Error)?.message || e).slice(0, 160) || "Upload failed"); }
    setUploading(false);
  }

  const polling = useRef(false);
  const running = clips.some((c) => c.status === "running");

  useEffect(() => { if (running && !polling.current) poll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [running]);

  async function poll() {
    polling.current = true;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const d = await fetch(`/api/influencers/${influencerId}/aroll`).then((r) => r.json()).catch(() => null);
      if (d?.aroll) {
        // Only update state when the data actually changed, so scrolling isn't jolted by needless re-renders.
        setClips((prev) => (JSON.stringify(prev) === JSON.stringify(d.aroll) ? prev : d.aroll));
        if (d.voice) setVoice((prev) => (prev?.id === d.voice.id ? prev : d.voice));
        if (!d.aroll.some((c: Clip) => c.status === "running")) break;
      }
    }
    polling.current = false;
  }

  const effectiveLine = () => (directed.trim() || line.trim());
  async function enhance() {
    if (!line.trim() || enhancing) return;
    setEnhancing(true); setErr(""); setPreviewUrl(null);
    const r = await fetch(`/api/influencers/${influencerId}/voice/script`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line: line.trim(), tone, accent }),
    }).then((x) => x.json()).catch(() => null);
    setEnhancing(false);
    if (r?.tagged) setDirected(r.tagged); else setErr(r?.error || "Could not enhance the script.");
  }
  async function preview() {
    const text = effectiveLine();
    if (!text || previewing) return;
    setPreviewing(true); setErr(""); setPreviewUrl(null);
    const r = await fetch(`/api/influencers/${influencerId}/voice/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    }).then((x) => x.json()).catch(() => null);
    setPreviewing(false);
    if (r?.url) setPreviewUrl(r.url); else setErr(r?.error || "Could not preview the read.");
  }
  async function deleteClip(clipId: string) {
    setClips((cs) => cs.filter((c) => (c.id || "") !== clipId)); // optimistic
    await fetch(`/api/influencers/${influencerId}/aroll?clipId=${encodeURIComponent(clipId)}`, { method: "DELETE" }).catch(() => {});
  }
  async function generate() {
    const text = effectiveLine();
    if (!text || gen) return;
    setGen(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/aroll`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line: text, ratio, sourceUrl }),
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
        <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">① Voice</div>
        {voice && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-ready/30 bg-ready/8 px-3 py-2">
            <span className="text-sm font-semibold text-ready">🔊 {voice.name}</span>
            {voice.preview && <audio src={voice.preview} controls className="h-8" />}
            <span className="text-[11px] text-ink-faint">{name}&apos;s current voice</span>
          </div>
        )}
        <div className="mb-3 flex gap-2">
          {([["library", "Pick a voice"], ["design", "Design a voice"], ["upload", "Upload my own"], ["auto", "Auto-match"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setVtab(k)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${vtab === k ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{l}</button>
          ))}
        </div>

        {vtab === "library" && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="min-w-[220px] rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-[#a855f7]">
              <option value="">{lib.length ? "Choose a voice…" : "Loading voices…"}</option>
              {lib.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}{v.labels?.gender ? ` · ${v.labels.gender}` : ""}{v.labels?.accent ? ` · ${v.labels.accent}` : ""}</option>)}
            </select>
            {sel && lib.find((v) => v.voice_id === sel)?.preview_url && (
              <audio src={lib.find((v) => v.voice_id === sel)?.preview_url || undefined} controls className="h-8" />
            )}
            <button onClick={() => sel && setVoiceVia({ action: "select", voiceId: sel, voiceName: lib.find((v) => v.voice_id === sel)?.name })} disabled={!sel || voicing} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{voicing ? "Setting…" : "Use this voice"}</button>
          </div>
        )}

        {vtab === "design" && (
          <div className="space-y-2">
            <p className="text-[13px] text-ink-faint">Describe the voice and we design it in ElevenLabs. Be specific, e.g. &quot;South African white female, early twenties, soft Afrikaans twang, warm and chatty, slight lisp.&quot;</p>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Describe the voice…" className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
            <button onClick={designVoice} disabled={!desc.trim() || designing} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{designing ? "Designing voice options…" : "✨ Design voice options"}</button>
            {designPreviews.length > 0 && (
              <div className="mt-1 space-y-2">
                <p className="text-[11px] text-ink-faint">Listen and pick your favourite:</p>
                {designPreviews.map((p, i) => (
                  <div key={p.generatedVoiceId} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                    <span className="text-xs font-semibold text-ink-dim">Option {i + 1}</span>
                    <audio src={p.url} controls className="h-8" />
                    <button onClick={() => useDesigned(p.generatedVoiceId)} disabled={voicing} className="rounded-lg border border-[#a855f7]/50 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{voicing ? "Saving…" : "Use this voice"}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {vtab === "upload" && (
          <div className="space-y-2">
            <p className="text-[13px] text-ink-faint">Upload a clear voice sample (20 to 60 seconds, one speaker, minimal background noise). We clone it as {name}&apos;s voice.</p>
            <input type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSample(f); }} className="block text-sm text-ink-dim file:mr-3 file:rounded-lg file:border-0 file:bg-[#a855f7]/15 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#c79bff]" />
            {uploading && <p className="text-[12px] text-ink-faint">Uploading sample…</p>}
            {sampleUrl && <audio src={sampleUrl} controls className="h-8" />}
            <label className="flex items-center gap-2 text-[12px] text-ink-dim"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I have the right to use this voice and consent to cloning it.</label>
            <button onClick={() => setVoiceVia({ action: "clone", sampleUrls: [sampleUrl], consentId: consent ? "voice-upload-consent" : "" })} disabled={!sampleUrl || !consent || voicing} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{voicing ? "Cloning…" : "Clone this voice"}</button>
          </div>
        )}

        {vtab === "auto" && (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setVoiceVia({ action: "auto" })} disabled={voicing} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{voicing ? "Setting up…" : "Use a matched voice"}</button>
            <span className="text-[13px] text-ink-faint">We pick a natural voice matched to {name}&apos;s gender.</span>
          </div>
        )}
      </div>

      {/* A-roll */}
      <div className={`rounded-xl border border-line bg-surface-1 p-5 ${voice ? "" : "pointer-events-none opacity-50"}`}>
        <div className="tabular mb-2 text-xs uppercase tracking-[0.2em] text-ink-faint">② Talking clip (a-roll)</div>
        <textarea value={line} onChange={(e) => setLine(e.target.value)} rows={3} placeholder={`What should ${name} say to camera?`}
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />

        {/* Voice producer: enhance with expressive tags, then preview */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-faint">Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-[#a855f7]">
            {["natural and warm", "upbeat and energetic", "calm and reassuring", "confident and bold", "playful and fun", "sincere and heartfelt"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[11px] text-ink-faint">Accent</span>
          <select value={accent} onChange={(e) => setAccent(e.target.value)} className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-[#a855f7]">
            {[["", "Voice default"], ["South African", "South African"], ["British", "British"], ["American", "American"], ["Australian", "Australian"], ["Nigerian", "Nigerian"], ["Indian", "Indian"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={enhance} disabled={!line.trim() || enhancing} className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{enhancing ? "Directing…" : "✨ Enhance with voice tags"}</button>
        </div>

        {directed && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="tabular text-[10px] uppercase tracking-[0.2em] text-[#c79bff]">Directed read (edit the tags freely)</span>
              <button onClick={() => setDirected("")} className="text-[11px] text-ink-faint hover:text-ink">reset to plain</button>
            </div>
            <textarea value={directed} onChange={(e) => { setDirected(e.target.value); setPreviewUrl(null); }} rows={3}
              className="w-full rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/5 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
            <p className="mt-1 text-[11px] text-ink-faint">Tags like [warm], [excited], [thoughtful pause] and CAPS for emphasis shape the delivery.</p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={preview} disabled={!voice || !effectiveLine() || previewing} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-dim hover:border-line-strong hover:text-ink disabled:opacity-50">{previewing ? "Generating preview…" : "▶ Preview the read"}</button>
          {previewUrl && <audio src={previewUrl} controls className="h-9" />}
        </div>

        {/* Source shot — we animate THIS exact frame, so scene + aspect come from it */}
        <div className="mt-4 border-t border-line pt-3">
          <div className="tabular mb-2 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Choose the shot to animate {sourceUrl ? `· ${ratio}` : ""}</div>
          {sources.length === 0 ? (
            <p className="text-[12px] text-ink-faint">No creatives yet. Render some in the Creatives tab first, then pick one here to bring it to life.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {sources.map((s) => (
                <button key={s.url} onClick={() => setSourceUrl(s.url)} className={`relative w-44 shrink-0 overflow-hidden rounded-xl border-2 transition ${sourceUrl === s.url ? "border-[#a855f7] shadow-[0_0_0_3px_rgba(168,85,247,0.25)]" : "border-line hover:border-line-strong"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="source" className="aspect-[3/4] w-full object-cover" />
                  <span className="tabular absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">{s.ratio}</span>
                  {sourceUrl === s.url && <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#a855f7] text-xs font-bold text-white shadow">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button onClick={generate} disabled={!voice || !effectiveLine() || !sourceUrl || gen} className="btn-brand rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50">{gen ? "Starting…" : "🎬 Generate talking clip"}</button>
          <span className="text-[13px] text-ink-faint">Animates the chosen shot at its own aspect ({ratio}), using the directed read. Renders in a few minutes.</span>
        </div>
      </div>

      {err && <p className="text-xs text-alert">{err}</p>}

      {/* Clips */}
      {clips.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Clips · {clips.length}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clips.map((c, i) => (
              <div key={c.id || i} className="group relative overflow-hidden rounded-lg border border-line bg-surface-2">
                {c.status !== "running" && c.id && (
                  <button onClick={() => deleteClip(c.id as string)} title="Delete this clip"
                    className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-alert/60 bg-black/60 text-xs text-alert opacity-0 transition hover:bg-alert/20 group-hover:opacity-100">✕</button>
                )}
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
                <details className="px-2.5 py-2">
                  <summary className="cursor-pointer list-none text-[11px] text-ink-faint hover:text-ink-dim"><span className="tabular">{c.ratio || "9:16"}</span> · view script ▾</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-dim">{c.line}</p>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
