import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// Retrain identity on a richer, more varied photoshoot. For influencers locked on an
// early single-look set (which made the Soul clone that one outfit/scene), this re-runs
// the varied photoshoot from the existing hero face, then the user re-locks. Creatives
// already made are kept.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean }[]) : [];
  const hero = (persona.chosen_url as string) || (persona.hero_url as string)
    || refs.find((r) => r.hero)?.url || refs[0]?.url || (persona.reference_url as string) || "";
  if (!hero) return NextResponse.json({ error: "No locked face to retrain from." }, { status: 400 });

  // Send the job FIRST; only reset identity state if it was accepted, so a send failure
  // never strands the influencer in "generating" with no job running.
  try {
    await inngest.send({ name: "influencer/build.identity", data: { influencerId: id, chosenUrl: hero } });
  } catch {
    return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  }
  await updateInfluencer(id, {
    status: "generating",
    higgsfield_soul_id: null,
    look_refs: [{ url: hero, hero: true }],
    persona: { ...persona, locked: false, soul_error: null, hero_url: hero, chosen_url: hero },
  });
  return NextResponse.json({ ok: true });
}
