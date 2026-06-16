import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencerSpend, getReport } from "@/lib/usage";
import { getZarPerUsd } from "@/lib/fx";
import { monthStartIso } from "@/lib/cron";

// ?influencerId= → that influencer's running spend (build chip).
// otherwise → THIS MONTH's running total across all jobs + the live ZAR/USD rate.
// (Per-job breakdowns and other periods live in Cost Control.)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const influencerId = new URL(req.url).searchParams.get("influencerId");
  if (influencerId) return NextResponse.json({ influencer: await getInfluencerSpend(influencerId) });

  const [report, zarPerUsd] = await Promise.all([getReport({ from: monthStartIso() }), getZarPerUsd()]);
  return NextResponse.json({
    month: { cents: report.total.cents, credits: Math.round(report.total.credits), events: report.total.events },
    zarPerUsd,
  });
}
