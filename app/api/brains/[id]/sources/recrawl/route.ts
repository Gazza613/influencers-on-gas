import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/lib/inngest";
import { getBrain } from "@/lib/brains";
import { db } from "@/lib/db";

// RE-CRAWL ONE SOURCE (Gary, world-class Brain UX): a site changes, so let the team refresh a single source in
// place rather than delete and re-add it. Only website/crawl sources can be re-crawled (a pasted note or an
// uploaded file has no live URL to re-read). We clear that source's old passages, set it back to pending, and
// re-fire the same durable ingest job - the row then shows "Reading & indexing…" and flips to a fresh "✓ Ready".
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as { sourceId?: string };
  const sourceId = String(b.sourceId || "").trim();
  if (!sourceId) return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });

  // The source, ringfenced to this brain.
  const rows = (await db().query(
    `select type, uri, include_path from knowledge_sources where id = $1 and client_id = $2`,
    [sourceId, id],
  )) as { type: string; uri: string; include_path: string | null }[];
  const src = rows[0];
  if (!src) return NextResponse.json({ error: "That source is not on this brain." }, { status: 404 });
  if (src.type !== "website" && src.type !== "crawl") {
    return NextResponse.json({ error: "Only a website source can be re-crawled. Re-add a document or note to refresh it." }, { status: 400 });
  }

  // Clear its old passages and set it re-reading. The ingest job re-populates from the live site.
  await db().query(`delete from knowledge_chunks where client_id = $1 and source_id = $2`, [id, sourceId]).catch(() => {});
  await db().query(`update knowledge_sources set status = 'pending', last_synced_at = null where id = $1 and client_id = $2`, [sourceId, id]);

  const engine = await inngest.send({ name: "brain/ingest.source", data: { sourceId, clientId: id, type: src.type, uri: src.uri, text: "", includePath: src.include_path || null, kind: null } }).catch(() => null);
  if (!engine) return NextResponse.json({ error: "Generation engine not connected (Inngest)." }, { status: 503 });
  return NextResponse.json({ ok: true, sourceId });
}
