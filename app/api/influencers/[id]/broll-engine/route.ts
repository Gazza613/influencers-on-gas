import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateProductionFields } from "@/lib/influencers";

// Producer-selected SCENE-SHOT (b-roll) video engine for this production: "kling" (fast default) or "seedance"
// (Seedance 1.5 Pro). Read by the b-roll render path; a Seedance miss falls back to Kling, so it's always safe.
// Applies to the NEXT animate/re-animate of the scene shots. Scoped write so it can't clobber other fields.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const engine = b?.engine === "seedance" ? "seedance" : "kling";
  await updateProductionFields(id, { broll_engine: engine });
  return NextResponse.json({ ok: true, broll_engine: engine });
}
