import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { listCompetitors } from "@/lib/researcher-v3";

// THE COMPETITOR SET (spec 3.6, 4.3), editable at Gate 1. Auto-detected competitors land via the collect run;
// Gary adds or removes here at approval. An ADD is a candidate for a targeted research pass on that competitor
// only (not a full rerun) - the pass is commissioned via the collect endpoint, which now sees the new name.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; name?: string; website?: string };
  const clientId = String(b.clientId || "").trim();
  const name = String(b.name || "").trim().slice(0, 200);
  const website = String(b.website || "").trim().slice(0, 300);
  if (!clientId || !name) return NextResponse.json({ error: "A competitor name is needed." }, { status: 400 });

  // Don't duplicate a name already in the set (case-insensitive).
  const exists = (await db().query(
    `select 1 from research_competitors where client_id = $1 and lower(name) = lower($2) limit 1`, [clientId, name],
  )) as unknown[];
  if (!exists.length) {
    await db().query(
      `insert into research_competitors (client_id, name, website, added_by) values ($1,$2,$3,$4)`,
      [clientId, name, /^https?:\/\//i.test(website) ? website : null, session.user?.email || "manual"],
    );
  }
  return NextResponse.json({ ok: true, competitors: await listCompetitors(clientId) });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const clientId = url.searchParams.get("clientId") || "";
  if (!id || !clientId) return NextResponse.json({ error: "Missing the competitor or client." }, { status: 400 });
  await db().query(`delete from research_competitors where id = $1 and client_id = $2`, [id, clientId]);
  return NextResponse.json({ ok: true, competitors: await listCompetitors(clientId) });
}
