import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// The team's PER-BUILD cost target - what "a lot" is for a single influencer build. Drives the
// running-cost chip's amber/red thresholds (P2-1) so they reflect a number the team set, not a
// hardcoded R1000. Stored in the budgets table as scope='team', period='per_build'.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = (await db()`
      select limit_cents from budgets
       where scope = 'team' and period = 'per_build' order by created_at desc limit 1`) as { limit_cents: number }[];
    return NextResponse.json({ perBuildCents: rows[0]?.limit_cents ?? null });
  } catch {
    return NextResponse.json({ perBuildCents: null });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const cents = Math.round(Number(body.perBuildCents));
  if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_00) {
    return NextResponse.json({ error: "Enter a target between R0 and R100,000" }, { status: 400 });
  }
  const sql = db();
  try {
    // Single canonical row. Clearing (cents=0) is just a delete; setting a value does the
    // clear + insert ATOMICALLY in one transaction, so a mid-operation failure can never leave
    // the target silently wiped (delete committed, insert lost).
    if (cents > 0) {
      await sql.transaction([
        sql`delete from budgets where scope = 'team' and period = 'per_build'`,
        sql`insert into budgets (scope, scope_id, period, limit_cents, hard_gate)
            values ('team', null, 'per_build', ${cents}, false)`,
      ]);
    } else {
      await sql`delete from budgets where scope = 'team' and period = 'per_build'`;
    }
    return NextResponse.json({ ok: true, perBuildCents: cents > 0 ? cents : null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
