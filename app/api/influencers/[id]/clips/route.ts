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
  const production = persona.production as { storyboard?: { scenes?: unknown[] }; shots?: { url?: string | null }[]; clips?: unknown[] } | undefined;
  if (!production?.storyboard?.scenes?.length) return NextResponse.json({ error: "Direct a storyboard first." }, { status: 400 });
  if (!production.shots?.some((s) => s.url)) return NextResponse.json({ error: "Shoot the shots first." }, { status: 400 });

  // Optional: render only certain roles (the wizard renders a-roll then b-roll as separate steps).
  const body = await req.json().catch(() => ({}));
  const roles = Array.isArray(body?.roles) ? body.roles.map(String).filter((r: string) => ["a-roll", "b-roll", "graphic"].includes(r)) : null;
  const keptClips = roles && roles.length ? (production.clips ?? []) : []; // keep the other role's clips when filtering

  await updateInfluencer(id, { persona: { ...persona, production: { ...production, clips: keptClips, clips_status: "running" } } });
  try {
    await inngest.send({ name: "influencer/generate.clips", data: { influencerId: id, ...(roles && roles.length ? { roles } : {}) } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, clips_status: "idle" } } });
    return NextResponse.json({ error: "Could not start rendering (generation engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
