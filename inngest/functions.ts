import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt } from "@/lib/realism";
import { generateHero, createFaceElement, generateVariation, trainSoul, soulStatus } from "@/lib/vendors/higgsfield";

// Same-person variations (angles + expressions). Each is locked to the hero face via
// the Element, so all frames are ONE consistent identity — required for a faithful Soul.
// Wardrobe + setting are held constant (only angle/expression/light vary).
const IDENTITY_VARIATIONS = [
  "the same exact person, three-quarter left angle, soft natural daylight, calm neutral expression, identical face, wardrobe and setting, photorealistic portrait",
  "the same exact person, three-quarter right angle, warm indoor lighting, subtle genuine smile, identical face, wardrobe and setting, photorealistic portrait",
  "the same exact person, near-profile side view, gentle side lighting, relaxed expression, identical face, wardrobe and setting, photorealistic portrait",
  "the same exact person, straight-on at eye level, looking directly into the lens, warm authentic smile, identical face, wardrobe and setting, photorealistic portrait",
  "the same exact person, slight low angle, soft golden-hour light, composed confident expression, identical face, wardrobe and setting, photorealistic portrait",
];

// Build the hyper-realism prompt + generate ONE hero face, then 5 same-person
// variations locked to it via a face Element (6 consistent frames; need 5+ for Soul).
// Images are unlimited on Ultra, so retries are free.
export const generateReferences = inngest.createFunction(
  {
    id: "generate-references",
    name: "Generate influencer reference frames",
    retries: 1,
    triggers: [{ event: "influencer/generate.references" }],
  },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };

    const { prompt, negative } = buildIdentityPrompt(inf.persona);
    await step.run("save-prompt", () =>
      updateInfluencer(influencerId, { persona: { ...inf.persona, identity_prompt: prompt, identity_negative: negative } }),
    );

    try {
      // 1. Hero face (its own step — one generation, safely within the function limit).
      const hero = await step.run("hero", () => generateHero(prompt, "gpt_image_2", "9:16"));
      if (!hero.url) throw new Error("hero generation failed");
      // Persist the hero immediately so the UI shows the first frame + a real progress bar.
      await step.run("save-hero", () =>
        updateInfluencer(influencerId, {
          look_refs: [{ url: hero.url, hero: true }],
          persona: { ...inf.persona, identity_prompt: prompt, identity_negative: negative, hero_url: hero.url, frames_expected: IDENTITY_VARIATIONS.length + 1 },
        }),
      );

      // 2. Face Element from the hero → locks every variation to this identity.
      const elementId = await step.run("element", () =>
        createFaceElement(hero.jobId, hero.url as string, `${inf.name}-${influencerId.slice(0, 8)}`),
      );

      // 3. Same-person variations — each its own durable step, persisted as it lands.
      const frames: { url: string; hero?: boolean }[] = [{ url: hero.url, hero: true }];
      for (let i = 0; i < IDENTITY_VARIATIONS.length; i++) {
        const url = await step.run(`variation-${i}`, () => generateVariation(elementId, prompt, IDENTITY_VARIATIONS[i], "gpt_image_2", "9:16"));
        if (url && !frames.some((f) => f.url === url)) {
          frames.push({ url });
          await step.run(`save-${i}`, () => updateInfluencer(influencerId, { look_refs: [...frames] }));
        }
      }

      await step.run("save-frames", () =>
        updateInfluencer(influencerId, {
          look_refs: frames,
          status: "frames_ready",
          persona: { ...inf.persona, identity_prompt: prompt, identity_negative: negative, element_id: elementId, hero_url: hero.url, frames_expected: IDENTITY_VARIATIONS.length + 1 },
        }),
      );
      return { ok: true, frames: frames.length, element: !!elementId };
    } catch (e) {
      await step.run("mark-failed", () =>
        updateInfluencer(influencerId, {
          status: "gen_failed",
          persona: { ...inf.persona, identity_prompt: prompt, identity_negative: negative, gen_error: String((e as Error)?.message || e).slice(0, 300) },
        }),
      );
      throw e;
    }
  },
);

// Train a reusable Soul from selected reference frames (~10 min). Uses step.sleep so
// the function is durably suspended between status polls (survives function timeouts).
export const trainSoulJob = inngest.createFunction(
  { id: "train-soul", retries: 0, triggers: [{ event: "influencer/train.soul" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const images = (event.data.images as string[]) || [];
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    if (images.length < 5) {
      await step.run("too-few", () => updateInfluencer(influencerId, { status: "frames_ready" }));
      return { error: "need at least 5 images" };
    }

    let soulId: string;
    try {
      soulId = await step.run("launch-train", () => trainSoul({ name: inf.name, images }));
    } catch (e) {
      await step.run("train-failed", () =>
        updateInfluencer(influencerId, { status: "soul_failed", persona: { ...inf.persona, soul_error: String((e as Error)?.message || e).slice(0, 300) } }),
      );
      throw e;
    }
    await step.run("save-soul-id", () => updateInfluencer(influencerId, { higgsfield_soul_id: soulId, status: "training" }));

    // Poll up to ~16 min (32 × 30s) with durable sleeps.
    for (let i = 0; i < 32; i++) {
      await step.sleep(`wait-${i}`, "30s");
      const status = await step.run(`status-${i}`, () => soulStatus(soulId));
      if (status === "ready") {
        await step.run("mark-ready", () => updateInfluencer(influencerId, { status: "ready" }));
        return { ready: true, soulId };
      }
      if (status === "failed") {
        await step.run("mark-soul-failed", () => updateInfluencer(influencerId, { status: "soul_failed" }));
        return { failed: true, soulId };
      }
    }
    return { timeout: true, soulId };
  },
);
