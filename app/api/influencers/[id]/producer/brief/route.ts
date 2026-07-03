import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { draftBrief } from "@/lib/vendors/anthropic";
import { retrieve } from "@/lib/rag";
import { recordUsage } from "@/lib/usage";

// BRIEF CO-PILOT: draft/sharpen the Producer brief (offer, key benefits, CTA, tone) with AI, from the brand
// + this influencer + whatever's already typed. Returns the suggestion; the producer reviews + edits it.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  const b = await req.json().catch(() => ({}));
  const brand = typeof b.brand === "string" ? b.brand.trim().slice(0, 200) : "";
  if (!brand) return NextResponse.json({ error: "Add the brand / product first, then I can draft the brief." }, { status: 400 });
  const durationSeconds = [15, 30, 45, 60].includes(Number(b.durationSeconds)) ? Number(b.durationSeconds) : 45;
  // Optional guided answers - sharpen the brief without needing a brain (work for every production).
  const audience = typeof b.audience === "string" ? b.audience.trim().slice(0, 300) : "";
  const keyMessage = typeof b.keyMessage === "string" ? b.keyMessage.trim().slice(0, 300) : "";
  const proof = typeof b.proof === "string" ? b.proof.trim().slice(0, 300) : "";
  const offer = typeof b.offer === "string" ? b.offer.trim().slice(0, 400) : "";

  // A short profile of who she is, so the brief is on-brand for THIS influencer + audience.
  const bible = (persona.bible ?? {}) as { signature_line?: string; identity?: Record<string, string> };
  const profile = [persona.tagline, bible.signature_line, bible.identity?.ethnicity_design, persona.persona_summary]
    .filter((x): x is string => typeof x === "string" && !!x.trim()).join(". ").slice(0, 800);

  // BRAIN (optional): if this influencer is tied to a client brain, pull the most relevant verified facts to
  // ground the brief. No brain? This whole block is skipped and the co-pilot still works from the inputs above.
  let brainFacts = "";
  if (inf.client_id) {
    const query = [brand, keyMessage, offer, audience].filter(Boolean).join(" — ").slice(0, 400) || brand;
    const chunks = await retrieve(inf.client_id, query, 5).catch(() => []);
    brainFacts = chunks.filter((c) => (c.score ?? 0) > 0.2).map((c) => `- ${String(c.content).replace(/\s+/g, " ").trim().slice(0, 320)}`).join("\n").slice(0, 1600);
    if (brainFacts) await recordUsage({ influencerId: id, clientId: inf.client_id, userEmail: session.user.email ?? null, provider: "voyage", model: "voyage-3.5", unit: "embedding", action: "brief-retrieve", count: 1 }).catch(() => {});
  }

  try {
    const out = await draftBrief({
      influencerName: inf.name,
      influencerProfile: profile,
      brand,
      offer: typeof b.offer === "string" ? b.offer.slice(0, 400) : "",
      benefits: typeof b.benefits === "string" ? b.benefits.slice(0, 600) : "",
      cta: typeof b.cta === "string" ? b.cta.slice(0, 300) : "",
      tone: typeof b.tone === "string" ? b.tone.slice(0, 200) : "",
      durationSeconds, audience, keyMessage, proof, brainFacts,
    });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "brief", count: 1 }).catch(() => {});
    return NextResponse.json({ ...out, usedBrain: !!brainFacts });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
