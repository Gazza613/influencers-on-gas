import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { planCampaign, sharpenBrief } from "@/lib/studio-producer";
import { listDeals } from "@/lib/studio-deals";
import { latestRun } from "@/lib/studio-campaign";

// THE PLAN. The Producer reads the brief and designs the whole funnel campaign. FREE - one Claude call.
//
// THIS ROUTE DELIBERATELY DOES NOT IMPORT THE RENDERER. It used to sit in the same route as production,
// which meant it also pulled in @sparticuz/chromium at module scope - so when Chromium failed to load, the
// function died before it ever read the brief, and "plan my campaign" returned an HTML error page. Planning
// is the step you use most and it costs nothing; it must not be able to fail for a reason that belongs to
// rendering. Production lives at ./produce, on its own function, with its own 67MB of Chromium.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Recover the last production run for a client. This is what makes navigating away safe: the creatives you
// paid for are fetched back rather than lost with the tab.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ run: null });
  const run = await latestRun(clientId).catch(() => null);
  return NextResponse.json({ run });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; brief?: string; action?: string };
  const clientId = String(body.clientId || "");
  const brief = String(body.brief || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick a client first." }, { status: 400 });
  if (brief.length < 4) return NextResponse.json({ error: "Tell the Producer what the campaign is about." }, { status: 400 });

  try {
    // THE BRIEF COACH. Free, and it runs BEFORE any planning: a thin brief does not produce a bad campaign,
    // it produces a plausible generic one, which is worse because it looks finished.
    if (body.action === "sharpen") {
      const deals = await listDeals(clientId).catch(() => []);
      const lines = deals.map((d) => `${d.label} - ${d.amount}${d.amountSuffix || ""} for ${d.price} (${d.validity})`);
      const sharpened = await sharpenBrief(clientId, brief, lines);
      return NextResponse.json({ ok: true, sharpened });
    }

    const plan = await planCampaign(clientId, brief);
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    return NextResponse.json({ error: friendly(e) }, { status: 500 });
  }
}

// Say what actually happened. An out-of-credit Anthropic account returns a 400 with a wall of JSON, and the
// user should not have to read a stack trace to learn that the bill needs paying.
function friendly(e: unknown): string {
  const m = String((e as Error)?.message || e);
  if (/credit balance is too low/i.test(m)) {
    return "Claude is out of credit. Top up the Anthropic account (Plans & Billing) and this will work again - nothing is broken.";
  }
  if (/rate.?limit|429/i.test(m)) return "Claude is rate-limited right now. Wait a moment and try again.";
  if (/overloaded|529/i.test(m)) return "Claude is overloaded right now. Try again in a minute.";
  return m.slice(0, 240);
}
