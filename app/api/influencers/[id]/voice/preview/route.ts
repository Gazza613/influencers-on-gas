import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { tts } from "@/lib/vendors/elevenlabs";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// Preview the expressive read of a (possibly tagged) line before committing to a full video.
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

  try {
    const buf = await tts(voiceId, text, { expressive: true });
    const url = await putBytes(buf, "voice-preview", "mp3", "audio/mpeg");
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {});
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 502 });
  }
}
