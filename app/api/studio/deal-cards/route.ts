import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAssets } from "@/lib/studio";

// THE REAL DEAL-CARD / PILL LIBRARY (Gary's team). The client's own deal-card artwork, uploaded on the intake
// page. The builder lets you pick one per creative and composites THAT image top-right - never an AI-drawn
// deal, which is what garbled the price and put off-theme data offers on a money-transfer campaign.
//
// Each design ships in two orientations (Horizontal / Vert); we surface the name so the team can choose.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  try {
    const assets = await listAssets(clientId, "deal_card");
    const cards = assets
      .map((a) => ({ id: a.id, name: a.name || "Deal card", url: a.url }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, cards });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
