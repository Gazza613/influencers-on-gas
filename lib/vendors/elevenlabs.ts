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
