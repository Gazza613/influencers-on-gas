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
  const who = session.user?.email || "manual";
  const ACTIONS = ["reject", "restore", "add_brain", "remove_brain"];
  if (!clientId || !claimId || !ACTIONS.includes(String(b.action))) {
    return NextResponse.json({ error: "Need a claim and a reject/restore/add_brain/remove_brain action." }, { status: 400 });
  }

  // ADD TO BRAIN / REMOVE: a "keep" tag. Adding one clears any reject (a fact is kept OR rejected, never both).
  if (b.action === "add_brain" || b.action === "remove_brain") {
    const add = b.action === "add_brain";
    const rows = (await db().query(
      `update research_claims set in_brain = $1, in_brain_by = $2${add ? ", rejected = false, rejected_by = null" : ""}
       where id = $3 and client_id = $4
       returning id, in_brain, rejected`,
      [add, add ? who : null, claimId, clientId],
    )) as { id: string; in_brain: boolean; rejected: boolean }[];
    if (!rows[0]) return NextResponse.json({ error: "That claim was not found." }, { status: 404 });
    return NextResponse.json({ ok: true, id: rows[0].id, in_brain: rows[0].in_brain, rejected: rows[0].rejected });
  }

  // REJECT / RESTORE. Rejecting clears any in-brain tag.
  const reject = b.action === "reject";
  const rows = (await db().query(
    `update research_claims set rejected = $1, rejected_by = $2${reject ? ", in_brain = false, in_brain_by = null" : ""}
     where id = $3 and client_id = $4
     returning id, rejected, in_brain`,
    [reject, reject ? who : null, claimId, clientId],
  )) as { id: string; rejected: boolean; in_brain: boolean }[];
  if (!rows[0]) return NextResponse.json({ error: "That claim was not found." }, { status: 404 });
  return NextResponse.json({ ok: true, id: rows[0].id, rejected: rows[0].rejected, in_brain: rows[0].in_brain });
}
