import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listBrains, createBrain } from "@/lib/brains";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ brains: await listBrains() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the brain a name." }, { status: 400 });
  const id = await createBrain(name);
  return NextResponse.json({ id });
}
