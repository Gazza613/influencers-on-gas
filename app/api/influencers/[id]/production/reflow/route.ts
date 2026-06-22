import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { reflowContinuity } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// CONTINUITY pass: after the producer keeps/rejects references, re-flow the VO across the KEPT
// talking scenes so they read as one seamless script (no gaps from dropped scenes). Saves the
// rewritten vo_line + caption back onto the storyboard. Fails open (originals kept on any error).
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { brief?: Record<string, string>; dropped_scenes?: number[]; storyboard?: { tone?: string; scenes?: Record<string, string>[] } } | undefined;
  const scenes = production?.storyboard?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });

  const dropped = new Set((production?.dropped_scenes ?? []).map(Number));
  const kept = scenes.map((s, i) => ({ scene: i, role: String(s.role || "a-roll"), beat: String(s.beat || ""), vo_line: String(s.vo_line || "") })).filter((s) => !dropped.has(s.scene));

  try {
    const lines = await reflowContinuity({
      brand: production?.brief?.brand || "",
      tone: production?.storyboard?.tone || production?.brief?.tone || "",
      cta: production?.brief?.cta || "",
      scenes: kept,
    });
    if (!lines.length) return NextResponse.json({ error: "Nothing to re-flow (no kept talking scenes)." }, { status: 400 });
    const byScene = new Map(lines.map((l) => [Number(l.scene), l]));
    const nextScenes = scenes.map((s, i) => { const l = byScene.get(i); return l ? { ...s, vo_line: l.vo_line, caption: l.caption } : s; });
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, storyboard: { ...production!.storyboard, scenes: nextScenes } } } });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "reflow", count: lines.length }).catch(() => {});
    return NextResponse.json({ ok: true, reflowed: lines.length });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
