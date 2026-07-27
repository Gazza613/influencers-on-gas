import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isSafePublicUrl } from "@/lib/safe-url";

// THE CLIENT'S GROUND-TRUTH WEBSITE (Gary). The team offers up the client's real website, and both intel desks
// anchor every run to it, so they can never research a same-named but different business. GET reads it; POST
// sets it (super-admin - it changes what the desks treat as the client).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ website: null });
  const rows = (await db().query(`select website from clients where id = $1`, [clientId])) as { website: string | null }[];
  return NextResponse.json({ website: rows[0]?.website ?? null });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "super-admin only" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; website?: string };
  const clientId = String(b.clientId || "").trim();
  let website = String(b.website || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (!isSafePublicUrl(website)) return NextResponse.json({ error: "That does not look like a valid public website." }, { status: 400 });
  }
  await db().query(`update clients set website = $2 where id = $1`, [clientId, website || null]);
  return NextResponse.json({ ok: true, website: website || null });
}
