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
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!url) {
    await updateProductionFields(id, { wardrobe_lock: "" });
    return NextResponse.json({ wardrobe: "" });
  }
  if (!isSafePublicUrl(url)) return NextResponse.json({ error: "That image URL could not be read." }, { status: 400 });

  const wardrobe = await describeOutfit(url).catch(() => "");
  if (!wardrobe) return NextResponse.json({ error: "Could not read the outfit from that image - try another guide." }, { status: 502 });
  await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-haiku-4-5", unit: "image", action: "wardrobe", count: 1 }).catch(() => {});
  await updateProductionFields(id, { wardrobe_lock: wardrobe });
  return NextResponse.json({ wardrobe });
}
