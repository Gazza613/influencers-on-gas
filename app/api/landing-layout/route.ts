import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSetting, setSetting, LANDING_LAYOUT } from "@/lib/settings";

// Which layout the PUBLIC landing page uses. The GET is deliberately unauthenticated: the page it controls is
// the logged-out front door, so gating the read would mean visitors always saw the default. It exposes one
// word and nothing else.
export const dynamic = "force-dynamic";

export async function GET() {
  // Default is "cards", the original floating photos: Gary reviewed the systems layout and rejected it,
  // so the fallback must be the layout he wants, not the one he turned down.
  const layout = await getSetting(LANDING_LAYOUT, "cards");
  return NextResponse.json({ layout });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { layout?: string };
  if (b.layout !== "systems" && b.layout !== "cards") {
    return NextResponse.json({ error: "layout must be systems or cards" }, { status: 400 });
  }
  await setSetting(LANDING_LAYOUT, b.layout);
  return NextResponse.json({ ok: true, layout: b.layout });
}
