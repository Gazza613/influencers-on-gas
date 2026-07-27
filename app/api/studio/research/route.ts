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

// The run STREAMS its progress (Server-Sent Events): a deep dive takes minutes, and a static "Researching..."
// makes a world-class engine feel broken. runResearch emits real milestones - each web search, each source
// read, each finding filed - and we forward them as they happen, closing with a done or error event. The
// client reads the body as a stream; there is no polling and no job table.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; focus?: string };
  const clientId = String(b.clientId || "").trim();
  const focus = String(b.focus || "").trim().slice(0, 600);
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone */ }
      };
      try {
        const findings = await runResearch(clientId, today, focus || undefined, (e) => send(e), session.user?.email ?? null);
        send({ t: "done", count: findings.length });
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
