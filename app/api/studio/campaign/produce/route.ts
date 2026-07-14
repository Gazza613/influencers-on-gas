import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { produceCampaign } from "@/lib/studio-campaign";
import type { CampaignPlan } from "@/lib/studio-producer";

// FINAL PRODUCTION. This SPENDS: 5 generated images + 2 background cut-outs, then renders five canvases.
//
// It is its OWN function because it carries Chromium (67MB, via @sparticuz/chromium). Chromium ships its
// browser as brotli data files (bin/chromium.br), which Next's file tracer will NOT infer from a static
// import - they have to be named explicitly in next.config.ts, or the require fails at cold start and the
// whole function returns an HTML error page instead of JSON.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; plan?: CampaignPlan };
  const clientId = String(body.clientId || "");
  if (!clientId) return NextResponse.json({ error: "Pick a client first." }, { status: 400 });
  if (!body.plan?.sliders?.length) return NextResponse.json({ error: "There is no plan to produce." }, { status: 400 });

  try {
    const out = await produceCampaign(clientId, body.plan);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 240) }, { status: 500 });
  }
}
