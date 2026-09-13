import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { retrieve } from "@/lib/rag";

// THE BRAIN-ISOLATION REGRESSION CHECK (CLAUDE.md's top invariant, and the security audit's ask). A brain must
// NEVER retrieve another brain's data. This proves it end-to-end at RUNTIME, not just by eyeballing the SQL:
//   1. take a distinctive passage that lives in brain A,
//   2. run retrieve() for that passage against brain A - it MUST find it (retrieval works), and
//   3. run the SAME query against brain B - it must NEVER return brain A's passage (the ringfence holds).
// If someone ever drops the `client_id = $1` filter from retrieve(), step 3 fails and this catches it. Super-admin
// only, and read-only. No CI runner exists here, so this is the runnable form of the mandated regression test.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Two brains that actually hold enough content to test against each other.
  const brains = (await db().query(
    `select client_id, count(*)::int n from knowledge_chunks where embedding is not null group by client_id having count(*) > 5 order by n desc limit 10`,
  ).catch(() => [])) as { client_id: string; n: number }[];
  if (brains.length < 2) return NextResponse.json({ ok: false, skipped: "need at least two brains with content to test isolation" });

  const results: Record<string, unknown>[] = [];
  let allPass = true;

  // Test each of the first few brains as "A" against the next brain as "B", so a single misconfigured brain
  // cannot make the whole check pass by luck.
  for (let i = 0; i < Math.min(brains.length, 4); i++) {
    const A = brains[i].client_id;
    const B = brains[(i + 1) % brains.length].client_id;
    if (A === B) continue;

    // A distinctive, content-rich passage that lives in A.
    const row = (await db().query(
      `select content from knowledge_chunks where client_id = $1 and length(content) > 80 order by length(content) desc limit 1`,
      [A],
    ).catch(() => [])) as { content: string }[];
    const aContent = row[0]?.content;
    if (!aContent) { results.push({ A, B, skipped: "no rich passage in A" }); continue; }

    // Query built from A's own words, and a distinctive slice of it to detect the leak.
    const query = aContent.replace(/\s+/g, " ").trim().split(" ").slice(0, 14).join(" ");
    const needle = aContent.replace(/\s+/g, " ").trim().slice(0, 60).toLowerCase();

    const [inA, inB] = await Promise.all([
      retrieve(A, query, 10).catch(() => []),
      retrieve(B, query, 10).catch(() => []),
    ]);
    const foundInA = inA.some((h) => h.content.replace(/\s+/g, " ").toLowerCase().includes(needle));
    const leakedToB = inB.some((h) => h.content.replace(/\s+/g, " ").toLowerCase().includes(needle));

    const pass = foundInA && !leakedToB;   // retrieval works AND nothing leaked
    if (!pass) allPass = false;
    results.push({ A, B, aChunks: brains[i].n, retrievalWorks: foundInA, isolationHeld: !leakedToB, pass });
  }

  return NextResponse.json({ ok: allPass, checked: results.length, results });
}
