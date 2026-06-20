import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// Persist which wizard steps the producer has approved, so returning to the page restores the
// exact step you were on (instead of rebuilding from artifacts and jumping back mid-render).
export const maxDuration = 15;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = (persona.production ?? null) as Record<string, unknown> | null;
  if (!production) return NextResponse.json({ error: "No production." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const approved = Array.isArray(b?.approved) ? b.approved.map(String).slice(0, 16) : [];
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, wizard_approved: approved } } });
  return NextResponse.json({ ok: true });
}
