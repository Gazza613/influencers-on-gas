import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAssets } from "@/lib/studio";

// THE REAL PHONE-SCREEN LIBRARY (Gary's team). The client's own phone-screen screenshots, uploaded on the
// intake page. The builder lets you pick one per creative - exactly like the deal-card thumbnails - so the
// producer, or an expert, can say what the handset shows. A phone screen is NEVER AI-invented (a made-up
// banking UI in a real bank's ad is a compliance problem, not a style one); it is always a supplied screenshot.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  try {
    const assets = await listAssets(clientId, "phone_screen");
    const screens = assets
      .map((a) => ({ id: a.id, name: a.name || "Phone screen", url: a.url }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, screens });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
