import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// THE PRODUCER step 2: "shoot the shots" — render a coherent image for every storyboard scene
// (durable; the UI polls the storyboard GET for production.shots). Fire-and-poll, never hangs.
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { storyboard?: { scenes?: unknown[] }; wizard_approved?: string[] } | undefined;
  if (!production?.storyboard?.scenes?.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });

  // Re-shooting the board invalidates everything downstream — clear the clips, audio and final cut
  // (back to clean stills) and reset approvals past Voice, so stale videos can't linger.
  const keptApprovals = (production.wizard_approved ?? []).filter((k) => k === "concept" || k === "voice");
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, shots: [], shots_status: "running", clips: [], clips_status: "idle", music_url: null, ambient_url: null, audio_status: "idle", final_url: null, assembly_status: "idle", wizard_approved: keptApprovals } } });
  try {
    await inngest.send({ name: "influencer/generate.shots", data: { influencerId: id } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, shots_status: "idle" } } });
    return NextResponse.json({ error: "Could not start shooting (generation engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
