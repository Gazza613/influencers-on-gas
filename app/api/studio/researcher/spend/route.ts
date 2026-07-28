import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// THE RESEARCHER SPEND METER (Gary: "a cost meter on top so we can see the spend as we run"). Every paid call the
// Researcher makes is metered to usage_events under a research action (deep-research, research-file, research-qa,
// research-verify, research-brief, research-ingest) - see lib/desks.ts. This sums those in ZAR (usage_events.cents
// is ZAR at the live rate) for this month and today, and counts the runs this month. Read-only, any signed-in user.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = (await db().query(
    `select
       coalesce(sum(cents) filter (where created_at >= date_trunc('month', now())), 0)::bigint as month_cents,
       coalesce(sum(cents) filter (where created_at >= date_trunc('day', now())), 0)::bigint as today_cents,
       coalesce(sum(cents), 0)::bigint as all_cents
     from usage_events
     where action = 'deep-research' or action like 'research-%'`,
  )) as { month_cents: string; today_cents: string; all_cents: string }[];
  const runs = (await db().query(
    `select count(*)::int as n from research_runs where created_at >= date_trunc('month', now())`,
  )) as { n: number }[];
  const r = rows[0] || { month_cents: "0", today_cents: "0", all_cents: "0" };
  return NextResponse.json({
    monthCents: Number(r.month_cents),
    todayCents: Number(r.today_cents),
    allCents: Number(r.all_cents),
    runsThisMonth: runs[0]?.n || 0,
  });
}
