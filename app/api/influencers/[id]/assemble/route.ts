import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";
import { isSafePublicUrl } from "@/lib/safe-url";

// THE PRODUCER step 4: "stitch the cut" - assemble the clips into one finished ad (music +
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

  // Captions opt-in (default off); optional uploaded closing clip/image. Persist both so a refresh-driven
  // resume re-stitches the same way. URL is SSRF-guarded (Shotstack fetches it).
  const body = await req.json().catch(() => ({}));
  const captions = body.captions === true;
  const captionStyle = ["pill", "bold", "highlight", "clean", "sunny", "karaoke"].includes(body.captionStyle) ? body.captionStyle : "bold";
  const endCardUrl = typeof body.endCardUrl === "string" && isSafePublicUrl(body.endCardUrl) ? body.endCardUrl : "";
  const endCardKind = body.endCardKind === "image" ? "image" : "video";
  const briefNext = { ...(production as { brief?: Record<string, unknown> }).brief, endCardUrl, endCardKind, captionStyle };
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, brief: briefNext, assembly_status: "running", final_url: null, stitch_captions: captions } } });
  try {
    await inngest.send({ name: "influencer/assemble.video", data: { influencerId: id, captions, captionStyle, endCardUrl, endCardKind } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, assembly_status: "idle" } } });
    return NextResponse.json({ error: "Could not start the stitch (assembly engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
