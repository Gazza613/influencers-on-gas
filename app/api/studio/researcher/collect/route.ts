import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { collectResearch, latestResearchRun, listResearchClaims, listCompetitors } from "@/lib/researcher-v3";
import { inngest } from "@/lib/inngest";

// THE RESEARCHER (V3), FACTS-ONLY COLLECTOR. Commissioned on demand, like the old dossier. GET returns the
// latest run with its claims and the editable competitor set (what Gate 1 reviews). POST commissions a new
// versioned run and STREAMS progress (Server-Sent Events) - a full collect does many web searches then files
// and verifies, so a static spinner would make it feel broken.
export const maxDuration = 800;
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
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone */ }
      };
      try {
        const { run, claims } = await collectResearch(clientId, today, {
          userEmail: session.user?.email ?? null,
          notes: notes || null,
          focus: focus || null,
          onEvent: (e) => send(e),
        });
        // DURABLE DOCUMENT (Inngest): render the PDF, file to Drive and email Gary in a retryable background job,
        // so the fragile parts heal themselves and the SSE request returns as soon as the facts are filed. The UI
        // polls for the PDF; a manual "Generate document" is the fallback if the background job is unavailable.
        if (claims.length > 0) await inngest.send({ name: "research/collected", data: { clientId, runId: run.id } }).catch(() => {});
        send({ t: "run", version: run.version, runId: run.id, count: claims.length });
      } catch (e) {
        send({ t: "error", message: String((e as Error)?.message || e).slice(0, 300) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
