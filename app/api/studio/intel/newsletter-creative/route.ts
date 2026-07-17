import { NextResponse } from "next/server";
import { auth } from "@/auth";
import sharp from "sharp";
import { generateBatchDetailed } from "@/lib/vendors/higgsfield";
import { typesetSliderHeadline, compositeLogo, tidyCallout } from "@/lib/studio-slider";
import { getBrandKit, listAssets } from "@/lib/studio";
import { buildCeoCreatives } from "@/lib/ceo-creative";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// THE CEO'S LINKEDIN CREATIVE, to run with his newsletter.
//
// BUILT CLEAN-PLATE, and that is the whole lesson from the first attempt. I first rethemed one of MoMo's funnel
// sliders and told the model to "draw no deal card" - it kept the reference's deal card anyway, and garbled the
// logo on the way. Asking this model to REMOVE design furniture does not work; it reliably keeps it. That is the
// same lesson as the old callout pill sitting behind the new one.
//
// So we inherit nothing. There is no reference to forensically match here - this is a NEW asset, not a copy of a
// funnel design - so:
//   1. generate a CLEAN emotive photograph with no graphics, no text and no logo in it at all;
//   2. typeset the callout ourselves (never garbles, because the model never draws a letter);
//   3. stamp the REAL logo top-left from the brand asset.
// Nothing to inherit means no deal card can appear, and no logo can double up.
//
// NO OFFER, EVER: the moment the CEO's post carries a price or a deal it becomes an FSP advertisement under
// FAIS s14 - the same line the newsletter itself must not cross.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; subject?: string; callout?: string };
  const clientId = String(b.clientId || "");
  const subject = String(b.subject || "").trim();
  // ONE LINE for a newsletter post (Gary: "keep the callout to 1 line for a more corporate appeal"). If the
  // writer hands back a two-part line, we take the first half rather than stack it.
  const callout = tidyCallout(String(b.callout || "")).split("/")[0].replace(/[,;]\s*$/, "").trim();
  if (!clientId || !subject) return NextResponse.json({ error: "Nothing to art-direct yet." }, { status: 400 });

  try {
    // IF THE CLIENT HAS A CEO PHOTO ON FILE, the creative is HIM - forensically, his real cut-out face on a MoMo
    // field, with his name plate (Gary). Returns THREE for the team to pick from. Otherwise we fall back to the
    // generic emotive photograph below.
    const ceoPhotos = await listAssets(clientId, "ceo_photo").catch(() => []);
    if (ceoPhotos.length) {
      const r = await buildCeoCreatives(clientId, { message: callout || subject });
      const urls = r.creatives.filter((c) => c.url).map((c) => c.url);
      if (urls.length) return NextResponse.json({ ok: true, url: urls[0], urls });
      return NextResponse.json({ error: r.error || "the CEO creative did not come back" }, { status: 500 });
    }

    // 1. A CLEAN PHOTOGRAPH, 1:1 (1200x1200).
    //    4:5 was tried and reverted (Gary). It was not the aspect that failed, it was what the aspect forced: to
    //    survive LinkedIn's desktop crop the foot had to be LIFTED off the bottom edge, which left a navy bar
    //    floating with photograph still running underneath it. That reads as a mistake, and on a CEO's post a
    //    mistake is the whole story. 1:1 renders identically everywhere, needs no crop, so the foot sits on the
    //    bottom edge exactly as it does on a slider - the layout we already know works.
    const prompt =
      `A premium, credible editorial photograph of ${subject}. ` +
      // It sits under a CEO's name, so the register is dignity and competence, not hardship. A worried face
      // beside an executive's market note reads as pity, not value (Gary: "very poor especially for a CEO post").
      `The person is DIGNIFIED, capable and composed - never anxious, worried, struggling or pitiable. ` +
      `Authentic South African, shot on a real camera: natural light, true even skin tone with visible texture, ` +
      `never plastic, never an over-smoothed 3D render. Editorial quality, sharp, high resolution, shallow depth ` +
      `of field, a clean and uncluttered composition with a clear single subject - not a busy crowded scene. ` +
      `Warm, restrained grade with gentle contrast. Corporate-grade photography, the standard of a bank's annual ` +
      `report, not a stock photo. ` +
      `\n\nCRITICAL - THE IMAGE CONTAINS NO GRAPHICS OF ANY KIND: no logo, no badge, no deal card, no price, no ` +
      `offer, no percentage, no pill, no callout, no headline, no caption, no watermark, no lettering and no ` +
      `numbers ANYWHERE. It is a photograph only. Any graphic or text you draw is a defect. ` +
      // The white-band bug: told to "leave the top calm for a logo", the model drew a white header banner. Kill
      // it - the photograph fills the whole frame, and the logo sits ON the picture, not on a strip.
      `\n\nIT IS A FULL-BLEED PHOTOGRAPH THAT FILLS THE ENTIRE FRAME, EDGE TO EDGE. There is NO white or grey ` +
      `header band, NO banner, NO border, NO frame, NO margin and NO solid colour strip along any edge. The ` +
      `photograph reaches every edge of the image. ` +
      `\n\nNobody presents a phone to the camera like an advert. If a phone appears at all there is exactly ONE, ` +
      `held naturally. Anatomy must be perfect: two hands per person, each attached to a visible arm, correct ` +
      `fingers, no floating or duplicated hands. ` +
      `\n\nCompose it so the person sits a little lower or to one side, keeping the TOP-LEFT area and the LOWER ` +
      `THIRD calmer within the photograph (softer background, not a blank band), so a logo and a line of type ` +
      `read cleanly once placed over the picture.`;

    const [shot] = await generateBatchDetailed([prompt], "nano_banana_pro", "1:1", { resolution: "2k" }, null);
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "ceo-linkedin-creative", count: 1 }).catch(() => {});
    if (!shot?.url) return NextResponse.json({ error: shot?.error || "the creative did not come back" }, { status: 500 });

    const kit = await getBrandKit(clientId).catch(() => null);
    const fonts = (kit?.fonts || []) as { family: string; url: string }[];
    const raw: Buffer = Buffer.from(new Uint8Array(await (await fetch(shot.url)).arrayBuffer()));

    // LinkedIn renders feed images up to 1200px wide, so 1200x1200 is the sharp, safe square. No crop, so
    // nothing can be clipped and nothing needs lifting off an edge.
    let out: Buffer = await sharp(raw).resize(1200, 1200, { fit: "cover", position: "attention" }).png().toBuffer();

    // 2. THE CALLOUT, typeset by us: one line, white, over the soft gradient, with the compliance line in the
    //    footer beneath it - the same proven foot a slider carries.
    //    THE COMPLIANCE LINE IS BACK (Gary: "compliance line is missing on the creatives for this too"). I had
    //    dropped it and kept only the AI disclosure, reasoning that a point of view is not an advertisement so
    //    the FSP strip is not required. Gary's call overrides: this is a MoMo-branded asset going out in public,
    //    so it carries MoMo's line. It already ends with "AI Creative", so the disclosure comes with it.
    //    No lift: 1:1 is never cropped, so the foot belongs on the bottom edge.
    const legal = (kit?.creative_legal_text || "").trim() || "AI Creative";
    if (callout || legal) {
      try { out = (await typesetSliderHeadline(out, callout, "", fonts, legal, 0)) as Buffer; }
      catch (e) { console.error("[ceo-creative] typeset failed:", e); }
    }

    // 3. THE REAL LOGO, top-left. The photograph has none, so this is the only logo in the frame and can never
    //    double up or read "from HTN".
    const logos = (kit?.logos || []) as { name: string | null; url: string }[];
    const logo = logos.find((l) => /horiz|primary|full/i.test(l.name || "")) || logos[0];
    if (logo) {
      try {
        const logoBuf = Buffer.from(new Uint8Array(await (await fetch(logo.url)).arrayBuffer()));
        out = (await compositeLogo(out, logoBuf, { xPct: 4, yPct: 4, wPct: 26 })) as Buffer;
      } catch (e) { console.error("[ceo-creative] logo composite failed:", e); }
    }

    const url = await putBytes(out, `studio/${clientId}/ceo-linkedin`, "png", "image/png");
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
