import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// THE RESEARCHER SPEND METER (Gary: "a cost meter on top so we can see the spend as we run"). Every paid call the
// Researcher makes is metered to usage_events under a research action (deep-research, research-file, research-qa,
// research-verify, research-brief, research-ingest) - see lib/desks.ts. This sums those in ZAR (usage_events.cents
// is ZAR at the live rate) for this month and today, and counts the runs this month. Read-only, any signed-in user.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

  // PER-RUN COST (Gary: "can it show the actual run cost of this research"). usage_events aren't tagged with a run
  // id, so we attribute by this client's time window: everything the Researcher spent for this client from the run's
  // start up to the next run for the same client (or now). Research runs for one client are sequential, so this is
  // an accurate reflection of what the run actually cost.
  let runCents: number | null = null;
  const params = new URL(req.url).searchParams;
  const runId = params.get("runId") || "";
  const scopeClient = params.get("clientId") || "";
  if (runId) {
    // Scope the run lookup by client too, so a run id from another brain can't surface that brain's spend.
    const win = (await db().query(
      `select client_id, created_at,
              (select min(created_at) from research_runs n
                 where n.client_id = research_runs.client_id and n.created_at > research_runs.created_at) as next_at
         from research_runs where id = $1${scopeClient ? " and client_id = $2" : ""}`,
      scopeClient ? [runId, scopeClient] : [runId],
    )) as { client_id: string; created_at: string; next_at: string | null }[];
    const w = win[0];
    if (w) {
      const rc = (await db().query(
        `select coalesce(sum(cents), 0)::bigint as c from usage_events
          where client_id = $1 and (action = 'deep-research' or action like 'research-%')
            and created_at >= $2 and ($3::timestamptz is null or created_at < $3)`,
        [w.client_id, w.created_at, w.next_at],
      )) as { c: string }[];
      runCents = Number(rc[0]?.c || 0);
    }
  }

  return NextResponse.json({
    monthCents: Number(r.month_cents),
    todayCents: Number(r.today_cents),
    allCents: Number(r.all_cents),
    runsThisMonth: runs[0]?.n || 0,
    runCents,
  });
}
