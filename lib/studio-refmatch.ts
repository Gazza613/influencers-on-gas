import sharp from "sharp";
import { planCampaign, type CampaignPlan } from "./studio-producer";
import { listAssets } from "./studio";
import { forensicSwap, stripPerson } from "./vendors/higgsfield";
import { applyReferenceAlpha, personMaskFromStrip, compositeForensicFurniture } from "./studio-cutout";
import { putBytes } from "./blob";
import { recordUsage } from "./usage";

const bufOf = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b));

// BUILD ONE MASTHEAD / SECTION-1. The forensic path, because img2img warps the furniture (Gary: "icons
// warped"). We SWAP the person and, in parallel, STRIP the person off the reference to recover a clean
// silhouette; then we keep the swap's person inside that silhouette and stamp the reference's ACTUAL furniture
// (bubbles, pill, disc) over everything else, with a tight eroded edge. The furniture is then pixel-identical,
// never a redraw. Returns the finished transparent PNG url (or an error + a fallback that at least masks clean).
export async function buildDiscCreative(clientId: string, kind: string, refUrl: string, person: string, ratio: string): Promise<{ url: string; error: string | null; calls: number }> {
  // Swap and strip are independent - run them together.
  const [swap, strip] = await Promise.all([
    forensicSwap(refUrl, { person, construction: "disc", ratio, resolution: "4k", humanise: true }),
    stripPerson(refUrl, { ratio, resolution: "4k" }),
  ]);
  let calls = 1 + (swap.humanised ? 1 : 0) + (strip.url ? 1 : 0);
  if (!swap.url) return { url: "", error: swap.error || "swap failed", calls };

  const refBuf = await bufOf(refUrl);
  const swapBuf = await bufOf(swap.url);
  try {
    let finalBuf: Buffer;
    if (strip.url) {
      const mask = await personMaskFromStrip(refBuf, await bufOf(strip.url));
      finalBuf = await compositeForensicFurniture(swapBuf, refBuf, mask); // furniture pixel-perfect + eroded edge
    } else {
      finalBuf = await applyReferenceAlpha(swapBuf, refBuf); // fallback: clean edge, furniture as the swap gave it
    }
    const url = await putBytes(finalBuf, `studio/${clientId}/${kind}`, "png", "image/png");
    return { url, error: strip.url ? null : "person-strip failed, furniture not re-composited", calls };
  } catch (e) {
    return { url: "", error: String((e as Error)?.message || e).slice(0, 160), calls };
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

  // The person for a slider is not in the plan's scenePrompt slot, so derive a warm theme-appropriate subject
  // from the campaign; the scenePrompt carries the setting.
  const sliderPerson = `a warm, believable South African person that suits "${plan.theme}"`;

  type Ref = { name: string; url: string };
  type Job = { kind: RefCreative["kind"]; index: number; ref?: Ref; person: string; scene?: string; construction: "disc" | "scene"; headline?: string };
  const jobs: Job[] = [
    { kind: "masthead", index: 0, ref: pick(mastheads), person: plan.masthead.subjectPrompt, construction: "disc" },
    { kind: "section1", index: 0, ref: pick(section1s), person: plan.section1.subjectPrompt, construction: "disc" },
    ...plan.sliders.slice(0, 3).map((s, i): Job => ({
      kind: "slider", index: i, ref: pick(sliders, i), person: sliderPerson, scene: s.scenePrompt,
      construction: "scene", headline: `${s.headline1} / ${s.headline2}`,
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

    // SCENE (slider): full-bleed swap. Furniture holds well on a photo, so no re-composite needed.
    const { url, error, humanised } = await forensicSwap(j.ref.url, {
      person: j.person, scene: j.scene, construction: j.construction, ratio, resolution: "4k", humanise: true,
    });
    totalCalls += 1 + (humanised ? 1 : 0);
    if (!url) { warnings.push(`${j.kind}: ${error}`); return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: "", error: error || "swap failed" }; }
    return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url, headline: j.headline };
  }));

  await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "refmatch-campaign", count: totalCalls }).catch(() => {});
  return { plan, creatives, warnings };
}
