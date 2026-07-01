import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { tts } from "@/lib/vendors/elevenlabs";
import { expressifyScript } from "@/lib/vendors/anthropic";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// Preview a line on the chosen VOICE MODEL before committing to the full voiceover, so the producer can
// A/B v2 (Stable) vs v3 (Expressive) on the ACTUAL scene copy and hear which holds the accent.
// v2 = plain read (WYSIWYG). v3 = expressive audio tags + an optional accent cue to fight v3's accent drift.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const voiceId = persona.voice_id as string | undefined;
  if (!voiceId) return NextResponse.json({ error: "Set a voice first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1200) : "";
  if (text.length < 2) return NextResponse.json({ error: "Nothing to preview." }, { status: 400 });
  const model = body.model === "v2" ? "v2" : "v3"; // default v3 (back-compat)
  const accent = typeof body.accent === "string" ? body.accent.trim().slice(0, 40) : "";
  const speed = Number(body.speed) > 0 ? Number(body.speed) : undefined;

  try {
    let readText = text;
    if (model === "v3") {
      // v3 reads audio tags; add expressive delivery + (optional) an accent cue to counter v3's drift.
      const descriptor = String((persona.voice_description as string) || "");
      const tone = String((persona.production as { storyboard?: { tone?: string } } | undefined)?.storyboard?.tone || "natural and warm");
      readText = await expressifyScript(text, descriptor, tone, accent).catch(() => text);
      await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "voice_script", count: 1 }).catch(() => {});
    }
    const buf = await tts(voiceId, readText, { expressive: model === "v3", speed });
    const url = await putBytes(buf, "voice-preview", "mp3", "audio/mpeg");
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: model === "v3" ? "eleven_v3" : "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {});
    return NextResponse.json({ url, model, tagged: model === "v3" ? readText : undefined });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 502 });
  }
}
