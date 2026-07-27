import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// PER-FACT REJECT AT GATE 1 (Gary). Rejecting the whole run is too blunt when a single claim is wrong. This
// drops (or restores) ONE claim, surgically, so the rest of the fact base stands. It is a soft flag, not a
// delete: rejected claims keep an audit trail, are hidden from the approved fact base, and are excluded from the
// PDF, the source register and the eventual Strategist hand-off. Undo just restores it.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; claimId?: string; action?: string };
  const clientId = String(b.clientId || "").trim();
  const claimId = String(b.claimId || "").trim();
  const reject = b.action === "reject";
  if (!clientId || !claimId || (b.action !== "reject" && b.action !== "restore")) {
    return NextResponse.json({ error: "Need a claim and a reject/restore action." }, { status: 400 });
  }
  const rows = (await db().query(
    `update research_claims set rejected = $1, rejected_by = $2
     where id = $3 and client_id = $4
     returning id, rejected`,
    [reject, reject ? session.user?.email || "manual" : null, claimId, clientId],
  )) as { id: string; rejected: boolean }[];
  if (!rows[0]) return NextResponse.json({ error: "That claim was not found." }, { status: 404 });
  return NextResponse.json({ ok: true, id: rows[0].id, rejected: rows[0].rejected });
}
