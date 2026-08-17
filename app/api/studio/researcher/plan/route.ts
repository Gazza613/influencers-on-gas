import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { planResearch } from "@/lib/research-plan";

// THE RESEARCH PLAN PREVIEW (pre-run alignment gate). Cheap: one model call, no web search, no run created. Returns a
// facts-only plan for the brief so the team can align on it before dispatching the expensive deep run.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; focus?: string };
  const clientId = String(b.clientId || "").trim();
  const focus = String(b.focus || "").slice(0, 2000);
  if (!clientId) return NextResponse.json({ error: "Pick a brain first." }, { status: 400 });
  try {
    const plan = await planResearch(clientId, focus, session.user?.email ?? null);
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
