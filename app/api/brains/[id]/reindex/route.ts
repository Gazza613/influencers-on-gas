import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { reembedBrain } from "@/lib/rag";
import { recordUsage } from "@/lib/usage";

// RE-INDEX a brain in place: re-embed every stored chunk with the CURRENT embedding model.
//
// Needed whenever the embedding model changes: a voyage-4-lite query vector compared against voyage-3.5
// document vectors returns meaningless similarity (same 1024 dims, so it fails silently rather than erroring).
// Lossless - chunk content is stored, so nothing is re-crawled and no pasted note is lost.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // embedding a large brain in batches of 32

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  try {
    const chunks = await reembedBrain(id);
    if (chunks) {
      await recordUsage({ clientId: id, userEmail: session.user.email ?? null, provider: "voyage", model: "voyage-4-lite", unit: "embed", action: "brain-reindex", count: chunks }).catch(() => {});
    }
    return NextResponse.json({ ok: true, chunks });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
