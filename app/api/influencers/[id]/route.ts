import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteInfluencer, updateInfluencer, getInfluencer } from "@/lib/influencers";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const influencer = await getInfluencer(id);
  if (!influencer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ influencer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Merge a small persona patch (step hand-off: chosen face, selected frames).
  let persona: Record<string, unknown> | undefined;
  if (body.personaPatch && typeof body.personaPatch === "object") {
    const inf = await getInfluencer(id);
    if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
    persona = { ...(inf.persona as Record<string, unknown>), ...body.personaPatch };
  }

  await updateInfluencer(id, {
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : undefined,
    voice_id: typeof body.voice_id === "string" ? body.voice_id : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    ...(persona ? { persona } : {}),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteInfluencer(id);
  return NextResponse.json({ ok: true });
}
