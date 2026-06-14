import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt } from "@/lib/realism";
import { generateHero, createFaceElement, generateVariation, trainSoul, soulStatus } from "@/lib/vendors/higgsfield";

const CANDIDATE_COUNT = 6;

// Stage 2 (Photoshoot) — same-person coverage from the CHOSEN look. FACE_COVERAGE is the
// angle/expression/close-up set that trains a faithful identity; sceneShots() places the
// same face in the brief's required location. Each is locked to the chosen face via the
// Element, so every frame is ONE consistent identity.
const FACE_COVERAGE = [
  "the same exact person, three-quarter left angle, soft natural daylight, calm neutral expression, identical face and wardrobe, photorealistic portrait",
  "the same exact person, three-quarter right angle, warm indoor lighting, subtle genuine smile, identical face and wardrobe, photorealistic portrait",
  "the same exact person, near-profile side view, gentle side lighting, relaxed expression, identical face and wardrobe, photorealistic portrait",
  "the same exact person, tight beauty close-up of the face, sharp catchlight in the eyes, natural skin texture with visible pores and fine detail, identical features, photorealistic",
  "the same exact person, close-up on the lower face and lips, soft natural light, realistic skin and lip detail, identical features, photorealistic",
  "the same exact person, straight-on at eye level, looking directly into the lens, warm authentic smile, identical face and wardrobe, photorealistic portrait",
];

// 2 shots of the same person in the brief's location (the money shots you'll actually use).
function sceneShots(setting?: string): string[] {
  const loc = (setting || "").trim() || "a clean editorial studio backdrop";
  return [
    `the same exact person in ${loc}, natural medium shot with full scene context, face clearly visible and identical, photorealistic editorial photo`,
    `the same exact person in ${loc}, candid wider lifestyle shot, environment in frame, identical face, photorealistic`,
  ];
}

// STAGE 1 — Casting. Generate CANDIDATE_COUNT distinct looks from the brief so the
// producer can choose the face. Each is an independent generation (different person),
// persisted as it lands for a live progress board. Images are free on Ultra.
export const generateCandidates = inngest.createFunction(
  {
    id: "generate-references",
    name: "Generate casting looks",
    retries: 1,
    triggers: [{ event: "influencer/generate.references" }],
  },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };

    const { prompt, negative } = buildIdentityPrompt(inf.persona);
    const persona = { ...inf.persona, identity_prompt: prompt, identity_negative: negative, candidates_expected: CANDIDATE_COUNT };
    await step.run("save-prompt", () => updateInfluencer(influencerId, { persona }));

    try {
      // Higgsfield generates serially per account, so we generate one look per durable
      // step and persist it immediately — the UI shows looks appear one-by-one.
      const candidates: { url: string }[] = [];
      for (let i = 0; i < CANDIDATE_COUNT; i++) {
        const hero = await step.run(`cast-${i}`, () => generateHero(prompt, "gpt_image_2", "9:16"));
        if (hero.url && !candidates.some((c) => c.url === hero.url)) {
          candidates.push({ url: hero.url });
          await step.run(`save-cast-${i}`, () => updateInfluencer(influencerId, { persona: { ...persona, candidates: [...candidates] } }));
        }
      }
      if (!candidates.length) throw new Error("no candidate looks generated");
      await step.run("save-candidates", () =>
        updateInfluencer(influencerId, { status: "cast_ready", persona: { ...persona, candidates } }),
      );
      return { ok: true, candidates: candidates.length };
    } catch (e) {
      await step.run("mark-failed", () =>
        updateInfluencer(influencerId, { status: "gen_failed", persona: { ...persona, gen_error: String((e as Error)?.message || e).slice(0, 300) } }),
      );
      throw e;
    }
  },
);

// STAGE 2 — Build the identity set from the chosen look. Lock the chosen face as an
// Element, then shoot the multi-angle/close-up coverage. Frames persist as they land.
export const buildIdentity = inngest.createFunction(
  {
    id: "build-identity",
    name: "Build identity set from chosen look",
    retries: 1,
    triggers: [{ event: "influencer/build.identity" }],
  },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const chosenUrl = String(event.data.chosenUrl || "");
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    if (!chosenUrl) {
      await step.run("no-choice", () => updateInfluencer(influencerId, { status: "cast_ready" }));
      return { error: "no chosen look" };
    }

    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const prompt = (persona.identity_prompt as string) || buildIdentityPrompt(inf.persona).prompt;
    const coverage = [...FACE_COVERAGE, ...sceneShots(persona.setting as string | undefined)];
    const expected = coverage.length + 1;

    try {
      // Lock the chosen face as a reusable Element (import the URL → media reference).
      const elementId = await step.run("element", () => createFaceElement(null, chosenUrl, `${inf.name}-${influencerId.slice(0, 8)}`));

      const frames: { url: string; hero?: boolean }[] = [{ url: chosenUrl, hero: true }];
      await step.run("save-hero", () =>
        updateInfluencer(influencerId, { look_refs: [...frames], persona: { ...persona, hero_url: chosenUrl, element_id: elementId, frames_expected: expected } }),
      );

      // One coverage frame per durable step, persisted as it lands (UI fills frame-by-frame).
      for (let i = 0; i < coverage.length; i++) {
        const url = await step.run(`variation-${i}`, () => generateVariation(elementId, prompt, coverage[i], "gpt_image_2", "9:16"));
        if (url && !frames.some((f) => f.url === url)) {
          frames.push({ url });
          await step.run(`save-${i}`, () => updateInfluencer(influencerId, { look_refs: [...frames] }));
        }
      }

      await step.run("save-frames", () =>
        updateInfluencer(influencerId, {
          look_refs: frames,
          status: "frames_ready",
          persona: { ...persona, hero_url: chosenUrl, element_id: elementId, frames_expected: expected },
        }),
      );
      return { ok: true, frames: frames.length, element: !!elementId };
    } catch (e) {
      await step.run("mark-failed", () =>
        updateInfluencer(influencerId, { status: "gen_failed", persona: { ...persona, gen_error: String((e as Error)?.message || e).slice(0, 300) } }),
      );
      throw e;
    }
  },
);

// STAGE 3 — Train a reusable Soul from selected frames (~10 min). Uses step.sleep so
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
