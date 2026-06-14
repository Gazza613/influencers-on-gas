import { NextResponse } from "next/server";
import { createBrain, deleteBrain } from "@/lib/brains";
import { ingestChunks, retrieve } from "@/lib/rag";

// TEMPORARY — proves embed → store → client-scoped retrieve + isolation. DELETE after.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "ragtest-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const a = await createBrain("Zzz Test Alpha");
  const b = await createBrain("Zzz Test Beta");
  try {
    const sa = await ingestChunks(a, null, [
      { content: "Acme Corp sells premium blue widgets to enterprise buyers. Our slogan is 'Sky-high quality'. The CEO is Jane Doe." },
    ]);
    const sb = await ingestChunks(b, null, [
      { content: "Beta Industries manufactures red rockets for space tourism. Our motto is 'To the moon'. Founder is Bob Smith." },
    ]);
    const q = "What does the company sell and who runs it?";
    const fromA = await retrieve(a, q, 3);
    const fromB = await retrieve(b, q, 3);
    // Isolation probe: ask brain A about rockets (which only exist in B).
    const aAboutRockets = await retrieve(a, "red rockets to the moon", 3);
    const leaked = aAboutRockets.some((r) => r.content.includes("Beta Industries"));
    return NextResponse.json({
      stored: { a: sa, b: sb },
      brainA_topHit: fromA[0]?.content?.slice(0, 80),
      brainB_topHit: fromB[0]?.content?.slice(0, 80),
      isolation_ok: !leaked && fromA.every((r) => !r.content.includes("Beta")) && fromB.every((r) => !r.content.includes("Acme")),
      scores: { a: fromA[0]?.score, b: fromB[0]?.score },
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  } finally {
    await deleteBrain(a);
    await deleteBrain(b);
  }
}
