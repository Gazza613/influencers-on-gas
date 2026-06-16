import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFinishedVideos, setShowcased } from "@/lib/showcase";

export const dynamic = "force-dynamic";

// List every finished video with its showcase flag (for the internal manager).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ videos: await listFinishedVideos() });
}

// Flag a production into the showcase or remove it again.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await setShowcased(id, body.showcased === true);
  return NextResponse.json({ ok: true });
}
