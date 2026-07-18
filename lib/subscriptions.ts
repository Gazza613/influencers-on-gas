import { db } from "./db";
import { getZarPerUsd } from "./fx";
import { deskOf, DESK_ORDER, DESK_TINT, type Desk } from "./desks";

// THE FIXED MONTHLY EXPOSURE (Gary: "i spend over $300 on the subscription per month ... even though the
// images may be free, the platform still costs us over $300 a month as a business").
//
// Cost Control measured MARGINAL cost - what one more job costs. That is the right number for "should we
// render another take?" and the wrong number for "what does this platform cost the agency?". On a stack of
// subscriptions the second question is the one that pays the bills: Higgsfield Ultra is $375 whether we
// render one image or a thousand, so the creative factory reported R0 while genuinely consuming a paid plan.
//
// ALLOCATION. Each subscription is spread across the desks by their share of THAT PROVIDER's jobs. If the
// Creatives desk did 204 of Higgsfield's 2,000 jobs, it carries ~10% of the Ultra plan. This is
// activity-based costing, and it is defensible precisely because it is driven by recorded work rather than a
// guess. Two consequences worth stating plainly:
//   - A desk that uses a plan heavily carries more of it, which is the point.
//   - A subscription NOBODY used in the period allocates to nothing and is reported as idle capacity, rather
//     than being smeared evenly to make the maths tidy. Paying for something unused is a finding, not a
//     rounding error.

export type Subscription = { id: string; provider: string; name: string; monthly_usd: number; active: boolean; note: string | null };

export async function listSubscriptions(): Promise<Subscription[]> {
  const rows = (await db().query(
    `select id, provider, name, monthly_usd, active, note from subscriptions order by monthly_usd desc, name`,
  )) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id), provider: String(r.provider), name: String(r.name),
    monthly_usd: Number(r.monthly_usd) || 0, active: Boolean(r.active), note: (r.note as string) ?? null,
  }));
}

export async function upsertSubscription(s: { id?: string; provider: string; name: string; monthly_usd: number; active?: boolean; note?: string | null }): Promise<void> {
  if (s.id) {
    await db().query(
      `update subscriptions set provider=$2, name=$3, monthly_usd=$4, active=$5, note=$6, updated_at=now() where id=$1`,
      [s.id, s.provider, s.name, s.monthly_usd, s.active ?? true, s.note ?? null],
    );
    return;
  }
  await db().query(
    `insert into subscriptions (provider, name, monthly_usd, active, note) values ($1,$2,$3,$4,$5)
     on conflict (provider, name) do update set monthly_usd = excluded.monthly_usd, active = excluded.active, note = excluded.note, updated_at = now()`,
    [s.provider, s.name, s.monthly_usd, s.active ?? true, s.note ?? null],
  );
}

export async function deleteSubscription(id: string): Promise<void> {
  await db().query(`delete from subscriptions where id = $1`, [id]);
}

export type FixedAllocation = {
  totalUsd: number;
  totalCents: number;                                  // ZAR cents per month, all active subscriptions
  zarPerUsd: number;
  byDesk: { desk: Desk; cents: number; tint: string }[];
  idle: { name: string; cents: number }[];             // paid for, used by nobody in this window
  subscriptions: (Subscription & { cents: number; jobs: number })[];
};

// Allocate every active subscription across the desks, using job counts in the given window.
export async function allocateFixedCosts(from?: string | null, to?: string | null): Promise<FixedAllocation> {
  const [subs, zarPerUsd] = await Promise.all([listSubscriptions(), getZarPerUsd()]);
  const active = subs.filter((s) => s.active && s.monthly_usd > 0);

  // Jobs per (provider, action) in the window. Action is what deskOf() reads.
  const where: string[] = [];
  const args: unknown[] = [];
  if (from) { args.push(from); where.push(`created_at >= $${args.length}`); }
  if (to) { args.push(to); where.push(`created_at < ($${args.length}::date + interval '1 day')`); }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const rows = (await db().query(
    `select provider, action, count(*)::int as n from usage_events ${clause} group by provider, action`,
    args,
  )) as { provider: string; action: string; n: number }[];

  // provider -> desk -> jobs
  const byProvider = new Map<string, Map<Desk, number>>();
  for (const r of rows) {
    const desk = deskOf(r.action);
    const m = byProvider.get(r.provider) ?? new Map<Desk, number>();
    m.set(desk, (m.get(desk) ?? 0) + r.n);
    byProvider.set(r.provider, m);
  }

  const usdToCents = (usd: number) => Math.round(usd * zarPerUsd * 100);

  const deskCents = new Map<Desk, number>();
  const idle: { name: string; cents: number }[] = [];
  const detailed: (Subscription & { cents: number; jobs: number })[] = [];

  for (const s of active) {
    const cents = usdToCents(s.monthly_usd);
    const desks = byProvider.get(s.provider);
    const totalJobs = desks ? [...desks.values()].reduce((a, b) => a + b, 0) : 0;
    detailed.push({ ...s, cents, jobs: totalJobs });

    if (!desks || totalJobs === 0) {
      // Nobody used it. Say so rather than spreading it evenly to make the totals look neat.
      idle.push({ name: s.name, cents });
      continue;
    }
    // Largest-remainder is overkill here; the rounding drift across a handful of desks is under a cent.
    for (const [desk, jobs] of desks) {
      deskCents.set(desk, (deskCents.get(desk) ?? 0) + Math.round((cents * jobs) / totalJobs));
    }
  }

  const totalUsd = active.reduce((a, s) => a + s.monthly_usd, 0);
  return {
    totalUsd,
    totalCents: usdToCents(totalUsd),
    zarPerUsd,
    byDesk: DESK_ORDER.map((d) => ({ desk: d, cents: deskCents.get(d) ?? 0, tint: DESK_TINT[d] })).filter((d) => d.cents > 0),
    idle,
    subscriptions: detailed,
  };
}
