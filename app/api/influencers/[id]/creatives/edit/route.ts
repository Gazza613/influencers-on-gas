import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { editImageUrl } from "@/lib/vendors/higgsfield";
import { rehostToBlob } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// EDIT THIS SHOT: forensic image-to-image edit of ONE Set & Wardrobe creative - keep the location, pose,
// framing, lighting and identity, change ONLY what the producer asks (e.g. recolour the dress). Adds the
// result as a NEW creative (the original is kept). Synchronous - one Nano Banana Pro edit.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 400) : "";
  if (!url || !isSafePublicUrl(url)) return NextResponse.json({ error: "No image to edit." }, { status: 400 });
  if (!instruction) return NextResponse.json({ error: "Say what to change (e.g. 'make her dress bright MTN-yellow')." }, { status: 400 });

  const creatives = Array.isArray(persona.creatives) ? (persona.creatives as Record<string, unknown>[]) : [];
  const src = creatives.find((c) => c.url === url);
  const ratio = String(src?.ratio || "9:16");

  try {
    const edited = await editImageUrl(url, { instruction, ratio, resolution: "2k" });
    if (!edited) return NextResponse.json({ error: "The edit didn't come back - try again or rephrase it." }, { status: 502 });
    const hosted = (await rehostToBlob(edited, "creatives").catch(() => null)) || edited;
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "edit", count: 1 }).catch(() => {});
    const newCreative = {
      ...(src || {}),
      id: `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: hosted,
      resolution: "2k",
      scene: `${src?.scene ? `${src.scene} · ` : ""}edit: ${instruction}`.slice(0, 300),
      at: Date.now(),
      status: undefined,
      qa: null,
      error: null,
      upscaling: false,
      upscale_error: null,
      edited_from: url,
    };
    // Insert the edit right AFTER its source so it sits next to the shot it came from.
    const srcIdx = creatives.findIndex((c) => c.url === url);
    const next = srcIdx >= 0 ? [...creatives.slice(0, srcIdx + 1), newCreative, ...creatives.slice(srcIdx + 1)] : [newCreative, ...creatives];
    await updateInfluencer(id, { persona: { ...persona, creatives: next } });
    return NextResponse.json({ ok: true, creative: newCreative });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
