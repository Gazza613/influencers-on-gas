import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// Queue a durable a-roll clip render (talking influencer says a line). Pre-creates the clip as
// "running", fires the job, returns immediately. The UI polls the influencer for the result.
export const maxDuration = 30;

type ArollClip = { id?: string; status?: string; [k: string]: unknown };

// Delete an a-roll clip the producer doesn't like. Removed clips never reach the showreel
// (clips are drafts; the showreel is an explicit accept/decline at the END of production).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const clipId = new URL(req.url).searchParams.get("clipId") || "";
  const list = (Array.isArray(persona.aroll) ? persona.aroll : []) as ArollClip[];
  const kept = list.filter((c) => (c.id || "") !== clipId);
  await updateInfluencer(id, { persona: { ...persona, aroll: kept } });
  return NextResponse.json({ ok: true, aroll: kept });
}

// Current voice + a-roll clips (for polling).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = (inf.persona ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    voice: p.voice_id ? { id: p.voice_id, name: p.voice_name ?? "Voice", preview: p.voice_preview_url ?? null } : null,
    aroll: Array.isArray(p.aroll) ? p.aroll : [],
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  if (!persona.voice_id) return NextResponse.json({ error: "Create the influencer's voice first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const line = typeof body.line === "string" ? body.line.trim().slice(0, 1200) : "";
  const ratio = body.ratio === "1:1" || body.ratio === "16:9" ? body.ratio : "9:16";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
  if (line.length < 2) return NextResponse.json({ error: "Add a line for the influencer to say." }, { status: 400 });

  const clipId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = (Array.isArray(persona.aroll) ? persona.aroll : []) as ArollClip[];
  const clip = { id: clipId, line, ratio, sourceUrl, status: "running", url: null, error: null, at: Date.now() };
  await updateInfluencer(id, { persona: { ...persona, aroll: [clip, ...existing].slice(0, 60) } });
  try {
    await inngest.send({ name: "influencer/generate.aroll", data: { influencerId: id, clipId, line, ratio, sourceUrl } });
  } catch {
    const cleared = [clip, ...existing].map((c) => (c.id === clipId ? { ...c, status: "failed", error: "Could not queue (generation engine not connected)." } : c));
    await updateInfluencer(id, { persona: { ...persona, aroll: cleared } });
    return NextResponse.json({ error: "Could not queue the clip." }, { status: 503 });
  }
  return NextResponse.json({ queued: true, clipId });
}
