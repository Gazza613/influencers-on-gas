import sharp from "sharp";
import { planCampaign, type CampaignPlan } from "./studio-producer";
import { listAssets } from "./studio";
import { forensicSwap, forensicRetheme } from "./vendors/higgsfield";
import { onFunnelBackground, applyReferenceAlpha, flattenSection1ToWhite, flattenMastheadToNavy } from "./studio-cutout";
import { overlayPill, balanceHeadline, tidyCallout, stampRealLogo } from "./studio-slider";
import { detectLayout } from "./studio-layout";
import { getBrandKit } from "./studio";
import { putBytes } from "./blob";
import { recordUsage } from "./usage";

const bufOf = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));

// THE SLIDER GRADE - one look across all three (Gary). The sliders sit side by side in the funnel, so if one is
// bright outdoor daylight and the next is warm indoor lamplight, the set reads as mismatched. Every slider gets
// this same colour direction, whatever its setting, so the three hang together as one campaign.
export const SLIDER_GRADE =
  "COLOUR GRADE - keep this IDENTICAL across the campaign's sliders so they sit together as a set: a warm, " +
  "golden, softly-lit tone with gentle contrast and rich but natural skin; the MoMo blue and yellow light " +
  "accents in the same strength and hue as @image1. Do not shift the grade cooler, flatter or more neutral " +
  "because of the setting - an outdoor scene must still carry the same warm accent and tone as an indoor one.";

// BUILD ONE MASTHEAD / SECTION-1. NO CUT-OUT (Gary: "see a decent image with no cut outs").
//
// Every cut approach ragged-edged, because the new person's hair/shoulders never match the original
// silhouette we were cutting with. So we never cut. Instead:
//   1. composite the reference (transparent) onto the EXACT funnel colour -> a COMPLETE finished ad on navy
//      (masthead) or white (section-1);
//   2. swap ONLY the person on that whole image - the model keeps the background, disc and furniture as one
//      continuous picture, and returns a complete image with no edge to tear.
// The output is already on the funnel colour, so it drops straight into the Webflow section.
export async function buildDiscCreative(clientId: string, kind: string, refUrl: string, person: string, ratio: string, callout?: string): Promise<{ url: string; error: string | null; calls: number }> {
  const bgKind = /section/i.test(kind) ? "section1" : "masthead";
  try {
    // A complete ad on the funnel colour becomes the base the swap edits.
    const base = await onFunnelBackground(await bufOf(refUrl), bgKind);
    const baseUrl = await putBytes(base, `studio/${clientId}/${kind}-base`, "png", "image/png");

    // The swap now KEEPS the disc/bubbles/swish but leaves the logo + pill areas CLEAN (no words at all), so we
    // composite the real, campaign-themed pill ourselves and nothing garbles.
    const swap = await forensicSwap(baseUrl, { person, construction: "disc", ratio, resolution: "4k", humanise: true });
    const calls = 1 + (swap.humanised ? 1 : 0);
    if (!swap.url) return { url: "", error: swap.error || "swap failed", calls };

    // Normalise to the reference's exact pixel size.
    const refBuf = await bufOf(refUrl);
    const meta = await sharp(refBuf).metadata().catch(() => null);
    const swapBuf = await bufOf(swap.url);
    let out: Buffer = (meta?.width && meta?.height)
      ? await sharp(swapBuf).resize(meta.width, meta.height, { fit: "fill" }).png().toBuffer()
      : swapBuf;

    // SECTION-1 must sit on CLEAN WHITE (Gary). The swap re-renders the surround off-white; so for section-1
    // we cut the design with the reference's tight (eroded) edge and re-place it on pure white. The masthead
    // stays on its navy, where a re-rendered dark surround is invisible and cutting would ragged the edge.
    if (bgKind === "section1") {
      out = (await onFunnelBackground(await applyReferenceAlpha(out, refBuf), "section1")) as Buffer;
    }
    // THE CAMPAIGN PILL: the Producer's on-theme callout, typeset into MoMo's own 3D lozenge and composited
    // bottom-centre. This is the ONLY pill in the frame (the swap left the area clean), so it can never carry
    // the reference's copy through onto the campaign (Gary: "the callouts have nothing to do with Mother's Day").
    // NO top-left logo on the disc creatives (Gary) - the branding is the disc + the pill.
    if (callout && callout.trim()) {
      const kit = await getBrandKit(clientId).catch(() => null);
      const fonts = (kit?.fonts || []) as { family: string; url: string }[];
      // Detect where the reference's pill sits so OUR pill fully covers it (the swap does not reliably remove
      // the old pill - Gary saw it sitting behind the new one).
      const layout = await detectLayout(refUrl).catch(() => null);
      try { out = (await overlayPill(out, callout, fonts, { box: layout?.callout || null, widthFrac: bgKind === "section1" ? 0.6 : 0.66 })) as Buffer; }
      catch (e) { console.error(`[buildDiscCreative] pill overlay failed (${kind}):`, e); }
    }

    const url = await putBytes(out, `studio/${clientId}/${kind}`, "png", "image/png");
    return { url, error: null, calls };
  } catch (e) {
    return { url: "", error: String((e as Error)?.message || e).slice(0, 160), calls: 0 };
  }
}

// THE REFERENCE-MATCH CAMPAIGN. A brief in, a full funnel set out - 1 masthead, 1 section-1, 3 sliders - each
// built by SWAPPING THE PERSON on one of the client's own proven designs, never generated from scratch.
//
// This is the flow Gary asked for. It ties together everything proven separately:
//   - the Producer writes the theme, the per-creative subject, the deals and the copy (grounded in the refs)
//   - masthead + section-1: disc-construction swap, then the reference's own alpha stamps it transparent
//   - sliders: full-bleed person + scene swap
// The design furniture stays the client's; only the person (and, later, the typeset offer) changes.

export type RefCreative = {
  kind: "masthead" | "section1" | "slider";
  index: number;
  refName: string;
  refUrl: string;
  url: string;        // the finished creative (transparent PNG for masthead/section-1)
  headline?: string;
  error?: string;
};

export type RefMatchResult = { plan: CampaignPlan; creatives: RefCreative[]; warnings: string[] };

function nearestRatio(w: number, h: number): string {
  const t = w / h;
  const opts: [string, number][] = [["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["3:2", 3 / 2], ["16:9", 16 / 9], ["9:16", 9 / 16]];
  return opts.reduce((b, o) => (Math.abs(o[1] - t) < Math.abs(b[1] - t) ? o : b))[0];
}
const buf = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));

export async function produceRefMatch(clientId: string, brief: string): Promise<RefMatchResult> {
  const plan = await planCampaign(clientId, brief);
  const refs = await listAssets(clientId, "reference");
  const warnings: string[] = [];

  const mastheads = refs.filter((r) => /hero/i.test(r.name || ""));
  const section1s = refs.filter((r) => /supporting/i.test(r.name || ""));
  const sliders = refs.filter((r) => /slider|slide/i.test(r.name || "") && !/supporting/i.test(r.name || ""));
  const pick = (a: { name: string | null; url: string }[], i = 0): Ref | undefined => (a.length ? { name: a[i % a.length].name || "", url: a[i % a.length].url } : undefined);


  type Ref = { name: string; url: string };
  type Job = { kind: RefCreative["kind"]; index: number; ref?: Ref; person: string; scene?: string; construction: "disc" | "scene"; headline?: string; callout?: string; deal?: import("./studio-producer").Deal };
  const jobs: Job[] = [
    { kind: "masthead", index: 0, ref: pick(mastheads), person: plan.masthead.subjectPrompt, construction: "disc", callout: plan.masthead.callout },
    { kind: "section1", index: 0, ref: pick(section1s), person: plan.section1.subjectPrompt, construction: "disc", callout: plan.section1.callout },
    ...plan.sliders.slice(0, 3).map((s, i): Job => ({
      // The slider person now EMBODIES the theme (mom + daughter for Mother's Day) - the Producer writes it.
      kind: "slider", index: i, ref: pick(sliders, i), person: s.subject || `people that suit "${plan.theme}"`,
      scene: s.scenePrompt, construction: "scene", headline: `${s.headline1} / ${s.headline2}`, deal: s.deal,
    })),
  ];

  let totalCalls = 0;
  const creatives = await Promise.all(jobs.map(async (j): Promise<RefCreative> => {
    if (!j.ref) { warnings.push(`No ${j.kind} reference on file.`); return { kind: j.kind, index: j.index, refName: "", refUrl: "", url: "", error: "no reference of this type" }; }
    const meta = await sharp(await bufOf(j.ref.url)).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";

    // FORENSIC RETHEME - the same locked strategy the wizard uses (keep the reference, change only the copy and
    // the people). One Higgsfield call per creative instead of swap + humaniser + Chromium composites, which is
    // also why the full set now finishes inside the function's time budget instead of hanging.
    const changes: string[] = [];
    if (j.construction === "disc") {
      if (j.callout) changes.push(`Change the CALLOUT PILL / lozenge copy to "${j.callout}", keeping the pill's exact shape, colour, 3D style and any yellow banner or underline, matched to the design's own font.`);
    } else if (j.headline) {
      const [hl1, hl2] = balanceHeadline(tidyCallout(j.headline));
      changes.push(`Change the main bottom HEADLINE to read EXACTLY two lines: "${hl1}" in WHITE${hl2 ? ` then "${hl2}" in YELLOW` : ""}. NEVER more than two lines - do NOT add a third line, a price line, a deal line or any extra copy beneath it. Set the punctuation exactly as written, character for character - do not add or remove a full stop or a comma. Keep any yellow underline beneath it exactly where it is.`);
    }
    if (j.person) changes.push(`Change the people in the advert to: ${j.person}.`);
    // ONE GRADE ACROSS ALL THREE SLIDERS (Gary): they sit next to each other in the funnel, so an outdoor
    // daylight slider beside a warm indoor one reads as a mismatched set. Same accent and tone, always.
    if (j.construction === "scene") changes.push(SLIDER_GRADE);
    // The offer must fit the campaign - the reference designs are data-campaign ads, so a faithful retheme
    // otherwise keeps their "+1GB" graphics and calls deals on an off-theme campaign (Gary).
    if (j.deal?.label) {
      changes.push(`Change the deal/offer card to read "${[j.deal.label, j.deal.amount, j.deal.price].filter(Boolean).join(" ")}", in the same card style and position. Any OTHER offer element in the design must also match this offer - no other, different bundle anywhere.`);
    } else if (plan.theme) {
      changes.push(`The campaign is about: ${plan.theme}. EVERY offer element in the design must fit THIS campaign - the deal/offer badge, any floating graphic like "+1GB", any icon popping out of the phone, and any price. If the design carries a data bundle, an airtime or calls offer, or any deal that does not fit this campaign, replace its wording and its icon so it reflects this campaign's offer instead (for a money-transfer campaign use money/transfer imagery, never data). Do NOT leave any off-theme data, airtime or calls offer anywhere in the image.`);
    }

    // MASTHEAD / SECTION 1: flatten onto the EXACT funnel background before rethemeing, or a reference supplied
    // on black comes back on black instead of the Webflow navy (the step the forensic-test route always did).
    let editUrl = j.ref.url;
    if (j.construction === "disc") {
      try {
        const base = await onFunnelBackground(await bufOf(j.ref.url), j.kind === "section1" ? "section1" : "masthead");
        editUrl = await putBytes(base, `studio/${clientId}/${j.kind}-base`, "png", "image/png");
      } catch (e) { console.error(`[produceRefMatch] funnel background failed (${j.kind}):`, e); }
    }

    const { url, error } = await forensicRetheme(editUrl, { changes, ratio, resolution: "2k", solidBackground: j.construction === "disc" });
    totalCalls += 1;
    if (!url) { warnings.push(`${j.kind}: ${error}`); return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: "", error: error || "retheme failed" }; }

    // SECTION 1 MUST BE PURE WHITE, MASTHEAD EXACTLY #083a51 - deterministic on both, because no prompt has held
    // and the seam against the Webflow section is unforgiving.
    let cleanUrl = url;
    if (j.kind === "section1") {
      try {
        const cleaned = await flattenSection1ToWhite(await bufOf(url));
        cleanUrl = await putBytes(cleaned, `studio/${clientId}/section1-white`, "png", "image/png");
      } catch (e) { console.error("[produceRefMatch] section-1 white flatten failed:", e); }
    } else if (j.kind === "masthead") {
      try {
        const navy = await flattenMastheadToNavy(await bufOf(url));
        cleanUrl = await putBytes(navy, `studio/${clientId}/masthead-navy`, "png", "image/png");
      } catch (e) { console.error("[produceRefMatch] masthead navy flatten failed:", e); }
    }
    // Sliders get the REAL stamped lockup (the retheme draws none, so it is the only logo and can never say
    // "from HTN"). Masthead/section-1 get NO logo (Gary) - the Webflow funnel page already carries it.
    const locked = j.construction === "disc" ? cleanUrl : await stampRealLogo(clientId, j.ref.url, cleanUrl);
    return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: locked, headline: j.headline };
  }));

  await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "refmatch-campaign", count: totalCalls }).catch(() => {});
  return { plan, creatives, warnings };
}
