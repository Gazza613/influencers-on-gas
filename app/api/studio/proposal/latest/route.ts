import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { latestProposalForStrategy } from "@/lib/proposal";

// The latest proposal for a strategy, for the proposal builder surface.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const strategyId = new URL(req.url).searchParams.get("strategyId") || "";
  if (!strategyId) return NextResponse.json({ proposal: null });
  const proposal = await latestProposalForStrategy(strategyId);
  return NextResponse.json({ proposal });
}
