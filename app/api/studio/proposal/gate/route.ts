import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refineProposal, approveProposal, reopenProposal } from "@/lib/proposal";

// THE PROPOSAL GATE (Human Command). A senior strategist reviews the draft: send it back with comments (refine),
// approve it for the final cut, or reopen an approved one. Our experts gate every step.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { proposalId?: string; action?: string; comments?: string };
  const proposalId = String(b.proposalId || "").trim();
  const action = String(b.action || "").trim();
  if (!proposalId) return NextResponse.json({ error: "Missing the proposal." }, { status: 400 });
  try {
    if (action === "refine") {
      const comments = String(b.comments || "").trim();
      if (!comments) return NextResponse.json({ error: "Add your comments to send it back." }, { status: 400 });
      const proposal = await refineProposal(proposalId, comments, session.user?.email ?? null);
      return NextResponse.json({ ok: true, proposal });
    }
    if (action === "approve") {
      const proposal = await approveProposal(proposalId, session.user?.email || "manual");
      if (!proposal) return NextResponse.json({ error: "That proposal is not awaiting approval." }, { status: 409 });
      return NextResponse.json({ ok: true, proposal });
    }
    if (action === "reopen") {
      await reopenProposal(proposalId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
