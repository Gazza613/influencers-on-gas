import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { reopenStrategy } from "@/lib/strategist";

// REOPEN an approved strategy for another round of edits (Gary: "reopen to refine"). Flips it back to
// awaiting_approval so the Gate 2 per-section refine + approve controls apply again. The team should rebuild the
// proposal from the re-approved version afterwards.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { strategyId?: string };
  const strategyId = String(b.strategyId || "").trim();
  if (!strategyId) return NextResponse.json({ error: "Missing the strategy." }, { status: 400 });
  try {
    const strategy = await reopenStrategy(strategyId);
    return NextResponse.json({ ok: true, strategy });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
