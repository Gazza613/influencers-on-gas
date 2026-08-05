import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { approveStrategy } from "@/lib/cycle";

// GATE 2 (direction). A senior human approves the strategy. It supersedes the prior current strategy and points the
// campaign at this one. The Proposal (next step in this same POD) will run from an approved strategy.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { strategyId?: string };
  const strategyId = String(b.strategyId || "").trim();
  if (!strategyId) return NextResponse.json({ error: "Missing the strategy." }, { status: 400 });
  const strategy = await approveStrategy(strategyId, session.user?.email || "manual");
  if (!strategy) return NextResponse.json({ error: "That strategy is not awaiting approval (already approved or superseded)." }, { status: 409 });
  return NextResponse.json({ ok: true, strategy });
}
