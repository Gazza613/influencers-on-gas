import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteInfluencer, updateInfluencer } from "@/lib/influencers";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await updateInfluencer(id, {
    voice_id: typeof body.voice_id === "string" ? body.voice_id : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
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
