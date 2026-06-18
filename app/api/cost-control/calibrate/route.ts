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

// Models on UNLIMITED access on our Ultra plan cost 0 credits to us regardless of their
// nominal get_cost, so we force them to 0 (do not trust get_cost to know about the
// subscription). Keep this in sync with Higgsfield → Subscription → Active unlimited models.
// As of Jun 2026: GPT Image is 365-unlimited; Nano Banana 2 unlimited EXPIRED Jun 17 so it is
// billable again. (Nano Banana Pro is unlimited but we do not call it yet.)
const UNLIMITED_MODELS = ["gpt_image_2", "nano_banana_pro"];
// Billable models the pipeline may fall back to: preflight their REAL credit cost via get_cost.
const IMAGE_MODELS = ["nano_banana_2"];

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const results: { model: string; credits: number | null; updated: boolean; raw: string }[] = [];

  // Unlimited/included models cost us nothing: force 0.
  for (const model of UNLIMITED_MODELS) {
    await setRate("higgsfield", model, "image", 0);
    results.push({ model, credits: 0, updated: true, raw: "unlimited on plan (forced 0)" });
  }

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
