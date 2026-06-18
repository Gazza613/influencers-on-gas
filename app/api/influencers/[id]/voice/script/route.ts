import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { expressifyScript } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

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
  if (line.length < 2) return NextResponse.json({ error: "Add a line first." }, { status: 400 });

  const descriptor = ((persona.bible as { voice_descriptor?: string })?.voice_descriptor) || "";
  const tagged = await expressifyScript(line, descriptor, tone);
  await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "voice_script", count: 1 }).catch(() => {});
  return NextResponse.json({ tagged });
}
