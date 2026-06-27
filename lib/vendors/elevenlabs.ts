import { getSecret } from "../connections";
import { isSafePublicUrl } from "../safe-url";

const BASE = "https://api.elevenlabs.io/v1";

async function key(): Promise<string> {
  const k = await getSecret("elevenlabs");
  if (!k) throw new Error("ElevenLabs is not connected");
  return k;
}

export type Voice = {
  voice_id: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  preview_url: string | null;
};

// The agency's available ElevenLabs voices (uses the connected/vault key).
export async function listVoices(): Promise<Voice[]> {
  const res = await fetch(`${BASE}/voices`, {
    headers: { "xi-api-key": await key() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ElevenLabs voices request failed (${res.status})`);
  const data = (await res.json()) as { voices?: Record<string, unknown>[] };
  return (data.voices ?? []).map((v) => ({
    voice_id: String(v.voice_id),
    name: String(v.name ?? "Unnamed"),
    category: (v.category as string) ?? null,
    labels: (v.labels as Record<string, string>) ?? {},
    preview_url: (v.preview_url as string) ?? null,
  }));
}

// ── Voice for a-roll (Phase 2) ─────────────────────────────────────────────
// Pick the best library voice for a gender (synthetics use a designed/library voice,
// no cloning). Falls back to the first available voice.
export async function pickVoiceForGender(gender?: string): Promise<{ voice_id: string; name: string } | null> {
  const voices = await listVoices().catch(() => [] as Voice[]);
  if (!voices.length) return null;
  const g = (gender || "").toLowerCase();
  const want = g.startsWith("f") ? "female" : g.startsWith("m") ? "male" : "";
  const match = want ? voices.find((v) => (v.labels?.gender || "").toLowerCase() === want) : null;
  const v = match || voices[0];
  return { voice_id: v.voice_id, name: v.name };
}

// Clone a voice from one or more audio samples (twins, consent-gated). Returns voice_id.
export async function cloneVoice(name: string, sampleUrls: string[]): Promise<string> {
  const k = await key();
  const form = new FormData();
  form.append("name", name);
  let i = 0;
  for (const url of sampleUrls.slice(0, 5)) {
    if (!isSafePublicUrl(url)) continue; // SSRF guard on user-supplied sample URLs
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r?.ok) continue;
    const ct = (r.headers.get("content-type") || "audio/mpeg").split(";")[0];
    const ext = ct.includes("wav") ? "wav" : ct.includes("mp4") || ct.includes("m4a") ? "m4a" : "mp3";
    form.append("files", new Blob([await r.arrayBuffer()], { type: ct }), `sample_${i++}.${ext}`);
  }
  if (!i) throw new Error("No usable voice samples could be fetched");
  const res = await fetch(`${BASE}/voices/add`, { method: "POST", headers: { "xi-api-key": k }, body: form });
  const data = (await res.json().catch(() => ({}))) as { voice_id?: string; detail?: unknown };
  if (!data.voice_id) throw new Error(`Voice clone failed (${res.status}): ${JSON.stringify(data.detail || data).slice(0, 180)}`);
  return data.voice_id;
}

// The EXPRESSIVE model (supports inline audio tags like [excited], [whispers], [laughs],
// [thoughtful pause]) for the most human, believable read. Env-overridable in case the
// account's expressive model id differs; falls back to the stable model on error.
export const EXPRESSIVE_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_v3";
const STABLE_MODEL = "eleven_multilingual_v2";

// Text to speech → MP3 bytes. `expressive` uses the audio-tag model + livelier settings
// (lower stability = more emotional range), and falls back to the stable model if it errors.
// ElevenLabs mispronounces some tech/unit words (e.g. "gigabyte" → "giji byte" with a soft g).
// Respell the worst offenders phonetically just before TTS. Word-boundary, case-insensitive.
const SAYABLE: [RegExp, string][] = [
  [/\bgigabytes\b/gi, "gigga-bytes"],
  [/\bgigabyte\b/gi, "gigga-byte"],
  [/\bmegabytes\b/gi, "megga-bytes"],
  [/\bmegabyte\b/gi, "megga-byte"],
];
function sayable(t: string): string { return SAYABLE.reduce((s, [re, rep]) => s.replace(re, rep), t); }

export async function tts(voiceId: string, text: string, opts: { expressive?: boolean; modelId?: string } = {}): Promise<Buffer> {
  text = sayable(text);
  const k = await key();
  const expressive = opts.expressive ?? false;
  const modelId = opts.modelId || (expressive ? EXPRESSIVE_MODEL : STABLE_MODEL);
  const voice_settings = expressive
    ? { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true }
    : { stability: 0.5, similarity_boost: 0.75 };
  const call = async (model: string) => {
    const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, voice_settings }),
    });
    if (!res.ok) throw new Error(`TTS failed (${res.status} ${model}): ${(await res.text().catch(() => "")).slice(0, 180)}`);
    return Buffer.from(await res.arrayBuffer());
  };
  try { return await call(modelId); }
  catch (e) { if (expressive && modelId !== STABLE_MODEL) return call(STABLE_MODEL); throw e; }
}

// Same synthesis as tts(), but via the WITH-TIMESTAMPS endpoint so we also get the EXACT audio
// duration (last character end time). The a-roll timeline uses this real length instead of estimated
// storyboard timecodes — that estimate mismatch was the root of the scene-switch pause + the audio
// overlapping into the next scene. Returns the same voice/model audio + the measured duration.
export async function ttsWithDuration(voiceId: string, text: string, opts: { expressive?: boolean; modelId?: string } = {}): Promise<{ buffer: Buffer; durationSeconds: number | null }> {
  text = sayable(text);
  const k = await key();
  const expressive = opts.expressive ?? false;
  const modelId = opts.modelId || (expressive ? EXPRESSIVE_MODEL : STABLE_MODEL);
  const voice_settings = expressive
    ? { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true }
    : { stability: 0.5, similarity_boost: 0.75 };
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ text, model_id: modelId, voice_settings, output_format: "mp3_44100_128" }),
  });
  if (!res.ok) throw new Error(`TTS+timestamps failed (${res.status} ${modelId})`);
  const data = (await res.json()) as { audio_base64?: string; alignment?: { character_end_times_seconds?: number[] } };
  if (!data.audio_base64) throw new Error("TTS+timestamps: no audio");
  const buffer = Buffer.from(data.audio_base64, "base64");
  const ends = data.alignment?.character_end_times_seconds ?? [];
  const durationSeconds = ends.length ? ends[ends.length - 1] : null;
  return { buffer, durationSeconds };
}

// Short preview line so the producer can hear a voice before locking it.
export async function previewVoice(voiceId: string, line = "Hi, this is how I will sound in your videos."): Promise<Buffer> {
  return tts(voiceId, line);
}

// ── Design a voice from a text prompt (Voice Design, eleven_ttv_v3) ─────────
// Generate candidate voices from a rich description; returns previews (generated_voice_id +
// audio bytes) to play. text must be ~100+ chars for v3.
export async function designVoicePreviews(description: string, text: string): Promise<{ generatedVoiceId: string; audio: Buffer }[]> {
  const k = await key();
  const res = await fetch(`${BASE}/text-to-voice/design`, {
    method: "POST",
    headers: { "xi-api-key": k, "Content-Type": "application/json" },
    body: JSON.stringify({ voice_description: description, model_id: "eleven_ttv_v3", text }),
  });
  if (!res.ok) throw new Error(`Voice design failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { previews?: { generated_voice_id: string; audio_base_64?: string; audio_base64?: string }[] };
  return (data.previews ?? []).map((p) => ({ generatedVoiceId: p.generated_voice_id, audio: Buffer.from(p.audio_base_64 || p.audio_base64 || "", "base64") }));
}

// Save a chosen designed preview as a permanent voice → voice_id.
export async function createDesignedVoice(name: string, description: string, generatedVoiceId: string): Promise<string> {
  const k = await key();
  const res = await fetch(`${BASE}/text-to-voice`, {
    method: "POST",
    headers: { "xi-api-key": k, "Content-Type": "application/json" },
    body: JSON.stringify({ voice_name: name, voice_description: description, generated_voice_id: generatedVoiceId }),
  });
  const data = (await res.json().catch(() => ({}))) as { voice_id?: string; detail?: unknown };
  if (!data.voice_id) throw new Error(`Create designed voice failed (${res.status}): ${JSON.stringify(data.detail || data).slice(0, 200)}`);
  return data.voice_id;
}

// ── Music bed + ambient SFX (Producer assembly) ────────────────────────────
// ElevenLabs Music: a full-length scored track from a text brief. Returns mp3 bytes.
export async function generateMusic(prompt: string, lengthMs: number): Promise<Buffer> {
  const k = await key();
  const ms = Math.max(10000, Math.min(300000, Math.round(lengthMs)));
  // SAFETY: ElevenLabs Music prohibits prompts that reference real artists/bands/songs/copyrighted
  // works (a common violation trigger). Strip "like/in the style of/reminiscent of X" phrases and
  // force an original, royalty-free, no-imitation instruction onto every request.
  const stripped = prompt.replace(/\b(like|reminiscent of|in the style of|styled after|inspired by|similar to|à la|sounds like|channel(?:ling|ing)?)\b[^.,;\n]*/gi, "").replace(/\s{2,}/g, " ").trim();
  const safePrompt = `${stripped || "warm modern background music"}. An ORIGINAL, royalty-free instrumental bed; no vocals; does NOT imitate, reference or reproduce any specific artist, band, song or copyrighted work.`;

  // BEST-OF-BREED: try a music_v2 COMPOSITION PLAN first — structured styles with hard negatives
  // (no vocals, no artist imitation), which gives more control AND auto-rejects copyrighted refs.
  // Falls back to the prompt-based endpoint below if the plan shape isn't accepted.
  try {
    const styles = (stripped || "warm modern background").split(/[,.;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
    const composition_plan = {
      positive_global_styles: styles.length ? styles : ["warm", "modern", "instrumental"],
      negative_global_styles: ["vocals", "lyrics", "singing", "spoken word", "any specific real artist, band or song", "copyrighted melody"],
      sections: [{ section_name: "bed", positive_local_styles: [], negative_local_styles: ["vocals"], duration_ms: ms, lines: [] }],
    };
    const res = await fetch(`${BASE}/music`, { method: "POST", headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify({ composition_plan, model_id: "music_v2" }), signal: AbortSignal.timeout(150000) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 401 || res.status === 402 || res.status === 429) throw new Error(`music_v2 ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`); // auth/quota — don't bother with fallback
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") throw e; // genuine timeout → bubble up (caller falls back to ambient-only)
    /* otherwise: plan shape not accepted → fall through to the prompt API */
  }

  // Fallback: prompt-based Music endpoint (the proven path).
  const bodies: [string, Record<string, unknown>][] = [
    [`${BASE}/music`, { prompt: safePrompt, music_length_ms: ms }],
    [`${BASE}/music/compose`, { prompt: safePrompt, music_length_ms: ms }],
  ];
  let lastErr = "";
  for (const [url, body] of bodies) {
    try {
      // Hard timeout so a hung/queued music request can't stall the whole audio step — the caller
      // falls back to ambient-only instead of waiting indefinitely.
      const res = await fetch(url, { method: "POST", headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(body), signal: AbortSignal.timeout(150000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastErr = `${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`;
      if (res.status !== 404 && res.status !== 405) break;
    } catch (e) {
      lastErr = String((e as Error)?.message || e).slice(0, 160);
      if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") break; // don't retry the fallback after a timeout
    }
  }
  throw new Error(`Music generation failed: ${lastErr}`);
}

// ElevenLabs Sound Effects: a short ambient/foley bed from a text description.
export async function generateSfx(prompt: string, durationSeconds = 5): Promise<Buffer> {
  const k = await key();
  const res = await fetch(`${BASE}/sound-generation`, {
    method: "POST",
    headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: prompt, duration_seconds: Math.max(1, Math.min(22, durationSeconds)) }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`SFX failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}
