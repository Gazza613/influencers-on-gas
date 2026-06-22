import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// THE PRODUCER step 4: "stitch the cut" — assemble the clips into one finished ad (music +
// captions + brand + VO) via Shotstack. Durable; the UI polls the storyboard GET.
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { clips?: { url?: string | null }[] } | undefined;
  if (!production?.clips?.some((c) => c.url)) return NextResponse.json({ error: "Render the clips first." }, { status: 400 });

  // Captions are opt-in at stitch (default off — they were appearing unrequested). Remember the choice
  // so a refresh-driven resume re-stitches the same way.
  const body = await req.json().catch(() => ({}));
  const captions = body.captions === true;
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, assembly_status: "running", final_url: null, stitch_captions: captions } } });
  try {
    await inngest.send({ name: "influencer/assemble.video", data: { influencerId: id, captions } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, assembly_status: "idle" } } });
    return NextResponse.json({ error: "Could not start the stitch (assembly engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
