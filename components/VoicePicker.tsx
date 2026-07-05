"use client";

import { useEffect, useState } from "react";
import Uploader from "@/components/Uploader";

type LibVoice = { voice_id: string; name: string; labels?: Record<string, string>; preview_url?: string | null; category?: string | null };

// Self-contained voice chooser used inside the Producer wizard's Voice step: pick from the library,
// design a voice from a description, UPLOAD your own voice to clone (great for twins), or auto-match.
// Calls onSet with the chosen voice.
export default function VoicePicker({ influencerId, name, voiceId, voiceName, voicePreview, onSet }: {
  influencerId: string; name: string; voiceId: string; voiceName: string; voicePreview?: string | null;
  onSet: (v: { voice_id: string; voice_name: string; preview_url: string | null }) => void;
}) {
  const [vtab, setVtab] = useState<"library" | "design" | "upload" | "auto">("library");
  const [samples, setSamples] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [lib, setLib] = useState<LibVoice[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [desc, setDesc] = useState("");
  const [designing, setDesigning] = useState(false);
  const [designDesc, setDesignDesc] = useState("");
  const [previews, setPreviews] = useState<{ generatedVoiceId: string; url: string }[]>([]);
  const [savingId, setSavingId] = useState(""); // which designed option is being saved (so only IT spins)
  const [accent, setAccent] = useState(""); // quick accent filter / design seed (South African first - our market)
  const ACCENTS = ["South African", "British", "American", "Australian", "Nigerian", "Irish"];

  useEffect(() => { fetch("/api/voices").then((r) => r.json()).then((d) => { if (Array.isArray(d?.voices)) setLib(d.voices); }).catch(() => {}); }, []);

  async function setVia(payload: Record<string, unknown>) {
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.voice_id) onSet({ voice_id: r.voice_id, voice_name: r.voice_name, preview_url: r.preview_url ?? null });
    else setErr(r?.error || "Could not set the voice.");
  }
  async function designVoice() {
    if (!desc.trim() || designing) return;
    setDesigning(true); setErr(""); setPreviews([]);
    const r = await fetch(`/api/influencers/${influencerId}/voice/design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: desc.trim() }) }).then((x) => x.json()).catch(() => null);
    setDesigning(false);
    if (r?.previews?.length) { setPreviews(r.previews); setDesignDesc(r.voice_description || ""); }
    else setErr(r?.error || "Could not design a voice.");
  }
  async function useDesigned(generatedVoiceId: string, heardUrl: string) {
    if (savingId) return;
    setSavingId(generatedVoiceId); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/voice/design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generatedVoiceId, voice_description: designDesc }) }).then((x) => x.json()).catch(() => null);
    setSavingId("");
    // Show the EXACT preview the producer just listened to (heardUrl), not a fresh ElevenLabs sample, so
    // the selected voice matches what they picked. The created voice_id IS that option's generated voice.
    if (r?.voice_id) { onSet({ voice_id: r.voice_id, voice_name: r.voice_name, preview_url: heardUrl || r.preview_url || null }); setPreviews([]); }
    else setErr(r?.error || "Could not save the designed voice.");
  }

  const fq = q.trim().toLowerCase();
  // Voices YOU made (cloned / generated / professional - not "premade" stock) always show and sort
  // first; the accent chip only narrows the STOCK library (your designed voices have no accent label,
  // so they must never be filtered out by it).
  const isMine = (v: LibVoice) => !!v.category && v.category !== "premade";
  const byAccent = accent ? lib.filter((v) => isMine(v) || `${v.labels?.accent || ""} ${v.labels?.description || ""} ${v.name}`.toLowerCase().includes(accent.toLowerCase())) : lib;
  const matched = fq ? byAccent.filter((v) => `${v.name} ${Object.values(v.labels || {}).join(" ")}`.toLowerCase().includes(fq)) : byAccent;
  const fv = [...matched].sort((a, b) => Number(isMine(b)) - Number(isMine(a)));

  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      {voiceId && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-ready/30 bg-ready/8 px-3 py-2">
          <span className="text-sm font-semibold text-ready">🔊 {voiceName || "Voice set"}</span>
          {voicePreview && <audio src={voicePreview} controls className="h-8" />}
          <span className="text-[11px] text-ink-faint">{name}&apos;s current voice</span>
        </div>
      )}
      <div className="mb-3 flex gap-2">
        {([["library", "Pick a voice"], ["design", "Design a voice"], ["upload", "Upload my voice"], ["auto", "Auto-match"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setVtab(k)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${vtab === k ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{l}</button>
        ))}
      </div>

      {vtab === "library" && (
        <div className="space-y-2">
          <div>
            <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Accent</div>
            <div className="flex flex-wrap gap-1.5">
              {ACCENTS.map((a) => (
                <button key={a} onClick={() => setAccent(accent === a ? "" : a)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${accent === a ? "border-[#a855f7] bg-[#a855f7]/15 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{a}</button>
              ))}
              {accent && <button onClick={() => setAccent("")} className="rounded-full px-2 py-1 text-[11px] text-ink-faint hover:text-ink">clear</button>}
            </div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search voices - name, accent (e.g. South African), gender, age…" className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-[#a855f7]" />
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {fv.length === 0 && <p className="px-1 py-2 text-[12px] text-ink-faint">{lib.length ? "No voices match that search." : "Loading your voices…"}</p>}
            {fv.map((v) => {
              const on = sel === v.voice_id;
              const d = [v.labels?.gender, v.labels?.accent, v.labels?.age, v.labels?.description, v.labels?.use_case].filter(Boolean).join(" · ");
              return (
                <div key={v.voice_id} onClick={() => setSel(v.voice_id)} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${on ? "border-[#a855f7] bg-[#a855f7]/10" : "border-line hover:border-line-strong"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{v.name}{isMine(v) && <span className="ml-2 rounded bg-[#a855f7]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#c79bff]">Yours</span>}{on && <span className="ml-2 text-[10px] font-bold text-[#c79bff]">✓ selected</span>}</div>
                    {d && <div className="truncate text-[11px] text-ink-faint">{d}</div>}
                  </div>
                  {v.preview_url && <audio src={v.preview_url} controls className="h-8 w-40 shrink-0" onClick={(e) => e.stopPropagation()} />}
                </div>
              );
            })}
          </div>
          <button onClick={() => sel && setVia({ action: "select", voiceId: sel, voiceName: lib.find((v) => v.voice_id === sel)?.name })} disabled={!sel || busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{busy ? "Setting…" : "Use this voice"}</button>
        </div>
      )}

      {vtab === "design" && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-faint">Describe the voice and we design it. Be specific, e.g. &quot;South African female, late twenties, warm and chatty, soft Afrikaans twang.&quot;</p>
          <div className="flex flex-wrap gap-1.5">
            {ACCENTS.map((a) => (
              <button key={a} onClick={() => setDesc((d) => (d.toLowerCase().includes(a.toLowerCase()) ? d : `${a} accent. ${d}`.trim()))} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-dim transition hover:border-[#a855f7] hover:text-[#c79bff]">+ {a}</button>
            ))}
          </div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Describe the voice…" className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
          <button onClick={designVoice} disabled={!desc.trim() || designing} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{designing ? "Designing voice options…" : "✨ Design voice options"}</button>
          {previews.length > 0 && (
            <div className="mt-1 space-y-2">
              <p className="text-[11px] text-ink-faint">Listen and pick your favourite:</p>
              {previews.map((p, i) => (
                <div key={p.generatedVoiceId} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                  <span className="text-xs font-semibold text-ink-dim">Option {i + 1}</span>
                  <audio src={p.url} controls className="h-8" />
                  <button onClick={() => useDesigned(p.generatedVoiceId, p.url)} disabled={!!savingId} className="rounded-lg border border-[#a855f7]/50 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{savingId === p.generatedVoiceId ? "Saving…" : "Use this voice"}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {vtab === "upload" && (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-faint">Upload <b>one clear recording</b> of the voice - about 1-2 minutes of natural speaking with minimal background noise (one good file clones better than several short ones). We clone it once, then the producer generates {name}&apos;s lines in that exact voice and slices them per scene, just like a library voice. Your recording is only used to train the clone - it doesn&apos;t need to be the script.</p>
          <Uploader kind="voice-sample" accept="audio" multiple label="Upload your voice recording" onUploaded={(url) => setSamples((s) => [...s, url])} />
          {samples.length > 0 && <p className="text-[12px] text-ready">✓ {samples.length} recording{samples.length > 1 ? "s" : ""} added{samples.length === 1 ? " - that&apos;s enough" : ""}</p>}
          <label className="flex items-start gap-2 text-[12px] text-ink-dim">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#a855f7]" />
            <span>I confirm the person whose voice this is has consented to it being cloned and used in these videos.</span>
          </label>
          <button onClick={() => setVia({ action: "clone", sampleUrls: samples, consentId: consent ? `consent-${Date.now()}` : "", voiceName: `${name} (my voice)` })} disabled={busy || !samples.length || !consent} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{busy ? "Cloning your voice…" : "🎙️ Clone my voice"}</button>
          <p className="text-[10px] text-ink-faint">Cloning a real voice requires consent. If this is blocked, ask an admin to enable voice cloning for the account.</p>
        </div>
      )}

      {vtab === "auto" && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setVia({ action: "auto" })} disabled={busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{busy ? "Setting up…" : "Use a matched voice"}</button>
          <span className="text-[13px] text-ink-faint">We pick a natural voice matched to {name}&apos;s gender.</span>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}
    </div>
  );
}
