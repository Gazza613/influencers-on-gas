import sharp from "sharp";
import { planCampaign, type CampaignPlan } from "./studio-producer";
import { listAssets } from "./studio";
import { forensicSwap } from "./vendors/higgsfield";
import { onFunnelBackground } from "./studio-cutout";
import { finishSlider } from "./studio-slider";
import { putBytes } from "./blob";
import { recordUsage } from "./usage";

const bufOf = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));

// BUILD ONE MASTHEAD / SECTION-1. NO CUT-OUT (Gary: "see a decent image with no cut outs").
//
// Every cut approach ragged-edged, because the new person's hair/shoulders never match the original
// silhouette we were cutting with. So we never cut. Instead:
//   1. composite the reference (transparent) onto the EXACT funnel colour -> a COMPLETE finished ad on navy
//      (masthead) or white (section-1);
//   2. swap ONLY the person on that whole image - the model keeps the background, disc and furniture as one
//      continuous picture, and returns a complete image with no edge to tear.
// The output is already on the funnel colour, so it drops straight into the Webflow section.
export async function buildDiscCreative(clientId: string, kind: string, refUrl: string, person: string, ratio: string): Promise<{ url: string; error: string | null; calls: number }> {
  const bgKind = /section/i.test(kind) ? "section1" : "masthead";
  try {
    // A complete ad on the funnel colour becomes the base the swap edits.
    const base = await onFunnelBackground(await bufOf(refUrl), bgKind);
    const baseUrl = await putBytes(base, `studio/${clientId}/${kind}-base`, "png", "image/png");

    const swap = await forensicSwap(baseUrl, { person, construction: "disc", ratio, resolution: "4k", humanise: true });
    const calls = 1 + (swap.humanised ? 1 : 0);
    if (!swap.url) return { url: "", error: swap.error || "swap failed", calls };

    // Already a complete image on the funnel colour - just normalise to the reference's exact pixel size.
    const meta = await sharp(await bufOf(refUrl)).metadata().catch(() => null);
    const swapBuf = await bufOf(swap.url);
    const out: Buffer = (meta?.width && meta?.height)
      ? await sharp(swapBuf).resize(meta.width, meta.height, { fit: "fill" }).png().toBuffer()
      : swapBuf;
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
  type Job = { kind: RefCreative["kind"]; index: number; ref?: Ref; person: string; scene?: string; construction: "disc" | "scene"; headline?: string };
  const jobs: Job[] = [
    { kind: "masthead", index: 0, ref: pick(mastheads), person: plan.masthead.subjectPrompt, construction: "disc" },
    { kind: "section1", index: 0, ref: pick(section1s), person: plan.section1.subjectPrompt, construction: "disc" },
    ...plan.sliders.slice(0, 3).map((s, i): Job => ({
      // The slider person now EMBODIES the theme (mom + daughter for Mother's Day) - the Producer writes it.
      kind: "slider", index: i, ref: pick(sliders, i), person: s.subject || `people that suit "${plan.theme}"`,
      scene: s.scenePrompt, construction: "scene", headline: `${s.headline1} / ${s.headline2}`,
    })),
  ];

  let totalCalls = 0;
  const creatives = await Promise.all(jobs.map(async (j): Promise<RefCreative> => {
    if (!j.ref) { warnings.push(`No ${j.kind} reference on file.`); return { kind: j.kind, index: j.index, refName: "", refUrl: "", url: "", error: "no reference of this type" }; }
    const meta = await sharp(await bufOf(j.ref.url)).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";

    // DISC (masthead + section-1): the forensic path - swap the person, then stamp the reference's real
    // furniture back, so the bubbles and pill are pixel-perfect instead of the img2img warp Gary flagged.
    if (j.construction === "disc") {
      const r = await buildDiscCreative(clientId, j.kind, j.ref.url, j.person, ratio);
      totalCalls += r.calls;
      if (r.error) warnings.push(`${j.kind}: ${r.error}`);
      if (!r.url) return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: "", error: r.error || "failed" };
      return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: r.url, headline: j.headline };
    }

    // SCENE (slider): swap, then FINISH - typeset the campaign headline over the baked one and stamp the real
    // logo (never AI-drawn). The three sliders then read as the campaign's story, not the reference's copy.
    const { url, error, humanised } = await forensicSwap(j.ref.url, {
      person: j.person, scene: j.scene, construction: j.construction, ratio, resolution: "4k", humanise: true,
    });
    totalCalls += 1 + (humanised ? 1 : 0);
    if (!url) { warnings.push(`${j.kind}: ${error}`); return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: "", error: error || "swap failed" }; }
    const finished = await finishSlider(clientId, j.ref.url, url, j.headline || "").catch(() => url);
    return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: finished, headline: j.headline };
  }));

  await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "refmatch-campaign", count: totalCalls }).catch(() => {});
  return { plan, creatives, warnings };
}
