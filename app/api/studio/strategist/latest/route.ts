import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { latestStrategyForClient } from "@/lib/strategist";

// The latest strategy for a client (+ whether approved research exists), for the Gate 2 surface.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ strategy: null, objective: null, hasApprovedResearch: false });
  const out = await latestStrategyForClient(clientId);
  return NextResponse.json(out);
}
