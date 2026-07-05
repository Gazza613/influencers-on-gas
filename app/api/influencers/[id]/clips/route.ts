import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// THE PRODUCER step 3: "render the clips" - every board frame becomes a moving clip (a-roll
// talking via HeyGen, b-roll motion via Kling). Durable; the UI polls the storyboard GET.
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  type Clip = { scene?: number; url?: string | null; status?: string; draft?: boolean };
  const production = persona.production as { storyboard?: { scenes?: { role?: string }[] }; shots?: { url?: string | null }[]; clips?: Clip[]; dropped_scenes?: number[] } | undefined;
  if (!production?.storyboard?.scenes?.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });
  if (!production.shots?.some((s) => s.url)) return NextResponse.json({ error: "Shoot the shots first." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const roles = Array.isArray(body?.roles) ? body.roles.map(String).filter((r: string) => ["a-roll", "b-roll", "graphic"].includes(r)) : null;
  const explicitScenes = Array.isArray(body?.scenes) ? body.scenes.map(Number).filter((n: number) => Number.isInteger(n)) : null;
  const force = body?.force === true; // a deliberate, paid full redo
  const reanimate = body?.reanimate === true; // an explicit per-scene re-animate (may redo a scene that has a clip)
  const speed = body?.speed === true; // draft speed: 720p a-roll clips (faster); the final stitch always outputs 1080p
  // FINALIZE (conform pass): re-animate every DRAFT (or missing/failed) clip at FULL quality for delivery,
  // from its already-locked keyframe - the proxy->conform step. Forces speed OFF + reanimate ON. Full-quality
  // clips are skipped so it only pays for what still needs upgrading.
  const finalize = body?.finalize === true;

  // COST SAFETY (single source of truth): never wipe clips and never re-render a scene that already has a
  // good clip unless the caller explicitly forces it. A whole-board animate computes EXACTLY the scenes
  // that still need a clip and renders only those - so 7/8 animates the 1, not all 8.
  const allScenes = production.storyboard.scenes;
  const existingClips: Clip[] = Array.isArray(production.clips) ? production.clips : [];
  const dropped = new Set((Array.isArray(production.dropped_scenes) ? production.dropped_scenes : []).map(Number));
  const hasGoodClip = (i: number) => existingClips.some((c) => Number(c.scene) === i && !!c.url && c.status !== "failed");

  // A clip needs a full-quality conform if it's missing, failed, or was rendered as a draft proxy.
  const needsFinal = (i: number) => {
    const c = existingClips.find((x) => Number(x.scene) === i && !!x.url && x.status !== "failed");
    return !c || c.draft === true;
  };

  // Decide the exact scene list to render.
  let targetScenes: number[] | null = explicitScenes && explicitScenes.length ? explicitScenes : null;
  // FINALIZE overrides the scene list: every kept, non-graphic scene still on a draft/missing clip.
  if (finalize && !targetScenes) {
    targetScenes = allScenes
      .map((sc, i) => ({ role: String(sc?.role || "a-roll"), i }))
      .filter(({ role, i }) => role !== "graphic" && !dropped.has(i) && needsFinal(i))
      .map(({ i }) => i);
    if (!targetScenes.length) return NextResponse.json({ queued: false, nothingToDo: true, message: "Every scene is already at full delivery quality." });
  }
  if (!targetScenes && !roles && !force) {
    // Incremental whole-board animate: only the scenes missing a good clip (skip graphics + dropped).
    targetScenes = allScenes
      .map((sc, i) => ({ role: String(sc?.role || "a-roll"), i }))
      .filter(({ role, i }) => role !== "graphic" && !dropped.has(i) && !hasGoodClip(i))
      .map(({ i }) => i);
    if (!targetScenes.length) return NextResponse.json({ queued: false, nothingToDo: true, message: "Every kept scene already has a clip." });
  }

  // Keep ALL existing clips in the DB (never wipe) unless this is a forced full redo. Renders merge in place.
  // BUT clear a prior FAILURE on the scenes about to re-render (the target scenes, or failed clips of a role
  // being animated): drop the "failed" status + error so the UI immediately shows progress instead of leaving
  // the old error banner on screen through the whole re-render (the "nothing happens, error still shows" bug).
  // Only reset a scene that will ACTUALLY re-render - otherwise a good clip in an explicit scene list without
  // reanimate gets flipped to "pending" but the render filter (force||reanimate||finalize||!hasGoodClip) skips
  // it, leaving it stuck on "pending" forever. Mirror that predicate here.
  const willRender = (i: number) => force || reanimate || finalize || !hasGoodClip(i);
  const resetScenes = new Set(targetScenes ?? []);
  const clipsNext = force ? [] : existingClips.map((c) => {
    const sceneN = Number(c.scene);
    const bySceneClear = resetScenes.has(sceneN) && willRender(sceneN);
    const byRoleClear = !!roles && roles.length > 0 && roles.includes(String((c as { role?: string }).role)) && (c as { status?: string }).status === "failed";
    return (bySceneClear || byRoleClear) ? { ...c, status: "pending", error: null } : c;
  });
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, clips: clipsNext, clips_status: "running" } } });
  try {
    await inngest.send({ name: "influencer/generate.clips", data: { influencerId: id,
      ...(roles && roles.length ? { roles } : {}),
      ...(targetScenes && targetScenes.length ? { scenes: targetScenes } : {}),
      // finalize re-animates the same locked keyframes, so it must reanimate; and it NEVER passes speed
      // (full-quality conform), even if the UI's draft toggle is on.
      ...((reanimate || finalize) ? { reanimate: true } : {}),
      ...((speed && !finalize) ? { speed: true } : {}),
      ...(force ? { force: true } : {}) } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, clips_status: "idle" } } });
    return NextResponse.json({ error: "Could not start rendering (generation engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true, animating: targetScenes ? targetScenes.length : (roles ? "role" : "all") });
}
