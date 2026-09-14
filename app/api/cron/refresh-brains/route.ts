import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cronAuthed } from "@/lib/cron";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";
import { isSafeCrawlTarget } from "@/lib/safe-url";

// FRESHNESS SLA / AUTO-RECRAWL (Gary, keep every brain current on its own). A daily pass that re-crawls a brain's
// website sources once they are older than that brain's SLA (clients.auto_recrawl_days), so the knowledge base
// never quietly goes stale. It reuses the exact same durable ingest job the manual "Re-crawl" button fires.
//
// COST IS DIALLED, deliberately: a brain only participates when it opts in (auto_recrawl_days > 0, off by
// default), and each run re-crawls at most a few sources per brain and a bounded total, so the Firecrawl + Voyage
// spend per day is capped and predictable rather than re-reading every site at once.
export const dynamic = "force-dynamic";

const PER_BRAIN = 3;   // most stale sources to refresh per brain per run
const TOTAL = 24;      // hard ceiling across all brains per run

export async function GET(req: Request) {
  const session = await auth();
  if (!cronAuthed(req) && session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 401 }); // this spends money
  }
  // A manual run may target one brain and/or force ignoring the SLA (?clientId=&force=1), for testing.
  const url = new URL(req.url);
  const only = url.searchParams.get("clientId") || "";
  const force = url.searchParams.get("force") === "1";

  // STALE, OPTED-IN website sources, oldest first. A source with no last_synced_at (never dated) is treated as
  // due. `force` ignores the age test but still honours the opt-in and the caps. client_id scopes everything.
  const rows = (await db().query(
    // FEEDS refresh DAILY (they exist to be current, and a re-read is cheap - no Firecrawl); WEBSITE/CRAWL
    // sources honour the brain's days-based SLA. Both only for opted-in brains, and both capped below.
    `select s.id, s.client_id, s.type, s.uri, s.include_path, s.last_synced_at, c.name as client_name
       from knowledge_sources s
       join clients c on c.id = s.client_id
      where c.auto_recrawl_days > 0
        and s.type in ('website','crawl','feed')
        and s.status = 'indexed'
        and ($1 = '' or s.client_id = $1::uuid)
        and ($2 or s.last_synced_at is null
             or (s.type = 'feed' and s.last_synced_at < now() - interval '20 hours')
             or (s.type in ('website','crawl') and s.last_synced_at < now() - make_interval(days => c.auto_recrawl_days)))
      order by s.client_id, s.last_synced_at asc nulls first`,
    [only, force],
  ).catch(() => [])) as { id: string; client_id: string; type: string; uri: string; include_path: string | null; last_synced_at: string | null; client_name: string }[];

  const perBrain = new Map<string, number>();
  const out: Record<string, unknown>[] = [];
  let fired = 0;

  for (const s of rows) {
    if (fired >= TOTAL) break;
    if ((perBrain.get(s.client_id) || 0) >= PER_BRAIN) continue;
    // Re-validate the stored URL before re-fetching it (defence in depth, exactly as the manual recrawl does).
    if (!isSafeCrawlTarget(s.uri)) { out.push({ client: s.client_name, uri: s.uri, skipped: "unsafe url" }); continue; }

    // Clear its old passages and set it re-reading, then fire the SAME durable ingest job as the manual button.
    await db().query(`delete from knowledge_chunks where client_id = $1 and source_id = $2`, [s.client_id, s.id]).catch(() => {});
    await db().query(`update knowledge_sources set status = 'pending', last_synced_at = null where id = $1 and client_id = $2`, [s.id, s.client_id]).catch(() => {});
    const engine = await inngest.send({ name: "brain/ingest.source", data: { sourceId: s.id, clientId: s.client_id, type: s.type, uri: s.uri, text: "", includePath: s.include_path || null, kind: null } }).catch(() => null);
    if (!engine) { out.push({ client: s.client_name, uri: s.uri, error: "inngest not connected" }); continue; }

    perBrain.set(s.client_id, (perBrain.get(s.client_id) || 0) + 1);
    fired++;
    out.push({ client: s.client_name, uri: s.uri, refreshed: true });
  }

  return NextResponse.json({ ok: true, fired, considered: rows.length, ran: out });
}
