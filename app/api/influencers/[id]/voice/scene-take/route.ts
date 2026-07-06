import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateProductionFields } from "@/lib/influencers";
import { ttsPcm, pcmSliceToWav, sayable } from "@/lib/vendors/elevenlabs";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// PER-SCENE VOICE RE-TAKE: re-generate the voiceover for ONE scene only, using the SAME global voice (voice_id,
// model, speed) as the full take - so the voice stays identical, you just re-roll a single scene's read (e.g. a
// clunky delivery) without re-running the whole voiceover. The slice is flagged `locked: true`, and the full
// voiceover run PRESERVES locked slices (see the voiceover route), so a later full re-run won't clobber it.
// The stitch + animate already read scene_audio per scene, so this ships once the scene is re-animated.
export const maxDuration = 90;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const voiceId = String(persona.voice_id || "");
  if (!voiceId) return NextResponse.json({ error: "Set a voice first." }, { status: 400 });
  const production = (persona.production ?? null) as {
    storyboard?: { scenes?: Record<string, string>[] };
    scene_audio?: { scene: number; url: string; duration: number; cues?: number[]; locked?: boolean }[];
  } | null;
  const scenes = production?.storyboard?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const sceneIdx = Number(body?.scene);
  if (!Number.isInteger(sceneIdx) || sceneIdx < 0 || sceneIdx >= scenes.length) return NextResponse.json({ error: "Bad scene." }, { status: 400 });
  // Use the edited line if supplied (so a wording tweak applies), else the scene's current line.
  const rawLine = (typeof body?.text === "string" && body.text.trim() ? body.text : String(scenes[sceneIdx]?.vo_line || "")).trim();
  if (rawLine.length < 2) return NextResponse.json({ error: "This scene has no line to voice." }, { status: 400 });

  // Mirror the full-voiceover pipeline for ONE scene: respell (sayable) BEFORE synth so the caption cues line up,
  // same global model + speed, and use the timestamps to slice the WAV + place each word's caption cue.
  const line = sayable(rawLine);
  const expressive = persona.voice_model === "v3" || process.env.AROLL_EXPRESSIVE === "1";
  const speed = Number(persona.voice_speed) || undefined;
  try {
    const { pcm, charEndTimes } = await ttsPcm(voiceId, line, { expressive, speed, presayabled: true });
    if (!charEndTimes.length) throw new Error("no timestamps");
    const totalSec = pcm.length / (44100 * 2);
    const url = await putBytes(pcmSliceToWav(pcm, 0, totalSec), "scene-vo", "wav", "audio/wav");
    // Word-start cues (seconds from the slice start) for exact caption timing, same as the full take.
    const timeAt = (c: number) => charEndTimes[Math.min(charEndTimes.length - 1, Math.max(0, c))] || 0;
    const cues: number[] = [];
    const re = /\S+/g; let m: RegExpExecArray | null;
    while ((m = re.exec(line))) { const ci = m.index; cues.push(Math.max(0, Math.round(((ci > 0 ? timeAt(ci - 1) : 0)) * 100) / 100)); }
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: expressive ? "eleven_v3" : "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {});

    // Upsert this scene's slice (locked) into scene_audio, keeping every other scene untouched. Also keep the
    // scene's line text in sync if the producer edited it here.
    const existing = Array.isArray(production?.scene_audio) ? production!.scene_audio!.filter((e) => Number(e.scene) !== sceneIdx) : [];
    const nextAudio = [...existing, { scene: sceneIdx, url, duration: totalSec, cues, locked: true }].sort((a, b) => Number(a.scene) - Number(b.scene));
    const patch: Record<string, unknown> = { scene_audio: nextAudio };
    if (typeof body?.text === "string" && body.text.trim() && body.text.trim() !== String(scenes[sceneIdx]?.vo_line || "").trim()) {
      const nextScenes = scenes.map((s, i) => (i === sceneIdx ? { ...s, vo_line: rawLine, caption: rawLine } : s));
      patch["storyboard"] = { ...(production!.storyboard as Record<string, unknown>), scenes: nextScenes };
    }
    await updateProductionFields(id, patch);
    return NextResponse.json({ ok: true, scene: sceneIdx, url, duration: Math.round(totalSec * 100) / 100 });
  } catch (e) {
    return NextResponse.json({ error: `Could not re-take that scene: ${String((e as Error)?.message || e).slice(0, 160)}` }, { status: 502 });
  }
}

// UNLOCK: drop this scene's locked re-take so it reverts to the full continuous take on the next voiceover run.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = (persona.production ?? null) as { scene_audio?: { scene: number; locked?: boolean }[] } | null;
  const body = await req.json().catch(() => ({}));
  const sceneIdx = Number(body?.scene);
  if (!Number.isInteger(sceneIdx)) return NextResponse.json({ error: "Bad scene." }, { status: 400 });
  const existing = Array.isArray(production?.scene_audio) ? production!.scene_audio! : [];
  // Drop the whole slice for this scene: the next full voiceover run regenerates it as part of the continuous take.
  const nextAudio = existing.filter((e) => Number(e.scene) !== sceneIdx);
  await updateProductionFields(id, { scene_audio: nextAudio });
  return NextResponse.json({ ok: true, scene: sceneIdx, unlocked: true });
}
