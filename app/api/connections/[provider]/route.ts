import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteConnection, isProvider } from "@/lib/connections";

export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { provider } = await params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  await deleteConnection(provider);
  return NextResponse.json({ ok: true });
}
