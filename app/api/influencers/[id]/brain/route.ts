import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { getBrain } from "@/lib/brains";

// Attach (or detach) a client BRAIN to this influencer. `client_id` is the brain key: once set, the Producer
// grounds "Sharpen my story" on that brain's verified facts (see producer/story/route.ts). Detach with
// clientId: null. Everything downstream fails open - no brain means the story step behaves exactly as before.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const raw = b?.clientId;
  const clientId = typeof raw === "string" && raw.trim() ? raw.trim() : null;

  // Only ever point at a brain that exists - a dangling client_id would silently disable retrieval.
  if (clientId) {
    const brain = await getBrain(clientId);
    if (!brain) return NextResponse.json({ error: "That brain no longer exists." }, { status: 404 });
  }

  await updateInfluencer(id, { client_id: clientId });
  return NextResponse.json({ ok: true, client_id: clientId });
}
