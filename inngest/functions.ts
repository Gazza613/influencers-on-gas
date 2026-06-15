import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt } from "@/lib/realism";
import { createFaceElement, generateBatch, trainSoul, soulStatus } from "@/lib/vendors/higgsfield";
import { createTalkingPhoto } from "@/lib/vendors/heygen";
import { enhanceImage } from "@/lib/vendors/magnific";
import { scrape } from "@/lib/vendors/firecrawl";
import { chunkText, ingestChunks } from "@/lib/rag";
import { setSourceStatus } from "@/lib/brains";

const CANDIDATE_COUNT = 6;

// Nano Banana Pro: 1 credit/image (vs gpt_image_2's 4), far faster, and supports the
// <<<element>>> identity lock we need for consistent photoshoot frames.
const IMAGE_MODEL = "nano_banana_2";

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
      // gpt_image_2 is ~150s PER IMAGE, so generating all 6 CONCURRENTLY collapses casting
      // to ~one image's wall-clock (~2.5 min) instead of 6× (~15 min).
      const urls = await step.run("cast", () => generateBatch(Array(CANDIDATE_COUNT).fill(prompt), IMAGE_MODEL, "9:16"));
      const candidates = [...new Set(urls.filter((u): u is string => !!u))].map((url) => ({ url }));
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
    const locationRef = (event.data.locationRef as string) || "";
    const clothingRef = (event.data.clothingRef as string) || "";
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    if (!chosenUrl) {
      await step.run("no-choice", () => updateInfluencer(influencerId, { status: "cast_ready" }));
      return { error: "no chosen look" };
    }

    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const prompt = (persona.identity_prompt as string) || buildIdentityPrompt(inf.persona).prompt;
    const faceCoverage = [...FACE_COVERAGE];
    const sceneCoverage = sceneShots(persona.setting as string | undefined);
    const expected = faceCoverage.length + sceneCoverage.length + 1;

    try {
      // Lock the chosen face as a reusable Element (import the URL → media reference).
      const elementId = await step.run("element", () => createFaceElement(null, chosenUrl, `${inf.name}-${influencerId.slice(0, 8)}`));
      // Optional uploaded references → their own Elements (steer wardrobe + location).
      const clothEl = clothingRef ? await step.run("cloth-element", () => createFaceElement(null, clothingRef, `${inf.name}-cloth`)) : null;
      const locEl = locationRef ? await step.run("loc-element", () => createFaceElement(null, locationRef, `${inf.name}-loc`)) : null;

      const frames: { url: string; hero?: boolean }[] = [{ url: chosenUrl, hero: true }];
      await step.run("save-hero", () =>
        updateInfluencer(influencerId, { look_refs: [...frames], persona: { ...persona, hero_url: chosenUrl, element_id: elementId, frames_expected: expected } }),
      );

      // Compose prompts: face element always; clothing element on face-coverage; location
      // element on scene shots. Each <<<id>>> placeholder injects that reference image.
      const tag = (id: string | null) => (id ? `<<<${id}>>> ` : "");
      const facePrompts = faceCoverage.map((v) => `${tag(elementId)}${tag(clothEl)}${clothEl ? "wearing the same outfit as the clothing reference, " : ""}${v}`);
      const scenePrompts = sceneCoverage.map((v) => `${tag(elementId)}${tag(locEl)}${locEl ? "in the same location as the location reference, " : ""}${v}`);
      const vPrompts = elementId ? [...facePrompts, ...scenePrompts] : [...faceCoverage, ...sceneCoverage].map((v) => `${prompt}. ${v}`);
      const urls = await step.run("variations", () => generateBatch(vPrompts, IMAGE_MODEL, "9:16"));
      for (const url of urls) if (url && !frames.some((f) => f.url === url)) frames.push({ url });

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

// BRAIN INGEST — pull a knowledge source into a client's brain: scrape (website) or use
// pasted text, chunk it, embed + store (all scoped to client_id). Durable; survives the
// slow free-tier embedding limit.
export const ingestSource = inngest.createFunction(
  { id: "ingest-source", retries: 1, triggers: [{ event: "brain/ingest.source" }] },
  async ({ event, step }) => {
    const sourceId = String(event.data.sourceId);
    const clientId = String(event.data.clientId);
    const type = String(event.data.type || "text");
    const uri = String(event.data.uri || "");
    const text = String(event.data.text || "");

    try {
      let items: { content: string; metadata?: Record<string, unknown> }[];
      if (type === "website") {
        const page = await step.run("scrape", () => scrape(uri));
        if (!page.content) throw new Error("page had no readable content");
        items = chunkText(page.content).map((c) => ({ content: c, metadata: { url: page.url, title: page.title } }));
      } else {
        items = chunkText(text).map((c) => ({ content: c, metadata: { title: uri || "Pasted note" } }));
      }
      if (!items.length) throw new Error("nothing to ingest");

      // ingestChunks embeds in batches; can take a while on the free tier (429 retries).
      const stored = await step.run("embed-store", () => ingestChunks(clientId, sourceId, items));
      await step.run("mark-indexed", () => setSourceStatus(sourceId, "indexed"));
      return { ok: true, chunks: stored };
    } catch (e) {
      await step.run("mark-failed", () => setSourceStatus(sourceId, "failed"));
      throw e;
    }
  },
);

// PRESENTER — turn the chosen hero into a HeyGen Talking Photo (the talking a-roll
// avatar). Fast; stored as heygen_avatar_id for the produce pipeline to drive later.
export const createPresenter = inngest.createFunction(
  { id: "create-presenter", retries: 1, triggers: [{ event: "influencer/create.presenter" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    const refs = (inf.look_refs as { url: string; hero?: boolean }[]) || [];
    const hero = (inf.persona as { hero_url?: string })?.hero_url || refs.find((r) => r.hero)?.url || refs[0]?.url;
    if (!hero) return { error: "no hero image yet" };

    try {
      const talkingPhotoId = await step.run("talking-photo", () => createTalkingPhoto(hero));
      await step.run("save", () =>
        updateInfluencer(influencerId, { heygen_avatar_id: talkingPhotoId, persona: { ...inf.persona, presenter_error: null } }),
      );
      return { ok: true, talkingPhotoId };
    } catch (e) {
      await step.run("fail", () =>
        updateInfluencer(influencerId, { persona: { ...inf.persona, presenter_error: String((e as Error)?.message || e).slice(0, 300) } }),
      );
      throw e;
    }
  },
);

// REALISM — run the hero through Magnific for skin realism. Stores the enhanced URL
// as persona.hero_realism_url (kept alongside the original).
export const enhanceRealism = inngest.createFunction(
  { id: "enhance-realism", retries: 1, triggers: [{ event: "influencer/enhance.realism" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    const refs = (inf.look_refs as { url: string; hero?: boolean }[]) || [];
    const hero = (inf.persona as { hero_url?: string })?.hero_url || refs.find((r) => r.hero)?.url || refs[0]?.url;
    if (!hero) return { error: "no hero image yet" };

    try {
      const enhanced = await step.run("enhance", () => enhanceImage(hero));
      await step.run("save", () =>
        updateInfluencer(influencerId, { persona: { ...inf.persona, hero_realism_url: enhanced, realism_error: null } }),
      );
      return { ok: true, enhanced };
    } catch (e) {
      await step.run("fail", () =>
        updateInfluencer(influencerId, { persona: { ...inf.persona, realism_error: String((e as Error)?.message || e).slice(0, 300) } }),
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
        // Lock Down step 2: run the Humaniser on the hero, then mark the identity LOCKED
        // and ready for video production.
        const fresh = await step.run("reload", () => getInfluencer(influencerId));
        const persona = (fresh?.persona ?? inf.persona ?? {}) as Record<string, unknown>;
        const refs = (fresh?.look_refs as { url: string; hero?: boolean }[]) || [];
        const hero = (persona.hero_url as string) || refs.find((r) => r.hero)?.url || refs[0]?.url;
        let realism = (persona.hero_realism_url as string) || null;
        if (hero && !realism) {
          try { realism = await step.run("humanise", () => enhanceImage(hero)); } catch { /* non-fatal: lock anyway */ }
        }
        await step.run("mark-locked", () =>
          updateInfluencer(influencerId, { status: "ready", persona: { ...persona, hero_realism_url: realism, locked: true } }),
        );
        return { ready: true, soulId, locked: true };
      }
      if (status === "failed") {
        await step.run("mark-soul-failed", () => updateInfluencer(influencerId, { status: "soul_failed" }));
        return { failed: true, soulId };
      }
    }
    return { timeout: true, soulId };
  },
);
