import { NextResponse } from "next/server";
import { auth } from "@/auth";
import sharp from "sharp";
import { buildDiscCreative } from "@/lib/studio-refmatch";
import { forensicSwap } from "@/lib/vendors/higgsfield";
import { recordUsage } from "@/lib/usage";

// GENERATE ONE CREATIVE for the wizard. The user picked a reference for this section and typed what they want
// in it (the subject/callout, theme-embodying). We swap the person on their chosen design. THIS SPENDS.
//   masthead/section1 -> buildDiscCreative (on the funnel background, no cut-out)
//   slider            -> full-bleed person + scene swap
export const maxDuration = 800;
export const dynamic = "force-dynamic";

function nearestRatio(w: number, h: number): string {
  const t = w / h;
  const opts: [string, number][] = [["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["3:2", 3 / 2], ["16:9", 16 / 9], ["9:16", 9 / 16]];
  return opts.reduce((b, o) => (Math.abs(o[1] - t) < Math.abs(b[1] - t) ? o : b))[0];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; kind?: string; referenceUrl?: string; subject?: string; scene?: string };
  const clientId = String(b.clientId || "");
  const kind = String(b.kind || "");
  const referenceUrl = String(b.referenceUrl || "");
  const subject = String(b.subject || "").trim();
  if (!clientId || !referenceUrl || !subject) return NextResponse.json({ error: "Pick a design and describe who should be in it." }, { status: 400 });

  try {
    const refBuf: Buffer = Buffer.from(await (await fetch(referenceUrl)).arrayBuffer());
    const meta = await sharp(refBuf).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";

    if (kind === "masthead" || kind === "section1") {
      const r = await buildDiscCreative(clientId, kind, referenceUrl, subject, ratio);
      if (!r.url) return NextResponse.json({ error: r.error || "generation failed" }, { status: 500 });
      return NextResponse.json({ ok: true, url: r.url });
    }
    // slider
    const sw = await forensicSwap(referenceUrl, { person: subject, scene: String(b.scene || ""), construction: "scene", ratio, resolution: "4k", humanise: true });
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "wizard-build", count: sw.humanised ? 2 : 1 }).catch(() => {});
    if (!sw.url) return NextResponse.json({ error: sw.error || "generation failed" }, { status: 500 });
    return NextResponse.json({ ok: true, url: sw.url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
