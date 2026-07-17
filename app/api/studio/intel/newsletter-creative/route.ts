import { NextResponse } from "next/server";
import { auth } from "@/auth";
import sharp from "sharp";
import { forensicRetheme } from "@/lib/vendors/higgsfield";
import { balanceHeadline, tidyCallout, stampRealLogo } from "@/lib/studio-slider";
import { listAssets } from "@/lib/studio";
import { recordUsage } from "@/lib/usage";

// THE CEO'S LINKEDIN CREATIVE, to run with his newsletter (Gary: "a MoMo aligned to CI creative added so we can
// have both the creative and the article... MTN logo top left, callout below, no deals, just relevant creative
// for the article push to LinkedIn, emotive creative").
//
// It reuses the funnel builder's module, and its locked strategy: take one of the client's own proven designs,
// change only the people and the copy, keep the design's own look, and stamp the REAL logo on top so it can
// never garble. Same engine, different job.
//
// THREE DIFFERENCES from a funnel slider, and they are the whole brief:
//   NO DEAL. Not a card, not a badge, not a price. This is the CEO's point of view, and the moment it carries
//   an offer it becomes an FSP advertisement under FAIS s14 - the same line the newsletter itself must not
//   cross. So the model is told to draw no offer, and we composite none.
//   EMOTIVE, not promotional: a human moment, not a product shot.
//   THE CALLOUT is the piece's emotional line, written by the same call that wrote the piece, so the image and
//   the article are about the same thing.
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

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; subject?: string; callout?: string };
  const clientId = String(b.clientId || "");
  const subject = String(b.subject || "").trim();
  const callout = String(b.callout || "").trim();
  if (!clientId || !subject) return NextResponse.json({ error: "Nothing to art-direct yet." }, { status: 400 });

  try {
    // A slider design: a full-bleed photograph, which is the right shape for LinkedIn and for a human moment.
    // The disc constructions are funnel furniture and would look like an advert here.
    const pool = (await listAssets(clientId, "reference"))
      .filter((a) => /slider|slide/i.test(a.name || "") && !/supporting/i.test(a.name || ""));
    if (!pool.length) return NextResponse.json({ error: "No slider designs on file to work from." }, { status: 400 });
    const referenceUrl = pool[Math.floor(Date.now() / 1000) % pool.length].url;

    const refBuf: Buffer = Buffer.from(new Uint8Array(await (await fetch(referenceUrl)).arrayBuffer()));
    const meta = await sharp(refBuf).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";

    const changes: string[] = [];
    if (callout) {
      const [hl1, hl2] = balanceHeadline(tidyCallout(callout));
      changes.push(`Change the main bottom HEADLINE to read EXACTLY two lines: "${hl1}" in WHITE${hl2 ? ` then "${hl2}" in YELLOW` : ""}. NEVER more than two lines - do NOT add a third line, a price line, a deal line or any extra copy beneath it. Set the punctuation exactly as written. Keep any yellow underline beneath it exactly where it is.`);
    }
    changes.push(`Change the people in the advert to: ${subject}. Make it a real, warm, EMOTIVE human moment, photographed naturally - not a product shot, nobody presenting a phone to camera like an advert.`);
    // NO OFFER, ANYWHERE. This is the CEO speaking, not an advertisement (FAIS s14).
    changes.push(`Do NOT draw any deal card, offer badge, price bubble, pill, promotional lozenge, price, percentage or offer wording ANYWHERE in the image. There is no offer in this picture at all. Leave the top-right area as clean photograph.`);

    const ed = await forensicRetheme(referenceUrl, { changes, ratio, resolution: "2k" });
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "ceo-linkedin-creative", count: 1 }).catch(() => {});
    if (!ed.url) return NextResponse.json({ error: ed.error || "the creative did not come back" }, { status: 500 });

    // The logo is the one thing never left to the model - top-left, from the real brand asset.
    const url = await stampRealLogo(clientId, referenceUrl, ed.url);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
