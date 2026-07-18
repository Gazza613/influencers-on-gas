import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getBrain } from "@/lib/brains";
import { getBrandKit } from "@/lib/studio";
import { chunkText, ingestChunks } from "@/lib/rag";
import { metered } from "@/lib/usage";

// MAKE THE DOCTRINE RETRIEVABLE.
//
// The brand doctrine - positioning, the zero-fee list, the customer truth, the FAIS boundary, the trust
// research - lives in studio_brand_kits.tone_notes. A handful of routes load that column directly, so the CEO
// newsletter has always had it. But the BRAIN searches knowledge_chunks, and tone_notes was never chunked or
// embedded, so none of it was retrievable.
//
// The effect was invisible and severe: the MoMo brain's entire searchable knowledge was funnel-page scrapes.
// Asking it "who is the CEO" or "what is MoMo's positioning" searched landing-page copy and missed 13,000
// characters of exactly the right answer. Every retrieve() caller - scripts, stories, briefs - had the same
// blind spot.
//
// REPEATABLE BY DESIGN (Gary: "i will keep adding so you have this going forward"). Doctrine chunks are
// tagged in metadata and DELETED before each re-ingest, so syncing after an edit replaces the old copy instead
// of stacking a second one. Running this twice is the same as running it once - which is what stops this
// becoming the next source of duplicates.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DOCTRINE_KIND = "doctrine";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const kit = await getBrandKit(id).catch(() => null);
  const doctrine = (kit?.tone_notes || "").trim();
  if (!doctrine) {
    return NextResponse.json({ error: "This brain has no doctrine written yet, so there is nothing to sync." }, { status: 400 });
  }

  // Replace, never append. client_id in the WHERE is the isolation guarantee.
  const removed = (await db().query(
    `delete from knowledge_chunks where client_id = $1 and metadata->>'kind' = $2 returning id`,
    [id, DOCTRINE_KIND],
  )) as { id: string }[];

  const pieces = chunkText(doctrine);
  const stored = await metered(
    { clientId: id, provider: "voyage", model: "voyage-4-lite", unit: "embedding", action: "ingest", count: pieces.length },
    () => ingestChunks(id, null, pieces.map((content, i) => ({
      content,
      metadata: { kind: DOCTRINE_KIND, title: `${brain.name} brand doctrine`, part: i + 1, of: pieces.length },
    }))),
  );

  return NextResponse.json({ ok: true, replaced: removed.length, stored });
}
