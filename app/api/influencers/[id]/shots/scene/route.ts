import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// THE PRODUCER: re-shoot ONE scene, optionally with edited direction. Persists the edits to the
// storyboard, marks that scene re-shooting, and fires the per-scene job. The UI polls the GET.
export const maxDuration = 20;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { storyboard?: { scenes?: Record<string, string>[] }; shots?: Record<string, unknown>[] } | undefined;
  const scenes = production?.storyboard?.scenes;
  const b = await req.json().catch(() => ({}));
  const index = Number(b.scene);
  if (!Array.isArray(scenes) || !scenes[index]) return NextResponse.json({ error: "No such scene." }, { status: 400 });

  // Apply edited direction + script to the scene (persists + drives the clip/caption later).
  // vo_line + caption are script edits (no image regen needed); location/blocking/shot/motion change the image.
  const edited = { ...scenes[index] };
  for (const k of ["location", "blocking", "shot", "performance", "motion_prompt", "vo_line", "caption", "vo_audio_url", "phone_screen_url", "hero", "ref_url"] as const) {
    if (typeof b[k] === "string") edited[k] = String(b[k]).trim();
  }
  const newScenes = scenes.map((s, i) => (i === index ? edited : s));
  const reshoot = b.reshoot !== false; // false = save text only, no image regeneration

  const shots = Array.isArray(production?.shots) ? [...(production!.shots as Record<string, unknown>[])] : [];
  if (reshoot) {
    const at = shots.findIndex((s) => Number(s.scene) === index);
    if (at >= 0) shots[at] = { ...shots[at], reshooting: true };
    else shots.push({ scene: index, role: edited.role, beat: edited.beat, url: null, reshooting: true });
  }

  await updateInfluencer(id, { persona: { ...persona, production: { ...production, storyboard: { ...production!.storyboard, scenes: newScenes }, shots } } });
  if (!reshoot) return NextResponse.json({ saved: true });
  try {
    // Re-shoot this ONE scene through the SAME path as the whole board (generateShots, scene-filtered) so it
    // gets the guide-authoritative look, the wardrobe lock, the phone-screen image, the per-scene reference
    // and the stale-media retry - NOT the old stripped-down reshootShot, which ignored all of those (why an
    // edited scene came back in different clothing and the uploaded phone screen never pulled through).
    await inngest.send({ name: "influencer/generate.shots", data: { influencerId: id, scenes: [index] } });
  } catch {
    return NextResponse.json({ error: "Could not start the re-shoot (engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
