import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// KEEP THE CEO NEWSLETTER DRAFTED OFF A FACT (Gary: "I clicked approve and it did nothing and when I went back
// it was gone"). The piece and its creative used to live only in React state, so approving threw them away. They
// are now stored ON THE FACT, exactly as the Journalist desk stores a draft on its finding (intel/draft) - so a
// draft survives a logout, reopens where it was, and can be taken to the CEO.
//
// POST   saves the piece, the chosen creative and the other options (send only what changed).
// DELETE clears the draft (Reject), so the team can drop what they do not want to keep.
//
// Scoped by client_id AND id on every statement: a draft belongs to one brain's fact and can never be written
// or cleared from another brain.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    clientId?: string; claimId?: string; newsletter?: string; art?: string; options?: string[];
  };
  const clientId = String(b.clientId || "").trim();
  const claimId = String(b.claimId || "").trim();
  if (!clientId || !claimId) return NextResponse.json({ error: "clientId and claimId required" }, { status: 400 });

  try {
    // Only touch the fields actually supplied, so saving a new pick cannot wipe the article.
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (typeof b.newsletter === "string") { sets.push(`newsletter = $${i++}`); vals.push(b.newsletter); }
    if (typeof b.art === "string") { sets.push(`newsletter_art = $${i++}`); vals.push(b.art); }
    if (Array.isArray(b.options)) { sets.push(`newsletter_options = $${i++}`); vals.push(JSON.stringify(b.options)); }
    if (!sets.length) return NextResponse.json({ ok: true, skipped: "nothing to save" });

    vals.push(claimId, clientId);
    await db().query(
      `update research_claims set ${sets.join(", ")} where id = $${i++} and client_id = $${i}`,
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
  const claimId = url.searchParams.get("claimId") || "";
  if (!clientId || !claimId) return NextResponse.json({ error: "clientId and claimId required" }, { status: 400 });

  try {
    await db().query(
      `update research_claims set newsletter = null, newsletter_art = null, newsletter_options = '[]'::jsonb
       where id = $1 and client_id = $2`,
      [claimId, clientId],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
