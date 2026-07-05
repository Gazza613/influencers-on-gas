import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { ttsPcm, pcmSliceToWav, sayable } from "@/lib/vendors/elevenlabs";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// THE FULL VOICEOVER step: synthesize the WHOLE approved script as ONE continuous take, so the voice is
// identical across every scene, and the producer can LISTEN to the exact audio that will ship (WYSIWYG).
// We slice it per scene by ElevenLabs timestamps and store both the full file + per-scene slices on the
// production; Animate reuses those slices (no re-generation, no drift).
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  const prod = ((inf?.persona as Record<string, unknown>)?.production ?? {}) as Record<string, unknown>;
  return NextResponse.json({ voiceover_url: prod.voiceover_url ?? null, scenes: Array.isArray(prod.scene_audio) ? (prod.scene_audio as unknown[]).length : 0 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const body = await req.json().catch(() => ({}));

  // MANUAL path: the producer uploaded their OWN voice recording; the client already sliced it per scene
  // (Web Audio, using the Scribe alignment) and uploaded the pieces. Store them as the scene audio - the
  // animate/stitch pipeline reuses these exactly like the generated voice-once slices.
  if (Array.isArray(body.scene_audio)) {
    const clean = (body.scene_audio as { scene?: number; url?: string; duration?: number }[])
      .filter((e) => typeof e?.scene === "number" && typeof e?.url === "string" && isSafePublicUrl(e.url))
      .map((e) => ({ scene: e.scene as number, url: e.url as string, duration: Number(e.duration) || 0 }));
    if (!clean.length) return NextResponse.json({ error: "No valid sliced audio to save." }, { status: 400 });
    const voUrl = typeof body.voiceover_url === "string" && isSafePublicUrl(body.voiceover_url) ? body.voiceover_url : (clean[0]?.url ?? null);
    const prod = (persona.production ?? {}) as Record<string, unknown>;
    await updateInfluencer(id, { persona: { ...persona, production: { ...prod, voiceover_url: voUrl, scene_audio: clean, voiceover_at: Date.now(), voiceover_source: "uploaded" } } });
    return NextResponse.json({ voiceover_url: voUrl, scenes: clean.length });
  }

  const voiceId = String(persona.voice_id || "");
  if (!voiceId) return NextResponse.json({ error: "Set a voice first." }, { status: 400 });
  const production = (persona.production ?? null) as { storyboard?: { scenes?: Record<string, string>[] } } | null;
  const scenes = production?.storyboard?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });

  // Build the full read from every scene's line, in order; remember each scene's char span.
  const parts: { i: number; start: number; end: number }[] = [];
  let full = "";
  scenes.forEach((sc, i) => {
    // Pre-apply sayable() (respell + comma de-click) HERE so the char spans match the exact text the TTS
    // speaks - otherwise dropping commas would shift the slice timestamps and mis-cut the per-scene audio.
    const ln = sayable(String(sc.vo_line || "").trim());
    if (!ln) return;
    const start = full.length ? full.length + 1 : 0;
    full += (full.length ? " " : "") + ln;
    parts.push({ i, start, end: full.length });
  });
  if (!full.trim() || !parts.length) return NextResponse.json({ error: "No spoken lines in the storyboard." }, { status: 400 });

  try {
    // v3 (Expressive) when the producer chose it - more realistic, dynamic delivery + audio-tag support.
    const expressive = persona.voice_model === "v3" || process.env.AROLL_EXPRESSIVE === "1";
    const { pcm, charEndTimes } = await ttsPcm(voiceId, full, { expressive, speed: Number(persona.voice_speed) || undefined, presayabled: true });
    if (!charEndTimes.length) throw new Error("no timestamps");
    const timeAt = (c: number) => charEndTimes[Math.min(charEndTimes.length - 1, Math.max(0, c))] || 0;
    const totalSec = pcm.length / (44100 * 2);
    // Whole take → one WAV the producer can listen to.
    const voiceover_url = await putBytes(pcmSliceToWav(pcm, 0, totalSec), "voiceover", "wav", "audio/wav");
    // Per-scene slices → Animate reuses these (consistent + WYSIWYG). Each slice also carries `cues`: the
    // start time (seconds, relative to the scene's own audio) of every spoken word, from the SAME ElevenLabs
    // timestamps - so the stitch can place each caption chunk at the exact moment she starts speaking it.
    const scene_audio: { scene: number; url: string; duration: number; cues?: number[] }[] = [];
    for (const p of parts) {
      const startSec = p.start > 0 ? timeAt(p.start - 1) : 0;
      const endSec = timeAt(p.end - 1);
      if (!(endSec > startSec)) continue;
      const url = await putBytes(pcmSliceToWav(pcm, startSec, endSec), "scene-vo", "wav", "audio/wav").catch(() => null);
      if (!url) continue;
      const cues: number[] = [];
      const seg = full.slice(p.start, p.end);
      const re = /\S+/g; let m: RegExpExecArray | null;
      while ((m = re.exec(seg))) { const ci = p.start + m.index; cues.push(Math.max(0, Math.round(((ci > 0 ? timeAt(ci - 1) : 0) - startSec) * 100) / 100)); }
      scene_audio.push({ scene: p.i, url, duration: endSec - startSec, cues });
    }
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {});
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, voiceover_url, scene_audio, voiceover_at: Date.now() } } });
    return NextResponse.json({ voiceover_url, scenes: scene_audio.length, total_seconds: Math.round(totalSec) });
  } catch (e) {
    return NextResponse.json({ error: `Could not generate the voiceover: ${String((e as Error)?.message || e).slice(0, 160)}` }, { status: 502 });
  }
}
