import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteInfluencer } from "@/lib/influencers";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteInfluencer(id);
  return NextResponse.json({ ok: true });
}
