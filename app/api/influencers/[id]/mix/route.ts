import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateProductionFields } from "@/lib/influencers";

// Producer-set AUDIO MIX levels (music + ambient) for this production. Saved to production.music_vol /
// ambient_vol (0-1); the final stitch reads them so the mix is what the producer dialled. Applied on the next
// stitch (no re-generation of the beds needed - it's a mix-time volume). Scoped write so it can't clobber other
// fields. ambient_off is also honoured for a hard "no ambient".
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const clamp = (v: unknown) => Math.max(0, Math.min(1, Number(v)));
  const patch: Record<string, unknown> = {};
  if (typeof b?.music_vol === "number") patch.music_vol = clamp(b.music_vol);
  if (typeof b?.ambient_vol === "number") patch.ambient_vol = clamp(b.ambient_vol);
  if (typeof b?.ambient_off === "boolean") patch.ambient_off = b.ambient_off;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to set." }, { status: 400 });

  await updateProductionFields(id, patch);
  return NextResponse.json({ ok: true, ...patch });
}
