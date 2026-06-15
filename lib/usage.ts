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
