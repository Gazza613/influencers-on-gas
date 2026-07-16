import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { renderDealCardPreview } from "@/lib/studio-slider";
import type { Deal } from "@/lib/studio-producer";

// PREVIEW A TYPED DEAL as the actual card that will land on the creative (Gary: "deals are dynamic from the
// client - if it says 1GB for R2 and I want 5GB for R49, can I change it?").
//
// Yes, and the price never goes near an AI: the client's deal card is rebuilt as code, so we SET the type
// ourselves and every character is exact. This renders that card standalone so the team can eyeball it before
// spending a generate. Free - no vendor call, just our own renderer.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; deal?: Deal; orientation?: "vertical" | "horizontal" };
  const clientId = String(b.clientId || "");
  const deal = b.deal;
  if (!clientId || !deal?.label) return NextResponse.json({ error: "clientId and a deal are required" }, { status: 400 });

  try {
    const url = await renderDealCardPreview(clientId, deal, b.orientation === "horizontal" ? "horizontal" : "vertical");
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
