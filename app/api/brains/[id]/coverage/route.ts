import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { getSecret } from "@/lib/connections";
import { INGEST } from "@/lib/vendors/anthropic";
import { meterClaude } from "@/lib/usage";
import { db } from "@/lib/db";

// WHAT THIS BRAIN CAN ANSWER ON (Gary, world-class Brain UX): a passive, auto-generated topic map so the team
// sees the brain's strengths and holes at a glance without having to query it. Cached in brain_coverage and
// regenerated only when the passage count drifts materially or on an explicit refresh, so it is cheap.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TOPICS_TOOL = {
  type: "object", additionalProperties: false,
  properties: {
    topics: {
      type: "array",
      description: "6 to 10 short topics or themes this knowledge base can answer questions on. Each a plain noun phrase of 2-6 words, specific to what the passages actually cover (e.g. 'Product range and pricing', 'Leadership team', 'Delivery and returns policy'). No sentences, no fluff, no duplicates.",
      items: { type: "string" },
    },
  },
  required: ["topics"],
} as unknown as Anthropic.Tool["input_schema"];

async function currentChunkCount(clientId: string): Promise<number> {
  const r = (await db().query(`select count(*)::int as n from knowledge_chunks where client_id = $1`, [clientId])) as { n: number }[];
  return r[0]?.n || 0;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  const now = await currentChunkCount(id);
  if (now === 0) return NextResponse.json({ topics: [], chunkCount: 0, empty: true });

  const cached = (await db().query(`select topics, chunk_count, generated_at from brain_coverage where client_id = $1`, [id])) as { topics: string[]; chunk_count: number; generated_at: string }[];
  const c = cached[0];
  // Reuse the cache unless the brain has grown/shrunk materially (>20% or +/-15 passages) or a refresh is asked.
  if (c && !refresh) {
    const drift = Math.abs(now - c.chunk_count);
    if (drift <= Math.max(15, c.chunk_count * 0.2)) {
      return NextResponse.json({ topics: Array.isArray(c.topics) ? c.topics : [], chunkCount: now, generatedAt: c.generated_at, stale: false });
    }
  }

  const key = await getSecret("anthropic");
  if (!key) {
    // No model connected: hand back whatever is cached rather than nothing.
    return NextResponse.json({ topics: c?.topics ?? [], chunkCount: now, stale: !!c });
  }

  // Sample the brain widely, then ask the cheap model to name the themes it can answer on.
  const rows = (await db().query(
    `select content from knowledge_chunks where client_id = $1 order by random() limit 45`, [id],
  )) as { content: string }[];
  const sample = rows.map((r, i) => `[${i + 1}] ${String(r.content).slice(0, 500)}`).join("\n\n").slice(0, 24000);

  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: INGEST, max_tokens: 800,
      system: "You map what a knowledge base covers. Given sample passages from one client's brain, list the topics it can answer questions on. Base it ONLY on the passages. UK British spelling, no em dashes.",
      tools: [{ name: "topics", description: "The topics this brain can answer on.", input_schema: TOPICS_TOOL }],
      tool_choice: { type: "tool", name: "topics" },
      messages: [{ role: "user", content: `Sample passages from this brain:\n\n${sample}\n\nList the topics this brain can answer on via the tool.` }],
    });
    await meterClaude(res, { clientId: id, userEmail: session.user?.email ?? null, model: INGEST, action: "brain-coverage" }).catch(() => {});
    const block = res.content.find((b) => b.type === "tool_use");
    const topics = (block && block.type === "tool_use" ? (block.input as { topics?: string[] }).topics : []) || [];
    const clean = topics.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().slice(0, 80)).slice(0, 10);
    await db().query(
      `insert into brain_coverage (client_id, topics, chunk_count, generated_at) values ($1, $2, $3, now())
       on conflict (client_id) do update set topics = $2, chunk_count = $3, generated_at = now()`,
      [id, JSON.stringify(clean), now],
    );
    return NextResponse.json({ topics: clean, chunkCount: now, stale: false, generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ topics: c?.topics ?? [], chunkCount: now, stale: !!c, error: String((e as Error)?.message || e).slice(0, 160) });
  }
}
