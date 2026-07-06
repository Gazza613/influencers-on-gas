import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// THE PRODUCER step 2: "shoot the shots" - render a coherent image for every storyboard scene
// (durable; the UI polls the storyboard GET for production.shots). Fire-and-poll, never hangs.
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { storyboard?: { scenes?: unknown[] }; wizard_approved?: string[]; shots?: { scene: number; role?: string }[] } | undefined;
  if (!production?.storyboard?.scenes?.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });

  // Optional: shoot only ONE role's references (the curated galleries), at a chosen aspect ratio.
  const body = await req.json().catch(() => ({}));
  const roleFilter = body.roleFilter === "a-roll" || body.roleFilter === "b-roll" ? String(body.roleFilter) : "";
  const aspectRatio = ["9:16", "1:1", "16:9"].includes(body.aspectRatio) ? String(body.aspectRatio) : "";
  const priority = body.priority === true; // faster, paid render queue (opt-in for speed)
  const speed = body.speed === true; // draft speed: skip the humaniser pass for faster keyframes

  // PER-SCENE keyframe (reference) shoot: re-shoot only these scenes' stills, keep everything else
  // (other scenes' stills + clips, the cut, approvals). Drops only the target scenes' stale clips.
  const sceneIdxs = Array.isArray(body.scenes) ? (body.scenes as unknown[]).map(Number).filter((n) => Number.isInteger(n)) : [];
  if (sceneIdxs.length) {
    const prod = production as Record<string, unknown>;
    const shots = (Array.isArray(prod.shots) ? prod.shots as { scene: number }[] : []).map((s) => (sceneIdxs.includes(Number(s.scene)) ? { ...s, reshooting: true } : s));
    const clips = (Array.isArray(prod.clips) ? prod.clips as { scene: number }[] : []).filter((c) => !sceneIdxs.includes(Number(c.scene)));
    // PER-SCENE re-shoot must NOT globally lock the board: the target scene carries its own `reshooting: true`
    // flag (which the client polls), so leave the global shots_status as-is instead of flipping it to "running".
    // Only a whole-board shoot (below) sets the board-wide "shooting" state. This keeps other scenes free to be
    // animated / edited / re-shot in parallel (different engines, different API calls).
    const shotsStatusNext = (prod as { shots_status?: string }).shots_status === "running" ? "running" : "idle";
    await updateInfluencer(id, { persona: { ...persona, production: { ...prod, shots, clips, shots_status: shotsStatusNext } } });
    try {
      await inngest.send({ name: "influencer/generate.shots", data: { influencerId: id, scenes: sceneIdxs, aspectRatio, priority, speed } });
    } catch {
      await updateInfluencer(id, { persona: { ...persona, production: { ...prod, shots_status: "idle" } } });
      return NextResponse.json({ error: "Could not start the shoot (engine not connected)." }, { status: 503 });
    }
    return NextResponse.json({ queued: true });
  }

  // Re-shooting invalidates everything downstream - clear clips, audio and final cut + reset approvals
  // past Voice. Shooting ONE role keeps the OTHER role's existing stills AND its approval (so approving
  // a-roll then shooting b-roll doesn't throw you back to a-roll). The whole board clears all.
  const otherRoleApproval = roleFilter === "a-roll" ? "brollRefs" : roleFilter === "b-roll" ? "arollRefs" : "";
  const keptApprovals = (production.wizard_approved ?? []).filter((k) => k === "concept" || k === "voice" || (!!otherRoleApproval && k === otherRoleApproval));
  const keptShots = roleFilter ? (production.shots ?? []).filter((s) => String(s.role || "a-roll") !== roleFilter) : [];
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, shots: keptShots, shots_status: "running", clips: [], clips_status: "idle", music_url: null, ambient_url: null, audio_status: "idle", final_url: null, assembly_status: "idle", wizard_approved: keptApprovals } } });
  try {
    await inngest.send({ name: "influencer/generate.shots", data: { influencerId: id, roleFilter, aspectRatio, priority, speed } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, shots_status: "idle" } } });
    return NextResponse.json({ error: "Could not start shooting (generation engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
