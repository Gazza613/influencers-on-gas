import { NextResponse } from "next/server";
import { remainingQuota, createTalkingPhoto } from "@/lib/vendors/heygen";
import { getInfluencer } from "@/lib/influencers";

// TEMPORARY — verify HeyGen key + talking-photo creation. DELETE after wiring.
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "hgprobe-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const out: Record<string, unknown> = {};
  try {
    out.quota = await remainingQuota();
  } catch (e) {
    out.quota_error = String((e as Error)?.message || e);
  }
  // Optionally create a talking photo from an influencer's hero (?id=<influencerId>)
  const id = url.searchParams.get("id");
  if (id) {
    try {
      const inf = await getInfluencer(id);
      const hero = (inf?.persona as { hero_url?: string })?.hero_url || (inf?.look_refs as { url: string; hero?: boolean }[])?.find((r) => r.hero)?.url;
      out.hero_url = hero || null;
      if (hero) out.talking_photo_id = await createTalkingPhoto(hero);
    } catch (e) {
      out.talking_photo_error = String((e as Error)?.message || e);
    }
  }
  return NextResponse.json(out);
}
