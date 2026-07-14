import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// APPROVE a reference: this is the one we recreate as code and lock against.
//
// The team uploads many versions of a layout over time ("Slider 1 (4)", "(5)", "(6)"...). Exactly ONE of
// them is the current approved design, and that one becomes the DESIGN CONTRACT with the client - the file
// the coded template must be pixel-equivalent to at lock time. Recreating a stale version would bake a dead
// design into the contract, so this is an explicit human choice, never a guess at "the newest file".
//
// Approving one reference un-approves the others for that placement: there can only be one contract.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId || "").trim();
  const templateId = String(b.templateId || "").trim();
  const approve = b.approve !== false;
  if (!clientId || !templateId) return NextResponse.json({ error: "Missing client or template." }, { status: 400 });

  const rows = (await db().query(
    `select placement from studio_templates where id = $1 and client_id = $2`,
    [templateId, clientId],
  )) as { placement: string }[];
  if (!rows[0]) return NextResponse.json({ error: "That reference no longer exists." }, { status: 404 });

  if (approve) {
    // One contract per placement: stand the others down first.
    await db().query(
      `update studio_templates set status = 'draft'
       where client_id = $1 and placement = $2 and status = 'locked'`,
      [clientId, rows[0].placement],
    );
    await db().query(`update studio_templates set status = 'locked' where id = $1 and client_id = $2`, [templateId, clientId]);
  } else {
    await db().query(`update studio_templates set status = 'draft' where id = $1 and client_id = $2`, [templateId, clientId]);
  }

  return NextResponse.json({ ok: true });
}
