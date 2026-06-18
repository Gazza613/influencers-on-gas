import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { getBrain, createSource, deleteSource, purgeBrain } from "@/lib/brains";

// Add a knowledge source to a brain: a website URL (scraped) or pasted text.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const type = body.type === "website" ? "website" : "text";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  let uri = typeof body.uri === "string" ? body.uri.trim() : "";

  if (type === "website") {
    if (!/^https?:\/\//i.test(uri)) return NextResponse.json({ error: "Enter a valid website URL (https://…)." }, { status: 400 });
  } else {
    if (text.length < 20) return NextResponse.json({ error: "Paste a bit more text to learn from." }, { status: 400 });
    if (!uri) uri = "Pasted note";
  }

  const sourceId = await createSource(id, type, uri);
  try {
    await inngest.send({ name: "brain/ingest.source", data: { sourceId, clientId: id, type, uri, text } });
  } catch {
    return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, sourceId });
}

// Delete one source (?sourceId=…) or nuke ALL knowledge for the brain (?sourceId=all).
// Chunks + embeddings cascade. The brain itself stays (use DELETE /api/brains/[id] to remove it).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  const sourceId = new URL(req.url).searchParams.get("sourceId") || "";
  if (!sourceId) return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  if (sourceId === "all") await purgeBrain(id);
  else await deleteSource(id, sourceId);
  return NextResponse.json({ ok: true });
}
