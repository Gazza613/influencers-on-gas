import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildResearchDocument, documentDeliveryStatus } from "@/lib/research-doc";

// THE RESEARCH DOCUMENT (spec 3.8, 3.9). POST renders the fact base to a GAS-CI PDF, stores it (Blob), files it
// to Google Drive under the client's /Research folder when Drive is configured, and emails Gary a Studio link.
// GET reports where things stand plus which delivery channels are live, so the UI can be honest about what will
// happen (e.g. "Drive not configured yet"). Rendering uses Chromium, so give it room.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ delivery: documentDeliveryStatus() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; runId?: string };
  const clientId = String(b.clientId || "").trim();
  const runId = String(b.runId || "").trim();
  if (!clientId || !runId) return NextResponse.json({ error: "Missing the client or run." }, { status: 400 });
  try {
    const out = await buildResearchDocument(clientId, runId);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
