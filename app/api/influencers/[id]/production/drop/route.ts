import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// Approve/reject a reference: toggle a scene in/out of the cut. Rejected (dropped) scenes are
// excluded from animation + the stitch. The producer curates the a-roll / b-roll galleries this way.
export const maxDuration = 15;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = (persona.production ?? null) as Record<string, unknown> | null;
  if (!production) return NextResponse.json({ error: "No production." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  // Scene indices must be real storyboard scenes (a valid integer in range) — guards against junk
  // indices bloating the dropped list.
  const sceneCount = Array.isArray((production.storyboard as { scenes?: unknown[] })?.scenes) ? (production.storyboard as { scenes: unknown[] }).scenes.length : 0;
  const valid = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < sceneCount;
  // Either set the whole list, or toggle a single scene.
  let dropped = new Set((Array.isArray(production.dropped_scenes) ? (production.dropped_scenes as number[]) : []).map(Number).filter(valid));
  if (Array.isArray(b?.dropped)) {
    dropped = new Set(b.dropped.map(Number).filter(valid));
  } else if (valid(b?.scene)) {
    if (b.drop === false) dropped.delete(b.scene);
    else if (b.drop === true) dropped.add(b.scene);
    else dropped.has(b.scene) ? dropped.delete(b.scene) : dropped.add(b.scene); // toggle
  }
  const list = [...dropped].sort((x, y) => x - y);
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, dropped_scenes: list } } });
  return NextResponse.json({ ok: true, dropped: list });
}
