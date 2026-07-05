import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Pre-flight cost estimate for a paid action, so the team SEES a number before they spend (P2-1).
// Prices come ONLY from rate_card (never hardcoded) - this reads the live rows and returns a
// best-effort ZAR-cents figure. It is deliberately approximate (queue, clip length and engine
// fallbacks vary) and flagged as such; if the needed rates aren't seeded, it returns amount:null
// and the caller simply omits the estimate rather than showing a wrong number.
export const dynamic = "force-dynamic";

// Roughly how long a talking-shot clip runs, for the per-second a-roll engines. A duration
// assumption, not a price - the price still comes from rate_card.
const AROLL_SECONDS = 8;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scenes = Math.max(0, Math.min(200, Number(url.searchParams.get("scenes")) || 0));
  const talking = Math.max(0, Math.min(scenes, Number(url.searchParams.get("talking")) || 0));
  const sceneShots = Math.max(0, scenes - talking);

  try {
    const rows = (await db()`
      select provider, model, unit, price_cents_per_unit
        from rate_card where active = true`) as { provider: string; model: string; unit: string; price_cents_per_unit: number }[];
    const rate = (provider: string, model: string, unit: string) =>
      rows.find((r) => r.provider === provider && r.model === model && r.unit === unit)?.price_cents_per_unit ?? null;

    // Scene shots (b-roll) render on Kling; talking shots (a-roll) on the per-second OmniHuman lane.
    const clipVideo = rate("higgsfield", "kling3", "video") ?? rate("higgsfield", "kling3_0", "video");
    const arollSecond = rate("fal", "omnihuman_1_5", "second");

    // Only estimate the parts we have a real rate for; if a slice is unpriced, fall back to the
    // clip-video rate for it (rather than dropping it) so the total is never an under-count.
    const perScene = clipVideo;
    if (perScene == null) return NextResponse.json({ amount: null });

    let cents = sceneShots * perScene;
    cents += talking * (arollSecond != null ? arollSecond * AROLL_SECONDS : perScene);

    return NextResponse.json({ amount: Math.round(cents), approx: true });
  } catch {
    return NextResponse.json({ amount: null });
  }
}
