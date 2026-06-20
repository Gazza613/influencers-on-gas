import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteEndCard } from "@/lib/endcards";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteEndCard(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 160) }, { status: 500 });
  }
}
