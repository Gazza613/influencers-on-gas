import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getBrain } from "@/lib/brains";

// SEE WHAT THE BRAIN ACTUALLY KNOWS, AND CUT OUT WHAT IS WRONG (Gary: "it says 159 chunks in the brain but
// how do we see that and maybe even remove if we feel it is off on a specific data input?").
//
// Until now a brain was a black box with a count on it. You could add a source and you could delete a whole
// source, but you could not READ the 159 chunks or remove ONE bad passage - so a single wrong fact buried in
// an otherwise good research document meant a choice between living with it or deleting the whole document.
// That is how false positioning survives: not because nobody would remove it, but because nobody could see it.
//
// ISOLATION: every statement is scoped by client_id AND the row id. A chunk id alone is never enough to read
// or delete anything - a brain is the client's proprietary information and the query is the fence.

export const dynamic = "force-dynamic";

const PAGE = 50;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const u = new URL(req.url);
  const sourceId = u.searchParams.get("sourceId") || "";
  const q = (u.searchParams.get("q") || "").trim();
  const offset = Math.max(0, Number(u.searchParams.get("offset") || 0));

  // Built as a parameterised list so the filters compose without string-concatenating user input. Columns are
  // written table-qualified from the start, because both queries below join knowledge_sources and an
  // unqualified `id`/`content` would be ambiguous.
  const where: string[] = ["k.client_id = $1"];
  const args: unknown[] = [id];
  if (sourceId) { args.push(sourceId); where.push(`k.source_id = $${args.length}`); }
  // Plain substring search, not vector search. This view is for AUDITING the text that is stored, so it must
  // find the literal words someone is worried about ("R5", "MAU") rather than the semantic neighbourhood.
  if (q) { args.push(`%${q}%`); where.push(`k.content ilike $${args.length}`); }
  const clause = `where ${where.join(" and ")}`;

  const totalRow = (await db().query(`select count(*)::int as n from knowledge_chunks k ${clause}`, args)) as { n: number }[];

  const chunks = (await db().query(
    `select k.id, k.content, k.source_id, k.metadata, s.uri as source_uri, s.type as source_type,
            to_char(k.created_at at time zone 'Africa/Johannesburg','DD Mon YYYY') as added
     from knowledge_chunks k
     left join knowledge_sources s on s.id = k.source_id
     ${clause}
     order by k.created_at desc, k.id
     limit $${args.length + 1} offset $${args.length + 2}`,
    [...args, PAGE, offset],
  )) as Record<string, unknown>[];

  // DUPLICATE COUNT, always reported against the WHOLE brain rather than the current filter. Redundancy is a
  // property of the brain, and it is the single most damaging thing in one: retrieval pulls only the top 5
  // passages, so if a fact is stored three times it can occupy three of those five slots and crowd out two
  // genuinely different facts. A brain can be large, accurate and still answer badly for exactly this reason.
  const dupRow = (await db().query(
    `select (count(*) - count(distinct content))::int as n from knowledge_chunks where client_id = $1`,
    [id],
  )) as { n: number }[];

  return NextResponse.json({ chunks, total: totalRow[0]?.n ?? 0, offset, page: PAGE, duplicates: dupRow[0]?.n ?? 0 });
}

// DE-DUPLICATE. Keeps the OLDEST copy of each identical passage and deletes the rest, so the brain keeps every
// distinct fact it holds and loses only the repetition. Text-identical only - never "similar", because
// deciding two differently-worded passages mean the same thing is a judgement call that belongs to a person,
// not to a cleanup button.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "dedupe") return NextResponse.json({ error: "unknown action" }, { status: 400 });

  const removed = (await db().query(
    `delete from knowledge_chunks
     where client_id = $1
       and id not in (
         select distinct on (content) id from knowledge_chunks
         where client_id = $1 order by content, created_at asc, id asc
       )
     returning id`,
    [id],
  )) as { id: string }[];

  return NextResponse.json({ ok: true, removed: removed.length });
}

// Remove ONE passage. The embedding goes with the row, so the brain stops retrieving it immediately - no
// re-index needed. Deliberately surgical: the whole point is to correct a brain without gutting a good source.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const chunkId = new URL(req.url).searchParams.get("chunkId") || "";
  if (!chunkId) return NextResponse.json({ error: "chunkId required" }, { status: 400 });

  // client_id in the WHERE is the isolation guarantee, not a convenience.
  await db().query(`delete from knowledge_chunks where id = $1 and client_id = $2`, [chunkId, id]);
  return NextResponse.json({ ok: true });
}
