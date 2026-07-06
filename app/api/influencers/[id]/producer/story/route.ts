import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { shapeStory } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// STORY HELPER: shape the producer's rough notes (or the brief) into a vivid, top-1% story for the ad. The
// producer reviews + edits it in the story box, then Directs it into the storyboard. Returns { storyline }.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  const b = await req.json().catch(() => ({}));
  const storyline = typeof b.storyline === "string" ? b.storyline.slice(0, 3000) : "";
  const brand = typeof b.brand === "string" ? b.brand.trim().slice(0, 200) : "";
  if (!storyline.trim() && !brand) return NextResponse.json({ error: "Write a few notes in the story box (or add a brand below), then I can shape it." }, { status: 400 });
  const durationSeconds = [15, 30, 45, 60].includes(Number(b.durationSeconds)) ? Number(b.durationSeconds) : 45;

  const bible = (persona.bible ?? {}) as { signature_line?: string; identity?: Record<string, string> };
  const profile = [persona.tagline, bible.signature_line, bible.identity?.ethnicity_design, persona.persona_summary]
    .filter((x): x is string => typeof x === "string" && !!x.trim()).join(". ").slice(0, 800);

  try {
    const out = await shapeStory({
      influencerName: inf.name, influencerProfile: profile, storyline, brand,
      offer: typeof b.offer === "string" ? b.offer.slice(0, 400) : "",
      benefits: typeof b.benefits === "string" ? b.benefits.slice(0, 600) : "",
      cta: typeof b.cta === "string" ? b.cta.slice(0, 300) : "",
      tone: typeof b.tone === "string" ? b.tone.slice(0, 200) : "",
      setting: typeof b.setting === "string" ? b.setting.slice(0, 200) : "",
      durationSeconds,
    });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "story", count: 1 }).catch(() => {});
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
