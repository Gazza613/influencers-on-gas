import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { retrieve } from "@/lib/rag";

// Test the brain: retrieve the most relevant chunks for a query (scoped to this brain).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "Type a question to test the brain." }, { status: 400 });
  try {
    const hits = await retrieve(id, query, 6);
    return NextResponse.json({ hits });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
