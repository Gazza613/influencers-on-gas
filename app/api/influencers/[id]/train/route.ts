import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// Kicks off Soul training for an influencer from selected reference frames (>=5).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  let images = Array.isArray(body.images) ? body.images.filter((u: unknown) => typeof u === "string") : [];
  if (images.length < 5) {
    // fall back to all of the influencer's reference frames
    const inf = await getInfluencer(id);
    images = (inf?.look_refs as { url: string }[] | undefined)?.map((r) => r.url).filter(Boolean) ?? [];
  }
  if (images.length < 5) {
    return NextResponse.json({ error: "Select at least 5 reference frames to train." }, { status: 400 });
  }

  await updateInfluencer(id, { status: "training" });
  try {
    await inngest.send({ name: "influencer/train.soul", data: { influencerId: id, images: images.slice(0, 20) } });
  } catch {
    return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
