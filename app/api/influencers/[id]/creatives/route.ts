import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { db } from "@/lib/db";

const RATIOS = ["9:16", "1:1", "16:9"];

async function rate(provider: string, model: string): Promise<{ credits: number; cents: number }> {
  const rows = (await db().query(
    "select credits_per_unit, price_cents_per_unit from rate_card where provider=$1 and model=$2 and unit='image' and active limit 1",
    [provider, model],
  )) as { credits_per_unit: string | number; price_cents_per_unit: string | number }[];
  if (!rows[0]) return { credits: 0, cents: 0 };
  return { credits: Number(rows[0].credits_per_unit) || 0, cents: Number(rows[0].price_cents_per_unit) || 0 };
}

// Current creatives + status + per-image rates (for the cost estimate).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const [image, upscale] = await Promise.all([rate("higgsfield", "nano_banana_2"), rate("magnific", "upscaler")]);
  return NextResponse.json({
    creatives: Array.isArray(persona.creatives) ? persona.creatives : [],
    videoSelects: Array.isArray(persona.video_selects) ? persona.video_selects : [],
    status: persona.creatives_status ?? "idle",
    error: persona.creatives_error ?? null,
    locked: !!persona.locked,
    rates: { image, upscale }, // per-image: base + (4K upscale)
  });
}

// Kick off a creatives render (one image per selected ratio; optional 4K upscale).
export const maxDuration = 60;
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  if (!persona.locked) return NextResponse.json({ error: "Lock the identity down first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const ratios = Array.isArray(body.ratios) ? body.ratios.filter((r: unknown) => RATIOS.includes(r as string)) : [];
  const resolution = body.resolution === "4k" ? "4k" : "2k";
  const scene = typeof body.scene === "string" ? body.scene.trim().slice(0, 800) : "";
  const count = Math.max(1, Math.min(6, Number(body.count) || 3));
  const clothingRef = typeof body.clothingRef === "string" ? body.clothingRef : "";
  const locationRef = typeof body.locationRef === "string" ? body.locationRef : "";
  if (!ratios.length) return NextResponse.json({ error: "Pick at least one format." }, { status: 400 });

  await updateInfluencer(id, { persona: { ...persona, creatives_status: "running", creatives_error: null } });
  try {
    await inngest.send({ name: "influencer/generate.creatives", data: { influencerId: id, ratios, resolution, scene, count, clothingRef, locationRef } });
  } catch {
    return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
