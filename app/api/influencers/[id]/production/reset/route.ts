import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// Clear stuck "running" flags on a production (shoot / clips / assembly) so the UI unlocks if a job
// died mid-way. Keeps all the shots/clips/final already produced; only resets the status.
export const maxDuration = 15;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = (persona.production ?? null) as Record<string, unknown> | null;
  if (!production) return NextResponse.json({ ok: true });
  // Also clear any per-scene re-shoot flags left mid-flight.
  const shots = Array.isArray(production.shots) ? (production.shots as Record<string, unknown>[]).map((s) => ({ ...s, reshooting: false })) : production.shots;
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, shots, shots_status: "idle", clips_status: "idle", assembly_status: "idle", audio_status: "idle" } } });
  return NextResponse.json({ ok: true });
}
