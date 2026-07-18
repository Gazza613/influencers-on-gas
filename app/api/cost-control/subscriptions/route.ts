import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listSubscriptions, upsertSubscription, deleteSubscription, allocateFixedCosts } from "@/lib/subscriptions";

// The standing cost of the tech stack, and how it lands on each desk.
export const dynamic = "force-dynamic";

// SEEDED WITH ONLY WHAT IS ACTUALLY KNOWN. Higgsfield Ultra and HeyGen Pro are already written into this
// codebase (lib/usage.ts MONTHLY_USD, and the heygen rate_card note), and Gary stated Claude at $100/mo. The
// rest are listed at 0 so they appear in the UI as an explicit "tell me the amount" rather than being
// invented: a fabricated subscription price would corrupt the exact number this exists to produce, and it
// would look authoritative while doing it.
const SEED: { provider: string; name: string; monthly_usd: number; note: string }[] = [
  { provider: "higgsfield", name: "Higgsfield Ultra", monthly_usd: 375, note: "9,000 credits/mo. nano_banana_pro and gpt_image_2 are unlimited on this plan." },
  { provider: "anthropic", name: "Claude", monthly_usd: 100, note: "Powers every AI step on the platform: co-pilot, research, scripts, QA." },
  { provider: "heygen", name: "HeyGen Pro", monthly_usd: 99, note: "~121 presenter minutes/mo included; overage billed per minute." },
  { provider: "elevenlabs", name: "ElevenLabs", monthly_usd: 0, note: "Voice, music and SFX run inside this quota. Set the real monthly amount." },
  { provider: "freepik", name: "Freepik / Magnific", monthly_usd: 0, note: "Fallback upscale and stock. Set the real monthly amount." },
  { provider: "vercel", name: "Vercel", monthly_usd: 0, note: "Hosting and functions. Set the real monthly amount." },
  { provider: "neon", name: "Neon Postgres", monthly_usd: 0, note: "Database and pgvector. Set the real monthly amount." },
];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // First look on an empty table plants the known rows so the panel is useful immediately.
  const existing = await listSubscriptions();
  if (existing.length === 0) {
    for (const s of SEED) await upsertSubscription(s).catch(() => {});
  }

  const u = new URL(req.url);
  const [subscriptions, allocation] = await Promise.all([
    listSubscriptions(),
    allocateFixedCosts(u.searchParams.get("from"), u.searchParams.get("to")),
  ]);
  return NextResponse.json({ subscriptions, allocation });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { id?: string; provider?: string; name?: string; monthly_usd?: number; active?: boolean; note?: string };
  const provider = String(b.provider || "").trim().toLowerCase();
  const name = String(b.name || "").trim();
  const monthly = Number(b.monthly_usd);
  if (!provider || !name) return NextResponse.json({ error: "Provider and name are required." }, { status: 400 });
  if (!Number.isFinite(monthly) || monthly < 0) return NextResponse.json({ error: "Enter a monthly amount in USD." }, { status: 400 });

  await upsertSubscription({ id: b.id, provider, name, monthly_usd: monthly, active: b.active ?? true, note: b.note ?? null });
  return NextResponse.json({ ok: true, subscriptions: await listSubscriptions() });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteSubscription(id);
  return NextResponse.json({ ok: true, subscriptions: await listSubscriptions() });
}

// Ensure the table exists on a deploy that has not run the migration yet - the panel should never 500 on a
// missing table, it should just come up empty and fill in.
export async function PUT() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  await db().query(`create table if not exists subscriptions (
    id uuid primary key default gen_random_uuid(),
    provider text not null, name text not null,
    monthly_usd numeric not null default 0, active boolean not null default true,
    note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
  await db().query(`create unique index if not exists idx_subscriptions_provider_name on subscriptions(provider, name)`);
  return NextResponse.json({ ok: true });
}
