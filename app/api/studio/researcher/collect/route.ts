import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@/auth";
import { collectResearch, latestResearchRun, listResearchClaims, listCompetitors, markResearchFailed } from "@/lib/researcher-v3";
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

  // DURABLE RUN (Gary: navigating away errored AND lost the acquired research, wasting the spend). The collection
  // now runs DECOUPLED from the response stream and is kept alive by waitUntil, so it reaches the store step even
  // if the browser disconnects. The SSE stream just tails a queue of progress events while the tab is open; if it
  // closes, the work carries on server-side and the run lands in the DB regardless. On failure the run is marked
  // 'failed' (never left as a dead 'collecting' spinner).
  const queue: unknown[] = [];
  let finished = false, capturedRunId = "";
  const work = (async () => {
    try {
      const { run, claims } = await collectResearch(clientId, today, {
        userEmail: session.user?.email ?? null,
        notes: notes || null,
        focus: focus || null,
        onEvent: (e) => { if (e.t === "start") capturedRunId = e.runId; queue.push(e); },
      });
      if (claims.length > 0) await inngest.send({ name: "research/collected", data: { clientId, runId: run.id } }).catch(() => {});
      queue.push({ t: "run", version: run.version, runId: run.id, count: claims.length });
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 300);
      if (capturedRunId) await markResearchFailed(capturedRunId, msg);   // don't leave a dead 'collecting' run
      queue.push({ t: "error", message: msg });
    } finally {
      finished = true;
    }
  })();
  waitUntil(work);   // keeps the function (and the run) alive past a client disconnect

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone: work continues via waitUntil */ }
      };
      // Drain the queue until the work finishes. If the client disconnects, enqueue no-ops and this loop simply
      // ends when the work does, but the work itself is not tied to this stream.
      while (!finished || queue.length) {
        if (queue.length) send(queue.shift());
        else await new Promise((r) => setTimeout(r, 250));
      }
      try { controller.close(); } catch { /* already closed */ }
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
