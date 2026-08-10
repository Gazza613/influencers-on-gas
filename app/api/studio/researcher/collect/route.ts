import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { startResearchRun, latestResearchRun, listResearchClaims, listCompetitors } from "@/lib/researcher-v3";
import { inngest } from "@/lib/inngest";

// THE RESEARCHER (V3), FACTS-ONLY COLLECTOR. Commissioned on demand. GET returns the latest run with its claims and
// the editable competitor set (what Gate 1 reviews). POST commissions a new versioned run: it creates the run row,
// fires the DURABLE, phase-stepped Inngest job (inngest/research.ts) and returns immediately. The run is no longer
// tied to this request, so it can take as long as it needs - a deep run used to hit Vercel's ~13-minute per-request
// ceiling and die. The UI polls this route's GET for the run's status + progress until it lands.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  const run = await latestResearchRun(clientId);
  const [claims, competitors] = await Promise.all([
    run ? listResearchClaims(run.id) : Promise.resolve([]),
    listCompetitors(clientId),
  ]);
  return NextResponse.json({ run, claims, competitors });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; notes?: string; focus?: string };
  const clientId = String(b.clientId || "").trim();
  const notes = String(b.notes || "").trim().slice(0, 2000);
  const focus = String(b.focus || "").trim().slice(0, 1000);
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  // Create the run row synchronously (so the user gets an immediate answer - a friendly refusal if a collect is
  // already in flight, or a run id to poll), then fire the durable phase-stepped job and return. The heavy work runs
  // in Inngest, decoupled from this request, so it can take as long as it needs.
  try {
    const { runId, version } = await startResearchRun(clientId, { userEmail: session.user?.email ?? null, notes: notes || null });
    await inngest.send({
      name: "research/collect",
      data: { clientId, runId, version, today, userEmail: session.user?.email ?? null, notes: notes || null, focus: focus || null },
    });
    return NextResponse.json({ ok: true, runId, version, status: "collecting" });
  } catch (e) {
    // A concurrency refusal ("already in progress") or a setup error - surface it as a 409 so the UI shows the message.
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 409 });
  }
}
