import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest";

// GATE 1 (spec 4). Gary approves or rejects a specific research VERSION in Studio - never by email. Approve locks
// it as the fact base and lets the Strategist start; reject archives it with a reason. "Rerun with notes" is not
// here: it commissions a NEW version via the collect endpoint (with the notes), so reruns never overwrite.
//
// STATE IS ENFORCED HERE, not just in the UI (spec 4.4): only a run currently at 'ready' can be gated, and the
// run must belong to the client passed in. The Strategist reads gate1_approved and nothing else.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; runId?: string; action?: string; reason?: string };
  const clientId = String(b.clientId || "").trim();
  const runId = String(b.runId || "").trim();
  const action = String(b.action || "").trim();
  const reason = String(b.reason || "").trim().slice(0, 2000);
  if (!clientId || !runId) return NextResponse.json({ error: "Missing the client or run." }, { status: 400 });

  const status = action === "approve" ? "gate1_approved" : action === "reject" ? "gate1_rejected" : null;
  if (!status) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  // Only a run that is READY for review can be gated, and only its own client can gate it.
  const rows = (await db().query(
    `update research_runs set status = $1, notes = coalesce($2, notes)
     where id = $3 and client_id = $4 and status = 'ready'
     returning id, version, status`,
    [status, reason || null, runId, clientId],
  )) as { id: string; version: number; status: string }[];
  if (!rows[0]) return NextResponse.json({ error: "That research is not awaiting review (already approved, rejected, or superseded)." }, { status: 409 });
  // Drive the pipeline through an event (spec 4.4). research/approved is the ONLY seam the Strategist can start
  // from, so approval is enforced at the workflow level, not just in the UI.
  if (action === "approve") await inngest.send({ name: "research/approved", data: { clientId, runId } }).catch(() => {});
  return NextResponse.json({ ok: true, run: rows[0] });
}
