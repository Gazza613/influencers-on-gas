import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { planCampaign } from "@/lib/studio-producer";
import { produceCampaign } from "@/lib/studio-campaign";
import type { CampaignPlan } from "@/lib/studio-producer";

// THE FUNNEL CAMPAIGN ORDER. Two steps, deliberately separate.
//
//   POST { action: "plan" }     -> the Producer reads the brief and plans the campaign. FREE (one Claude call).
//   POST { action: "produce" }  -> final production. This SPENDS: 5 generated images + 2 cut-outs.
//
// The split is the cost gate. You see the whole campaign - every headline, every image prompt, every deal,
// and the Producer's own compliance check - and you can edit it, BEFORE a single paid image is generated.
// Nothing renders off an unread plan.

export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string; clientId?: string; brief?: string; plan?: CampaignPlan;
  };
  const clientId = String(body.clientId || "");
  if (!clientId) return NextResponse.json({ error: "Pick a client first." }, { status: 400 });

  try {
    if (body.action === "plan") {
      const brief = String(body.brief || "").trim();
      if (brief.length < 12) return NextResponse.json({ error: "Tell the Producer what the campaign is about." }, { status: 400 });
      const plan = await planCampaign(clientId, brief);
      return NextResponse.json({ ok: true, plan });
    }

    if (body.action === "produce") {
      if (!body.plan?.sliders?.length) return NextResponse.json({ error: "There is no plan to produce." }, { status: 400 });
      const out = await produceCampaign(clientId, body.plan);
      return NextResponse.json({ ok: true, ...out });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 220) }, { status: 500 });
  }
}
