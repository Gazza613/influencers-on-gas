import { generateBatchDetailed } from "./vendors/higgsfield";
import { removeBackground } from "./vendors/fal";
import { renderPng, encodeForDelivery } from "./studio-render";
import { renderMomoSlider } from "./templates/momo-slider";
import { renderMomoMasthead } from "./templates/momo-masthead";
import { renderMomoSection1 } from "./templates/momo-section1";
import { getBrandKit } from "./studio";
import { putBytes } from "./blob";
import { recordUsage } from "./usage";
import type { CampaignPlan } from "./studio-producer";

// FINAL PRODUCTION. The plan goes in, five finished files come out.
//
//   plan -> generate the imagery -> cut out the two subjects -> render the five canvases -> store
//
// The imagery is GENERATED, not supplied. That is the whole point of the studio: a brief in, a campaign out.
// Nothing here is a placeholder waiting for a designer to drop a photo in.
//
// WHERE THE MONEY GOES (every call is metered - a step that spends without a usage event is a bug):
//   Higgsfield  x5 images   (2 cut-out subjects + 3 slider scenes)
//   fal birefnet x2         (background removal on the two cut-outs)
// The renders themselves are free - they run in our own Chromium.

const IMAGE_MODEL = process.env.STUDIO_IMAGE_MODEL || "nano_banana_pro";
const FALLBACK_MODEL = "gpt_image_2";
const REMBG_MODEL = process.env.FAL_REMBG_MODEL || "fal-ai/birefnet/v2";

export type Creative = {
  kind: "masthead" | "section1" | "slider";
  index: number;
  url: string;
  bytes: number;
  width: number;
  height: number;
  /** Kept so a re-shoot can regenerate ONE creative without re-running the whole campaign. */
  imagePrompt: string;
  sourceImage: string | null;
  error?: string;
};

export type CampaignOutput = { creatives: Creative[]; warnings: string[] };

// The photographic grammar every generated frame inherits. It sits UNDER the Producer's per-shot prompt,
// so the Producer writes the idea and this writes the camera. Kept short on purpose: past ~200 tokens the
// image models start averaging the instructions instead of following them.
const CAMERA = "Photorealistic editorial photograph, shot on a full-frame camera with an 85mm lens at f/2.0, " +
  "authentic skin texture with visible pores and natural imperfections, no plastic retouching, no beauty filter, " +
  "true-to-life colour, natural catchlights in the eyes";

export async function produceCampaign(clientId: string, plan: CampaignPlan): Promise<CampaignOutput> {
  const kit = await getBrandKit(clientId);
  if (!kit) throw new Error("No brand kit for this client.");
  const fonts = (kit.fonts || []) as { family: string; url: string }[];
  const logo = pickLogo(kit.logos as { name: string; url: string }[] | undefined);
  const compliance = kit.compliance_text || "";
  const warnings: string[] = [];

  // ── 1. GENERATE. All five frames at once - the batch is concurrency-capped inside the vendor, so five
  // prompts cost roughly the wall-clock of one. Cut-outs are generated at 3:4 (a standing person), scenes
  // at 1:1 (the slider canvas), so nothing is generated at an aspect it will only be cropped out of.
  const cutoutPrompts = [
    `${plan.masthead.subjectPrompt}. ${CAMERA}`,
    `${plan.section1.subjectPrompt}. ${CAMERA}`,
  ];
  const scenePrompts = plan.sliders.map((s) => `${s.scenePrompt}. ${CAMERA}`);

  const [cutShots, sceneShots] = await Promise.all([
    generateBatchDetailed(cutoutPrompts, IMAGE_MODEL, "3:4", {}, FALLBACK_MODEL),
    generateBatchDetailed(scenePrompts, IMAGE_MODEL, "1:1", {}, FALLBACK_MODEL),
  ]);

  const shots = [...cutShots, ...sceneShots];
  await meter(clientId, "higgsfield", shots.map((s) => s.model), "generate-campaign");
  shots.forEach((s, i) => { if (s.error) warnings.push(`image ${i + 1}: ${s.error.slice(0, 120)}`); });

  // ── 2. CUT OUT. The masthead and section-1 subjects have to sit ON the yellow disc, so the background
  // must actually be gone - a "plain grey studio background" in the prompt is not the same as transparency,
  // and compositing a grey rectangle onto the brand's signature shape is exactly the sticker look we are
  // avoiding. If the cut fails we fall back to the raw frame rather than dropping the creative entirely.
  const cuts = await Promise.all(cutShots.map(async (s) => {
    if (!s.url) return null;
    const r = await removeBackground(s.url);
    if (!r.url) { warnings.push(`background removal failed, using the raw frame: ${r.error}`); return s.url; }
    return r.url;
  }));
  await meter(clientId, "fal", cuts.filter(Boolean).map(() => REMBG_MODEL), "cut-out");

  // ── 3. RENDER + STORE. Master encoding (lossless): Webflow re-encodes to AVIF on its own, so handing it a
  // pre-compressed file would just be double compression for no benefit.
  const out: Creative[] = [];

  const store = async (html: string, w: number, h: number, kind: Creative["kind"], index: number, prompt: string, src: string | null) => {
    try {
      const { png } = await renderPng({ html, width: w, height: h, scale: 1 });
      const enc = await encodeForDelivery(png, "master");
      const url = await putBytes(enc.buf, `studio/${clientId}/${kind}`, enc.ext, enc.mime);
      out.push({ kind, index, url, bytes: enc.bytes, width: w, height: h, imagePrompt: prompt, sourceImage: src });
    } catch (e) {
      // LOG THE WHOLE THING. Catching a render failure into a 160-character warning meant that when the
      // browser died in production there was NOTHING in the Vercel log to read - the stack, which is the only
      // thing that identifies why Chromium fell over, had been thrown away by my own error handling. A
      // swallowed error is worse than a crash: a crash at least tells you something.
      console.error(`[studio-campaign] ${kind} ${index + 1} failed to render`, e);
      const msg = String((e as Error)?.message || e).slice(0, 160);
      warnings.push(`${kind} ${index + 1} did not render: ${msg}`);
      out.push({ kind, index, url: "", bytes: 0, width: w, height: h, imagePrompt: prompt, sourceImage: src, error: msg });
    }
  };

  if (cuts[0]) {
    await store(renderMomoMasthead({ subject: cuts[0], logoUrl: logo }, fonts), 1080, 811, "masthead", 0, cutoutPrompts[0], cutShots[0].url);
  } else warnings.push("The masthead subject did not generate, so the masthead was skipped.");

  if (cuts[1]) {
    await store(renderMomoSection1({ subject: cuts[1], deals: plan.section1.deals, logoUrl: logo }, fonts), 1239, 1080, "section1", 0, cutoutPrompts[1], cutShots[1].url);
  } else warnings.push("The section 1 subject did not generate, so section 1 was skipped.");

  for (let i = 0; i < plan.sliders.length; i++) {
    const s = plan.sliders[i];
    const img = sceneShots[i]?.url;
    if (!img) { warnings.push(`Slider ${i + 1}'s scene did not generate, so it was skipped.`); continue; }
    await store(
      renderMomoSlider({ image: img, headline1: s.headline1, headline2: s.headline2, deal: s.deal, logoUrl: logo, complianceText: compliance }, fonts),
      1080, 1080, "slider", i, scenePrompts[i], img,
    );
  }

  return { creatives: out, warnings };
}

// The logo the templates want: the horizontal full-colour lockup, which is what the reference creatives use.
// Never the mono or the stacked variant - those are for contexts this canvas is not.
function pickLogo(logos?: { name: string; url: string }[]): string {
  if (!logos?.length) return "";
  const score = (n: string) => {
    const s = n.toLowerCase();
    let v = 0;
    if (/mono|black|white|grey|gray/.test(s)) v -= 5;
    if (/stack|vertical/.test(s)) v -= 3;
    if (/horizontal|primary|full|colour|color/.test(s)) v += 3;
    if (/momo/.test(s)) v += 2;
    return v;
  };
  return [...logos].sort((a, b) => score(b.name) - score(a.name))[0].url;
}

async function meter(clientId: string, provider: string, models: string[], action: string): Promise<void> {
  const counts = new Map<string, number>();
  for (const m of models) counts.set(m, (counts.get(m) || 0) + 1);
  await Promise.all([...counts].map(([model, count]) =>
    recordUsage({ clientId, provider, model, unit: "image", action, count }).catch(() => {}),
  ));
}
