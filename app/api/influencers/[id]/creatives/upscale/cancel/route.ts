import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// Clear a stuck "upscaling" spinner (client hard-timeout). Leaves the 2K shot intact so the
// producer can simply try the upscale again.
export const maxDuration = 20;

type Creative = { id?: string; upscaling?: boolean; [k: string]: unknown };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const creativeId = typeof body.id === "string" ? body.id : "";
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const creatives = (Array.isArray(persona.creatives) ? persona.creatives : []) as Creative[];
  const updated = creatives.map((c) => ((c.id || "") === creativeId ? { ...c, upscaling: false } : c));
  await updateInfluencer(id, { persona: { ...persona, creatives: updated } });
  return NextResponse.json({ ok: true });
}
