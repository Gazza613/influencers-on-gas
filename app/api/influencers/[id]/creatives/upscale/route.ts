import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// Queue a DURABLE 4K upscale of ONE kept 2K shot (a 4K render can take 1-2 min, too long for a
// synchronous request). We mark the shot "upscaling", fire the job, and return immediately; the
// UI polls the creatives list until the shot flips to 4k (or carries an upscale_error).
export const maxDuration = 30;

type Creative = { id?: string; url?: string | null; resolution?: string; upscaling?: boolean; [k: string]: unknown };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const creativeId = typeof body.id === "string" ? body.id : "";
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const creatives = (Array.isArray(persona.creatives) ? persona.creatives : []) as Creative[];
  const target = creatives.find((c) => (c.id || "") === creativeId);
  if (!target || !target.url) return NextResponse.json({ error: "Shot not found" }, { status: 404 });
  if (target.resolution === "4k") return NextResponse.json({ queued: false, creative: target }); // already done

  // Mark it upscaling so the UI shows a spinner and survives a refresh.
  const marked = creatives.map((c) => ((c.id || "") === creativeId ? { ...c, upscaling: true, upscale_error: null } : c));
  await updateInfluencer(id, { persona: { ...persona, creatives: marked } });
  try {
    await inngest.send({ name: "influencer/upscale.creative", data: { influencerId: id, creativeId } });
  } catch {
    const cleared = creatives.map((c) => ((c.id || "") === creativeId ? { ...c, upscaling: false } : c));
    await updateInfluencer(id, { persona: { ...persona, creatives: cleared } });
    return NextResponse.json({ error: "Could not queue the upscale (generation engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
