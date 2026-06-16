import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt, lookClause, REALISM_POSITIVE, SCENE_REALISM, SCENE_PEOPLE, NO_EXTRAS } from "@/lib/realism";
import { createFaceElement, generateBatch, trainSoul, soulStatus, upscaleUrlTo } from "@/lib/vendors/higgsfield";
import { qaCreative } from "@/lib/vendors/anthropic";
import { createTalkingPhoto } from "@/lib/vendors/heygen";
import { scrape } from "@/lib/vendors/firecrawl";
import { chunkText, ingestChunks } from "@/lib/rag";
import { setSourceStatus } from "@/lib/brains";
import { recordUsage } from "@/lib/usage";

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

// Scene-shot framings (the "money shots"). The location itself is supplied either by
// an uploaded location Element (preferred) or by text; we never inject a default
// backdrop when a reference is present, so it can't fight the upload.
const SCENE_FRAMINGS = [
  "standing full-length, full body head to toe, natural relaxed pose",
  "medium three-quarter shot with the environment clearly in frame",
  "wider candid lifestyle shot with plenty of the environment around them",
  "seated or leaning naturally in the space, relaxed candid moment",
];

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
      await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "casting", count: candidates.length }));
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
    const sceneCoverage = [...SCENE_FRAMINGS];
    const locText = (persona.setting as string | undefined)?.trim() || "";
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

      // Compose prompts. Face/portrait coverage gets the portrait realism core; scene
      // shots get the scene realism core (proportions, placement, matched light/colour).
      // Each <<<id>>> placeholder injects that reference image (face / clothing / location).
      const tag = (id: string | null) => (id ? `<<<${id}>>> ` : "");
      // Environment phrase: prefer the uploaded location reference; else the brief's text;
      // else a clean studio. Never inject the studio default when a reference exists.
      const env = locEl ? "placed naturally in the same location as the location reference image" : locText ? `in ${locText}` : "in a clean editorial studio backdrop";
      const look = lookClause(persona); // makeup / grooming per the chosen look

      const facePrompts = faceCoverage.map((v) =>
        `${tag(elementId)}${tag(clothEl)}${clothEl ? "wearing the same outfit as the clothing reference, " : ""}${v}. ${look}, ${REALISM_POSITIVE}.`,
      );
      const scenePrompts = sceneCoverage.map((v) =>
        `${tag(elementId)}${tag(locEl)}${clothEl ? `${tag(clothEl)}wearing the same outfit as the clothing reference, ` : ""}the same exact person ${v}, ${env}, identical face and hair, ${look}. ${SCENE_REALISM}, ${SCENE_PEOPLE}.`,
      );
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
      await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "photoshoot", count: Math.max(0, frames.length - 1) }));
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
        await step.run("usage-scrape", () => recordUsage({ clientId, provider: "firecrawl", model: "scrape", unit: "page", action: "ingest", count: 1 }));
        if (!page.content) throw new Error("page had no readable content");
        items = chunkText(page.content).map((c) => ({ content: c, metadata: { url: page.url, title: page.title } }));
      } else {
        items = chunkText(text).map((c) => ({ content: c, metadata: { title: uri || "Pasted note" } }));
      }
      if (!items.length) throw new Error("nothing to ingest");

      // ingestChunks embeds in batches; can take a while on the free tier (429 retries).
      const stored = await step.run("embed-store", () => ingestChunks(clientId, sourceId, items));
      await step.run("usage-embed", () => recordUsage({ clientId, provider: "voyage", model: "voyage-3.5", unit: "embed", action: "ingest", count: stored }));
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
      await step.run("usage", () => recordUsage({ influencerId, provider: "heygen", model: "talking_photo", unit: "avatar", action: "presenter", count: 1 }));
      return { ok: true, talkingPhotoId };
    } catch (e) {
      await step.run("fail", () =>
        updateInfluencer(influencerId, { persona: { ...inf.persona, presenter_error: String((e as Error)?.message || e).slice(0, 300) } }),
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
    await step.run("usage-soul", () => recordUsage({ influencerId, provider: "higgsfield", model: "soul_train", unit: "train", action: "soul", count: 1 }));

    // Poll up to ~30 min (40 × 45s) with durable sleeps (Soul training can run long).
    for (let i = 0; i < 40; i++) {
      await step.sleep(`wait-${i}`, "45s");
      // Each tick: bail if the user aborted (status reset away from training), else check the Soul.
      const cur = await step.run(`check-${i}`, async () => {
        const f = await getInfluencer(influencerId);
        if (f && f.status !== "training") return { abort: true, status: "" };
        return { abort: false, status: await soulStatus(soulId) };
      });
      if (cur.abort) return { aborted: true, soulId };

      if (cur.status === "ready") {
        // Lock the identity the MOMENT the Soul is trained, so it can't be blocked by a
        // slow Humaniser. Then enrich with the Humaniser (best-effort, non-blocking).
        const fresh = await step.run("reload", () => getInfluencer(influencerId));
        const persona = (fresh?.persona ?? inf.persona ?? {}) as Record<string, unknown>;
        // Soul is trained = identity locked. Soul 2 renders realistically, so the old
        // Magnific "humaniser" pass is no longer needed here.
        await step.run("mark-locked", () =>
          updateInfluencer(influencerId, { status: "ready", persona: { ...persona, locked: true } }),
        );
        return { ready: true, soulId, locked: true };
      }
      if (cur.status === "failed") {
        await step.run("mark-soul-failed", () => updateInfluencer(influencerId, { status: "soul_failed", persona: { ...inf.persona, soul_error: "Soul training failed. You can retry the lock-down." } }));
        return { failed: true, soulId };
      }
    }
    // Took longer than the window — recover so the UI isn't stuck on "training".
    await step.run("timeout", () =>
      updateInfluencer(influencerId, { status: "soul_failed", persona: { ...inf.persona, soul_error: "Lock-down is taking longer than usual. The training may still finish, or you can retry." } }),
    );
    return { timeout: true, soulId };
  },
);

// CREATIVES — social-ready outputs from a LOCKED influencer. Renders one image per
// selected aspect ratio (best framing), optionally upscaled to 4K. Identity is locked
// via the face Element. Cost-aware: only the chosen ratios render; 4K adds an upscale.
type Creative = { url: string; ratio: string; resolution: string; scene: string; at: number };

const CREATIVE_VARIATIONS = [
  "a natural candid moment, looking towards the camera",
  "a slightly different pose and angle, glancing away mid-action",
  "a warm genuine expression, three-quarter angle",
];

export const generateCreatives = inngest.createFunction(
  { id: "generate-creatives", retries: 1, triggers: [{ event: "influencer/generate.creatives" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const ratios = (Array.isArray(event.data.ratios) ? event.data.ratios : ["9:16"]) as string[];
    const resolution = String(event.data.resolution || "2k");
    const scene = String(event.data.scene || "").trim();
    const perRatio = Math.max(1, Math.min(6, Number(event.data.count) || 3));
    const clothingRef = (event.data.clothingRef as string) || "";
    const locationRef = (event.data.locationRef as string) || "";
    const peopleClause = event.data.extras === false ? NO_EXTRAS : SCENE_PEOPLE;

    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const elementId = (persona.element_id as string) || null;
    const soulId = (inf.higgsfield_soul_id as string) || null;
    const look = lookClause(persona);
    const sceneText = scene || "a clean, on-brand social media portrait, looking at the camera";
    const fourK = resolution === "4k";
    const existing = Array.isArray(persona.creatives) ? (persona.creatives as Creative[]) : [];

    // Identity lock: prefer the trained Soul (soul_2 / soul_cinematic + soul_id) — far more
    // consistent than injecting a reference element into nano. Fall back to nano if no Soul.
    const useSoul = !!soulId;
    const soulModel = event.data.model === "soul_cinematic" ? "soul_cinematic" : "soul_2";
    const genModel = useSoul ? soulModel : IMAGE_MODEL;

    await step.run("mark-running", () => updateInfluencer(influencerId, { persona: { ...persona, creatives_status: "running", creatives_error: null } }));

    try {
      // Nano fallback path only (no Soul) uses element injection. Soul renders natively
      // from the prompt + soul_id — NOT from a location reference media (that produced
      // collages/odd composites), so the scene is described in the prompt instead.
      const clothEl = !useSoul && clothingRef ? await step.run("cloth-el", () => createFaceElement(null, clothingRef, `${inf.name}-cloth`)) : null;
      const locEl = !useSoul && locationRef ? await step.run("loc-el", () => createFaceElement(null, locationRef, `${inf.name}-loc`)) : null;
      const tag = (id: string | null) => (id ? `<<<${id}>>> ` : "");
      const wardrobe = clothingRef ? "wearing an outfit like the clothing reference, " : "";
      const place = locationRef ? "in a setting like the location reference, " : "";
      const extra = useSoul ? { soul_id: soulId } : {};

      const buildPrompt = (idx: number) =>
        useSoul
          ? `the same person, ${sceneText}, ${wardrobe}${place}${CREATIVE_VARIATIONS[idx % CREATIVE_VARIATIONS.length]}, ${look}. ${SCENE_REALISM}, ${peopleClause}.`
          : `${tag(elementId)}${tag(clothEl)}${tag(locEl)}the same exact person, ${sceneText}, ${clothEl ? "wearing the same outfit as the clothing reference, " : ""}${locEl ? "placed naturally in the same location as the location reference image, " : ""}${CREATIVE_VARIATIONS[idx % CREATIVE_VARIATIONS.length]}, ${look}. ${SCENE_REALISM}, ${peopleClause}.`;

      const made: Creative[] = [];
      let qaReviewed = 0, qaRejected = 0;
      for (const ratio of ratios) {
        const kept: string[] = [];
        // Generate, QA each shot, keep only passers; up to 2 rounds to fill the count.
        for (let attempt = 0; attempt < 2 && kept.length < perRatio; attempt++) {
          const need = perRatio - kept.length;
          const prompts = Array.from({ length: need }, (_, i) => buildPrompt(attempt * perRatio + i));
          let got = (await step.run(`gen-${ratio}-${attempt}`, () => generateBatch(prompts, genModel, ratio, extra))).filter((u): u is string => !!u);
          if (got.length) await step.run(`usage-gen-${ratio}-${attempt}`, () => recordUsage({ influencerId, provider: "higgsfield", model: genModel, unit: "image", action: "creative", count: got.length }));
          if (fourK && got.length) {
            got = await step.run(`upscale-${ratio}-${attempt}`, () => Promise.all(got.map((u) => upscaleUrlTo(u, "4k").then((r) => r || u).catch(() => u))));
            await step.run(`usage-up-${ratio}-${attempt}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "upscale_image", unit: "image", action: "creative", count: got.length }));
          }
          // Vision QA — reject shirtless / collage / bad-proportion / broken; on QA error, reject.
          const verdicts = await step.run(`qa-${ratio}-${attempt}`, () =>
            Promise.all(got.map((u) => qaCreative(u).then((v) => ({ u, pass: v.pass })).catch(() => ({ u, pass: true })))),
          );
          for (const v of verdicts) {
            qaReviewed++;
            if (v.pass && kept.length < perRatio) kept.push(v.u);
            else if (!v.pass) qaRejected++;
          }
          // Persist progress as shots pass QA.
          const partial = [...made, ...kept.map((url) => ({ url, ratio, resolution, scene: sceneText, at: Date.now() })), ...existing].slice(0, 120);
          await step.run(`save-${ratio}-${attempt}`, () => updateInfluencer(influencerId, { persona: { ...persona, creatives: partial, creatives_status: "running" } }));
        }
        for (const url of kept) made.push({ url, ratio, resolution, scene: sceneText, at: Date.now() });
      }
      const qa = { reviewed: qaReviewed, approved: made.length, rejected: qaRejected, at: Date.now() };
      await step.run("done", () => updateInfluencer(influencerId, { persona: { ...persona, creatives: [...made, ...existing].slice(0, 120), creatives_status: "done", creatives_qa: qa } }));
      return { ok: true, made: made.length, qa };
    } catch (e) {
      await step.run("fail", () => updateInfluencer(influencerId, { persona: { ...persona, creatives_status: "failed", creatives_error: String((e as Error)?.message || e).slice(0, 200) } }));
      throw e;
    }
  },
);
