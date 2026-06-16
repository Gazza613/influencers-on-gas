import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { refineCreativePrompt } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// "Perfect with AI": turn a rough idea into a polished, art-directed image prompt.
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const { scene } = await req.json().catch(() => ({}));

  try {
    const refined = await refineCreativePrompt(inf.name, (persona.bible as Record<string, unknown>) ?? {}, typeof scene === "string" ? scene : "");
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-opus-4-8", unit: "bible", action: "creative", count: 1 }).catch(() => {});
    return NextResponse.json({ refined });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
