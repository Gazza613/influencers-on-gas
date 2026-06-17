import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt, lookClause, genderWord, REALISM_POSITIVE, SCENE_REALISM, SCENE_PEOPLE, NO_EXTRAS, buildCreativeImagePrompt, buildIdentityCardPrompt, buildFeatureSheetPrompt, buildTurnaroundPrompt } from "@/lib/realism";
import { createFaceElement, generateBatch, generateAngles2_0, upscaleUrlTo, filterLoadable, importMediaUrl } from "@/lib/vendors/higgsfield";
import { rehostToBlob } from "@/lib/blob";
import { qaCreative, composeCreativeScene } from "@/lib/vendors/anthropic";
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
      
      // Try Angles 2.0 first (single call, 60-80% cost reduction). Fall back to multi-prompt if unavailable.
      let urls: (string | null)[] = [];
      try {
        const angles = await step.run("angles-2-0", () => generateAngles2_0({ heroUrl: chosenUrl, elementId, count: 12 }));
        if (angles.length >= 8) {
          urls = angles;
          await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: "angles_2_0", unit: "image", action: "photoshoot", count: angles.length }));
        }
      } catch (e) {
        console.log("Angles 2.0 fallback:", String(e).slice(0, 100));
      }
      
      // Fallback: multi-prompt if Angles 2.0 returned empty or failed.
      if (!urls.length) {
        const vPrompts = looks.map((l, i) => {
          const useCloth = clothEl && i === userIdx;
          const core = l.full ? SCENE_REALISM : REALISM_POSITIVE;
          const wardrobePhrase = useCloth ? "wearing the same outfit as the clothing reference" : `wearing ${l.wardrobe}`;
          const head = elementId ? `${tag(elementId)}${useCloth ? tag(clothEl) : ""}${constant}` : prompt;
          return `${head}, ${wardrobePhrase}, ${l.frame}, ${l.light}, against a clean simple neutral background, ${look}. ${core}.`;
        });
        urls = await step.run("variations", () => generateBatch(vPrompts, IMAGE_MODEL, "9:16"));
        const produced = urls.filter((u): u is string => !!u);
        if (produced.length) await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "photoshoot", count: produced.length }));
      }
      
      const produced = urls.filter((u): u is string => !!u);
      // looks[0] is the tight face close-up; tag it as the clean identity anchor for
      // creatives (a face reference clones far less wardrobe/scene than a full photo).
      const closeUpUrl = produced[0] || null;
      const validFrames = await step.run("validate-frames", () => filterLoadable(produced));
      for (const url of validFrames) if (!frames.some((f) => f.url === url)) frames.push({ url, ...(url === closeUpUrl ? { face: true } : {}) });

      await step.run("save-frames", () =>
        updateInfluencer(influencerId, {
          look_refs: frames,
          status: "frames_ready",
          persona: { ...persona, hero_url: chosenUrl, element_id: elementId, frames_expected: expected },
        }),
      );

      // Canonical reference set (archive gem): a clean identity card, a macro feature sheet
      // and a turnaround, generated from the chosen face. Reused as forensic refs in every
      // creative AND shown as a "feature card" flex. Best-effort, never blocks the build.
      const cards = await step.run("reference-cards", async () => {
        const faceMedia = await importMediaUrl(chosenUrl).catch(() => null);
        if (!faceMedia) return null;
        const ex = { medias: [{ value: faceMedia, role: "image" }] };
        const [card, sheet, turn] = await Promise.all([
          generateBatch([buildIdentityCardPrompt()], IMAGE_MODEL, "1:1", ex).catch(() => []),
          generateBatch([buildFeatureSheetPrompt()], IMAGE_MODEL, "3:4", ex).catch(() => []),
          generateBatch([buildTurnaroundPrompt()], IMAGE_MODEL, "16:9", ex).catch(() => []),
        ]);
        const pick = (a: (string | null)[]) => (a && a[0]) || null;
        const [c, s, t] = await Promise.all([
          pick(card) ? rehostToBlob(pick(card)!, "refs").catch(() => null) : null,
          pick(sheet) ? rehostToBlob(pick(sheet)!, "refs").catch(() => null) : null,
          pick(turn) ? rehostToBlob(pick(turn)!, "refs").catch(() => null) : null,
        ]);
        return { face_card_url: c || pick(card), feature_sheet_url: s || pick(sheet), turnaround_url: t || pick(turn) };
      });
      if (cards && (cards.face_card_url || cards.feature_sheet_url || cards.turnaround_url)) {
        const fresh = await step.run("reload-pre-cards", () => getInfluencer(influencerId));
        await step.run("save-cards", () => updateInfluencer(influencerId, { persona: { ...((fresh?.persona as Record<string, unknown>) || persona), ...cards } }));
        const made = [cards.face_card_url, cards.feature_sheet_url, cards.turnaround_url].filter(Boolean).length;
        if (made) await step.run("usage-cards", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "photoshoot", count: made }));
      }
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

// STAGE 3, Lock the identity. Identity is already captured at the photoshoot (the chosen
// face + the canonical reference set: identity card, feature sheet, turnaround) and every
// creative locks onto those references, so the lock is INSTANT. No slow Soul training.
// (A trained Soul is no longer needed for image creatives; if the future video pipeline
// needs one, train it there.)
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
    await step.run("lock", () =>
      updateInfluencer(influencerId, { status: "ready", persona: { ...((inf.persona as Record<string, unknown>) || {}), locked: true, soul_error: null } }),
    );
    return { ok: true, locked: true };
  },
);

// CREATIVES, social-ready outputs from a LOCKED influencer. Renders one image per
// selected aspect ratio (best framing), optionally upscaled to 4K. Identity is locked
// via the face Element. Cost-aware: only the chosen ratios render; 4K adds an upscale.
type CreativeStatus = "approved" | "failed_qa" | "failed_generation";
type CreativeQa = { pass: boolean; score10: number; issues: string[] };
type Creative = {
  id: string;
  url: string | null;
  ratio: string;
  resolution: "2k" | "4k" | "n/a";
  scene: string;
  at: number;
  status: CreativeStatus;
  qa: CreativeQa | null;
  error: string | null;
};

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
      // Prefer the clean canonical identity card (archive gem) for @image1, then fall back
      // to the chosen casting face. Feature sheet (if any) is a forensic @image2.
      const idRefUrl = (persona.face_card_url as string) || (persona.hero_realism_url as string) || (persona.hero_url as string) || (persona.chosen_url as string) || refs.find((r) => r.hero)?.url || refs.find((r) => r.face)?.url || refs[0]?.url || (persona.reference_url as string) || "";
      const featureUrl = (persona.feature_sheet_url as string) || "";
      // Import the references → media ids. Face = identity, feature sheet = forensic detail,
      // optional clothing/scene refs.
      const [idMedia, featMedia, clothMedia, locMedia] = await step.run("import-refs", () => Promise.all([
        idRefUrl ? importMediaUrl(idRefUrl) : Promise.resolve(null),
        featureUrl ? importMediaUrl(featureUrl) : Promise.resolve(null),
        clothingRef ? importMediaUrl(clothingRef) : Promise.resolve(null),
        locationRef ? importMediaUrl(locationRef) : Promise.resolve(null),
      ]));
      const medias = [idMedia, featMedia, clothMedia, locMedia].filter((v): v is string => !!v).map((value) => ({ value, role: "image" }));
      const extra = medias.length ? { medias } : {};
      // @image tags follow the medias order. Tell the model how to use each one.
      let n = 0;
      const faceTag = idMedia ? `@image${++n}` : null;
      const featTag = featMedia ? `@image${++n}` : null;
      const clothTag = clothMedia ? `@image${++n}` : null;
      const locTag = locMedia ? `@image${++n}` : null;
      const refInstruction = [
        faceTag && (lockMode === "flexible"
          ? `IDENTITY REFERENCE: ${faceTag} shows the person. Match their facial bone structure, face shape, eye shape and colour, brow arch, nose, lip shape, skin tone and hair. IGNORE ${faceTag}'s clothing, background, pose and lighting; take the wardrobe, scene and pose from the description above.`
          : `IDENTITY LOCK: ${faceTag} is the appearance reference. Replicate this person EXACTLY, facial bone structure, face shape, jaw, nose, lip shape, eye shape and colour, eyebrow arch, skin tone and texture, freckles, moles and natural asymmetries. Zero facial drift, it must be unmistakably the same individual. IGNORE ${faceTag}'s clothing, background, pose and lighting; take those only from the scene described above.`),
        featTag && `${featTag} is a forensic FEATURE reference: match the exact eyes, brows, lips, skin texture and hair shown in it. Do NOT copy its panel layout, labels or white background.`,
        clothTag && `${clothTag} is a WARDROBE reference: match its outfit (silhouette, fabric, styling). Do NOT copy any face or person from ${clothTag}.`,
        locTag && `${locTag} is a SCENE reference: match its location and setting. Do NOT copy any face or person from ${locTag}.`,
      ].filter(Boolean).join(" ");

      const userScene = !!scene;
      const variations = userScene ? FRAMING_VARIATIONS : CREATIVE_VARIATIONS;
      // Light subject line (body/age/heritage) for the structured prompt; the FACE comes
      // from @image1, so we keep this general and let the reference own the likeness.
      const bibleId = ((persona.bible as { identity?: { age?: string; build?: string; ethnicity_design?: string } })?.identity) ?? {};
      const bibleFace = ((persona.bible as { face?: { skin?: string; distinct_features?: string } })?.face) ?? {};
      const g = genderWord(persona.gender) || "person";
      const subjectLine = [bibleId.age, g, bibleId.build, bibleId.ethnicity_design].filter(Boolean).join(", ") || g;
      const faceMarks = [bibleFace.distinct_features, bibleFace.skin].filter(Boolean).join(", ").slice(0, 220);

      // TWO-STAGE writer: when the user gave a brief, let Claude expand it into a rich,
      // art-directed scene (using the bible) before we wrap it in the structured prompt.
      // Falls back to the raw brief if Claude is unavailable.
      let richScene = sceneText;
      if (scene) {
        const composed = await step.run("compose-scene", () => composeCreativeScene({ bible: (persona.bible as Record<string, unknown>) || {}, scene: sceneText, cinematic, extras: event.data.extras !== false }));
        if (composed) {
          richScene = composed;
          await step.run("usage-compose", () => recordUsage({ influencerId, provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: "compose", count: 1 }));
        }
      }
      const buildPrompt = (idx: number, ratio: string) =>
        buildCreativeImagePrompt({ sceneText: richScene, variation: variations[idx % variations.length], refInstruction, subjectLine, faceMarks, look, peopleClause, cinematic, ratio });

      // Each format runs CONCURRENTLY and preserves one persisted record per requested
      // attempt. Failed generations and QA rejects are visible to producers, not dropped.
      // Identity comes from the @image1 reference (extra.medias), so we render on the
      // VALIDATED gpt_image_2 path (the Supercomputer route dropped the reference and was
      // returning no image).
      const perRatioResults = await Promise.all(ratios.map(async (ratio) => {
        const rid = ratio.replace(/:/g, "x"); // safe slug for Inngest step IDs (no colons)
        const prompts = Array.from({ length: perRatio }, (_, i) => buildPrompt(i, ratio));
        const selectedModel = genModel;
        const rawProduced = await step.run(`gen-${rid}`, () => generateBatch(prompts, genModel, ratio, extra));
        const produced = rawProduced.filter((u): u is string => !!u);
        const valid = produced.length ? await step.run(`validate-${rid}`, () => filterLoadable(produced)) : [];
        const validSet = new Set(valid);
        if (produced.length) await step.run(`usage-gen-${rid}`, () => recordUsage({ influencerId, provider: "higgsfield", model: selectedModel, unit: "image", action: "creative", count: produced.length }));
        // Per attempt: failed generation stays visible, QA gets a score, and only approved
        // shots are upscaled/rehosted.
        const attempts = await Promise.all(rawProduced.map((sourceUrl, k) =>
          step.run(`finalize-${rid}-${k}`, async () => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            if (!sourceUrl) {
              return { id, url: null, ratio, resolution: "n/a", scene: sceneText, at: Date.now(), status: "failed_generation", qa: null, error: "generation returned no image" } as Creative;
            }

            if (!validSet.has(sourceUrl)) {
              return { id, url: sourceUrl, ratio, resolution: "n/a", scene: sceneText, at: Date.now(), status: "failed_generation", qa: null, error: "image url failed to load" } as Creative;
            }

            const verdict = await qaCreative(sourceUrl).catch(() => ({ pass: true, score10: 7, issues: ["qa-unavailable"] }));
            const qa = { pass: verdict.pass, score10: verdict.score10, issues: verdict.issues || [] };
            if (!verdict.pass) {
              return {
                id,
                url: sourceUrl,
                ratio,
                resolution: "2k",
                scene: sceneText,
                at: Date.now(),
                status: "failed_qa",
                qa,
                error: qa.issues[0] || "failed quality review",
              } as Creative;
            }

            let finalUrl = sourceUrl;
            let finalRes: "2k" | "4k" = "2k";
            if (fourK) {
              const up = await upscaleUrlTo(sourceUrl, "4k", 40).catch(() => null);
              if (up && (await filterLoadable([up])).length) { finalUrl = up; finalRes = "4k"; }
            }
            let hosted = await rehostToBlob(finalUrl).catch(() => null);
            if (!hosted && finalUrl !== sourceUrl) { hosted = await rehostToBlob(sourceUrl).catch(() => null); finalRes = "2k"; }
            return {
              id,
              url: hosted || finalUrl,
              ratio,
              resolution: finalRes,
              scene: sceneText,
              at: Date.now(),
              status: "approved",
              qa,
              error: null,
            } as Creative;
          }),
        ));
        const upscaled = attempts.filter((a) => a.status === "approved" && a.resolution === "4k").length;
        if (fourK && upscaled) await step.run(`usage-up-${rid}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "upscale_image", unit: "image", action: "creative", count: upscaled }));
        const reviewed = attempts.filter((a) => !!a.qa).length;
        const rejected = attempts.filter((a) => a.status === "failed_qa").length;
        const failedGeneration = attempts.filter((a) => a.status === "failed_generation").length;
        return { attempts, reviewed, rejected, failedGeneration };
      }));

      const made: Creative[] = [];
      let qaReviewed = 0, qaRejected = 0, qaApproved = 0, generationFailed = 0;
      for (const r of perRatioResults) {
        qaReviewed += r.reviewed;
        qaRejected += r.rejected;
        generationFailed += r.failedGeneration;
        for (const it of r.attempts) {
          if (it.status === "approved") qaApproved += 1;
          made.push(it);
        }
      }
      const qa = { reviewed: qaReviewed, approved: qaApproved, rejected: qaRejected, failed_generation: generationFailed, at: Date.now() };
      await step.run("done", () => updateInfluencer(influencerId, { persona: { ...persona, creatives: [...made, ...existing].slice(0, 120), creatives_status: "done", creatives_qa: qa } }));
      return { ok: true, made: made.length, qa };
    } catch (e) {
      await step.run("fail", () => updateInfluencer(influencerId, { persona: { ...persona, creatives_status: "failed", creatives_error: String((e as Error)?.message || e).slice(0, 200) } }));
      throw e;
    }
  },
);
