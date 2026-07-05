import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateProductionFields } from "@/lib/influencers";

// Clear stuck "running" flags on a production (shoot / clips / assembly) so the UI unlocks if a job
// died mid-way. Keeps all the shots/clips/final already produced; only resets the status.
export const maxDuration = 15;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = (persona.production ?? null) as Record<string, unknown> | null;
  if (!production) return NextResponse.json({ ok: true });
  const body = await req.json().catch(() => ({}));
  // Optional: drop ALL existing clips + the final cut (leftover videos from earlier testing) so the board
  // is clean keyframes again. Keeps the storyboard, shots, voice and approvals - just the videos go.
  const clearClips = body?.clearClips === true;
  // Delete just the finished CUT (the stitched final video) - removes it from the studio's Latest cuts
  // and the showcase, but KEEPS the scenes/clips so it can be re-stitched. (clearClips is the heavier
  // "wipe the clips too" option.)
  const clearFinal = body?.clearFinal === true;
  // Also clear any per-scene re-shoot flags left mid-flight. SCOPED write so a genuinely-live concurrent
  // render's clips/shots aren't clobbered - we only touch the status flags (+ optional clip/final clear).
  const shots = Array.isArray(production.shots) ? (production.shots as Record<string, unknown>[]).map((s) => ({ ...s, reshooting: false })) : production.shots;
  await updateProductionFields(id, { shots, shots_status: "idle",
    ...(clearClips ? { clips: [], final_url: null } : clearFinal ? { final_url: null } : {}),
    clips_status: "idle", assembly_status: "idle", audio_status: "idle" });
  return NextResponse.json({ ok: true });
}
