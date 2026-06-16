import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { generateBibleSection } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// Reimagine a single Character Casting section with AI (kept consistent with the rest).
export const maxDuration = 60;

const SECTIONS = ["identity", "face", "psychology", "performance", "portrait", "wardrobe", "palette", "voice_descriptor", "signature_line"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Influencer not found" }, { status: 404 });

  const { section } = await req.json().catch(() => ({}));
  if (!SECTIONS.includes(section)) return NextResponse.json({ error: "Unknown section" }, { status: 400 });

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const bible = (persona.bible as Record<string, unknown>) ?? null;
  if (!bible) return NextResponse.json({ error: "Design the character first." }, { status: 400 });

  try {
    const value = await generateBibleSection(inf.name, (persona.brief as string) ?? "", bible, section);
    const nextBible = { ...bible, [section]: value };
    await updateInfluencer(id, { persona: { ...persona, bible: nextBible } });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-opus-4-8", unit: "bible", action: "bible", count: 1 }).catch(() => {});
    return NextResponse.json({ section, value });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
