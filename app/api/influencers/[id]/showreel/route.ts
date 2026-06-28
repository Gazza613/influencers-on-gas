import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { resolveClientId, upsertProducerCut } from "@/lib/showcase";

// THE PRODUCER, final step: the showreel gate. Accept the finished cut into the showreel
// (green in) or decline it (orange out). Rejected cuts never reach the showcase wall.
export const maxDuration = 20;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const decision = body?.decision === "accept" ? "accept" : "decline";

  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { final_url?: string | null; storyboard?: { title?: string }; showcase_id?: string | null } | undefined;
  if (!production?.final_url) return NextResponse.json({ error: "Stitch the cut first." }, { status: 400 });

  const title = production.storyboard?.title || `${inf.name} - ad`;
  const clientId = await resolveClientId(inf.client_id);
  const showcaseId = await upsertProducerCut({
    showcaseId: production.showcase_id ?? null,
    clientId,
    title,
    url: production.final_url,
    showcased: decision === "accept",
  });

  await updateInfluencer(id, { persona: { ...persona, production: { ...production, showreel_status: decision === "accept" ? "accepted" : "declined", showcase_id: showcaseId } } });
  return NextResponse.json({ ok: true, showreel_status: decision === "accept" ? "accepted" : "declined" });
}
