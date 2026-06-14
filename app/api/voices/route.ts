import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listVoices } from "@/lib/vendors/elevenlabs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
}
