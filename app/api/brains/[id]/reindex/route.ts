import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { inngest } from "@/lib/inngest";

// RE-INDEX a brain in place: re-embed every stored chunk with the CURRENT embedding model.
//
// Needed whenever the embedding model changes: a voyage-4-lite query vector compared against voyage-3.5
// document vectors returns meaningless similarity (same 1024 dims, so it fails silently rather than erroring).
// Lossless - chunk content is stored, so nothing is re-crawled and no pasted note is lost.
//
// DURABLE (audit B5): this now fires an Inngest job rather than re-embedding inline. A large brain could exceed
// the request cap half-way and leave mixed-model vectors (silent retrieval noise); the durable job re-embeds one
// batch per retryable step, so it cannot half-finish.
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const engine = await inngest.send({ name: "brain/reindex", data: { clientId: id, userEmail: session.user.email ?? null } }).catch(() => null);
  if (!engine) return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  return NextResponse.json({ ok: true, started: true });
}
