import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listDeals } from "@/lib/studio-deals";

// The client's real deal library (read off their intake artwork). The wizard's deal picker uses this - the
// Producer never invents a deal, per Gary; the user picks one of these or types the deal to typeset.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ deals: [] });
  const deals = await listDeals(clientId).catch(() => []);
  return NextResponse.json({ deals });
}
