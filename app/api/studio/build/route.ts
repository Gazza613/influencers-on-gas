import { NextResponse } from "next/server";
import { auth } from "@/auth";
import sharp from "sharp";
import { forensicRetheme } from "@/lib/vendors/higgsfield";
import { balanceHeadline, tidyCallout, stampRealLogo, stampDealCard, stampTypesetDeal } from "@/lib/studio-slider";
import { onFunnelBackground, flattenSection1ToWhite } from "@/lib/studio-cutout";
import { SLIDER_GRADE } from "@/lib/studio-refmatch";
import { putBytes } from "@/lib/blob";
import { listAssets } from "@/lib/studio";
import { recordUsage } from "@/lib/usage";

// GENERATE ONE CREATIVE for the wizard. The user picks a reference and says what to change (the callout copy,
// and who should be in it). We FORENSICALLY RETHEME that reference - keep everything, change only the copy
// (and people/deal if asked) to the campaign theme. Same strategy for masthead, section 1 and slider. THIS SPENDS.
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

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; kind?: string; referenceUrl?: string; subject?: string; scene?: string; callout?: string; theme?: string; dealCardUrl?: string; deal?: import("@/lib/studio-producer").Deal | null };
  const clientId = String(b.clientId || "");
  const kind = String(b.kind || "");
  let referenceUrl = String(b.referenceUrl || "");
  const subject = String(b.subject || "").trim();
  const callout = String(b.callout || "").trim();
  const theme = String(b.theme || "").trim();
  const dealCardUrl = String(b.dealCardUrl || "").trim();
  if (!clientId || !subject) return NextResponse.json({ error: "Describe who should be in it." }, { status: 400 });

  try {
    // REFERENCE IS OPTIONAL. Gary: the creative expert should nail it whether or not a reference is picked.
    // If none was chosen, the expert picks one for this section itself (Hero=masthead, Supporting=section1,
    // Slider=slider) - a pick is never compulsory.
    if (!referenceUrl) {
      const match = kind === "masthead" ? /hero/i : kind === "section1" ? /supporting/i : /slider|slide/i;
      const pool = (await listAssets(clientId, "reference")).filter((a) => match.test(a.name || "") && !(kind !== "section1" && /supporting/i.test(a.name || "")));
      if (!pool.length) return NextResponse.json({ error: `No ${kind} designs on file to work from.` }, { status: 400 });
      referenceUrl = pool[Math.floor(Date.now() / 1000) % pool.length].url; // vary the pick between runs
    }
    const refBuf: Buffer = Buffer.from(await (await fetch(referenceUrl)).arrayBuffer());
    const meta = await sharp(refBuf).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";

    // FORENSIC RETHEME (Gary's locked strategy, same for all three): keep the selected reference EXACTLY - its
    // people (unless asked), background, signature swish, logo, layout and every graphic detail incl. the yellow
    // underline - and change ONLY the copy (and people/deal if asked) to the campaign theme, in the design's own
    // style. On the masthead this preserves the reference's exact funnel navy, so it drops into Webflow with no
    // seam.
    const changes: string[] = [];
    if (kind === "slider") {
      if (callout) {
        const [hl1, hl2] = balanceHeadline(tidyCallout(callout));
        changes.push(`Change the main bottom HEADLINE to read EXACTLY two lines: "${hl1}" in WHITE${hl2 ? ` then "${hl2}" in YELLOW` : ""}. NEVER more than two lines - do NOT add a third line, a price line, a deal line or any extra copy beneath it. Set the punctuation exactly as written, character for character - do not add or remove a full stop or a comma. Keep any yellow underline beneath it exactly where it is.`);
      }
      // One grade across all three sliders, whatever the setting, so the set hangs together in the funnel.
      changes.push(SLIDER_GRADE);
    } else {
      // masthead / section 1: the callout is the copy on the design's CALLOUT PILL.
      if (callout) changes.push(`Change the CALLOUT PILL / lozenge copy to "${callout}", keeping the pill's exact shape, colour, 3D style and any yellow banner or underline, matched to the design's own font.`);
    }
    // The "who should be in it" field: a people change (or a verbatim instruction if it reads like one).
    if (subject) changes.push(/^\s*(change|keep|replace|make|remove|add|use)\b/i.test(subject) ? subject : `Change the people in the advert to: ${subject}.`);
    // SETTING / BACKGROUND - sliders only. A slider is a photograph, so re-setting it is safe. A masthead or
    // section 1 must keep the flat funnel colour or it stops matching the Webflow section it drops into, so the
    // control is never offered there and we ignore it if it somehow arrives.
    const scene = String(b.scene || "").trim();
    if (scene && kind === "slider") changes.push(`Change the SETTING / background to: ${scene}. Keep the same framing, composition and the signature swish, and keep the people believably lit for that setting.`);
    // THE OFFER MUST FIT THE CAMPAIGN (Gary). The reference designs are DATA-campaign ads, so a faithful
    // retheme happily keeps their "+1GB" graphics and "All-Net Calls R10" cards on a money-transfer campaign.
    // A selected deal wins; otherwise the theme governs every offer element in the design.
    // A REAL deal card from the intake library wins over everything: the model must draw NO deal at all, and we
    // composite the client's own artwork afterwards. Pixel-perfect price, on brand, never garbled.
    // Either kind of real deal (chosen artwork, or a typed deal we typeset ourselves) means the model draws NO
    // offer at all - we composite it afterwards. The price is never the model's to write.
    if (dealCardUrl || (b.deal && b.deal.label)) {
      changes.push(`Do NOT draw any deal card, offer badge, price bubble, pill or promotional lozenge ANYWHERE in the image, and no prices or offer wording of any kind. Leave the top-right area as clean background/photograph. The real deal card is composited on afterwards, so any offer you draw is a defect.`);
    } else if (theme) {
      changes.push(`The campaign is about: ${theme}. EVERY offer element in the design must fit THIS campaign - the deal/offer badge, any floating graphic like "+1GB", any icon popping out of the phone, and any price. If the design carries a data bundle, an airtime or calls offer, or any deal that does not fit this campaign, replace its wording and its icon so it reflects this campaign's offer instead (for a money-transfer campaign use money/transfer imagery, never data). Do NOT leave any off-theme data, airtime or calls offer anywhere in the image.`);
    }

    // MASTHEAD / SECTION 1: flatten the reference onto the EXACT funnel background FIRST, then retheme that.
    // The reference designs are supplied on black (or transparent), so without this the creative comes back on
    // black instead of the Webflow navy. This is the step the /api/studio/forensic-test route always did - and
    // why that test produced a perfect Webflow-blue masthead while the live builder did not.
    let editUrl = referenceUrl;
    if (kind === "masthead" || kind === "section1") {
      const base = await onFunnelBackground(refBuf, kind === "section1" ? "section1" : "masthead");
      editUrl = await putBytes(base, `studio/${clientId}/${kind}-base`, "png", "image/png");
    }

    const isDisc = kind === "masthead" || kind === "section1";
    const ed = await forensicRetheme(editUrl, { changes, ratio, resolution: "4k", solidBackground: isDisc });
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: `retheme-${kind}`, count: 1 }).catch(() => {});
    if (!ed.url) return NextResponse.json({ error: ed.error || "generation failed" }, { status: 500 });
    // THE LOGO. The retheme never draws one (any logo it draws is a defect), so:
    //   sliders           -> stamp the REAL lockup, the only logo in the frame. Can never say "from HTN".
    //   masthead/section1 -> NO logo at all (Gary). The Webflow funnel page already carries the MoMo logo, so
    //                        repeating it on the creative just duplicates it.
    // SECTION 1 MUST BE PURE WHITE for the Webflow white section. The model keeps painting faint smudges there
    // and no prompt has held, so this is deterministic: flood-fill the background to #ffffff from the edges,
    // protecting a halo around the design so the bubbles keep their shadows.
    let finalUrl = ed.url;
    if (kind === "section1") {
      try {
        const cleaned = await flattenSection1ToWhite(Buffer.from(new Uint8Array(await (await fetch(ed.url)).arrayBuffer())));
        finalUrl = await putBytes(cleaned, `studio/${clientId}/section1-white`, "png", "image/png");
      } catch (e) { console.error("[build] section-1 white flatten failed, keeping the render:", e); }
    }

    let locked = isDisc ? finalUrl : await stampRealLogo(clientId, referenceUrl, finalUrl);
    // THE OFFER, composited - never AI-drawn. Chosen artwork wins; otherwise a typed deal is typeset in the
    // client's own card design (dynamic deals, every character exact).
    if (dealCardUrl) locked = await stampDealCard(clientId, locked, dealCardUrl, referenceUrl);
    else if (b.deal && b.deal.label) locked = await stampTypesetDeal(clientId, locked, b.deal, referenceUrl);
    return NextResponse.json({ ok: true, url: locked });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
