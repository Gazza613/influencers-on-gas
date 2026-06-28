import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { scribeTranscribe } from "@/lib/vendors/elevenlabs";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// VOICE-FIRST scripting: the producer uploads a real voice recording; Scribe transcribes it and the
// transcript BECOMES the script. The recording is remembered (production.my_vo_url) so the Voice step
// can slice that exact audio per scene - your real voice, perfectly aligned (the script IS the transcript).
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl.trim() : "";
  if (!audioUrl || !isSafePublicUrl(audioUrl)) return NextResponse.json({ error: "A valid uploaded recording URL is required." }, { status: 400 });

  try {
    const { text } = await scribeTranscribe(audioUrl);
    const script = text.trim();
    if (!script) return NextResponse.json({ error: "Couldn't hear any speech in that recording." }, { status: 422 });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "scribe_v1", unit: "stt", action: "script", count: 1 }).catch(() => {});
    // Remember the recording so the Voice step can slice it per scene later.
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const prod = (persona.production ?? {}) as Record<string, unknown>;
    await updateInfluencer(id, { persona: { ...persona, production: { ...prod, my_vo_url: audioUrl } } });
    return NextResponse.json({ script });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 502 });
  }
}
