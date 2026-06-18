import { getSecret } from "../connections";

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

// Text to speech → MP3 bytes. eleven_multilingual_v2 is the strong general voice model.
export async function tts(voiceId: string, text: string, modelId = "eleven_multilingual_v2"): Promise<Buffer> {
  const k = await key();
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) throw new Error(`TTS failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 180)}`);
  return Buffer.from(await res.arrayBuffer());
}

// Short preview line so the producer can hear a voice before locking it.
export async function previewVoice(voiceId: string, line = "Hi, this is how I will sound in your videos."): Promise<Buffer> {
  return tts(voiceId, line);
}
