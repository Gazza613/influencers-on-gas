import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { planCampaign } from "@/lib/studio-producer";

// THE PLAN. The Producer reads the brief and designs the whole funnel campaign. FREE - one Claude call.
//
// THIS ROUTE DELIBERATELY DOES NOT IMPORT THE RENDERER. It used to sit in the same route as production,
// which meant it also pulled in @sparticuz/chromium at module scope - so when Chromium failed to load, the
// function died before it ever read the brief, and "plan my campaign" returned an HTML error page. Planning
// is the step you use most and it costs nothing; it must not be able to fail for a reason that belongs to
// rendering. Production lives at ./produce, on its own function, with its own 67MB of Chromium.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; brief?: string };
  const clientId = String(body.clientId || "");
  const brief = String(body.brief || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick a client first." }, { status: 400 });
  if (brief.length < 12) return NextResponse.json({ error: "Tell the Producer what the campaign is about." }, { status: 400 });

  try {
    const plan = await planCampaign(clientId, brief);
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 220) }, { status: 500 });
  }
}
