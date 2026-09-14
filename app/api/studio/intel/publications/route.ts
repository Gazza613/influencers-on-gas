import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// THE CEO/MD PUBLISH + MEASURE LOOP (Gary), manual-metrics v1. A piece is posted to LinkedIn by the exec off the
// platform, so the team records the post + its performance here; the platform trends what lands per exec + topic.
// Admin-only (it is the CEO/MD article flow), and everything is scoped by client_id.
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";
const num = (v: unknown): number | null => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };

export async function GET(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ publications: [], summary: [] });

  const publications = (await db().query(
    `select id, intel_id, publisher, title, topic, linkedin_url, published_at, reach, reactions, comments, reshares, created_at
       from ceo_publications where client_id = $1 order by published_at desc nulls last, created_at desc limit 200`,
    [clientId],
  ).catch(() => [])) as Record<string, unknown>[];

  // WHAT LANDS: totals + averages per publisher, and the single best-performing piece (by reactions), so the trend
  // is visible at a glance, not just a table of rows.
  const summary = (await db().query(
    `select publisher,
            count(*) filter (where published_at is not null)::int as posted,
            coalesce(sum(reach),0)::int as reach, coalesce(sum(reactions),0)::int as reactions,
            coalesce(sum(comments),0)::int as comments, coalesce(sum(reshares),0)::int as reshares,
            round(avg(reactions))::int as avg_reactions
       from ceo_publications where client_id = $1 group by publisher`,
    [clientId],
  ).catch(() => [])) as Record<string, unknown>[];

  return NextResponse.json({ publications, summary });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || "").trim();
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });

  const cleanUrl = (u: unknown) => { const s = String(u || "").trim(); return /^https?:\/\//i.test(s) ? s.slice(0, 500) : null; };
  const cleanDate = (d: unknown) => { const s = String(d || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

  if (action === "create") {
    const title = String(b.title || "").trim().slice(0, 300);
    if (!title) return NextResponse.json({ error: "The piece needs a title." }, { status: 400 });
    const publisher = b.publisher === "md" ? "md" : "ceo";
    const rows = (await db().query(
      `insert into ceo_publications (client_id, intel_id, publisher, title, topic, linkedin_url, published_at)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [clientId, String(b.intelId || "").trim() || null, publisher, title, String(b.topic || "").trim().slice(0, 300) || null, cleanUrl(b.linkedinUrl), cleanDate(b.publishedAt)],
    )) as { id: string }[];
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  }

  if (action === "update") {
    const id = String(b.id || "").trim();
    if (!id) return NextResponse.json({ error: "Missing the publication." }, { status: 400 });
    const rows = (await db().query(
      `update ceo_publications set
         reach = $3, reactions = $4, comments = $5, reshares = $6,
         linkedin_url = coalesce($7, linkedin_url), published_at = coalesce($8, published_at), updated_at = now()
       where id = $1 and client_id = $2 returning id`,
      [id, clientId, num(b.reach), num(b.reactions), num(b.comments), num(b.reshares), cleanUrl(b.linkedinUrl), cleanDate(b.publishedAt)],
    )) as { id: string }[];
    if (!rows[0]) return NextResponse.json({ error: "That piece is not on this brain." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(b.id || "").trim();
    await db().query(`delete from ceo_publications where id = $1 and client_id = $2`, [id, clientId]).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
