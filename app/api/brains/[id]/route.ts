import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrain, deleteBrain, listSources } from "@/lib/brains";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ brain, sources: await listSources(id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const { id } = await params;
  await deleteBrain(id);
  return NextResponse.json({ ok: true });
}
