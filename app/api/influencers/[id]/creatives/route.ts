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
  // Creatives render on gpt_image_2 (the only image model used now); both quality styles use
  // it, so both share its rate. Only the optional 4K upscale adds cost.
  const [gpt, upscale] = await Promise.all([rate("higgsfield", "gpt_image_2"), rate("higgsfield", "upscale_image")]);
  return NextResponse.json({
    creatives: Array.isArray(persona.creatives) ? persona.creatives : [],
    videoSelects: Array.isArray(persona.video_selects) ? persona.video_selects : [],
    qa: persona.creatives_qa ?? null,
    status: persona.creatives_status ?? "idle",
    started_at: typeof persona.creatives_started_at === "number" ? persona.creatives_started_at : null,
    error: persona.creatives_error ?? null,
    locked: !!persona.locked,
    rates: { soul_2: gpt, soul_cinematic: gpt, upscale }, // per-image (both styles render on gpt_image_2)
  });
}

// Abort a stuck/running render: reset status so the UI unblocks (the durable job's
// final save is harmless if it lands later, it just writes whatever it finished).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  const persona = (inf?.persona ?? {}) as Record<string, unknown>;
  await updateInfluencer(id, { persona: { ...persona, creatives_status: "idle", creatives_error: null } });
  return NextResponse.json({ ok: true });
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
  const ratios = Array.isArray(body.ratios) ? [...new Set(body.ratios.filter((r: unknown) => RATIOS.includes(r as string)) as string[])] : []; // dedupe: duplicate ratios collide Inngest step ids
  const resolution = body.resolution === "4k" ? "4k" : "2k";
  const scene = typeof body.scene === "string" ? body.scene.trim().slice(0, 2000) : "";
  const count = Math.max(1, Math.min(6, Number(body.count) || 3));
  // Style is an explicit flag now (both styles render on the same image model). Accept the
  // legacy soul_cinematic model name too so older clients keep working.
  const cinematic = body.cinematic === true || body.model === "soul_cinematic";
  const clothingRef = typeof body.clothingRef === "string" ? body.clothingRef : "";
  // Multiple location references (shots rotate through them for varied backdrops). Back-compat with the old single locationRef.
  const locationRefs = (Array.isArray(body.locationRefs) ? body.locationRefs : [body.locationRef]).filter((u: unknown): u is string => typeof u === "string" && !!u).slice(0, 8);
  // A-roll (presenter) vs B-roll (lifestyle/scene). Drives pose + extras default in the engine.
  const role = body.role === "b-roll" ? "b-roll" : "a-roll";
  // Pass extras as the RAW user choice (true/false/undefined) so the engine can apply the role default
  // when unset (b-roll → extras on, a-roll → off).
  const extras = typeof body.extras === "boolean" ? body.extras : undefined;
  const identityLock = body.identityLock === "flexible" ? "flexible" : "strong"; // default: max likeness
  if (!ratios.length) return NextResponse.json({ error: "Pick at least one format." }, { status: 400 });

  // Send first; only flip to "running" once accepted, so a send failure can't strand the
  // gallery showing "Rendering" forever with no job running.
  try {
    await inngest.send({ name: "influencer/generate.creatives", data: { influencerId: id, ratios, resolution, scene, count, cinematic, clothingRef, locationRefs, extras, identityLock, role, priority: body.priority === true } });
  } catch {
    return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  }
  await updateInfluencer(id, { persona: { ...persona, creatives_status: "running", creatives_error: null, creatives_started_at: Date.now() } });
  return NextResponse.json({ ok: true });
}
