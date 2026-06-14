import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { updateInfluencer } from "@/lib/influencers";

// Kicks off the durable identity-generation job for an influencer.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await updateInfluencer(id, { status: "generating" });
  try {
    await inngest.send({ name: "influencer/generate.references", data: { influencerId: id } });
  } catch {
    return NextResponse.json(
      { error: "The generation engine isn't connected yet (Inngest). Connect it in Vercel, then retry." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
