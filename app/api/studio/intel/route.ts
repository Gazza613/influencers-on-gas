import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listIntel, setIntelStatus } from "@/lib/intel";

// The "Worth reviewing" queue. The daily agents PROPOSE; a human accepts or bins. Nothing reaches the client
// brain without that gate - otherwise a bad source quietly becomes "fact" and every future article and
// strategy inherits it.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const clientId = u.searchParams.get("clientId") || "";
  const status = u.searchParams.get("status") || "new";
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  return NextResponse.json({ intel: await listIntel(clientId, status) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId || "").trim();
  const id = String(b.id || "").trim();
  const status = b.status === "accepted" ? "accepted" : b.status === "binned" ? "binned" : null;
  if (!clientId || !id || !status) return NextResponse.json({ error: "Missing client, item or status." }, { status: 400 });
  await setIntelStatus(clientId, id, status);
  return NextResponse.json({ ok: true });
}
