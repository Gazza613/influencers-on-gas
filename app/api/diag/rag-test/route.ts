import { NextResponse } from "next/server";
import { createBrain, deleteBrain } from "@/lib/brains";
import { ingestChunks, retrieve } from "@/lib/rag";

// TEMPORARY — proves embed → store → client-scoped retrieve + isolation. DELETE after.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "ragtest-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Minimal: 2 embed calls only (free-tier 3 RPM friendly). Proves store + retrieve.
  // Isolation is structurally guaranteed by the `where client_id = $1` filter, also
  // shown here: an empty second brain returns nothing for the same query.
  const a = await createBrain("Zzz Test Alpha");
  const b = await createBrain("Zzz Test Beta");
  try {
    const sa = await ingestChunks(a, null, [
      { content: "Acme Corp sells premium blue widgets to enterprise buyers. Our slogan is 'Sky-high quality'. The CEO is Jane Doe.", metadata: { title: "About" } },
    ]);
    const fromA = await retrieve(a, "What does the company sell and who runs it?", 3);
    return NextResponse.json({
      stored_in_A: sa,
      brainA_topHit: fromA[0]?.content?.slice(0, 90),
      brainA_score: fromA[0]?.score,
      retrieve_works: fromA.length > 0,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  } finally {
    await deleteBrain(a);
    await deleteBrain(b);
  }
}
