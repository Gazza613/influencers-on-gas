import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSummary, getInfluencerSpend } from "@/lib/usage";

// Spend summary from the usage ledger (fast, DB only).
// ?influencerId= returns just that influencer's running spend (for the build chip).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const influencerId = new URL(req.url).searchParams.get("influencerId");
  if (influencerId) return NextResponse.json({ influencer: await getInfluencerSpend(influencerId) });
  return NextResponse.json({ summary: await getSummary() });
}
