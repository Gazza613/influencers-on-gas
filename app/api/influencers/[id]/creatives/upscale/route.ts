import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { upscaleUrlTo, filterLoadable } from "@/lib/vendors/higgsfield";
import { rehostToBlob } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// Upscale ONE kept 2K shot to 4K on demand (so we only spend upscale credits on shots the
// producer actually chooses). Swaps that creative's url + resolution in place.
export const maxDuration = 300; // a 4K bytedance upscale (import + job poll + rehost) can take 1-2 min

type Creative = { id?: string; url?: string | null; resolution?: string; status?: string; [k: string]: unknown };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const creativeId = typeof body.id === "string" ? body.id : "";
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const creatives = (Array.isArray(persona.creatives) ? persona.creatives : []) as Creative[];
  const target = creatives.find((c) => (c.id || "") === creativeId);
  if (!target || !target.url) return NextResponse.json({ error: "Shot not found" }, { status: 404 });
  if (target.resolution === "4k") return NextResponse.json({ creative: target }); // already done

  const up = await upscaleUrlTo(target.url, "4k", 40).catch(() => null);
  if (!up || !(await filterLoadable([up])).length) {
    return NextResponse.json({ error: "Upscale did not return an image, please try again." }, { status: 502 });
  }
  const hosted = (await rehostToBlob(up).catch(() => null)) || up;
  await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "higgsfield", model: "upscale_image", unit: "image", action: "creative", count: 1 }).catch(() => {});

  const prevUrl = target.url;
  const updated = creatives.map((c) => ((c.id || "") === creativeId ? { ...c, url: hosted, resolution: "4k" } : c));
  // Keep any "for video" selection pointing at the new 4K url, not the dead 2K one.
  const videoSelects = (Array.isArray(persona.video_selects) ? persona.video_selects : []) as string[];
  const remappedSelects = videoSelects.map((u) => (u === prevUrl ? hosted : u));
  await updateInfluencer(id, { persona: { ...persona, creatives: updated, video_selects: remappedSelects } });
  return NextResponse.json({ creative: updated.find((c) => (c.id || "") === creativeId) });
}
