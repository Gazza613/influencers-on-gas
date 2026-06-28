import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { scribeTranscribe } from "@/lib/vendors/elevenlabs";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// Align an UPLOADED real-voice recording to the storyboard: Scribe transcribes it with word timestamps,
// then we assign words to scenes in order (by word count) and return per-scene [start,end] ranges. The
// client uses these to slice the recording per scene (Web Audio), so what you recorded is what ships.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const tokens = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl.trim() : "";
  if (!audioUrl || !isSafePublicUrl(audioUrl)) return NextResponse.json({ error: "A valid uploaded recording URL is required." }, { status: 400 });

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = (persona.production ?? null) as { storyboard?: { scenes?: Record<string, string>[] } } | null;
  const scenes = production?.storyboard?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });

  try {
    const { words } = await scribeTranscribe(audioUrl);
    if (!words.length) return NextResponse.json({ error: "Couldn't hear any speech in that recording." }, { status: 422 });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "scribe_v1", unit: "stt", action: "voice", count: 1 }).catch(() => {});

    // Assign transcript words to scenes IN ORDER by each scene's word count (the recording is the script
    // read top to bottom). Robust enough for a producer reading their own script.
    const ranges: { scene: number; start: number; end: number; duration: number }[] = [];
    let wi = 0;
    scenes.forEach((sc, i) => {
      const n = tokens(String(sc.vo_line || "")).length;
      if (!n) return;
      if (wi >= words.length) return;
      const startIdx = wi;
      const endIdx = Math.min(words.length - 1, wi + n - 1);
      const start = words[startIdx].start;
      const end = words[endIdx].end;
      if (end > start) ranges.push({ scene: i, start, end, duration: end - start });
      wi = endIdx + 1;
    });
    if (!ranges.length) return NextResponse.json({ error: "Couldn't align the recording to the script." }, { status: 422 });
    return NextResponse.json({ ranges, total_words: words.length });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 502 });
  }
}
