import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { expressifyScript } from "@/lib/vendors/anthropic";

// Voice producer: enhance a plain line into an expressively-tagged read (ElevenLabs audio
// tags + emphasis + pacing), matched to the influencer's voice descriptor + chosen tone.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  const body = await req.json().catch(() => ({}));
  const line = typeof body.line === "string" ? body.line.trim().slice(0, 1200) : "";
  const tone = typeof body.tone === "string" ? body.tone.slice(0, 60) : "natural and warm";
  const accent = typeof body.accent === "string" ? body.accent.slice(0, 40) : "";
  if (line.length < 2) return NextResponse.json({ error: "Add a line first." }, { status: 400 });

  const descriptor = ((persona.bible as { voice_descriptor?: string })?.voice_descriptor) || "";
  const tagged = await expressifyScript(line, descriptor, tone, accent, { influencerId: id, userEmail: session.user.email ?? null });
  return NextResponse.json({ tagged });
}
