import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// KEEP THE CEO DRAFT (Gary: "when I log out and back in the article and photos disappear... we could consider a
// keep or remove so we can choose what to keep for the CEO approval").
//
// The drafted piece and its creative used to live only in React state, so a logout threw them away. A draft you
// cannot come back to is a draft you cannot take to the CEO, so they are now stored against the finding itself.
//
// POST   saves the piece, the chosen creative and the other options (partial - send only what changed).
// DELETE removes the draft, so the team can clear what they do not want to keep.
//
// Scoped by client_id AND id on every statement: a draft belongs to one brain's finding and can never be
// written or cleared from another brain.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    clientId?: string; id?: string; newsletter?: string; art?: string; options?: string[];
  };
  const clientId = String(b.clientId || "");
  const id = String(b.id || "");
  if (!clientId || !id) return NextResponse.json({ error: "clientId and id required" }, { status: 400 });

  try {
    // Only touch the fields actually supplied, so saving a new pick cannot wipe the article.
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (typeof b.newsletter === "string") { sets.push(`newsletter = $${i++}`); vals.push(b.newsletter); }
    if (typeof b.art === "string") { sets.push(`newsletter_art = $${i++}`); vals.push(b.art); }
    if (Array.isArray(b.options)) { sets.push(`newsletter_options = $${i++}`); vals.push(JSON.stringify(b.options)); }
    if (!sets.length) return NextResponse.json({ ok: true, skipped: "nothing to save" });

    vals.push(id, clientId);
    await db().query(
      `update studio_intel set ${sets.join(", ")} where id = $${i++} and client_id = $${i}`,
      vals,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") || "";
  const id = url.searchParams.get("id") || "";
  if (!clientId || !id) return NextResponse.json({ error: "clientId and id required" }, { status: 400 });

  try {
    await db().query(
      `update studio_intel set newsletter = null, newsletter_art = null, newsletter_options = '[]'::jsonb
       where id = $1 and client_id = $2`,
      [id, clientId],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
