import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildStrategy } from "@/lib/strategist";

// THE STRATEGIST (Pillar II), Phase C. Build a strategy from the client's APPROVED research fact base. This is the
// demonstrable Research -> Strategy hand-off: it only ever runs from a Gate-1-approved run, and produces the
// structured brief (awaiting Gate 2). Two Opus 5 passes (draft + adversarial red-team) can take a moment.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; name?: string; objective?: string };
  const clientId = String(b.clientId || "").trim();
  const objective = String(b.objective || "").trim().slice(0, 1000);
  const name = String(b.name || "").trim().slice(0, 200) || objective.slice(0, 80);
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  if (!objective) return NextResponse.json({ error: "Give the strategy an objective to work toward." }, { status: 400 });
  try {
    const out = await buildStrategy(clientId, { name, objective, userEmail: session.user?.email ?? null });
    return NextResponse.json({ ok: true, strategy: out.strategy, campaignId: out.campaignId });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
