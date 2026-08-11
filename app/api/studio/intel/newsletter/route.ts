import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { writeCeoNewsletter } from "@/lib/ceo-newsletter";

// TURN A JOURNALIST/RESEARCHER FINDING INTO THE CEO'S NEWSLETTER. The finding lives on studio_intel; the shared
// writer (lib/ceo-newsletter) turns it into the CEO's LinkedIn piece in this brain's own voice, scope and
// compliance - the same writer the Researcher fact-base tag uses, so the piece is identical wherever it is
// triggered. A Strategist finding stays internal (blunt, names competitors) and is deliberately NOT eligible.
// The image is generated as a second, short request (intel/newsletter-creative) from the returned art direction.
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; id?: string; notes?: string };
  const clientId = String(b.clientId || "");
  const id = String(b.id || "");
  if (!clientId || !id) return NextResponse.json({ error: "clientId and id required" }, { status: 400 });

  const rows = (await db().query(
    `select headline, why_it_matters, detail, sources, published_at from studio_intel
     where id = $1 and client_id = $2 and role in ('journalist','researcher')`,
    [id, clientId],
  )) as Record<string, unknown>[];
  const f = rows[0];
  if (!f) return NextResponse.json({ error: "That finding is not on this brain." }, { status: 404 });

  const result = await writeCeoNewsletter(clientId, {
    headline: String(f.headline || ""),
    why_it_matters: String(f.why_it_matters || ""),
    detail: String(f.detail || ""),
    sources: (Array.isArray(f.sources) ? f.sources : []) as { name: string; url: string }[],
    published_at: f.published_at ? String(f.published_at) : null,
  }, { userEmail: session.user?.email ?? null, notes: b.notes || null });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, newsletter: result.post, art: result.art });
}
