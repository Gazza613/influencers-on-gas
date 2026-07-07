import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateProductionFields } from "@/lib/influencers";
import { describeOutfit } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// WARDROBE LOCK: when the producer picks a guide creative, read its outfit head-to-toe RIGHT THEN and store
// it as production.wardrobe_lock, so (a) the shoot threads that exact outfit into every scene and (b) the UI
// can SHOW the producer what got locked in - proof the selection registered. Empty url clears the lock.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await req.json().catch(() => ({})); // body.url is ignored now - the source is the canonical wardrobe below

  // SINGLE WARDROBE for the whole ad. The outfit is ALWAYS read from ONE canonical source - an explicit
  // clothing upload, else the A-ROLL guide, else the B-ROLL guide - NOT from whichever guide was just clicked.
  // So the UI lock and the shoot's wardrobe are identical, and picking a b-roll world guide can't silently
  // swap the locked outfit. We re-read it on every guide change (freshest persona) and store the source URL so
  // the shoot knows the lock is current for this exact source (no stale lock).
  const per = (inf.persona ?? {}) as Record<string, unknown>;
  const prod = (per.production ?? {}) as Record<string, unknown>;
  const brief = (prod.brief ?? {}) as Record<string, string>;
  const src = String(brief.clothingRef || per.aroll_ref_url || per.broll_ref_url || "").trim();

  if (!src) { // no guide / upload left → clear the lock
    await updateProductionFields(id, { wardrobe_lock: "", wardrobe_ref_url: "" });
    return NextResponse.json({ wardrobe: "" });
  }
  if (!isSafePublicUrl(src)) return NextResponse.json({ error: "That image URL could not be read." }, { status: 400 });

  const wardrobe = await describeOutfit(src).catch(() => "");
  if (!wardrobe) return NextResponse.json({ error: "Could not read the outfit from that image - try another guide." }, { status: 502 });
  await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-haiku-4-5", unit: "image", action: "wardrobe", count: 1 }).catch(() => {});
  await updateProductionFields(id, { wardrobe_lock: wardrobe, wardrobe_ref_url: src });
  return NextResponse.json({ wardrobe });
}
