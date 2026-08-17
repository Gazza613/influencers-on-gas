import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PLATFORMS } from "@/lib/proposal-config";

// THE CLIENT'S SELECTED MEDIA CHANNELS (Gary). The team picks, on the Strategist, which channels we intend to use for
// this client. The selection steers the strategy AND locks the proposal's channel plan + audience targeting to only
// those channels, so the final proposal reflects exactly what was chosen. Empty = no restriction (model judgement).
export const dynamic = "force-dynamic";

const VALID = new Set(PLATFORMS as unknown as string[]);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ channels: [] });
  const rows = (await db().query(`select channels from clients where id = $1`, [clientId]).catch(() => [])) as { channels: string[] | null }[];
  const channels = (Array.isArray(rows[0]?.channels) ? rows[0]!.channels! : []).filter((c) => VALID.has(c));
  return NextResponse.json({ channels });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; channels?: unknown };
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick a client first." }, { status: 400 });
  // Keep only valid platform names, deduped, in PLATFORMS order so the stored value is always clean.
  const picked = Array.isArray(b.channels) ? b.channels.map(String) : [];
  const channels = (PLATFORMS as unknown as string[]).filter((p) => picked.includes(p));
  await db().query(`update clients set channels = $2::text[] where id = $1`, [clientId, channels]).catch(() => {});
  return NextResponse.json({ ok: true, channels });
}
