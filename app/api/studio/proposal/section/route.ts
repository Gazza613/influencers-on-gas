import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refineProposalSection, setProposalSectionReview } from "@/lib/proposal";

// THE PER-SECTION GATE (Human Command). A senior human reads one section and either APPROVES it, or edits it by
// prompt ("refine": Fable rewrites only that section) and re-reads it. Reopen returns an approved section to draft.
// The whole proposal's final PDF unlocks once every section is approved. Our experts gate every section.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { proposalId?: string; section?: string; action?: string; instruction?: string };
  const proposalId = String(b.proposalId || "").trim();
  const section = String(b.section || "").trim();
  const action = String(b.action || "").trim();
  if (!proposalId || !section) return NextResponse.json({ error: "Missing the proposal or section." }, { status: 400 });
  try {
    if (action === "refine") {
      const instruction = String(b.instruction || "").trim();
      if (!instruction) return NextResponse.json({ error: "Add an instruction to refine this section." }, { status: 400 });
      const proposal = await refineProposalSection(proposalId, section, instruction, session.user?.email ?? null);
      return NextResponse.json({ ok: true, proposal });
    }
    if (action === "approve") {
      const proposal = await setProposalSectionReview(proposalId, section, "approved");
      return NextResponse.json({ ok: true, proposal });
    }
    if (action === "reopen") {
      const proposal = await setProposalSectionReview(proposalId, section, "draft");
      return NextResponse.json({ ok: true, proposal });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
