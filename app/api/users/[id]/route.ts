import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUser } from "@/lib/users";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const { id } = await params;
  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
