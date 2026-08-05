import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildAndSaveProposal } from "@/lib/proposal";
import { OBJECTIVES, TIERS, type ObjectiveId, type TierId } from "@/lib/proposal-config";

// Build the client-facing growth proposal from an approved strategy, on the chosen objective + tier. Fable 5, so
// it can take a moment.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { strategyId?: string; objective?: string; tier?: string };
  const strategyId = String(b.strategyId || "").trim();
  const objective = (OBJECTIVES.some((o) => o.id === b.objective) ? b.objective : "leads") as ObjectiveId;
  const tier = (b.tier && b.tier in TIERS ? b.tier : "dominate") as TierId;
  if (!strategyId) return NextResponse.json({ error: "Missing the strategy." }, { status: 400 });
  try {
    const proposal = await buildAndSaveProposal(strategyId, { objective, tier, userEmail: session.user?.email ?? null });
    return NextResponse.json({ ok: true, proposal });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
