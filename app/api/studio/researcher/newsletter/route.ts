import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { writeCeoNewsletter } from "@/lib/ceo-newsletter";

// THE "CEO NEWSLETTER" TAG on the Researcher fact base (Gary): take ONE verified fact and write the CEO's LinkedIn
// piece from it, in this brain's voice. Reuses the shared writer (lib/ceo-newsletter) so it is the same piece the
// Journalist desk would produce. The image is a second request (intel/newsletter-creative) with the returned art.
// notes = a rewrite instruction, so "rewrite" folds a note into the same fact.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; claimId?: string; notes?: string };
  const clientId = String(b.clientId || "").trim();
  const claimId = String(b.claimId || "").trim();
  if (!clientId || !claimId) return NextResponse.json({ error: "clientId and claimId required" }, { status: 400 });

  // The fact, ringfenced to this client's brain.
  const rows = (await db().query(
    `select claim, subject, section, source_name, source_url, source_date, conflict
     from research_claims where id = $1 and client_id = $2 and rejected = false`,
    [claimId, clientId],
  )) as { claim: string; subject: string | null; section: string | null; source_name: string | null; source_url: string | null; source_date: string | null; conflict: string | null }[];
  const c = rows[0];
  if (!c) return NextResponse.json({ error: "That fact is not on this brain." }, { status: 404 });

  const result = await writeCeoNewsletter(clientId, {
    headline: c.claim,
    why_it_matters: c.subject ? `A verified fact about ${c.subject}.` : null,
    detail: c.conflict || "",
    sources: c.source_url ? [{ name: c.source_name || c.source_url, url: c.source_url }] : [],
    published_at: c.source_date,
  }, { userEmail: session.user?.email ?? null, notes: b.notes || null });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, newsletter: result.post, art: result.art });
}
