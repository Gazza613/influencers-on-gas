import { NextResponse } from "next/server";
import { auth } from "@/auth";
import sharp from "sharp";
import { generateBatchDetailed } from "@/lib/vendors/higgsfield";
import { typesetSliderHeadline, compositeLogo, tidyCallout } from "@/lib/studio-slider";
import { getBrandKit } from "@/lib/studio";
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
    // 1. A CLEAN PHOTOGRAPH, generated 3:4 and cropped to 4:5.
    //    4:5 (1080x1350) takes the most room in the LinkedIn MOBILE feed and earns the most engagement, which is
    //    where this is actually read (Gary's call). The trade is that LinkedIn crops it towards square on
    //    DESKTOP, so anything against the bottom edge is the first thing cut - handled by the safe area below.
    //    The model has no 4:5, so we take its 3:4 (which is TALLER than 4:5) and crop the height. Cropping a
    //    taller frame is lossless in the sense that matters: nothing is stretched.
    const prompt =
      `A real, warm, emotive documentary photograph of ${subject}. ` +
      `Authentic South African, shot on a real camera: natural light, true even skin tone with visible texture, ` +
      `never plastic, never an over-smoothed 3D render. Editorial quality, sharp, high resolution, shallow depth ` +
      `of field, a genuine unposed human moment. Warm golden grade with gentle contrast. ` +
      `\n\nCRITICAL - THE IMAGE CONTAINS NO GRAPHICS OF ANY KIND: no logo, no badge, no deal card, no price, no ` +
      `offer, no percentage, no pill, no callout, no headline, no caption, no watermark, no lettering and no ` +
      `numbers ANYWHERE. It is a photograph only. Any graphic or text you draw is a defect. ` +
      `\n\nNobody presents a phone to the camera like an advert. If a phone appears at all there is exactly ONE, ` +
      `held naturally. Anatomy must be perfect: two hands per person, each attached to a visible arm, correct ` +
      `fingers, no floating or duplicated hands. ` +
      `\n\nLeave the LOWER THIRD and the TOP-LEFT corner relatively calm and uncluttered, so a line of type and a ` +
      `logo can sit over them.`;

    const [shot] = await generateBatchDetailed([prompt], "nano_banana_pro", "3:4", { resolution: "2k" }, null);
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "ceo-linkedin-creative", count: 1 }).catch(() => {});
    if (!shot?.url) return NextResponse.json({ error: shot?.error || "the creative did not come back" }, { status: 500 });

    const kit = await getBrandKit(clientId).catch(() => null);
    const fonts = (kit?.fonts || []) as { family: string; url: string }[];
    const raw: Buffer = Buffer.from(new Uint8Array(await (await fetch(shot.url)).arrayBuffer()));

    // Crop 3:4 -> 4:5 on the height, centred, then land on LinkedIn's 1080x1350. Never stretch: a distorted
    // face is worse than a slightly tighter crop.
    let out: Buffer = await sharp(raw)
      .resize(1080, 1350, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();

    // 2. THE CALLOUT, typeset by us. One line, white. Plus the AI disclosure (Gary: "always add AI Creative to
    //    the disclaimer copy"). This is NOT an advertisement, so it carries no FSP compliance strip - that
    //    belongs on a creative that makes an offer, and this one deliberately does not.
    // THE SAFE AREA is the point of the whole exercise. LinkedIn crops 4:5 towards square on desktop, taking
    // roughly the top and bottom tenth, so the callout is lifted clear of the bottom edge and the logo dropped
    // clear of the top. Both then survive the crop AND read on mobile, which is the only way 4:5 is worth it.
    const SAFE_PCT = 11;
    if (callout) {
      try { out = (await typesetSliderHeadline(out, callout, "", fonts, "AI Creative", SAFE_PCT)) as Buffer; }
      catch (e) { console.error("[ceo-creative] typeset failed:", e); }
    }

    // 3. THE REAL LOGO, top-left. The photograph has none, so this is the only logo in the frame and can never
    //    double up or read "from HTN".
    const logos = (kit?.logos || []) as { name: string | null; url: string }[];
    const logo = logos.find((l) => /horiz|primary|full/i.test(l.name || "")) || logos[0];
    if (logo) {
      try {
        const logoBuf = Buffer.from(new Uint8Array(await (await fetch(logo.url)).arrayBuffer()));
        out = (await compositeLogo(out, logoBuf, { xPct: 5, yPct: 12, wPct: 26 })) as Buffer;
      } catch (e) { console.error("[ceo-creative] logo composite failed:", e); }
    }

    const url = await putBytes(out, `studio/${clientId}/ceo-linkedin`, "png", "image/png");
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
