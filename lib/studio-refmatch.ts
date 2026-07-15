import sharp from "sharp";
import { planCampaign, type CampaignPlan } from "./studio-producer";
import { listAssets } from "./studio";
import { forensicSwap } from "./vendors/higgsfield";
import { applyReferenceAlpha } from "./studio-cutout";
import { putBytes } from "./blob";
import { recordUsage } from "./usage";

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

  const models: string[] = [];
  const creatives = await Promise.all(jobs.map(async (j): Promise<RefCreative> => {
    if (!j.ref) { warnings.push(`No ${j.kind} reference on file.`); return { kind: j.kind, index: j.index, refName: "", refUrl: "", url: "", error: "no reference of this type" }; }
    const meta = await sharp(await buf(j.ref.url)).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";

    const { url, error, humanised } = await forensicSwap(j.ref.url, {
      person: j.person, scene: j.scene, construction: j.construction, ratio, resolution: "4k", humanise: true,
    });
    models.push("nano_banana_pro"); if (humanised) models.push("nano_banana_pro");
    if (!url) { warnings.push(`${j.kind}: ${error}`); return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: "", error: error || "swap failed" }; }

    // Masthead + section-1 must be transparent PNGs: stamp the reference's own alpha.
    let finalUrl = url;
    if (j.construction === "disc") {
      try {
        const transparent = await applyReferenceAlpha(await buf(url), await buf(j.ref.url));
        finalUrl = await putBytes(transparent, `studio/${clientId}/${j.kind}`, "png", "image/png");
      } catch (e) { warnings.push(`${j.kind} transparency failed: ${String((e as Error)?.message || e).slice(0, 100)}`); }
    }
    return { kind: j.kind, index: j.index, refName: j.ref.name, refUrl: j.ref.url, url: finalUrl, headline: j.headline };
  }));

  await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "refmatch-campaign", count: models.length }).catch(() => {});
  return { plan, creatives, warnings };
}
