import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { generateScript } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// SCRIPT-FIRST: write the spoken voiceover from the concept + length, for the producer to review/edit
// BEFORE the scenes are built. Returns the script text; the client edits it, then sends it to /storyboard
// (as `script`) so the scenes are built around the approved words.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const b = await req.json().catch(() => ({}));
  if (!String(b.brand || "").trim() || !String(b.offer || "").trim()) {
    return NextResponse.json({ error: "Add at least a brand/product and the core offer." }, { status: 400 });
  }
  const bibleId = ((persona.bible as { identity?: Record<string, string> })?.identity) ?? {};
  const influencerProfile = [bibleId.age && `age ${bibleId.age}`, bibleId.profession, bibleId.ethnicity_design, bibleId.build]
    .filter(Boolean).join(", ") || String((persona.bible as { signature_line?: string })?.signature_line || "");
  try {
    const script = await generateScript({
      influencerName: inf.name,
      influencerProfile,
      brand: String(b.brand || "").trim(),
      goal: String(b.goal || "drive awareness and action").trim(),
      offer: String(b.offer || "").trim(),
      benefits: String(b.benefits || "").trim(),
      cta: String(b.cta || "").trim(),
      ctaCode: String(b.ctaCode || "").trim(),
      durationSeconds: [15, 30, 45, 60].includes(Number(b.durationSeconds)) ? Number(b.durationSeconds) : 60,
      tone: String(b.tone || "warm, confident, effortless").trim(),
      setting: String(b.setting || "").trim(),
    });
    if (!script) return NextResponse.json({ error: "The writer returned an empty script. Try again." }, { status: 502 });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: "script", count: 1 }).catch(() => {});
    return NextResponse.json({ script });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
