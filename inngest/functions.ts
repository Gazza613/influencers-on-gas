import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt, lookClause, REALISM_POSITIVE, SCENE_REALISM, SCENE_PEOPLE, NO_EXTRAS, UGC_REALISM, CINEMATIC_REALISM } from "@/lib/realism";
import { createFaceElement, generateBatch, trainSoul, soulStatus, upscaleUrlTo, filterLoadable, importMediaUrl } from "@/lib/vendors/higgsfield";
import { rehostToBlob } from "@/lib/blob";
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

// Stage 2 (Photoshoot) builds the Soul TRAINING SET from the chosen face. Recipe follows
// the Higgsfield Soul photo guide: 8 to 12 sharp, single-person frames that vary ANGLE,
// LIGHTING, EXPRESSION and DISTANCE while keeping ONE clear, consistent face. We do NOT
// vary outfit/scene to extremes (the guide warns against costumes): a Soul captures the
// FACE, and wardrobe + location are then driven by the prompt at generation time. Clean,
// neutral backgrounds keep the training focused on identity (no scene to clone later).
type TrainingLook = { frame: string; light: string; wardrobe: string; full?: boolean };
const TRAINING_LOOKS: TrainingLook[] = [
  { frame: "tight head-shot close-up, front on, neutral relaxed expression, sharp eye catchlights and natural skin pores", light: "soft even indoor light", wardrobe: "a plain crew-neck t-shirt" },
  { frame: "head-and-shoulders portrait, three-quarter left angle, faint natural smile", light: "soft daylight from a window", wardrobe: "a casual button shirt" },
  { frame: "head-and-shoulders portrait, three-quarter right angle, mid-conversation talking expression", light: "warm indoor light", wardrobe: "a relaxed knit top" },
  { frame: "head-shot, chin slightly down looking up into the lens, calm", light: "soft diffused studio light", wardrobe: "a plain t-shirt" },
  { frame: "head-shot, chin slightly raised, relaxed neutral", light: "bright natural daylight", wardrobe: "a simple casual top" },
  { frame: "clean side profile of the face, neutral", light: "directional studio key light", wardrobe: "a plain top" },
  { frame: "head-and-shoulders, straight on into the lens, warm genuine smile", light: "soft golden-hour light", wardrobe: "a smart-casual top" },
  { frame: "head-and-shoulders, one hand raised naturally near the jaw, the hand and fingers clearly visible and correctly formed", light: "soft daylight", wardrobe: "a casual top" },
  { frame: "three-quarter BACK view over the shoulder, face turned partly back to camera, showing the back of the head, hair and shoulders", light: "soft even light", wardrobe: "a plain top" },
  { frame: "waist-up medium shot, front on, easy natural expression", light: "even soft daylight", wardrobe: "an everyday casual outfit", full: true },
  { frame: "full-length head to toe, standing in a relaxed natural pose", light: "even studio light", wardrobe: "a simple casual outfit", full: true },
];

// STAGE 1, Casting. Generate CANDIDATE_COUNT distinct looks from the brief so the
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
      const produced = [...new Set(urls.filter((u): u is string => !!u))];
      // Meter what Higgsfield produced (billed), BEFORE dropping any that fail to load.
      if (produced.length) await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "casting", count: produced.length }));
      // Only keep looks whose image actually loads (drops broken/expired URLs).
      const valid = await step.run("validate", () => filterLoadable(produced));
      const candidates = valid.map((url) => ({ url }));
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

// STAGE 2, Build the identity set from the chosen look. Lock the chosen face as an
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
    const clothingRef = (event.data.clothingRef as string) || "";
    const clothingText = ((event.data.clothingText as string) || "").trim();
    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    if (!chosenUrl) {
      await step.run("no-choice", () => updateInfluencer(influencerId, { status: "cast_ready" }));
      return { error: "no chosen look" };
    }

    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const prompt = (persona.identity_prompt as string) || buildIdentityPrompt(inf.persona).prompt;
    const looks = TRAINING_LOOKS.map((l) => ({ ...l }));
    const expected = looks.length + 1;
    // The character bible assigns a UNIQUE set of natural imperfections (mole, freckles,
    // a small scar, asymmetry, skin texture) per build. Thread them through every training
    // frame so the Soul learns them as part of the identity (consistent skin, not generic).
    const bibleFace = ((persona.bible as { face?: { skin?: string; distinct_features?: string } })?.face) ?? {};
    const faceMarks = [bibleFace.distinct_features, bibleFace.skin].filter(Boolean).join(", ").slice(0, 300);

    try {
      // Lock the chosen face as a reusable Element (import the URL → media reference).
      const elementId = await step.run("element", () => createFaceElement(null, chosenUrl, `${inf.name}-${influencerId.slice(0, 8)}`));
      // Optional uploaded clothing reference → its own Element (features a signature outfit).
      const clothEl = clothingRef ? await step.run("cloth-element", () => createFaceElement(null, clothingRef, `${inf.name}-cloth`)) : null;

      const frames: { url: string; hero?: boolean; face?: boolean }[] = [{ url: chosenUrl, hero: true }];
      await step.run("save-hero", () =>
        updateInfluencer(influencerId, { look_refs: [...frames], persona: { ...persona, hero_url: chosenUrl, element_id: elementId, frames_expected: expected } }),
      );

      // Each <<<id>>> placeholder injects that reference image (face / clothing).
      const tag = (id: string | null) => (id ? `<<<${id}>>> ` : "");
      const look = lookClause(persona); // makeup / grooming per the chosen look
      // If the user supplied a signature outfit, feature it on ONE frame; the rest keep the
      // natural varied wardrobe. (Location is NOT used here: training stays on neutral
      // backgrounds so the Soul learns the face, not a scene; location is a creatives input.)
      const userIdx = 3;
      if (clothingText) looks[userIdx].wardrobe = clothingText;

      // Training frames: ONE clear consistent face, single person, clean neutral background,
      // varied angle/light/expression/distance. No background extras (single person per
      // photo, per the Soul photo guide). The FACE is the only constant.
      const constant = `the same exact person, a single person alone with a clear unobstructed face, IDENTICAL face, hairstyle, skin tone and facial features in every frame${faceMarks ? `, with the same consistent natural skin detail and unique features (${faceMarks})` : ""}`;
      const vPrompts = looks.map((l, i) => {
        const useCloth = clothEl && i === userIdx;
        const core = l.full ? SCENE_REALISM : REALISM_POSITIVE;
        const wardrobePhrase = useCloth ? "wearing the same outfit as the clothing reference" : `wearing ${l.wardrobe}`;
        const head = elementId ? `${tag(elementId)}${useCloth ? tag(clothEl) : ""}${constant}` : prompt;
        return `${head}, ${wardrobePhrase}, ${l.frame}, ${l.light}, against a clean simple neutral background, ${look}. ${core}.`;
      });
      const urls = await step.run("variations", () => generateBatch(vPrompts, IMAGE_MODEL, "9:16"));
      const produced = urls.filter((u): u is string => !!u);
      // looks[0] is the tight face close-up; tag it as the clean identity anchor for
      // creatives (a face reference clones far less wardrobe/scene than a full photo).
      const closeUpUrl = urls[0] || null;
      // Meter what Higgsfield produced (billed), before dropping any that fail to load.
      if (produced.length) await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "photoshoot", count: produced.length }));
      const validFrames = await step.run("validate-frames", () => filterLoadable(produced));
      for (const url of validFrames) if (!frames.some((f) => f.url === url)) frames.push({ url, ...(url === closeUpUrl ? { face: true } : {}) });

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

// BRAIN INGEST, pull a knowledge source into a client's brain: scrape (website) or use
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

// PRESENTER, turn the chosen hero into a HeyGen Talking Photo (the talking a-roll
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

// STAGE 3, Train a reusable Soul from selected frames (~10 min). Uses step.sleep so
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
    await step.run("save-soul-id", () => updateInfluencer(influencerId, { higgsfield_soul_id: soulId, status: "training", persona: { ...((inf.persona as Record<string, unknown>) || {}), soul_started_at: new Date().toISOString(), soul_error: null } }));
    await step.run("usage-soul", () => recordUsage({ influencerId, provider: "higgsfield", model: "soul_train", unit: "train", action: "soul", count: 1 }));

    // Poll up to ~52 min (70 × 45s) with durable sleeps (Soul training can run long).
    for (let i = 0; i < 70; i++) {
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
    // Final check before giving up: the Soul may have completed right at the window edge.
    const finalStatus = await step.run("final-check", () => soulStatus(soulId).catch(() => ""));
    if (finalStatus === "ready") {
      const fresh = await step.run("reload-final", () => getInfluencer(influencerId));
      const persona = (fresh?.persona ?? inf.persona ?? {}) as Record<string, unknown>;
      await step.run("mark-locked-final", () => updateInfluencer(influencerId, { status: "ready", persona: { ...persona, locked: true } }));
      return { ready: true, soulId, locked: true, late: true };
    }
    // Took longer than the window, recover so the UI isn't stuck on "training".
    await step.run("timeout", () =>
      updateInfluencer(influencerId, { status: "soul_failed", persona: { ...inf.persona, soul_error: "Lock-down is taking longer than usual. The training may still finish, or you can retry." } }),
    );
    return { timeout: true, soulId };
  },
);

// CREATIVES, social-ready outputs from a LOCKED influencer. Renders one image per
// selected aspect ratio (best framing), optionally upscaled to 4K. Identity is locked
// via the face Element. Cost-aware: only the chosen ratios render; 4K adds an upscale.
type Creative = { url: string; ratio: string; resolution: string; scene: string; at: number };

// Used for the DEFAULT brief (no user scene), these dictate pose/gaze for variety.
const CREATIVE_VARIATIONS = [
  ", in a natural candid moment looking towards the camera",
  ", in a slightly different pose glancing away mid-action",
  ", with a warm genuine expression at a three-quarter angle",
];
// Used when the user wrote their OWN brief, vary only framing, never pose/gaze, so we
// never contradict a brief that already describes how they stand, look or hold themselves.
const FRAMING_VARIATIONS = [
  "",
  ", captured from a slightly different angle and framing",
  ", captured in a slightly wider framing",
];

export const generateCreatives = inngest.createFunction(
  { id: "generate-creatives", retries: 1, triggers: [{ event: "influencer/generate.creatives" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const ratios = (Array.isArray(event.data.ratios) ? event.data.ratios : ["9:16"]) as string[];
    const resolution = String(event.data.resolution || "4k");
    const scene = String(event.data.scene || "").trim();
    const perRatio = Math.max(1, Math.min(6, Number(event.data.count) || 3));
    const clothingRef = (event.data.clothingRef as string) || "";
    const locationRef = (event.data.locationRef as string) || "";
    const peopleClause = event.data.extras === false ? NO_EXTRAS : SCENE_PEOPLE;

    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const look = lookClause(persona);
    const sceneText = scene || "a clean, on-brand social media portrait, looking at the camera";
    const fourK = resolution === "4k";
    const existing = Array.isArray(persona.creatives) ? (persona.creatives as Creative[]) : [];

    // ARCHIVE-PROVEN identity recipe (the old SPA never used Soul/soul_id). Identity comes
    // from REFERENCE IMAGES + an explicit instruction, on gpt_image_2 (high-fidelity, takes
    // up to 8 image refs). Higgsfield Soul did not hold identity in testing; references do.
    const genModel = "gpt_image_2";
    const cinematic = event.data.model === "soul_cinematic";

    await step.run("mark-running", () => updateInfluencer(influencerId, { persona: { ...persona, creatives_status: "running", creatives_error: null } }));

    try {
      const lockMode = event.data.identityLock === "flexible" ? "flexible" : "strong";
      const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean; face?: boolean }[]) : [];
      // Lock onto the face the user CHOSE at casting (hero), not a drifted photoshoot frame.
      const idRefUrl = (persona.hero_realism_url as string) || (persona.hero_url as string) || (persona.chosen_url as string) || refs.find((r) => r.hero)?.url || refs.find((r) => r.face)?.url || refs[0]?.url || (persona.reference_url as string) || "";
      // Import the references → media ids. Face = identity; optional clothing/scene refs.
      const [idMedia, clothMedia, locMedia] = await step.run("import-refs", () => Promise.all([
        idRefUrl ? importMediaUrl(idRefUrl) : Promise.resolve(null),
        clothingRef ? importMediaUrl(clothingRef) : Promise.resolve(null),
        locationRef ? importMediaUrl(locationRef) : Promise.resolve(null),
      ]));
      const medias = [idMedia, clothMedia, locMedia].filter((v): v is string => !!v).map((value) => ({ value, role: "image" }));
      const extra = medias.length ? { medias } : {};
      // @image tags follow the medias order. Tell the model how to use each one.
      let n = 0;
      const faceTag = idMedia ? `@image${++n}` : null;
      const clothTag = clothMedia ? `@image${++n}` : null;
      const locTag = locMedia ? `@image${++n}` : null;
      const refInstruction = [
        faceTag && (lockMode === "flexible"
          ? `IDENTITY REFERENCE: ${faceTag} shows the person. Match their facial bone structure, face shape, eye shape and colour, brow arch, nose, lip shape, skin tone and hair. IGNORE ${faceTag}'s clothing, background, pose and lighting; take the wardrobe, scene and pose from the description above.`
          : `IDENTITY LOCK: ${faceTag} is the appearance reference. Replicate this person EXACTLY, facial bone structure, face shape, jaw, nose, lip shape, eye shape and colour, eyebrow arch, skin tone and texture, freckles, moles and natural asymmetries. Zero facial drift, it must be unmistakably the same individual. IGNORE ${faceTag}'s clothing, background, pose and lighting; take those only from the scene described above.`),
        clothTag && `${clothTag} is a WARDROBE reference: match its outfit (silhouette, fabric, styling). Do NOT copy any face or person from ${clothTag}.`,
        locTag && `${locTag} is a SCENE reference: match its location and setting. Do NOT copy any face or person from ${locTag}.`,
      ].filter(Boolean).join(" ");

      const userScene = !!scene;
      const variations = userScene ? FRAMING_VARIATIONS : CREATIVE_VARIATIONS;
      const realismCore = cinematic ? CINEMATIC_REALISM : UGC_REALISM;
      const buildPrompt = (idx: number) =>
        `${sceneText}${variations[idx % variations.length]}. ${refInstruction} ${look}. ${realismCore}, ${peopleClause}.`;

      // Each format runs CONCURRENTLY and in ONE lean round: generate a small buffer,
      // QA at base resolution, then upscale ONLY the keepers (never the rejects). This is
      // far faster than retry-loops that upscale everything. Top-ups use "Generate more".
      const perRatioResults = await Promise.all(ratios.map(async (ratio) => {
        const rid = ratio.replace(/:/g, "x"); // safe slug for Inngest step IDs (no colons)
        // Over-generate by one for QA headroom.
        const prompts = Array.from({ length: perRatio + 1 }, (_, i) => buildPrompt(i));
        const rawProduced = (await step.run(`gen-${rid}`, () => generateBatch(prompts, genModel, ratio, extra))).filter((u): u is string => !!u);
        // Only keep images that actually load (drops broken/expired renders before QA).
        const produced = await step.run(`validate-${rid}`, () => filterLoadable(rawProduced));
        if (produced.length) await step.run(`usage-gen-${rid}`, () => recordUsage({ influencerId, provider: "higgsfield", model: genModel, unit: "image", action: "creative", count: produced.length }));
        // Vision QA at base res, reject shirtless / collage / bad-proportion / broken (QA error ⇒ keep).
        const verdicts = await step.run(`qa-${rid}`, () =>
          Promise.all(produced.map((u) => qaCreative(u).then((v) => ({ u, pass: v.pass })).catch(() => ({ u, pass: true })))),
        );
        const keptUrls = verdicts.filter((v) => v.pass).slice(0, perRatio).map((v) => v.u);
        const reviewed = verdicts.length;
        const rejected = verdicts.filter((v) => !v.pass).length;
        // Finalise each keeper: upscale to 4K (if requested + it loads), then re-host on Blob
        // so the stored URL is permanent and never 404s. Badge the TRUE resolution per image:
        // if 4K upscale or its re-host fails, we fall back to the base image and label it 2K.
        // One step PER image (not all keepers in one) so no single invocation risks the
        // 300s function cap, AND run them in PARALLEL so total time is one image's upscale,
        // not the sum. Upscale poll is capped (~120s); a slow upscale falls back to a
        // loadable 2K instead of killing the batch (reliability over guaranteed 4K).
        const kept = await Promise.all(keptUrls.map((baseUrl, k) =>
          step.run(`finalize-${rid}-${k}`, async () => {
            let url = baseUrl, res = "2k";
            if (fourK) {
              const up = await upscaleUrlTo(baseUrl, "4k", 40).catch(() => null);
              if (up && (await filterLoadable([up])).length) { url = up; res = "4k"; }
            }
            let hosted = await rehostToBlob(url).catch(() => null);
            if (!hosted && url !== baseUrl) { hosted = await rehostToBlob(baseUrl).catch(() => null); res = "2k"; }
            return { url: hosted || url, resolution: res };
          }),
        ));
        const upscaled = kept.filter((k) => k.resolution === "4k").length;
        if (fourK && upscaled) await step.run(`usage-up-${rid}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "upscale_image", unit: "image", action: "creative", count: upscaled }));
        return { ratio, kept, reviewed, rejected };
      }));

      const made: Creative[] = [];
      let qaReviewed = 0, qaRejected = 0;
      for (const r of perRatioResults) {
        qaReviewed += r.reviewed; qaRejected += r.rejected;
        for (const it of r.kept) made.push({ url: it.url, ratio: r.ratio, resolution: it.resolution, scene: sceneText, at: Date.now() });
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
