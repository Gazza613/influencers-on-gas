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
// Proven, reliable: match on GENDER only (descriptor scoring was landing on odd library voices).
// The user picks accent/quality explicitly in the VoicePicker.
export async function pickVoiceForGender(gender?: string, _descriptor?: string): Promise<{ voice_id: string; name: string } | null> {
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

// Scribe (speech-to-text) with WORD-LEVEL timestamps - used to align an uploaded real-voice recording
// to the script so we can slice it per scene (not for generating a voice).
export async function scribeTranscribe(audioUrl: string): Promise<{ text: string; words: { text: string; start: number; end: number }[] }> {
  const k = await key();
  if (!isSafePublicUrl(audioUrl)) throw new Error("Unsafe audio URL");
  const r = await fetch(audioUrl, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("Could not fetch the recording");
  const ct = (r.headers.get("content-type") || "audio/mpeg").split(";")[0];
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("timestamps_granularity", "word");
  form.append("file", new Blob([await r.arrayBuffer()], { type: ct }), "voiceover");
  const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "xi-api-key": k }, body: form });
  const data = (await res.json().catch(() => ({}))) as { text?: string; words?: { text?: string; start?: number; end?: number; type?: string }[] };
  if (!res.ok) throw new Error(`Scribe failed (${res.status}): ${JSON.stringify((data as { detail?: unknown }).detail || data).slice(0, 180)}`);
  const words = (Array.isArray(data.words) ? data.words : [])
    .filter((w) => (w.type || "word") === "word" && typeof w.start === "number" && typeof w.end === "number")
    .map((w) => ({ text: String(w.text || ""), start: Number(w.start), end: Number(w.end) }));
  return { text: String(data.text || ""), words };
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

// Voice SPEED (producer-tunable): ElevenLabs accepts voice_settings.speed in [0.7, 1.2] (1 = default).
// Slightly faster (e.g. 1.1) often reads more natural/energetic. Added only when set + non-default.
function withSpeed(vs: Record<string, unknown>, speed?: number): Record<string, unknown> {
  if (typeof speed === "number" && speed > 0 && Math.abs(speed - 1) > 0.001) vs.speed = Math.max(0.7, Math.min(1.2, speed));
  return vs;
}

export async function tts(voiceId: string, text: string, opts: { expressive?: boolean; modelId?: string; speed?: number } = {}): Promise<Buffer> {
  text = sayable(text);
  // v2 (Stable) would SPEAK bracketed audio tags aloud; strip them. v3 (Expressive) reads them as direction.
  if (!opts.expressive) text = text.replace(/\[[^\]]*\]/g, " ").replace(/\s{2,}/g, " ").trim();
  const k = await key();
  const expressive = opts.expressive ?? false;
  const modelId = opts.modelId || (expressive ? EXPRESSIVE_MODEL : STABLE_MODEL);
  const voice_settings = withSpeed(expressive
    ? { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true }
    : { stability: 0.5, similarity_boost: 0.75 }, opts.speed);
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
// storyboard timecodes - that estimate mismatch was the root of the scene-switch pause + the audio
// overlapping into the next scene. Returns the same voice/model audio + the measured duration.
export async function ttsWithDuration(voiceId: string, text: string, opts: { expressive?: boolean; modelId?: string; speed?: number } = {}): Promise<{ buffer: Buffer; durationSeconds: number | null }> {
  text = sayable(text);
  // v2 (Stable) would SPEAK bracketed audio tags aloud; strip them. v3 (Expressive) reads them as direction.
  if (!opts.expressive) text = text.replace(/\[[^\]]*\]/g, " ").replace(/\s{2,}/g, " ").trim();
  const k = await key();
  const expressive = opts.expressive ?? false;
  const modelId = opts.modelId || (expressive ? EXPRESSIVE_MODEL : STABLE_MODEL);
  const voice_settings = withSpeed(expressive
    ? { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true }
    : { stability: 0.5, similarity_boost: 0.75 }, opts.speed);
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

// VOICE-ONCE: synthesize the WHOLE approved script in ONE call (raw PCM + per-character timestamps),
// so the voice is a single continuous take. We then slice it per scene by the timestamps - that is
// what makes the voice IDENTICAL across every scene (per-scene generation is why it drifts), and what
// makes "what we hear" literally "what we get". Returns 16-bit/44.1kHz/mono PCM + char end times.
export async function ttsPcm(voiceId: string, text: string, opts: { expressive?: boolean; modelId?: string; speed?: number } = {}): Promise<{ pcm: Buffer; charEndTimes: number[] }> {
  text = sayable(text);
  // v2 (Stable) would SPEAK bracketed audio tags aloud; strip them. v3 (Expressive) reads them as direction.
  if (!opts.expressive) text = text.replace(/\[[^\]]*\]/g, " ").replace(/\s{2,}/g, " ").trim();
  const k = await key();
  const expressive = opts.expressive ?? false;
  const modelId = opts.modelId || (expressive ? EXPRESSIVE_MODEL : STABLE_MODEL);
  // Higher stability + similarity = more consistent, faithful delivery (avoid Creative). This is the
  // owner's "voice doesn't stay consistent" lever, on the WYSIWYG stable model.
  const voice_settings = withSpeed(expressive
    ? { stability: 0.5, similarity_boost: 0.85, style: 0.4, use_speaker_boost: true }
    : { stability: 0.7, similarity_boost: 0.85 }, opts.speed);
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}/with-timestamps?output_format=pcm_44100`, {
    method: "POST",
    headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ text, model_id: modelId, voice_settings }),
  });
  if (!res.ok) throw new Error(`ttsPcm failed (${res.status} ${modelId})`);
  const data = (await res.json()) as { audio_base64?: string; alignment?: { character_end_times_seconds?: number[] } };
  if (!data.audio_base64) throw new Error("ttsPcm: no audio");
  return { pcm: Buffer.from(data.audio_base64, "base64"), charEndTimes: data.alignment?.character_end_times_seconds ?? [] };
}

// Slice a span out of a 16-bit/44.1kHz/mono PCM buffer and wrap it as a playable WAV (HeyGen + Shotstack
// both accept WAV). No ffmpeg needed - PCM is one sample per 2 bytes, so a time slice is a byte slice.
export function pcmSliceToWav(pcm: Buffer, startSec: number, endSec: number): Buffer {
  const SR = 44100, CH = 1, BPS = 2;
  const startByte = Math.min(pcm.length, Math.max(0, Math.floor(startSec * SR) * BPS));
  const endByte = Math.min(pcm.length, Math.max(startByte, Math.floor(endSec * SR) * BPS));
  // COPY (don't mutate the shared pcm) and apply a ~4ms fade in/out so the slice starts and ends at zero
  // amplitude. Without this, two slices played back-to-back jump from one non-zero sample to another at the
  // scene cut = an audible CLICK. 4ms is far shorter than any speech transient, so it's inaudible.
  const data = Buffer.from(pcm.subarray(startByte, endByte));
  const nS = Math.floor(data.length / BPS);
  const fadeN = Math.min(Math.floor(nS / 2), Math.floor((SR * 4) / 1000));
  for (let i = 0; i < fadeN; i++) {
    const g = i / fadeN;
    data.writeInt16LE(Math.round(data.readInt16LE(i * BPS) * g), i * BPS);
    const j = nS - 1 - i;
    data.writeInt16LE(Math.round(data.readInt16LE(j * BPS) * g), j * BPS);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CH, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * CH * BPS, 28); h.writeUInt16LE(CH * BPS, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
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

  // BEST-OF-BREED: try a music_v2 COMPOSITION PLAN first - structured styles with hard negatives
  // (no vocals, no artist imitation), which gives more control AND auto-rejects copyrighted refs.
  // Falls back to the prompt-based endpoint below if the plan shape isn't accepted.
  try {
    const styles = (stripped || "warm modern background").split(/[,.;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
    // Split into MULTIPLE shorter sections so the model fills the WHOLE duration. A single long section
    // left ~9s of trailing SILENCE at the end (the model composed ~65s then stopped) - chunks of ~25s each
    // are each composed fully, so the bed plays continuously to the very end with no dead air.
    const SECTION_MS = 25000;
    const nSec = Math.max(1, Math.ceil(ms / SECTION_MS));
    const secMs = Math.round(ms / nSec);
    const sections = Array.from({ length: nSec }, (_, i) => ({
      section_name: nSec === 1 ? "bed" : i === 0 ? "intro" : i === nSec - 1 ? "outro" : `part${i}`,
      positive_local_styles: [],
      negative_local_styles: ["vocals"],
      duration_ms: i === nSec - 1 ? ms - secMs * (nSec - 1) : secMs,
      lines: [],
    }));
    const composition_plan = {
      positive_global_styles: styles.length ? styles : ["warm", "modern", "instrumental"],
      negative_global_styles: ["vocals", "lyrics", "singing", "spoken word", "any specific real artist, band or song", "copyrighted melody"],
      sections,
    };
    const res = await fetch(`${BASE}/music`, { method: "POST", headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify({ composition_plan, model_id: "music_v2" }), signal: AbortSignal.timeout(150000) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 401 || res.status === 402 || res.status === 429) throw new Error(`music_v2 ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`); // auth/quota - don't bother with fallback
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
      // Hard timeout so a hung/queued music request can't stall the whole audio step - the caller
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
