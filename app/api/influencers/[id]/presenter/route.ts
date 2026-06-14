import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { getInfluencer } from "@/lib/influencers";

// Create the presenter (HeyGen talking avatar) from the influencer's hero image.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const inf = await getInfluencer(id);
  const refs = (inf?.look_refs as { url: string; hero?: boolean }[]) || [];
  const hero = (inf?.persona as { hero_url?: string })?.hero_url || refs.find((r) => r.hero)?.url || refs[0]?.url;
  if (!hero) return NextResponse.json({ error: "Build the identity first. There's no face to make a presenter from yet." }, { status: 400 });

  try {
    await inngest.send({ name: "influencer/create.presenter", data: { influencerId: id } });
  } catch {
    return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
