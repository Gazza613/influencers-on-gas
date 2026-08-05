import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildProposalPdf } from "@/lib/proposal-pdf";

// Render the branded proposal PDF (client colour from their website + GAS as Agency of NOW). Chromium render, so
// give it room. accent (optional hex) lets the team override the auto-detected colour.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { proposalId?: string; accent?: string };
  const proposalId = String(b.proposalId || "").trim();
  const accent = typeof b.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : null;
  if (!proposalId) return NextResponse.json({ error: "Missing the proposal." }, { status: 400 });
  try {
    const url = await buildProposalPdf(proposalId, accent);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
