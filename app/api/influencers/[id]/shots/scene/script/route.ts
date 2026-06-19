import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { rewriteSceneScript } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// THE PRODUCER's script helper: AI-rewrite ONE scene's VO line + caption. Returns the suggestion
// (the producer reviews + Saves it). Does NOT regenerate the image.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { brief?: Record<string, string>; storyboard?: { tone?: string; full_vo?: string; scenes?: Record<string, string>[] } } | undefined;
  const scenes = production?.storyboard?.scenes;
  const b = await req.json().catch(() => ({}));
  const index = Number(b.scene);
  const sc = Array.isArray(scenes) ? scenes[index] : undefined;
  if (!sc) return NextResponse.json({ error: "No such scene." }, { status: 400 });

  try {
    const out = await rewriteSceneScript({
      brand: production?.brief?.brand || "",
      tone: production?.storyboard?.tone || production?.brief?.tone || "",
      beat: String(sc.beat || ""),
      role: String(sc.role || "a-roll"),
      blocking: String(sc.blocking || ""),
      currentVo: String(sc.vo_line || ""),
      currentCaption: String(sc.caption || ""),
      instruction: typeof b.instruction === "string" ? b.instruction.slice(0, 300) : "",
      fullVo: production?.storyboard?.full_vo || "",
    });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "script", count: 1 }).catch(() => {});
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
