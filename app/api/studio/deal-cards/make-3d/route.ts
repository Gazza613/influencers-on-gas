import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { make3dDealCard } from "@/lib/vendors/higgsfield";
import { addAsset } from "@/lib/studio";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// 3D-IFY A DEAL CARD - asset prep, with a HUMAN IN THE MIDDLE. Gary's team converts the flat intake cards into
// the premium 3D extruded badges the reference designs use.
//
// Two actions, deliberately separate, because the price must never be taken on trust:
//   preview -> render the 3D version and hand it back. NOTHING is saved.
//   save    -> the team has eyeballed the text and approved it; store it as a real deal_card asset, which then
//              appears in the builder's deal-card picker like any other artwork.
//
// That is what keeps the guarantee intact: the AI touches the card ONCE here, a person checks every digit, and
// from then on creatives composite a fixed, verified asset - never a fresh roll of the price.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { action?: string; clientId?: string; url?: string; name?: string; yaw?: number };
  const action = String(b.action || "preview");
  const clientId = String(b.clientId || "");
  const url = String(b.url || "");
  const name = String(b.name || "Deal card");
  if (!clientId || !url) return NextResponse.json({ error: "clientId and url required" }, { status: 400 });

  try {
    if (action === "save") {
      // The team approved this render - copy it into our own blob store so it can never expire from under us,
      // then register it as a deal_card asset alongside the flat originals.
      const buf = Buffer.from(new Uint8Array(await (await fetch(url)).arrayBuffer()));
      const stored = await putBytes(buf, `studio/${clientId}/deal_card_3d`, "png", "image/png");
      const clean = name.replace(/\.(png|jpe?g)$/i, "").replace(/\s*[–-]\s*3D$/i, "");
      const asset = await addAsset(clientId, "deal_card", stored, `${clean} - 3D`, { source: "make-3d", approvedBy: session.user.email || "" });
      return NextResponse.json({ ok: true, asset });
    }

    const r = await make3dDealCard(url, { yaw: typeof b.yaw === "number" ? b.yaw : -10 });
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "deal-card-3d", count: 1 }).catch(() => {});
    if (!r.url) return NextResponse.json({ error: r.error || "the 3D render failed" }, { status: 500 });
    return NextResponse.json({ ok: true, url: r.url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
