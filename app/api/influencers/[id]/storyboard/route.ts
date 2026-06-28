import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { generateStoryboard } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";
import { bibleProfile } from "@/lib/bible";

const safeUrl = (v: unknown): string => (typeof v === "string" && isSafePublicUrl(v) ? v : "");

// THE PRODUCER step 1: turn a brief into a directed 6-beat storyboard (house style), stored on
// the influencer as the current production. The UI reviews/edits it, then drives shot + clip gen.
export const maxDuration = 120;
export const dynamic = "force-dynamic"; // never cache - the UI polls this live for shot/clip progress

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = (inf.persona ?? {}) as Record<string, unknown>;
  return NextResponse.json({ production: p.production ?? null });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  if (!persona.locked) return NextResponse.json({ error: "Lock the influencer's identity first." }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  // Influencer profile from the locked bible - so the director casts an age/demographic-suited world,
  // wardrobe and background extras (even when the producer doesn't stipulate a setting).
  const bibleId = ((persona.bible as { identity?: Record<string, string> })?.identity) ?? {};
  // The FULL character bible (identity + performance + psychology + signature wardrobe/palette + tone)
  // drives the director, so the cast world, wardrobe, performance and VO all align to the character.
  const influencerProfile = bibleProfile(persona.bible as Record<string, unknown>)
    || [bibleId.age && `age ${bibleId.age}`, bibleId.profession, bibleId.ethnicity_design, bibleId.build].filter(Boolean).join(", ");
  const brief = {
    influencerName: inf.name,
    influencerProfile,
    brand: String(b.brand || "").trim(),
    goal: String(b.goal || "drive awareness and action").trim(),
    offer: String(b.offer || "").trim(),
    benefits: String(b.benefits || "").trim(),
    cta: String(b.cta || "").trim(),
    ctaCode: String(b.ctaCode || "").trim(),
    durationSeconds: [15, 30, 45, 60].includes(Number(b.durationSeconds)) ? Number(b.durationSeconds) : 60,
    format: b.format === "1:1" ? "1:1 (1080x1080)" : "9:16 (1080x1920)",
    talent: String(b.talent || "").trim(),
    setting: String(b.setting || "").trim(),
    tone: String(b.tone || "warm, confident, effortless").trim(),
    logo: String(b.logo || "").trim(),
    legal: String(b.legal || "").trim(),
    script: String(b.script || "").trim().slice(0, 6000), // approved script-first read: built into the scenes verbatim
    // Optional uploads: a clothing ref + a location ref steer the SHOOT; a transparent PNG logo +
    // its corner are burned onto the final cut at assembly.
    // All URLs are SSRF-guarded (isSafePublicUrl) - they get fetched by Higgsfield/Shotstack, so an
    // internal/metadata URL must never slip through.
    clothingRef: safeUrl(b.clothingRef),
    locationRef: safeUrl(b.locationRef),
    logoUrl: safeUrl(b.logoUrl), // burned top-left
    promoUrl: safeUrl(b.promoUrl), // burned top-right
    logoPosition: ["topLeft", "topRight", "bottomLeft", "bottomRight"].includes(b.logoPosition) ? b.logoPosition : "topLeft",
    captions: b.captions !== false, // default on; burned-in VO subtitles
    endCardUrl: safeUrl(b.endCardUrl), // optional closing clip/frame from the End Cards library
    endCardKind: b.endCardKind === "image" ? "image" : "video",
  };
  if (!brief.brand || !brief.offer) return NextResponse.json({ error: "Add at least a brand/product and the core offer." }, { status: 400 });

  try {
    const storyboard = await generateStoryboard(brief);
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: "storyboard", count: 1 }).catch(() => {});
    const production = { brief, storyboard, status: "storyboard", at: Date.now() };
    await updateInfluencer(id, { persona: { ...persona, production } });
    return NextResponse.json({ production });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
