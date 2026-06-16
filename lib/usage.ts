import { db } from "./db";

// ≈ R0.64 per Higgsfield credit (Ultra: $310 / 9,000 credits at ~R18.7/$). Used to
// convert the live credit balance to Rand. Per-generation prices live in rate_card.
export const CREDIT_ZAR_CENTS = 64;
export const MONTHLY_CREDITS = 9000;

type Rate = { credits: number; cents: number };

async function getRate(provider: string, model: string, unit: string): Promise<Rate> {
  const rows = (await db().query(
    "select credits_per_unit, price_cents_per_unit from rate_card where provider=$1 and model=$2 and unit=$3 and active limit 1",
    [provider, model, unit],
  )) as { credits_per_unit: string | number; price_cents_per_unit: string | number }[];
  if (!rows[0]) return { credits: 0, cents: 0 };
  return { credits: Number(rows[0].credits_per_unit) || 0, cents: Number(rows[0].price_cents_per_unit) || 0 };
}

// Append one cost event (priced from rate_card). Called from generation jobs.
export async function recordUsage(o: {
  influencerId?: string | null; clientId?: string | null; userEmail?: string | null;
  provider: string; model: string; unit: string; action: string; count?: number;
}): Promise<void> {
  const count = o.count ?? 1;
  if (count <= 0) return;
  const rate = await getRate(o.provider, o.model, o.unit);
  await db().query(
    `insert into usage_events (influencer_id, client_id, user_email, provider, model, action, credits, cents, count)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [o.influencerId ?? null, o.clientId ?? null, o.userEmail ?? null, o.provider, o.model, o.action, rate.credits * count, rate.cents * count, count],
  );
}

export type UsageSummary = {
  total: { credits: number; cents: number; events: number };
  byInfluencer: { name: string; credits: number; cents: number }[];
  byProvider: { provider: string; credits: number; cents: number }[];
  byDay: { day: string; credits: number; cents: number }[];
};

// ── Cost Control: filtered report ────────────────────────────────────────────
export type CostFilters = { from?: string | null; to?: string | null; influencerId?: string | null; provider?: string | null; userEmail?: string | null };

export type CostReport = {
  total: { credits: number; cents: number; events: number };
  split: { image: { count: number; cents: number }; video: { count: number; cents: number }; other: { count: number; cents: number } };
  byUser: { user_email: string; credits: number; cents: number; events: number }[];
  byInfluencer: { id: string | null; name: string; credits: number; cents: number; images: number; videos: number }[];
  byProvider: { provider: string; credits: number; cents: number }[];
  byAction: { action: string; credits: number; cents: number }[];
  byDay: { day: string; credits: number; cents: number }[];
  influencers: { id: string; name: string }[];
  providers: string[];
};

// `case` expression that buckets an event into image / video / other.
// (usage_events stores action/provider, not a unit column.)
const KIND = `case when u.action in ('casting','photoshoot','humaniser') then 'image' when u.provider='heygen' or u.action in ('presenter','video') then 'video' else 'other' end`;

function whereClause(f: CostFilters): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.from) { params.push(f.from); parts.push(`u.created_at >= $${params.length}`); }
  if (f.to) { params.push(f.to); parts.push(`u.created_at < ($${params.length}::date + interval '1 day')`); }
  if (f.influencerId) { params.push(f.influencerId); parts.push(`u.influencer_id = $${params.length}`); }
  if (f.provider) { params.push(f.provider); parts.push(`u.provider = $${params.length}`); }
  if (f.userEmail) { params.push(f.userEmail); parts.push(`u.user_email = $${params.length}`); }
  return { sql: parts.length ? `where ${parts.join(" and ")}` : "", params };
}

export async function getReport(f: CostFilters = {}): Promise<CostReport> {
  const { sql: where, params } = whereClause(f);
  const q = (text: string) => db().query(text, params) as Promise<Record<string, unknown>[]>;

  const total = (await q(`select coalesce(sum(u.credits),0)::float as credits, coalesce(sum(u.cents),0)::int as cents, count(*)::int as events from usage_events u ${where}`))[0] as { credits: number; cents: number; events: number };

  const splitRows = (await q(`select ${KIND} as kind, count(*)::int as count, coalesce(sum(u.cents),0)::int as cents from usage_events u ${where} group by kind`)) as { kind: string; count: number; cents: number }[];
  const split = { image: { count: 0, cents: 0 }, video: { count: 0, cents: 0 }, other: { count: 0, cents: 0 } };
  for (const r of splitRows) if (r.kind in split) (split as Record<string, { count: number; cents: number }>)[r.kind] = { count: r.count, cents: r.cents };

  const byUser = (await q(`select coalesce(u.user_email,'(system)') as user_email, sum(u.credits)::float as credits, sum(u.cents)::int as cents, count(*)::int as events from usage_events u ${where} group by u.user_email order by cents desc`)) as CostReport["byUser"];

  const byInfluencer = (await q(`
    select i.id as id, coalesce(i.name,'(removed)') as name,
           sum(u.credits)::float as credits, sum(u.cents)::int as cents,
           sum(case when u.action in ('casting','photoshoot','humaniser') then u.count else 0 end)::int as images,
           sum(case when u.provider='heygen' or u.action in ('presenter','video') then u.count else 0 end)::int as videos
    from usage_events u left join influencers i on i.id = u.influencer_id ${where}
    group by i.id, i.name order by cents desc limit 200`)) as CostReport["byInfluencer"];

  const byProvider = (await q(`select u.provider, sum(u.credits)::float as credits, sum(u.cents)::int as cents from usage_events u ${where} group by u.provider order by cents desc`)) as CostReport["byProvider"];
  const byAction = (await q(`select coalesce(u.action,'(other)') as action, sum(u.credits)::float as credits, sum(u.cents)::int as cents from usage_events u ${where} group by u.action order by cents desc`)) as CostReport["byAction"];
  const byDay = (await q(`select to_char(date_trunc('day', u.created_at),'YYYY-MM-DD') as day, sum(u.credits)::float as credits, sum(u.cents)::int as cents from usage_events u ${where} group by date_trunc('day', u.created_at) order by date_trunc('day', u.created_at) asc limit 120`)) as CostReport["byDay"];

  // Picker option lists (unfiltered).
  const influencers = (await db().query(`select id, name from influencers order by created_at desc limit 500`)) as { id: string; name: string }[];
  const providers = (await db().query(`select distinct provider from usage_events order by provider`) as { provider: string }[]).map((r) => r.provider);

  return { total, split, byUser, byInfluencer, byProvider, byAction, byDay, influencers, providers };
}

// Running spend for one influencer (for the live build-cost chip).
export async function getInfluencerSpend(id: string): Promise<{ credits: number; cents: number }> {
  const rows = (await db().query(
    `select coalesce(sum(credits),0)::float as credits, coalesce(sum(cents),0)::int as cents from usage_events where influencer_id=$1`,
    [id],
  )) as { credits: number; cents: number }[];
  return rows[0] ?? { credits: 0, cents: 0 };
}

// ── Daily cost audit ─────────────────────────────────────────────────────────
export async function recordBalanceSnapshot(remaining: number | null, note?: string): Promise<void> {
  const t = (await db().query(`select coalesce(sum(credits),0)::float as credits, coalesce(sum(cents),0)::int as cents from usage_events`)) as { credits: number; cents: number }[];
  await db().query(
    `insert into balance_snapshots (remaining, ledger_credits, ledger_cents, note) values ($1,$2,$3,$4)`,
    [remaining, t[0]?.credits ?? 0, t[0]?.cents ?? 0, note ?? null],
  );
}

export async function getAuditTrail(limit = 30): Promise<{ taken_at: string; remaining: number | null; ledger_credits: number; ledger_cents: number; note: string | null }[]> {
  return (await db().query(
    `select to_char(taken_at,'YYYY-MM-DD HH24:MI') as taken_at, remaining::float as remaining, ledger_credits::float as ledger_credits, ledger_cents::int as ledger_cents, note
     from balance_snapshots order by taken_at desc limit $1`, [limit],
  )) as { taken_at: string; remaining: number | null; ledger_credits: number; ledger_cents: number; note: string | null }[];
}

export async function getSummary(): Promise<UsageSummary> {
  const totalRows = (await db().query(
    "select coalesce(sum(credits),0)::float as credits, coalesce(sum(cents),0)::int as cents, count(*)::int as events from usage_events",
  )) as { credits: number; cents: number; events: number }[];
  const byInfluencer = (await db().query(
    `select coalesce(i.name,'(removed)') as name, sum(u.credits)::float as credits, sum(u.cents)::int as cents
     from usage_events u left join influencers i on i.id = u.influencer_id
     group by i.name order by cents desc, credits desc limit 50`,
  )) as { name: string; credits: number; cents: number }[];
  const byProvider = (await db().query(
    `select provider, sum(credits)::float as credits, sum(cents)::int as cents from usage_events group by provider order by cents desc`,
  )) as { provider: string; credits: number; cents: number }[];
  const byDay = (await db().query(
    `select to_char(date_trunc('day', created_at),'Mon DD') as day, sum(credits)::float as credits, sum(cents)::int as cents
     from usage_events group by date_trunc('day', created_at) order by date_trunc('day', created_at) desc limit 30`,
  )) as { day: string; credits: number; cents: number }[];
  return { total: totalRows[0], byInfluencer, byProvider, byDay };
}
