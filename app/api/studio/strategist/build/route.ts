import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { startStrategyBuild } from "@/lib/strategist";

// THE STRATEGIST (Pillar II), Phase C. Build a strategy from the client's APPROVED research fact base, DURABLY: this
// creates a 'building' strategy row and fires the background Inngest job (inngest/strategy.ts), then returns
// immediately. The two Opus 5 passes (draft + red-team) run as separate steps decoupled from this request, so a
// long pass can never hit the request ceiling and die (the old sync build's "nothing happened" failure). The UI
// polls the strategist/latest route for the row's status + progress.
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
    const strategy = await startStrategyBuild(clientId, { name, objective, userEmail: session.user?.email ?? null });
    return NextResponse.json({ ok: true, strategy, status: "building" });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
