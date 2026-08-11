import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// THE WEEKLY AUTO-RUN TOGGLE (Gary: "I want the Researcher to run weekly on a Monday morning at 08h30 - a weekly
// run toggle ON/OFF so we do not waste money"). Per client, OFF by default: a paid deep run never happens unless
// the team explicitly opts that brain in. The cron itself lives in inngest/research.ts (weeklyResearch); this is
// just the switch, read and written per brain.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  const rows = (await db().query(`select research_weekly from clients where id = $1`, [clientId])) as { research_weekly: boolean }[];
  return NextResponse.json({ enabled: !!rows[0]?.research_weekly });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; enabled?: boolean };
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  const enabled = b.enabled === true;
  const rows = (await db().query(
    `update clients set research_weekly = $1 where id = $2 returning research_weekly`,
    [enabled, clientId],
  )) as { research_weekly: boolean }[];
  if (!rows[0]) return NextResponse.json({ error: "That client was not found." }, { status: 404 });
  return NextResponse.json({ ok: true, enabled: rows[0].research_weekly });
}
