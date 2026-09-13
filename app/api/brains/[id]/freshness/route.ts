import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// THE FRESHNESS SLA for one brain (Gary): how often its website sources are automatically re-crawled to keep the
// knowledge base current. 0 = off. Reading is open to any signed-in user; SETTING it is admin-only, because it
// is a cost dial (each automated re-crawl spends Firecrawl + Voyage).
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";
const ALLOWED = new Set([0, 7, 14, 30, 60, 90]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = (await db().query(`select auto_recrawl_days from clients where id = $1`, [id]).catch(() => [])) as { auto_recrawl_days: number | null }[];
  return NextResponse.json({ autoRecrawlDays: Number(rows[0]?.auto_recrawl_days) || 0 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { days?: unknown };
  const days = Math.round(Number(b.days) || 0);
  if (!ALLOWED.has(days)) return NextResponse.json({ error: "Pick a valid interval." }, { status: 400 });
  const rows = (await db().query(`update clients set auto_recrawl_days = $2 where id = $1 returning id`, [id, days]).catch(() => [])) as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "Brain not found." }, { status: 404 });
  return NextResponse.json({ ok: true, autoRecrawlDays: days });
}
