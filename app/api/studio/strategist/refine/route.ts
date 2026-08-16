import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { startStrategyRefine } from "@/lib/strategist";

// GATE 2 pre-step, Human Command: "look at the strategy, edit if needed". Refines the strategy in place from the
// team's notes, DURABLY: flips the row to 'building' and fires the background job (inngest/strategy.ts), returning
// immediately. The two Opus 5 passes run decoupled from this request; the UI polls status/progress. Then the team
// approves the sharpened strategy.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { strategyId?: string; notes?: string };
  const strategyId = String(b.strategyId || "").trim();
  const notes = String(b.notes || "").trim().slice(0, 2000);
  if (!strategyId || !notes) return NextResponse.json({ error: "Need the strategy and your edit notes." }, { status: 400 });
  try {
    const strategy = await startStrategyRefine(strategyId, notes, session.user?.email ?? null);
    return NextResponse.json({ ok: true, strategy, status: "building" });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
