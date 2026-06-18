import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callMcp } from "@/lib/vendors/higgsfield";
import { setRate } from "@/lib/usage";

// Super-admin: preflight the REAL credit cost of each model via Higgsfield get_cost
// (no generation, no spend) and write it into rate_card so the ledger is exact.
export const maxDuration = 60;

function parseCost(raw: unknown): number | null {
  const s = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  const m = s.match(/"?(?:cost|credits?|price|total|amount|credit_cost)"?\s*[:=]\s*"?([0-9]+(?:\.[0-9]+)?)/i);
  if (m) { const v = Number(m[1]); if (!Number.isNaN(v)) return v; }
  return null;
}

// The models the pipeline actually calls today: nano_banana_2 (casting + photoshoot) and
// gpt_image_2 (creatives identity). Soul models are no longer used for images, so they are
// not calibrated. Higgsfield's get_cost returns the REAL credit cost for THIS plan, so if a
// model is unlimited/included on Ultra it comes back at 0 and the ledger reflects that.
const IMAGE_MODELS = ["nano_banana_2", "gpt_image_2"];

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const results: { model: string; credits: number | null; updated: boolean; raw: string }[] = [];

  for (const model of IMAGE_MODELS) {
    try {
      const raw = await callMcp("generate_image", { params: { model, prompt: "a person, photorealistic portrait", aspect_ratio: "1:1", get_cost: true } });
      const credits = parseCost(raw);
      if (credits != null) await setRate("higgsfield", model, "image", credits);
      results.push({ model, credits, updated: credits != null, raw: (typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 200) });
    } catch (e) {
      results.push({ model, credits: null, updated: false, raw: "ERR " + String((e as Error)?.message || e).slice(0, 160) });
    }
  }

  // Upscale (bytedance) — get_cost with a placeholder source.
  try {
    const raw = await callMcp("upscale_image", { params: { provider: "bytedance", image_id: "00000000-0000-0000-0000-000000000000", width: 2048, height: 2048, resolution: "4k", get_cost: true } });
    const credits = parseCost(raw);
    if (credits != null) await setRate("higgsfield", "upscale_image", "image", credits);
    results.push({ model: "upscale_image", credits, updated: credits != null, raw: (typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 200) });
  } catch (e) {
    results.push({ model: "upscale_image", credits: null, updated: false, raw: "ERR " + String((e as Error)?.message || e).slice(0, 160) });
  }

  return NextResponse.json({ ok: true, results });
}
