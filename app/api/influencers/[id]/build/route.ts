import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// Stage 2 — build the consistent identity set (angles + close-ups) from a chosen look.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const chosenUrl = typeof body.chosenUrl === "string" ? body.chosenUrl : "";

  // Validate the chosen URL is one of this influencer's casting candidates.
  const inf = await getInfluencer(id);
  const candidates = ((inf?.persona as { candidates?: { url: string }[] } | undefined)?.candidates ?? []).map((c) => c.url);
  if (!chosenUrl || !candidates.includes(chosenUrl)) {
    return NextResponse.json({ error: "Pick one of the generated looks first." }, { status: 400 });
  }

  await updateInfluencer(id, { status: "generating" });
  try {
    await inngest.send({ name: "influencer/build.identity", data: { influencerId: id, chosenUrl } });
  } catch {
    return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
