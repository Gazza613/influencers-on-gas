import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReport, getAuditTrail, getCreditsSince, type CostFilters } from "@/lib/usage";
import { getZarPerUsd } from "@/lib/fx";
import { cycleStartIso } from "@/lib/cron";
import { allocateFixedCosts } from "@/lib/subscriptions";
import { db } from "@/lib/db";

// Filtered Cost Control report (DB only - fast). Live balance comes from /api/balance.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const u = new URL(req.url);
  const filters: CostFilters = {
    from: u.searchParams.get("from"),
    to: u.searchParams.get("to"),
    influencerId: u.searchParams.get("influencerId"),
    provider: u.searchParams.get("provider"),
    userEmail: u.searchParams.get("userEmail"),
  };
  // Optional previous-period comparison (same-length window immediately before).
  const cmpFrom = u.searchParams.get("cmpFrom");
  const cmpTo = u.searchParams.get("cmpTo");

  const cycleStart = cycleStartIso(10);
  const [report, audit, zarPerUsd, prev, cycle, fixed] = await Promise.all([
    getReport(filters),
    getAuditTrail(30),
    getZarPerUsd(),
    cmpFrom && cmpTo ? getReport({ ...filters, from: cmpFrom, to: cmpTo }) : Promise.resolve(null),
    getCreditsSince(cycleStart),
    // The standing subscription cost, allocated onto the desks by their share of each provider's jobs. Never
    // allowed to break the page: a missing table on a not-yet-migrated deploy must not take Cost Control down.
    allocateFixedCosts(filters.from, filters.to).catch(() => null),
  ]);
  // FIRECRAWL QUOTA (Gary): the Hobby plan is 5,000 credits (pages) per 30-day cycle anchored on the 11th. Count
  // the pages drawn this cycle so the Brain pod can show a quota meter and warn before it bills overage.
  const fcCycleStart = cycleStartIso(11);
  const fcRows = (await db().query(
    `select coalesce(sum(count),0)::int as pages from usage_events where provider = 'firecrawl' and created_at >= $1`,
    [fcCycleStart],
  ).catch(() => [{ pages: 0 }])) as { pages: number }[];
  return NextResponse.json({
    report, audit, zarPerUsd,
    previous: prev ? { cents: prev.total.cents, credits: prev.total.credits } : null,
    cycle: { start: cycleStart, trackedCredits: Math.round(cycle.credits), trackedCents: cycle.cents },
    fixed,
    firecrawl: { pages: Number(fcRows[0]?.pages) || 0, quota: 5000, cycleStart: fcCycleStart },
  });
}
