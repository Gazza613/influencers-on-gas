import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runResearch, listResearch } from "@/lib/research";

// THE RESEARCHER DESK. Unlike the Journalist and Strategist (a daily cron), a dossier is COMMISSIONED here on
// demand - deep web research on four brains every day is real spend for little gain, so it only runs when
// someone asks. GET lists the current dossier; POST commissions a new one.
export const maxDuration = 800;   // a deep dossier does many web searches, then files
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  return NextResponse.json({ intel: await listResearch(clientId, "new") });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; focus?: string };
  const clientId = String(b.clientId || "").trim();
  const focus = String(b.focus || "").trim().slice(0, 600);
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const findings = await runResearch(clientId, today, focus || undefined);
    return NextResponse.json({ ok: true, count: findings.length });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
