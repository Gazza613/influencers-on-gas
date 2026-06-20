import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// THE PRODUCER step "music & ambient": generate the music bed + ambient room tone so the producer
// can hear them before the stitch. Durable; the UI polls the storyboard GET.
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { storyboard?: { scenes?: unknown[] } } | undefined;
  if (!production?.storyboard?.scenes?.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });

  await updateInfluencer(id, { persona: { ...persona, production: { ...production, audio_status: "running", music_url: null, ambient_url: null } } });
  try {
    await inngest.send({ name: "influencer/generate.audio", data: { influencerId: id } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, audio_status: "idle" } } });
    return NextResponse.json({ error: "Could not start the audio (generation engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
