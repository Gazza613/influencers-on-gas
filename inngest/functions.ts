import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt, lookClause, genderWord, REALISM_POSITIVE, SCENE_REALISM, SCENE_PEOPLE, NO_EXTRAS, buildCreativeImagePrompt, buildIdentityCardPrompt, buildFeatureSheetPrompt, buildTurnaroundPrompt, buildShotPrompt } from "@/lib/realism";
import { createFaceElement, generateBatch, generateBatchDetailed, generateAngles2_0, upscaleUrlTo, upscaleUrlToDetailed, filterLoadable, importMediaUrl, submitVideoFromImage, submitTalkingVideo, pollVideoJobOnce } from "@/lib/vendors/higgsfield";
import { rehostToBlob, putBytes } from "@/lib/blob";
import { tts, generateMusic, generateSfx } from "@/lib/vendors/elevenlabs";
import { renderEdit, pollRenderOnce } from "@/lib/vendors/shotstack";
import { startTalkingVideo, pollTalking } from "@/lib/vendors/heygen";
import { qaCreative, composeCreativeScene, moderateText } from "@/lib/vendors/anthropic";
import { createTalkingPhoto } from "@/lib/vendors/heygen";
import { scrape } from "@/lib/vendors/firecrawl";
import { chunkText, ingestChunks } from "@/lib/rag";
import { setSourceStatus } from "@/lib/brains";
import { recordUsage } from "@/lib/usage";

const CANDIDATE_COUNT = 6;

// Image identity engine. Nano Banana Pro is best-of-breed for reference-conditioned face
// consistency (blends many refs, native square) AND is UNLIMITED on our Ultra plan, so it is
// free and should fix the gpt_image_2 1:1 failure. Env-overridable in case the live model id
// differs; generation falls back to a known-good model per call so a wrong id never hard-breaks.
const IMAGE_MODEL = process.env.HF_IMAGE_MODEL || "nano_banana_pro";
const IMAGE_FALLBACK = "nano_banana_2"; // known-good casting/photoshoot model
const CREATIVE_FALLBACK = "gpt_image_2"; // previously-validated creatives identity model

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
      const urls = await step.run("cast", () => generateBatch(Array(CANDIDATE_COUNT).fill(prompt), IMAGE_MODEL, "9:16", {}, IMAGE_FALLBACK));
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
    const isTwin = inf.mode === "twin";
    const bibleFace = ((persona.bible as { face?: { skin?: string; distinct_features?: string } })?.face) ?? {};

    // UPLOADED REFERENCES (a twin's real photos, or a synthetic the user gave reference art):
    // these ARE the identity. Do NOT regenerate the face (that drifts and invents marks); use
    // the uploads directly as the frame/reference set, and never thread invented marks.
    const uploadedRefs = Array.isArray(persona.reference_images) ? (persona.reference_images as string[]).filter((u) => typeof u === "string") : [];
    const refFromUrl = typeof persona.reference_url === "string" && persona.reference_url ? [persona.reference_url] : [];
    const twinPhotos = uploadedRefs.length ? uploadedRefs : refFromUrl;
    const anchored = twinPhotos.length > 0;
    // For an anchored identity NEVER thread invented marks; the real/uploaded photo is truth.
    const faceMarks = anchored || isTwin ? "" : [bibleFace.distinct_features, bibleFace.skin].filter(Boolean).join(", ").slice(0, 300);

    if (anchored) {
      const valid = await step.run("validate-twin-photos", () => filterLoadable(twinPhotos));
      // If NONE of the uploaded photos load, don't save dead frames as "ready" (the influencer
      // would look built with a broken hero). Surface a clear error so the user re-uploads.
      if (!valid.length) {
        await step.run("anchor-failed", () => updateInfluencer(influencerId, { status: "gen_failed", persona: { ...persona, soul_error: "None of the uploaded reference photos could be loaded. Please re-upload clear images." } }));
        return { error: "no loadable reference photos" };
      }
      // Import the uploads as forensic @image identity anchors, then GENERATE a real, varied
      // photoshoot locked to them AND driven by the bible (build, complexion, age, styling).
      // The uploaded photos stay as the identity truth (hero + face card); the generated frames
      // give the angle/light/expression/distance variety a Soul + creatives need.
      const refMedias = await step.run("anchor-import", async () =>
        (await Promise.all(valid.slice(0, 4).map((u) => importMediaUrl(u).catch(() => null)))).filter((v): v is string => !!v),
      );
      const g = genderWord(persona.gender);
      const bibleId = ((persona.bible as { identity?: { age?: string; build?: string; ethnicity_design?: string } })?.identity) ?? {};
      const subjectLine = [bibleId.age, g, bibleId.build, bibleId.ethnicity_design].filter(Boolean).join(", ") || g;
      const look = lookClause(persona);

      if (refMedias.length) {
        const faceTags = refMedias.map((_, k) => `@image${k + 1}`).join(", ");
        const idLock = `${faceTags} are the SAME real person — replicate their face EXACTLY (bone structure, eye shape and colour, nose, lips, real skin tone and texture, hair); unmistakably the same individual in every frame, zero drift. IGNORE their original clothing, background and pose; take those from the direction below.`;
        const prompts = looks.map((l) => {
          const core = l.full ? SCENE_REALISM : REALISM_POSITIVE;
          return `A real photograph of ${subjectLine}. ${idLock} ${l.frame}, ${l.light}, wearing ${l.wardrobe}, against a clean simple neutral background, ${look}. ${core}.`;
        });
        const ex = { medias: refMedias.map((value) => ({ value, role: "image" })) };
        const urls = await step.run("anchored-shoot", () => generateBatch(prompts, IMAGE_MODEL, "9:16", ex, IMAGE_FALLBACK));
        const produced = urls.filter((u): u is string => !!u);
        if (produced.length) await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "photoshoot", count: produced.length }));
        const validShoot = await step.run("validate-shoot", () => filterLoadable(produced));
        // Real uploads first (identity truth), then the generated varied frames.
        const frames: { url: string; hero?: boolean; face?: boolean }[] = [{ url: valid[0], hero: true, face: true }];
        for (const url of valid.slice(1)) if (!frames.some((f) => f.url === url)) frames.push({ url });
        for (const url of validShoot) if (!frames.some((f) => f.url === url)) frames.push({ url });
        await step.run("save-anchored-frames", () =>
          updateInfluencer(influencerId, {
            look_refs: frames,
            status: "frames_ready",
            persona: { ...persona, hero_url: valid[0], frames_expected: frames.length, face_card_url: valid[0], feature_sheet_url: null, turnaround_url: null },
          }),
        );
        return { ok: true, frames: frames.length, anchored: true, generated: validShoot.length };
      }

      // Fallback: uploads could not be imported for reference → keep them as the frame set.
      const twinFrames = valid.map((url, i) => ({ url, ...(i === 0 ? { hero: true, face: true } : {}) }));
      await step.run("save-twin-frames", () =>
        updateInfluencer(influencerId, {
          look_refs: twinFrames,
          status: "frames_ready",
          persona: { ...persona, hero_url: valid[0], frames_expected: valid.length, face_card_url: valid[0], feature_sheet_url: null, turnaround_url: null },
        }),
      );
      return { ok: true, frames: twinFrames.length, twin: true };
    }

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
        urls = await step.run("variations", () => generateBatch(vPrompts, IMAGE_MODEL, "9:16", {}, IMAGE_FALLBACK));
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
      // and a turnaround. For a SYNTHETIC influencer we generate these from the chosen face.
      // For a TWIN (real person) we DO NOT regenerate the face, AI redraw drifts and invents
      // marks, so the real uploaded photo IS the identity card. Best-effort, never blocks.
      const cards = isTwin
        ? { face_card_url: chosenUrl, feature_sheet_url: null, turnaround_url: null, cards_rehosted: true }
        : await step.run("reference-cards", async () => {
            const faceMedia = await importMediaUrl(chosenUrl).catch(() => null);
            if (!faceMedia) return null;
            const ex = { medias: [{ value: faceMedia, role: "image" }] };
            const [card, sheet, turn] = await Promise.all([
              generateBatch([buildIdentityCardPrompt()], IMAGE_MODEL, "1:1", ex, IMAGE_FALLBACK).catch(() => []),
              generateBatch([buildFeatureSheetPrompt()], IMAGE_MODEL, "3:4", ex, IMAGE_FALLBACK).catch(() => []),
              generateBatch([buildTurnaroundPrompt()], IMAGE_MODEL, "16:9", ex, IMAGE_FALLBACK).catch(() => []),
            ]);
            const pick = (a: (string | null)[]) => (a && a[0]) || null;
            // These cards feed the video phase, so they MUST land on durable Blob, not a
            // temporary Higgsfield CDN url. Retry the rehost once; flag if any did not stick.
            const host = async (u: string | null) => (u ? (await rehostToBlob(u, "refs").catch(() => null)) || (await rehostToBlob(u, "refs").catch(() => null)) : null);
            const [pc, ps, pt] = [pick(card), pick(sheet), pick(turn)];
            const [c, s, t] = await Promise.all([host(pc), host(ps), host(pt)]);
            const cardsRehosted = (!pc || !!c) && (!ps || !!s) && (!pt || !!t);
            return { face_card_url: c || pc, feature_sheet_url: s || ps, turnaround_url: t || pt, cards_rehosted: cardsRehosted };
          });
      if (cards && (cards.face_card_url || cards.feature_sheet_url || cards.turnaround_url)) {
        const fresh = await step.run("reload-pre-cards", () => getInfluencer(influencerId));
        await step.run("save-cards", () => updateInfluencer(influencerId, { persona: { ...((fresh?.persona as Record<string, unknown>) || persona), ...cards } }));
        // Only meter NEW generations (twins reuse the real photo, no generation, no cost).
        const made = isTwin ? 0 : [cards.face_card_url, cards.feature_sheet_url, cards.turnaround_url].filter(Boolean).length;
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
      await step.run("usage-embed", () => recordUsage({ clientId, provider: "voyage", model: "voyage-4-lite", unit: "embed", action: "ingest", count: stored }));
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
  ", front on to the camera, looking straight into the lens with a relaxed natural expression",
  ", front on to the camera, looking straight into the lens with a warm genuine smile",
  ", front on to the camera, looking straight into the lens, easy confident expression",
];
// Used when the user wrote their OWN brief, vary only framing, never pose/gaze, so we
// never contradict a brief that already describes how they stand, look or hold themselves.
const FRAMING_VARIATIONS = [
  "",
  ", captured from a slightly different angle and framing",
  ", captured in a slightly wider framing",
];

// Split a brief into distinct scenes when the user numbered them ("Image 1", "**Scene 2**",
// "Shot 3:"). Returns [] for a single-scene brief (keeps the classic variations behaviour).
function splitScenes(text: string): string[] {
  if (!text) return [];
  const parts = text.split(/\n(?=\s*\*{0,2}\s*(?:image|scene|shot)\s*\d+\b)/i).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 6) : [];
}

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
    const look = lookClause(persona);
    const sceneText = scene || "a clean, on-brand social media portrait, looking at the camera";
    const fourK = resolution === "4k";
    const existing = Array.isArray(persona.creatives) ? (persona.creatives as Creative[]) : [];

    // Identity comes from REFERENCE IMAGES + an explicit IDENTITY LOCK instruction (Soul did
    // not hold identity in testing; references do). Renders on Nano Banana Pro (best reference
    // fidelity, native square, free on our plan), falling back to the previously-validated
    // gpt_image_2 if the model is unavailable. `cinematic` is an explicit flag, not a model name.
    const genModel = IMAGE_MODEL;
    const cinematic = event.data.cinematic === true;

    // Re-read + a run COUNTER so concurrent renders (e.g. a 9:16 and a 1:1 at once) don't clobber
    // each other's status or images. Status stays "running" until the LAST active run finishes.
    await step.run("mark-running", async () => {
      const fresh = ((await getInfluencer(influencerId))?.persona as Record<string, unknown>) || persona;
      return updateInfluencer(influencerId, { persona: { ...fresh, creatives_status: "running", creatives_error: null, creatives_running: (Number(fresh.creatives_running) || 0) + 1 } });
    });

    try {
      const lockMode = event.data.identityLock === "flexible" ? "flexible" : "strong";
      const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean; face?: boolean }[]) : [];
      // Identity references (face). Any influencer with UPLOADED reference photos (a twin, or
      // a synthetic the user gave reference art for) anchors to up to 4 of those REAL photos
      // (more angles = more accurate likeness, never regenerated). A synthetic with no uploads
      // uses the generated clean identity card + the forensic feature sheet.
      const uploadedRefs = Array.isArray(persona.reference_images)
        ? (persona.reference_images as string[]).filter((u) => typeof u === "string") : [];
      const refFromUrl = typeof persona.reference_url === "string" && persona.reference_url ? [persona.reference_url] : [];
      const twinPhotos = (uploadedRefs.length ? uploadedRefs : refFromUrl).slice(0, 4);
      const anchored = twinPhotos.length > 0 || inf.mode === "twin"; // photo is the truth for skin/marks
      const idRefUrls = twinPhotos.length
        ? twinPhotos
        : [(persona.face_card_url as string) || (persona.hero_realism_url as string) || (persona.hero_url as string) || (persona.chosen_url as string) || refs.find((r) => r.hero)?.url || refs.find((r) => r.face)?.url || refs[0]?.url || (persona.reference_url as string) || ""].filter(Boolean);
      const featureUrl = twinPhotos.length ? "" : ((persona.feature_sheet_url as string) || "");
      const imported = await step.run("import-refs", async () => {
        const ids = (await Promise.all(idRefUrls.map((u) => importMediaUrl(u).catch(() => null)))).filter((v): v is string => !!v);
        const [feat, cloth, loc] = await Promise.all([
          featureUrl ? importMediaUrl(featureUrl).catch(() => null) : Promise.resolve(null),
          clothingRef ? importMediaUrl(clothingRef).catch(() => null) : Promise.resolve(null),
          locationRef ? importMediaUrl(locationRef).catch(() => null) : Promise.resolve(null),
        ]);
        return { ids, feat, cloth, loc };
      });
      const idMedias = imported.ids;
      const medias = [...idMedias, imported.feat, imported.cloth, imported.loc].filter((v): v is string => !!v).map((value) => ({ value, role: "image" }));
      const extra = medias.length ? { medias } : {};
      // @image tags follow the medias order. Identity refs come first.
      let n = 0;
      const faceTags = idMedias.map(() => `@image${++n}`);
      const faceRange = faceTags.length > 1 ? `${faceTags[0]} to ${faceTags[faceTags.length - 1]}` : faceTags[0];
      const featTag = imported.feat ? `@image${++n}` : null;
      const clothTag = imported.cloth ? `@image${++n}` : null;
      const locTag = imported.loc ? `@image${++n}` : null;
      const refInstruction = [
        faceTags.length && (faceTags.length > 1
          ? `IDENTITY LOCK: ${faceRange} are photos of the SAME real person from different angles, lighting and expressions. Replicate this exact person faithfully, the same face, bone structure, eyes, nose, lips, skin tone and hair across all of them. Zero facial drift, unmistakably the same individual. Use them ONLY for the face and identity; IGNORE their clothing, backgrounds, poses and lighting.`
          : (lockMode === "flexible"
            ? `IDENTITY REFERENCE: ${faceTags[0]} shows the person. Match their facial bone structure, face shape, eye shape and colour, brow arch, nose, lip shape, skin tone and hair. IGNORE ${faceTags[0]}'s clothing, background, pose and lighting; take the wardrobe, scene and pose from the description above.`
            : `IDENTITY LOCK: ${faceTags[0]} is the appearance reference. Replicate this person EXACTLY, facial bone structure, face shape, jaw, nose, lip shape, eye shape and colour, eyebrow arch, skin tone and texture, freckles, moles and natural asymmetries. Zero facial drift, it must be unmistakably the same individual. IGNORE ${faceTags[0]}'s clothing, background, pose and lighting; take those only from the scene described above.`)),
        faceTags.length && "If the person wears glasses or any signature eyewear in the reference photos, keep that exact eyewear on them in this shot, unchanged; never remove, add or restyle their glasses.",
        anchored && "The reference photos are the ONLY source of truth for their skin: do NOT add any moles, freckles, scars, beauty spots or skin marks that are not clearly visible in those photos.",
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
      // NEVER thread bible-invented marks (moles/freckles) when anchored to a real photo —
      // the reference is the source of truth, inventing marks puts a mole where there isn't one.
      const faceMarks = anchored ? "" : [bibleFace.distinct_features, bibleFace.skin].filter(Boolean).join(", ").slice(0, 220);

      // MULTI-SCENE brief: if the user pasted numbered scenes ("Image 1 / Scene 2 / Shot 3"),
      // generate ONE distinct image per scene instead of N variations of the first. Otherwise the
      // single scene becomes N art-directed variations (the classic behaviour).
      const bibleObj = (persona.bible as Record<string, unknown>) || {};
      const extrasOn = event.data.extras !== false;
      const gender = String(persona.gender || "");
      const segments = splitScenes(scene);
      const multiScene = segments.length >= 2;
      let richScenes: string[] = [];
      if (multiScene) {
        richScenes = await step.run("compose-multi", () => Promise.all(segments.map((seg) => composeCreativeScene({ bible: bibleObj, scene: seg, cinematic, extras: extrasOn, gender }).then((c) => c || seg))));
        await step.run("usage-compose-multi", () => recordUsage({ influencerId, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "compose", count: segments.length }).catch(() => {}));
      } else {
        let rs = sceneText;
        if (scene) {
          const composed = await step.run("compose-scene", () => composeCreativeScene({ bible: bibleObj, scene: sceneText, cinematic, extras: extrasOn, gender }));
          if (composed) { rs = composed; await step.run("usage-compose", () => recordUsage({ influencerId, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "compose", count: 1 }).catch(() => {})); }
        }
        richScenes = [rs];
      }
      const buildPrompt = (idx: number, ratio: string) =>
        buildCreativeImagePrompt({ sceneText: multiScene ? richScenes[idx] : richScenes[0], variation: multiScene ? "" : variations[idx % variations.length], refInstruction, subjectLine, faceMarks, look, peopleClause, cinematic, ratio });

      // Each format runs CONCURRENTLY and preserves one persisted record per requested
      // attempt. Failed generations and QA rejects are visible to producers, not dropped.
      // Identity comes from the @image1 reference (extra.medias), so we render on the
      // VALIDATED gpt_image_2 path (the Supercomputer route dropped the reference and was
      // returning no image).
      const perRatioResults = await Promise.all(ratios.map(async (ratio) => {
        const rid = ratio.replace(/:/g, "x"); // safe slug for Inngest step IDs (no colons)
        const shotCount = multiScene ? richScenes.length : perRatio;
        const prompts = Array.from({ length: shotCount }, (_, i) => buildPrompt(i, ratio));
        // Detailed gen captures the failure REASON and the model ACTUALLY used per shot (it
        // also retries once internally and self-heals to the fallback model).
        const detailed = await step.run(`gen-${rid}`, () => generateBatchDetailed(prompts, genModel, ratio, extra, CREATIVE_FALLBACK));
        const rawProduced = detailed.map((d) => d.url);
        const genErrors = detailed.map((d) => d.error);
        const produced = rawProduced.filter((u): u is string => !!u);
        const valid = produced.length ? await step.run(`validate-${rid}`, () => filterLoadable(produced)) : [];
        const validSet = new Set(valid);
        // Meter by the REAL model that produced each shot, so a fallback to the costed model
        // is not invisibly billed as the free primary.
        const byModel: Record<string, number> = {};
        for (const d of detailed) if (d.url) byModel[d.model] = (byModel[d.model] || 0) + 1;
        for (const [mdl, n] of Object.entries(byModel)) {
          await step.run(`usage-gen-${rid}-${mdl}`, () => recordUsage({ influencerId, provider: "higgsfield", model: mdl, unit: "image", action: "creative", count: n }));
        }
        // AI Vision QA (Claude Haiku) runs once per loadable shot, meter it so it appears in Cost Control.
        if (valid.length) await step.run(`usage-qa-${rid}`, () => recordUsage({ influencerId, provider: "anthropic", model: "claude-haiku-4-5", unit: "image", action: "qa", count: valid.length }));
        // Per attempt: failed generation stays visible, QA gets a score, and only approved
        // shots are upscaled/rehosted.
        const attempts = await Promise.all(rawProduced.map((sourceUrl, k) =>
          step.run(`finalize-${rid}-${k}`, async () => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            if (!sourceUrl) {
              return { id, url: null, ratio, resolution: "n/a", scene: sceneText, at: Date.now(), status: "failed_generation", qa: null, error: genErrors[k] || "generation returned no image" } as Creative;
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
      // Re-read the LATEST persona and append (dedupe by id) so a concurrent run's images are
      // preserved, not overwritten by this run's stale snapshot. Status clears only when no run is left.
      await step.run("done", async () => {
        const fresh = ((await getInfluencer(influencerId))?.persona as Record<string, unknown>) || persona;
        const cur = Array.isArray(fresh.creatives) ? (fresh.creatives as Creative[]) : existing;
        const seen = new Set<string>();
        const merged = [...made, ...cur].filter((c) => { const k = c.id || ""; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 120);
        const left = Math.max(0, (Number(fresh.creatives_running) || 1) - 1);
        return updateInfluencer(influencerId, { persona: { ...fresh, creatives: merged, creatives_status: left > 0 ? "running" : "done", creatives_qa: qa, creatives_running: left } });
      });
      return { ok: true, made: made.length, qa };
    } catch (e) {
      await step.run("fail", async () => {
        const fresh = ((await getInfluencer(influencerId))?.persona as Record<string, unknown>) || persona;
        const left = Math.max(0, (Number(fresh.creatives_running) || 1) - 1);
        return updateInfluencer(influencerId, { persona: { ...fresh, creatives_status: left > 0 ? "running" : "failed", creatives_error: String((e as Error)?.message || e).slice(0, 200), creatives_running: left } });
      });
      throw e;
    }
  },
);

// On-demand 4K upscale of a single chosen creative, as a DURABLE job so it can never time out
// a request (a 4K bytedance render can take 1-2 min). The UI fires this, shows an "upscaling"
// spinner, and polls the creatives list until the shot's resolution flips to 4k (or errors).
type UpCreative = { id?: string; url?: string | null; resolution?: string; upscaling?: boolean; upscale_error?: string | null; [k: string]: unknown };
export const upscaleCreative = inngest.createFunction(
  { id: "upscale-creative", retries: 1, triggers: [{ event: "influencer/upscale.creative" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const creativeId = String(event.data.creativeId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const creatives = (Array.isArray(persona.creatives) ? persona.creatives : []) as UpCreative[];
    const target = creatives.find((c) => (c.id || "") === creativeId);
    if (!target || !target.url) return { skipped: "shot not found" };
    if (target.resolution === "4k") return { ok: true, already: true };

    const res = await step.run("upscale", () => upscaleUrlToDetailed(target.url as string, "4k", 80).catch((e) => ({ url: null, error: String((e as Error)?.message || e).slice(0, 300) })));
    const up = res.url;
    const ok = up && (await step.run("validate", () => filterLoadable([up]))).length > 0;
    if (!ok) {
      // Clear the spinner and surface the REAL per-shot reason; leave the 2K original intact.
      const fresh = (((await step.run("reload-fail", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
      const list = (Array.isArray(fresh.creatives) ? fresh.creatives : creatives) as UpCreative[];
      const updated = list.map((c) => ((c.id || "") === creativeId ? { ...c, upscaling: false, upscale_error: (res.error || "4K upscale did not return an image").slice(0, 200) } : c));
      await step.run("save-fail", () => updateInfluencer(influencerId, { persona: { ...fresh, creatives: updated } }));
      return { ok: false };
    }
    const hosted = (await step.run("rehost", () => rehostToBlob(up as string, "creatives").catch(() => null))) || (up as string);
    await step.run("usage-up", () => recordUsage({ influencerId, provider: "higgsfield", model: "upscale_image", unit: "image", action: "creative", count: 1 }));

    // Reload so we don't clobber other shots a parallel run may have changed.
    const fresh = (((await step.run("reload", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const list = (Array.isArray(fresh.creatives) ? fresh.creatives : creatives) as UpCreative[];
    const prevUrl = target.url;
    const updated = list.map((c) => ((c.id || "") === creativeId ? { ...c, url: hosted, resolution: "4k", upscaling: false, upscale_error: null } : c));
    const vs = (Array.isArray(fresh.video_selects) ? fresh.video_selects : []) as string[];
    const remapped = vs.map((u) => (u === prevUrl ? hosted : u));
    await step.run("save", () => updateInfluencer(influencerId, { persona: { ...fresh, creatives: updated, video_selects: remapped } }));
    return { ok: true };
  },
);

// PHASE 2 — A-ROLL: one lip-synced talking-influencer clip. Durable (HeyGen renders take a few
// minutes). TTS our ElevenLabs voice -> Blob -> HeyGen talking_photo + that audio -> poll -> save.
// The route pre-creates the clip {status:"running"}; this updates it to ready/failed by id.
type ArollClip = { id?: string; url?: string | null; line?: string; ratio?: string; status?: string; error?: string | null; at?: number; [k: string]: unknown };
export const generateAroll = inngest.createFunction(
  { id: "generate-aroll", retries: 1, triggers: [{ event: "influencer/generate.aroll" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const clipId = String(event.data.clipId || "");
    const line = String(event.data.line || "").trim();
    const ratio = String(event.data.ratio || "9:16");
    const setClip = async (patch: Partial<ArollClip>) => {
      const fresh = (((await getInfluencer(influencerId))?.persona as Record<string, unknown>) || {});
      const list = (Array.isArray(fresh.aroll) ? fresh.aroll : []) as ArollClip[];
      const updated = list.map((c) => ((c.id || "") === clipId ? { ...c, ...patch } : c));
      await updateInfluencer(influencerId, { persona: { ...fresh, aroll: updated } });
    };

    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const voiceId = persona.voice_id as string | undefined;
    // The producer CHOOSES which shot drives the clip; fall back to the hero. The clip aspect
    // matches the chosen image so there is no letterboxing / white space.
    const fallbackHero = (persona.hero_url || persona.face_card_url || persona.reference_url || (Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean }[]).find((r) => r.hero)?.url : "")) as string;
    const source = (typeof event.data.sourceUrl === "string" && event.data.sourceUrl) ? event.data.sourceUrl as string : fallbackHero;
    if (!voiceId) { await step.run("no-voice", () => setClip({ status: "failed", error: "No voice yet — create the influencer's voice first." })); return { error: "no voice" }; }
    if (!line) { await step.run("no-line", () => setClip({ status: "failed", error: "No line to say." })); return { error: "no line" }; }
    if (!source) { await step.run("no-src", () => setClip({ status: "failed", error: "No source image to drive the presenter." })); return { error: "no source" }; }

    try {
      // 1. TTS our ElevenLabs voice -> public Blob mp3 (HeyGen fetches it).
      const audioUrl = await step.run("tts", async () => putBytes(await tts(voiceId, line, { expressive: true }), "aroll-audio", "mp3", "audio/mpeg"));
      await step.run("usage-tts", () => recordUsage({ influencerId, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }));
      // 2. HeyGen Avatar IV (v3 image->video, expressiveness HIGH + motion) from the CHOSEN shot,
      //    at the shot's own aspect. Falls back to v2 internally if v3 errors.
      const started = await step.run("start-video", () => startTalkingVideo({ imageUrl: source, audioUrl, ratio }));
      // 3. Poll the render (a few minutes).
      const result = await step.run("poll-video", async () => {
        for (let i = 0; i < 70; i++) {
          if (i) await new Promise((r) => setTimeout(r, 5000));
          const s = await pollTalking(started.videoId, started.version).catch(() => ({ status: "unknown", url: null as string | null, error: null as string | null }));
          if (s.url) return { url: s.url, error: null as string | null };
          if (s.status === "failed") return { url: null as string | null, error: s.error };
        }
        return { url: null as string | null, error: "render timed out" };
      });
      if (!result.url) { await step.run("render-fail", () => setClip({ status: "failed", error: (result.error || "render failed").slice(0, 200) })); return { ok: false }; }
      await step.run("usage-video", () => recordUsage({ influencerId, provider: "heygen", model: "talking_photo", unit: "video", action: "presenter", count: 1 }));
      const hosted = (await step.run("rehost", () => rehostToBlob(result.url as string, "aroll").catch(() => null))) || (result.url as string);
      await step.run("save-clip", () => setClip({ status: "ready", url: hosted, error: null }));
      return { ok: true };
    } catch (e) {
      await step.run("fail", () => setClip({ status: "failed", error: String((e as Error)?.message || e).slice(0, 200) }));
      throw e;
    }
  },
);

// THE PRODUCER — "shoot the shots": render one coherent image per storyboard scene with Nano
// Banana Pro. Identity refs + a shared WORLD anchor (the first good frame, reused on the rest)
// keep location/lighting/identity continuous across the board (the API equivalent of Popcorn).
type ShotRow = { scene: number; role: string; beat: string; url: string | null; error?: string | null };
export const generateShots = inngest.createFunction(
  { id: "generate-shots", retries: 1, triggers: [{ event: "influencer/generate.shots" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as { brief?: Record<string, unknown>; storyboard?: { scenes?: Record<string, unknown>[]; format?: string } } | null;
    const scenes = production?.storyboard?.scenes ?? [];
    if (!scenes.length) return { error: "no storyboard" };
    const ratio = String(production?.storyboard?.format || "").includes("1:1") ? "1:1" : "9:16";

    // Identity references (same recipe as creatives): uploaded photos, else the canonical cards.
    const uploadedRefs = Array.isArray(persona.reference_images) ? (persona.reference_images as string[]).filter((u) => typeof u === "string") : [];
    const refFromUrl = typeof persona.reference_url === "string" && persona.reference_url ? [persona.reference_url] : [];
    const anchored = uploadedRefs.length ? uploadedRefs.slice(0, 4) : refFromUrl;
    const idRefUrls = anchored.length
      ? anchored
      : [(persona.face_card_url as string) || (persona.hero_url as string) || (persona.chosen_url as string) || ""].filter(Boolean);
    const featureUrl = anchored.length ? "" : ((persona.feature_sheet_url as string) || "");
    const idMedias = await step.run("import-identity", async () => {
      const ids = (await Promise.all(idRefUrls.map((u) => importMediaUrl(u).catch(() => null)))).filter((v): v is string => !!v);
      if (featureUrl) { const f = await importMediaUrl(featureUrl).catch(() => null); if (f) ids.push(f); }
      return ids;
    });
    const bibleId = ((persona.bible as { identity?: { age?: string; build?: string; ethnicity_design?: string } })?.identity) ?? {};
    const subjectLine = [bibleId.age, bibleId.build, bibleId.ethnicity_design].filter(Boolean).join(", ") || `${inf.name}, the influencer`;
    const look = lookClause(persona);

    // Optional producer uploads: a clothing reference (wardrobe) and a location reference (world).
    const brief = (production?.brief ?? {}) as Record<string, string>;
    const clothMedia = brief.clothingRef ? await step.run("import-cloth", () => importMediaUrl(brief.clothingRef).catch(() => null)) : null;
    const locMedia = brief.locationRef ? await step.run("import-loc", () => importMediaUrl(brief.locationRef).catch(() => null)) : null;
    // CREATIVE REFERENCES (Phase 1): a chosen creative becomes the wardrobe + world anchor per role.
    const arollRefMedia = persona.aroll_ref_url ? await step.run("import-aroll-ref", () => importMediaUrl(String(persona.aroll_ref_url)).catch(() => null)) : null;
    const brollRefMedia = persona.broll_ref_url ? await step.run("import-broll-ref", () => importMediaUrl(String(persona.broll_ref_url)).catch(() => null)) : null;

    await step.run("mark-running", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, shots_status: "running" } } }));

    const shots: ShotRow[] = [];
    let worldRef: string | null = null; // first good frame, imported, reused to lock the world
    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i] as Record<string, string>;
      const beat = String(sc.beat || ""); const role = String(sc.role || "a-roll");
      if (role === "graphic") { shots.push({ scene: i, role, beat, url: null }); continue; }
      // Optional PHONE-SCREEN image for THIS scene → composite onto the phone's screen.
      const phoneMedia = sc.phone_screen_url ? await step.run(`phone-${i}`, () => importMediaUrl(String(sc.phone_screen_url)).catch(() => null)) : null;
      // Role-specific Creative reference (Phase 1): a-roll scenes anchor to the a-roll ref, b-roll to the b-roll ref.
      const roleRefMedia = role === "a-roll" ? arollRefMedia : role === "b-roll" ? brollRefMedia : null;
      // @image order: identity, [clothing], [location], [world anchor], [phone screen], [role ref]. Tags must match.
      let n = idMedias.length;
      const faceTags = idMedias.map((_, k) => `@image${k + 1}`);
      const clothTag = clothMedia ? `@image${++n}` : "";
      const locTag = locMedia ? `@image${++n}` : "";
      const worldTag = worldRef ? `@image${++n}` : "";
      const phoneTag = phoneMedia ? `@image${++n}` : "";
      const roleRefTag = roleRefMedia ? `@image${++n}` : "";
      const refInstruction = [
        faceTags.length ? `IDENTITY LOCK: ${faceTags.join(", ")} are the SAME real person, replicate them EXACTLY (face shape, bone structure, eyes, nose, lips, skin tone and texture, hair); zero drift, unmistakably the same individual. IGNORE their clothing, background and pose; take those from the direction below.` : "",
        roleRefTag ? `${roleRefTag} is the APPROVED ${role.toUpperCase()} REFERENCE look: match its wardrobe, styling, grooming, lighting and overall mood/world closely for this scene. Do NOT copy its exact pose or framing (take those from the direction below), and do NOT copy any other person from it.` : "",
        clothTag ? `${clothTag} is a WARDROBE reference: dress the influencer in this exact outfit (silhouette, fabric, colour, styling). Do NOT copy any face or person from it.` : "",
        locTag ? `${locTag} is a LOCATION reference: set this scene in that exact place, matching its environment, architecture, lighting and mood. Do NOT copy any face or person from it.` : "",
        worldTag ? `${worldTag} is the ESTABLISHED world of this production: match its location, set dressing, lighting, time of day and colour grade exactly for seamless continuity.` : "",
        phoneTag ? `${phoneTag} is the PHONE SCREEN content: if the influencer is holding or showing a phone, render its screen displaying THIS exact image, crisp and legible, correctly perspective-fitted to the phone. Do NOT copy any person from it.` : "",
      ].filter(Boolean).join(" ");
      const prompt = buildShotPrompt({
        location: String(sc.location || ""), blocking: String(sc.blocking || ""), shot: String(sc.shot || ""),
        performance: String(sc.performance || ""), role, subjectLine, look, refInstruction, ratio,
        hasPeople: true, worldAnchored: !!worldRef,
      });
      const medias = [...idMedias, ...(clothMedia ? [clothMedia] : []), ...(locMedia ? [locMedia] : []), ...(worldRef ? [worldRef] : []), ...(phoneMedia ? [phoneMedia] : []), ...(roleRefMedia ? [roleRefMedia] : [])].map((value) => ({ value, role: "image" }));
      const gen = () => generateBatch([prompt], IMAGE_MODEL, ratio, medias.length ? { medias } : {}, CREATIVE_FALLBACK).then((a) => a[0] ?? null);
      let url = await step.run(`shot-${i}`, gen);
      let usable = url && (await step.run(`valid-${i}`, () => filterLoadable([url as string]))).length > 0 ? url : null;
      // QA GATE: these frames BECOME the video, so reject waxy/malformed/identity-drift frames and
      // re-roll ONCE before they go forward (the same Vision QA the creatives use).
      if (usable) {
        const verdict = await step.run(`qa-${i}`, () => qaCreative(usable as string).catch(() => ({ pass: true, score10: 7, issues: [] as string[] })));
        await step.run(`uqa-${i}`, () => recordUsage({ influencerId, provider: "anthropic", model: "claude-haiku-4-5", unit: "image", action: "qa", count: 1 }).catch(() => {}));
        if (!verdict.pass) {
          const reroll = await step.run(`reroll-${i}`, gen);
          if (reroll && (await step.run(`valid2-${i}`, () => filterLoadable([reroll as string]))).length > 0) { usable = reroll; await step.run(`u2-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "creative", count: 1 }).catch(() => {})); }
        }
      }
      let hosted: string | null = null;
      if (usable) {
        hosted = (await step.run(`host-${i}`, () => rehostToBlob(usable as string, "shots").catch(() => null))) || usable;
        await step.run(`usage-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "creative", count: 1 }));
        if (!worldRef && hosted) worldRef = await step.run(`worldref-${i}`, () => importMediaUrl(hosted as string).catch(() => null));
      }
      shots.push({ scene: i, role, beat, url: hosted, error: hosted ? null : "no image" });
      // Persist progressively so the UI fills in live.
      const fresh = (((await step.run(`reload-${i}`, () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
      const prod = (fresh.production ?? production) as Record<string, unknown>;
      await step.run(`save-${i}`, () => updateInfluencer(influencerId, { persona: { ...fresh, production: { ...prod, shots, shots_status: "running" } } }));
    }
    const done = (((await step.run("reload-done", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const prodDone = (done.production ?? production) as Record<string, unknown>;
    await step.run("done", () => updateInfluencer(influencerId, { persona: { ...done, production: { ...prodDone, shots, shots_status: "done", status: "shots" } } }));
    return { ok: true, shots: shots.length };
  },
);

// THE PRODUCER — "render the clips": turn each board frame into a moving clip. A-ROLL scenes
// become HeyGen talking clips (the frame + our expressive VO); B-ROLL scenes become Kling
// image->video motion clips (face-safe). Graphic scenes pass through to assembly. Durable +
// progressive; every clip metered; one failed clip never blocks the rest.
type ClipRow = { scene: number; role: string; beat: string; kind: string; url: string | null; status: string; error?: string | null; synced?: boolean; audio_url?: string | null };
export const generateClips = inngest.createFunction(
  { id: "generate-clips", retries: 1, triggers: [{ event: "influencer/generate.clips" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as { storyboard?: { scenes?: Record<string, string>[]; format?: string }; shots?: { scene: number; url: string | null }[]; clips?: ClipRow[] } | null;
    const scenes = production?.storyboard?.scenes ?? [];
    const shots = production?.shots ?? [];
    if (!scenes.length) return { error: "no storyboard" };
    if (!shots.some((s) => s.url)) return { error: "shoot the shots first" };
    const voiceId = persona.voice_id as string | undefined;
    const ratio = String(production?.storyboard?.format || "").includes("1:1") ? "1:1" : "9:16";
    const shotUrl = (i: number) => shots.find((s) => s.scene === i)?.url || null;
    // Optional role filter: render only a-roll OR only b-roll (the 8-step wizard renders them as
    // separate gated steps). When filtering, KEEP the clips already rendered for the other role.
    const roleFilter: string[] | null = Array.isArray(event.data.roles) && event.data.roles.length ? (event.data.roles as unknown[]).map(String) : null;
    const sceneFilter: number[] | null = Array.isArray(event.data.scenes) && event.data.scenes.length ? (event.data.scenes as unknown[]).map(Number) : null;
    const keepExisting = !!(roleFilter || sceneFilter); // filtered render → keep the other clips
    const existingClips = Array.isArray(production?.clips) ? (production!.clips as ClipRow[]) : [];

    await step.run("mark-running", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, clips_status: "running", clips: keepExisting ? existingClips : [] } } }));

    // Render ONE scene to a clip. CRITICAL: the render poll is split into many SHORT steps with
    // step.sleep between them, so no single step ever blocks for minutes (which was timing out the
    // serverless function and looping forever). Each poll step is a quick status check.
    const renderOne = async (i: number, sc: Record<string, string>): Promise<ClipRow> => {
      const role = String(sc.role || "a-roll"); const beat = String(sc.beat || "");
      const img = shotUrl(i);
      if (role === "graphic") return { scene: i, role, beat, kind: "graphic", url: null, status: "graphic" };
      if (!img) return { scene: i, role, beat, kind: role, url: null, status: "failed", error: "no shot frame" };
      const base = String(sc.motion_prompt || sc.blocking || "natural movement");
      const line = String(sc.vo_line || "").trim();
      const presetAudio = String(sc.vo_audio_url || "").trim(); // producer's own uploaded VO for this scene
      // Steer the video model away from its two worst tells: shaky camera + people clipping through
      // the world. Appended to every clip prompt.
      const MOTION_SAFE = " Camera is SMOOTH and STABILISED (gimbal-steady), gentle and locked — absolutely no jittery or shaky handheld motion. Everyone and everything moves with real spatial awareness along physically believable paths: nobody walks into the pool, water, walls, furniture, plants or other people, and nobody clips through objects. All motion is grounded, natural and plausible.";
      // When a scene has water, the video model's worst tell is fake/jelly water — force real physics.
      const sceneText = `${sc.location || ""} ${sc.blocking || ""} ${base}`.toLowerCase();
      const WATER = /\b(water|pool|waves?|sea|ocean|beach|river|lake|splash|swim|swimming|fountain|rain|surf|wave pool)\b/.test(sceneText)
        ? " WATER REALISM (critical): all water — pool, waves, sea, splashes — must move with HYPER-REALISTIC fluid physics: natural ripples and rolling wave motion, light refraction and caustics on the surface, sparkling sunlight highlights, believable splashes and foam. NEVER plastic, jelly-like, gelatinous, frozen, smeared, looping or fake-looking water."
        : "";

      // A-ROLL: Higgsfield Seedance 2.0 — feed the keyframe + a VO audio clip → a moving scene with
      // the avatar LIP-SYNCED to that voice (baked in). Uses the producer's uploaded VO if present,
      // else in-platform TTS. Falls back to silent Kling motion (VO laid over) if Seedance fails.
      if (role === "a-roll" && (presetAudio || (line && voiceId))) {
        // Moderate the line BEFORE any ElevenLabs TTS call (skip if it trips the safety classifier).
        const audioUrl = presetAudio || (await step.run(`tts-${i}`, async () => {
          const mod = await moderateText(line);
          if (!mod.allowed) return null;
          return putBytes(await tts(voiceId as string, line, { expressive: true }), "aroll-vo", "mp3", "audio/mpeg").catch(() => null);
        }) as string | null);
        if (audioUrl) {
          if (!presetAudio) await step.run(`u-tts-${i}`, () => recordUsage({ influencerId, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {}));
          // A-ROLL camera MUST hold on her — Seedance was obeying storyboard "push in / pan up"
          // directions and craning the camera off her (she slid out of frame, the building grew).
          const prompt = `${base}. She talks to camera with natural micro-expressions and gentle gestures. CAMERA — CRITICAL: hold a steady, locked, essentially static frame on her. The camera does NOT pan, tilt, push in, zoom, crane, rise or drift. She stays CENTRED and fully in frame for the entire clip — she never slides toward the edge or bottom, never shrinks, and the framing never reveals new architecture. The camera never moves, but the SCENE is fully ALIVE and hyper-real: trees, leaves and plants sway in a gentle breeze, her hair and clothing stir subtly in the air, light shifts softly, and background people move naturally and believably — walking at a real pace, gesturing with their hands, chatting, shifting their weight (each a real human, never a frozen mannequin). She gestures naturally with her hands and has lifelike micro-movements as she speaks. Nothing is a still photo; every element has subtle, realistic motion — only the camera stays locked.${MOTION_SAFE}${WATER}`;
          const sub = await step.run(`asubmit-${i}`, () => submitTalkingVideo({ imageUrl: img, audioUrl, ratio, prompt }));
          let url: string | null = sub.url;
          if (!url && sub.jobId) {
            for (let n = 0; n < 120; n++) { // ~120 x 8s ≈ 16 min (Seedance/Kling can be slow on heavy scenes)
              const s = await step.run(`apoll-${i}-${n}`, () => pollVideoJobOnce(sub.jobId as string));
              if (s.url) { url = s.url; break; }
              if (s.terminal) break;
              await step.sleep(`await-a-${i}-${n}`, "8s");
            }
          }
          if (url) {
            await step.run(`u-aroll-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "seedance_2_0", unit: "video", action: "aroll", count: 1 }).catch(() => {}));
            const hosted = (await step.run(`ahost-${i}`, () => rehostToBlob(url as string, "clips").catch(() => null))) || url;
            // Save the EXACT audio we lip-synced to — Seedance outputs a SILENT video (the audio
            // only drives the lips), so the stitch lays this same clip back over it for sound.
            return { scene: i, role, beat, kind: "a-roll", url: hosted, status: "ready", synced: true, audio_url: audioUrl };
          }
          // fall through to Kling motion (no sync) if Seedance failed
        }
      }

      // B-ROLL (and a-roll fallback): Kling whole-frame motion, silent. VO laid over in the stitch.
      const motion = (role === "a-roll"
        ? `${base}. She is front-on, looking into the lens, talking to camera. CAMERA holds a steady, locked frame on her — no pan, tilt, push, zoom or crane; she stays centred and fully in frame the whole time. Only she and the background move (background people, ambient motion).`
        : `${base}. The whole scene is alive and moving: background people move, gentle camera drift, water/leaves/light in motion — never frozen.`) + MOTION_SAFE + WATER;
      // SEAMLESS FLOW: end this clip on the NEXT scene's frame (when the next scene is in the same
      // world, i.e. not a graphic card), so the motion resolves there and the cut is seamless — and
      // the background can't drift/reverse (it's anchored to a defined end frame).
      // Chain to the NEXT scene's frame ONLY for b-roll (seamless scene-to-scene flow). NEVER for
      // a-roll — the presenter must stay in their own scene, not morph into the next backdrop.
      const next = scenes[i + 1] as Record<string, string> | undefined;
      const endImageUrl = role === "b-roll" && next && String(next.role || "a-roll") !== "graphic" ? (shotUrl(i + 1) || undefined) : undefined;
      // Match the clip length to the scene's storyboard timecodes (Kling clamps to 3–15s), so the
      // b-roll lines up with the cut instead of a fixed 5s.
      const a = tcSeconds(String(sc.start)); const b = tcSeconds(String(sc.end));
      const sceneDur = a != null && b != null && b > a ? b - a : 5;
      const sub = await step.run(`vsubmit-${i}`, () => submitVideoFromImage({ imageUrl: img, prompt: motion, ratio, endImageUrl, duration: sceneDur }));
      let url: string | null = sub.url;
      if (!url && sub.jobId) {
        for (let n = 0; n < 120; n++) { // ~120 x 8s ≈ 16 min (Kling is slow on heavy scenes)
          const s = await step.run(`vpoll-${i}-${n}`, () => pollVideoJobOnce(sub.jobId as string));
          if (s.url) { url = s.url; break; }
          if (s.terminal) break;
          await step.sleep(`vwait-${i}-${n}`, "8s");
        }
      }
      if (url) {
        await step.run(`u-vid-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: process.env.HF_VIDEO_MODEL || "kling3", unit: "video", action: role === "a-roll" ? "aroll" : "broll", count: 1 }).catch(() => {}));
        const hosted = (await step.run(`vhost-${i}`, () => rehostToBlob(url as string, "clips").catch(() => null))) || url;
        return { scene: i, role, beat, kind: role, url: hosted, status: "ready" };
      }
      return { scene: i, role, beat, kind: role, url: null, status: "failed", error: sub.error || `render started (${sub.model}) but did not finish in time` };
    };

    // Render EVERY scene CONCURRENTLY (wall-clock ≈ the slowest single clip, not the sum). Each
    // scene merge-saves its result as it lands so the UI fills in live; a final save is authoritative.
    // Only render the scenes in the role filter (all of them when no filter).
    const targets = scenes.map((sc, i) => ({ sc, i })).filter(({ sc, i }) => (!roleFilter || roleFilter.includes(String(sc.role || "a-roll"))) && (!sceneFilter || sceneFilter.includes(i)));
    await Promise.all(targets.map(async ({ sc, i }) => {
      const row = await renderOne(i, sc);
      const fresh = (((await step.run(`creload-${i}`, () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
      const prod = (fresh.production ?? production) as Record<string, unknown>;
      const list = Array.isArray(prod.clips) ? [...(prod.clips as ClipRow[])] : [];
      const at = list.findIndex((c) => c.scene === i); if (at >= 0) list[at] = row; else list.push(row);
      await step.run(`csave-${i}`, () => updateInfluencer(influencerId, { persona: { ...fresh, production: { ...prod, clips: list } } }));
      return row;
    }));

    // Re-sort the FULL merged list (this render's clips + any kept from the other role).
    const done = (((await step.run("reload-done", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const prodDone = (done.production ?? production) as Record<string, unknown>;
    const ordered = (Array.isArray(prodDone.clips) ? (prodDone.clips as ClipRow[]) : []).slice().sort((a, b) => a.scene - b.scene);
    await step.run("done", () => updateInfluencer(influencerId, { persona: { ...done, production: { ...prodDone, clips: ordered, clips_status: "done", status: "clips" } } }));
    return { ok: true, clips: ordered.length };
  },
);

// THE PRODUCER — "music & ambient" (its own gated step): generate the music bed + ambient room
// tone up front so the producer can hear them BEFORE the stitch. Saved to production.music_url /
// ambient_url; the stitch reuses them instead of regenerating. Durable; both metered.
export const generateAudio = inngest.createFunction(
  { id: "generate-audio", retries: 0, triggers: [{ event: "influencer/generate.audio" }] }, // retries:0 so a timed-out music call falls back to ambient-only fast (no 2.5-min re-try)
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as { storyboard?: { scenes?: Record<string, string>[]; duration_seconds?: number; tone?: string; music_bed?: string }; brief?: { setting?: string } } | null;
    const sb = production?.storyboard;
    if (!sb?.scenes?.length) return { error: "no storyboard" };
    const total = Math.max(15, Number(sb.duration_seconds) || sb.scenes.length * 5);
    await step.run("mark", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, audio_status: "running" } } }));

    // Generate music + ambient IN PARALLEL (they're independent) — this halves the wait vs running
    // them back-to-back. Each is a single slow ElevenLabs request.
    const brief = sb.music_bed || `${sb.tone || "warm, modern"} background music bed for a social ad, no vocals`;
    const setting = String(production?.brief?.setting || sb.scenes[0]?.location || "the location").slice(0, 120);
    const [musicUrl, ambientUrl] = await Promise.all([
      step.run("music", async () => putBytes(await generateMusic(brief, total * 1000), "music", "mp3", "audio/mpeg")).catch(() => null),
      step.run("ambient", async () => putBytes(await generateSfx(`continuous ambient background sound of ${setting}: low natural room tone, distant murmur and movement, gentle environment, no music and no speech`, 22), "ambient", "mp3", "audio/mpeg")).catch(() => null),
    ]);
    if (musicUrl) await step.run("u-music", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "music", count: 1 }).catch(() => {}));
    if (ambientUrl) await step.run("u-ambient", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "ambient", count: 1 }).catch(() => {}));

    const done = (((await step.run("reload", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const prod = (done.production ?? production) as Record<string, unknown>;
    await step.run("save", () => updateInfluencer(influencerId, { persona: { ...done, production: { ...prod, music_url: musicUrl, ambient_url: ambientUrl, audio_status: "done" } } }));
    return { ok: true, music: !!musicUrl, ambient: !!ambientUrl };
  },
);

// THE PRODUCER — "stitch the cut": assemble the rendered clips into one finished ad with
// Shotstack — clips in scene order, a continuous voiceover (a-roll VO is baked in; b-roll/
// graphic scenes get a laid-in VO), burned-in captions, a brand bug, and a music bed mixed
// underneath. Durable; music + render metered. Produces production.final_url.
function tcSeconds(tc: string): number | null {
  const m = String(tc || "").trim().match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d+))?$/);
  if (!m) return null;
  return (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseInt(m[2], 10) + (m[3] ? parseFloat(`0.${m[3]}`) : 0);
}
export const assembleVideo = inngest.createFunction(
  { id: "assemble-video", retries: 1, triggers: [{ event: "influencer/assemble.video" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as {
      brief?: { brand?: string; logo?: string; logoUrl?: string; promoUrl?: string; logoPosition?: string };
      storyboard?: { scenes?: Record<string, string>[]; format?: string; music_bed?: string; tone?: string; duration_seconds?: number; legal?: string };
      clips?: { scene: number; role: string; url: string | null; kind?: string; synced?: boolean; audio_url?: string | null }[];
    } | null;
    const sb = production?.storyboard;
    const scenes = sb?.scenes ?? [];
    const clips = production?.clips ?? [];
    if (!scenes.length || !clips.some((c) => c.url)) return { error: "render the clips first" };
    const voiceId = persona.voice_id as string | undefined;
    const ratio = String(sb?.format || "").includes("1:1") ? "1:1" : "9:16";
    const clipUrl = (i: number) => clips.find((c) => c.scene === i)?.url || null;

    await step.run("mark-running", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, assembly_status: "running", final_url: null } } }));

    // Lay scenes on the timeline using the storyboard timecodes; fall back to 5s sequential.
    let cursor = 0;
    const placed = scenes.map((sc, i) => {
      const a = tcSeconds(String(sc.start)); const b = tcSeconds(String(sc.end));
      let start = a != null ? a : cursor;
      let len = a != null && b != null && b > a ? b - a : 5;
      if (a == null) start = cursor;
      cursor = start + len;
      return { i, start, len, role: String(sc.role || "a-roll"), vo: String(sc.vo_line || "").trim(), caption: String(sc.caption || "").trim() };
    });
    // A breath after the last word so the cut doesn't end abruptly: hold the final clip ~1.2s longer
    // and extend the timeline (music fades out over it).
    const TAIL = 1.2;
    if (placed.length) placed[placed.length - 1].len += TAIL;
    const total = (Math.max(cursor, Number(sb?.duration_seconds) || cursor) || 30) + TAIL;

    // Music bed (full length) → Blob. REUSE the audio step's bed if it already produced one.
    let musicUrl: string | null = (production as { music_url?: string })?.music_url || null;
    if (!musicUrl) try {
      const brief = sb?.music_bed || `${sb?.tone || "warm, modern"} background music bed for a social ad, no vocals`;
      musicUrl = await step.run("music", async () => putBytes(await generateMusic(brief, total * 1000), "music", "mp3", "audio/mpeg"));
      await step.run("u-music", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "music", count: 1 }).catch(() => {}));
    } catch { musicUrl = null; }

    // Ambient bed: a continuous low room/location tone under everything (ElevenLabs SFX). SFX clips
    // max ~22s, so tile copies across the full duration. Mixed UNDER the VO + music. Reuse if present.
    let ambientUrl: string | null = (production as { ambient_url?: string })?.ambient_url || null;
    if (!ambientUrl) try {
      const setting = String((production?.brief as { setting?: string })?.setting || scenes[0]?.location || "the location").slice(0, 120);
      ambientUrl = await step.run("ambient", async () => putBytes(await generateSfx(`continuous ambient background sound of ${setting}: low natural room tone, distant murmur and movement, gentle environment, no music and no speech`, 22), "ambient", "mp3", "audio/mpeg"));
      await step.run("u-ambient", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "ambient", count: 1 }).catch(() => {}));
    } catch { ambientUrl = null; }
    const ambientTrack: Record<string, unknown>[] = [];
    if (ambientUrl) for (let t = 0; t < total; t += 22) ambientTrack.push({ asset: { type: "audio", src: ambientUrl, volume: 0.1 }, start: t, length: Math.min(22, total - t) });

    // Voiceover track. A-roll: lay back the EXACT audio we lip-synced to (Seedance video is silent),
    // so the voice matches the lips perfectly. B-roll/graphic: generate the VO from the scene line.
    const voTrack: Record<string, unknown>[] = [];
    for (const p of placed) {
      const clip = clips.find((c) => c.scene === p.i);
      const synced = clip?.audio_url as string | undefined;
      if (synced) { voTrack.push({ asset: { type: "audio", src: synced }, start: p.start, length: p.len }); continue; }
      if (voiceId && p.vo) {
        try {
          const url = await step.run(`vo-${p.i}`, async () => {
            const mod = await moderateText(p.vo); // screen before any ElevenLabs TTS call
            if (!mod.allowed) return null;
            return putBytes(await tts(voiceId, p.vo, { expressive: true }), "vo", "mp3", "audio/mpeg");
          });
          if (url) {
            await step.run(`u-vo-${p.i}`, () => recordUsage({ influencerId, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {}));
            voTrack.push({ asset: { type: "audio", src: url }, start: p.start, length: p.len });
          }
        } catch { /* skip this VO */ }
      }
    }

    // Build the Shotstack timeline (top track renders on top). All clips are silent; voice is the
    // voTrack above (a-roll's exact synced audio + b-roll VO), so nothing doubles up.
    const videoClips = placed.filter((p) => clipUrl(p.i)).map((p) => ({
      asset: { type: "video", src: clipUrl(p.i) as string, volume: 0 },
      start: p.start, length: p.len, fit: "cover",
      transition: { in: "fade", out: "fade" },
    }));
    // Captions on by default; producer can switch them off for a clean cut.
    const captionsOn = (production?.brief as { captions?: boolean })?.captions !== false;
    const captionClips = captionsOn ? placed.filter((p) => p.caption).map((p) => ({
      asset: { type: "title", text: p.caption, style: "subtitle", size: "small", position: "bottom" },
      start: p.start, length: p.len,
    })) : [];
    // Brand overlays: logo TOP-LEFT + promo image TOP-RIGHT, both auto-sized + inset so they sit
    // cleanly and stay legible. Logo falls back to the brand name as small text if no logo uploaded.
    const logoUrl = (production?.brief?.logoUrl || "").trim();
    const promoUrl = (production?.brief?.promoUrl || "").trim();
    const brand = (production?.brief?.brand || "").trim();
    const brandTrack: Record<string, unknown>[] = [];
    if (logoUrl) brandTrack.push({ asset: { type: "image", src: logoUrl }, start: 0, length: total, position: "topLeft", scale: 0.16, offset: { x: 0.04, y: -0.04 } });
    else if (brand) brandTrack.push({ asset: { type: "title", text: brand, style: "minimal", size: "x-small", position: "topLeft" }, start: 0, length: total });
    if (promoUrl) brandTrack.push({ asset: { type: "image", src: promoUrl }, start: 0, length: total, position: "topRight", scale: 0.18, offset: { x: -0.04, y: -0.04 } });

    const tracks: Record<string, unknown>[] = [];
    if (brandTrack.length) tracks.push({ clips: brandTrack });
    if (captionClips.length) tracks.push({ clips: captionClips });
    if (voTrack.length) tracks.push({ clips: voTrack });
    if (ambientTrack.length) tracks.push({ clips: ambientTrack });
    tracks.push({ clips: videoClips });

    const edit: Record<string, unknown> = {
      timeline: { background: "#000000", ...(musicUrl ? { soundtrack: { src: musicUrl, effect: "fadeOut", volume: 0.18 } } : {}), tracks },
      output: { format: "mp4", aspectRatio: ratio === "1:1" ? "1:1" : "9:16", resolution: "1080", fps: 25 },
    };

    let finalUrl: string | null = null; let err: string | null = null;
    try {
      const renderId = await step.run("render", () => renderEdit(edit));
      // DURABLE poll: short status checks with step.sleep between, so the Shotstack render (which
      // can take minutes) never blocks one invocation long enough to time out + retry-loop.
      let out: { url: string | null; error: string | null } = { url: null, error: "render timed out" };
      for (let n = 0; n < 100; n++) { // ~100 x 6s ≈ 10 min (Shotstack render of a full cut)
        const s = await step.run(`renderpoll-${n}`, () => pollRenderOnce(renderId));
        if (s.url) { out = { url: s.url, error: null }; break; }
        if (s.terminal) { out = { url: null, error: s.error }; break; }
        await step.sleep(`renderwait-${n}`, "6s");
      }
      if (out.url) {
        finalUrl = (await step.run("host-final", () => rehostToBlob(out.url as string, "finals").catch(() => null))) || out.url;
        await step.run("u-stitch", () => recordUsage({ influencerId, provider: "shotstack", model: "edit", unit: "render", action: "stitch", count: 1 }).catch(() => {}));
      } else err = out.error;
    } catch (e) { err = String((e as Error)?.message || e).slice(0, 220); }

    const done = (((await step.run("reload", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const prod = (done.production ?? production) as Record<string, unknown>;
    await step.run("save", () => updateInfluencer(influencerId, { persona: { ...done, production: { ...prod, final_url: finalUrl, music_url: musicUrl, ambient_url: ambientUrl, assembly_status: "done", assembly_error: err, status: finalUrl ? "final" : "clips" } } }));
    return { ok: !!finalUrl, error: err };
  },
);

// THE PRODUCER — re-shoot ONE scene (keep the rest). Same identity + clothing/location refs as the
// full board; anchors to an existing good frame for continuity; honours the scene's (edited) direction.
export const reshootShot = inngest.createFunction(
  { id: "reshoot-shot", retries: 1, triggers: [{ event: "influencer/reshoot.shot" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const index = Number(event.data.scene);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as { brief?: Record<string, string>; storyboard?: { scenes?: Record<string, string>[]; format?: string }; shots?: ShotRow[] } | null;
    const scenes = production?.storyboard?.scenes ?? [];
    const sc = scenes[index] as Record<string, string> | undefined;
    if (!sc) return { error: "no such scene" };
    const role = String(sc.role || "a-roll");
    if (role === "graphic") return { skipped: "graphic scene" };
    const ratio = String(production?.storyboard?.format || "").includes("1:1") ? "1:1" : "9:16";

    const uploadedRefs = Array.isArray(persona.reference_images) ? (persona.reference_images as string[]).filter((u) => typeof u === "string") : [];
    const refFromUrl = typeof persona.reference_url === "string" && persona.reference_url ? [persona.reference_url] : [];
    const anchored = uploadedRefs.length ? uploadedRefs.slice(0, 4) : refFromUrl;
    const idRefUrls = anchored.length ? anchored : [(persona.face_card_url as string) || (persona.hero_url as string) || (persona.chosen_url as string) || ""].filter(Boolean);
    const featureUrl = anchored.length ? "" : ((persona.feature_sheet_url as string) || "");
    const idMedias = await step.run("import-identity", async () => {
      const ids = (await Promise.all(idRefUrls.map((u) => importMediaUrl(u).catch(() => null)))).filter((v): v is string => !!v);
      if (featureUrl) { const f = await importMediaUrl(featureUrl).catch(() => null); if (f) ids.push(f); }
      return ids;
    });
    const bibleId = ((persona.bible as { identity?: { age?: string; build?: string; ethnicity_design?: string } })?.identity) ?? {};
    const subjectLine = [bibleId.age, bibleId.build, bibleId.ethnicity_design].filter(Boolean).join(", ") || `${inf.name}, the influencer`;
    const look = lookClause(persona);
    const brief = (production?.brief ?? {}) as Record<string, string>;
    const clothMedia = brief.clothingRef ? await step.run("import-cloth", () => importMediaUrl(brief.clothingRef).catch(() => null)) : null;
    const locMedia = brief.locationRef ? await step.run("import-loc", () => importMediaUrl(brief.locationRef).catch(() => null)) : null;
    // Continuity anchor: an existing good frame from another scene.
    const others = (production?.shots ?? []).filter((s) => s.scene !== index && s.url);
    const worldRef = others.length ? await step.run("import-world", () => importMediaUrl(others[0].url as string).catch(() => null)) : null;

    let n = idMedias.length;
    const faceTags = idMedias.map((_, k) => `@image${k + 1}`);
    const clothTag = clothMedia ? `@image${++n}` : "";
    const locTag = locMedia ? `@image${++n}` : "";
    const worldTag = worldRef ? `@image${++n}` : "";
    const refInstruction = [
      faceTags.length ? `IDENTITY LOCK: ${faceTags.join(", ")} are the SAME real person, replicate them EXACTLY; zero drift. IGNORE their clothing, background and pose; take those from the direction below.` : "",
      clothTag ? `${clothTag} is a WARDROBE reference: dress them in this exact outfit. Do NOT copy any face or person from it.` : "",
      locTag ? `${locTag} is a LOCATION reference: set this scene in that exact place. Do NOT copy any face or person from it.` : "",
      worldTag ? `${worldTag} is the ESTABLISHED world: match its location, lighting and colour grade for continuity.` : "",
    ].filter(Boolean).join(" ");
    const prompt = buildShotPrompt({
      location: String(sc.location || ""), blocking: String(sc.blocking || ""), shot: String(sc.shot || ""),
      performance: String(sc.performance || ""), role, subjectLine, look, refInstruction, ratio,
      hasPeople: true, worldAnchored: !!worldRef,
    });
    const medias = [...idMedias, ...(clothMedia ? [clothMedia] : []), ...(locMedia ? [locMedia] : []), ...(worldRef ? [worldRef] : [])].map((value) => ({ value, role: "image" }));
    const url = await step.run("shot", () => generateBatch([prompt], IMAGE_MODEL, ratio, medias.length ? { medias } : {}, CREATIVE_FALLBACK).then((a) => a[0] ?? null));
    let hosted: string | null = null;
    if (url) {
      const ok = (await step.run("valid", () => filterLoadable([url]))).length > 0;
      if (ok) {
        hosted = (await step.run("host", () => rehostToBlob(url, "shots").catch(() => null))) || url;
        await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: IMAGE_MODEL, unit: "image", action: "creative", count: 1 }));
      }
    }
    const fresh = (((await step.run("reload", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const prod = (fresh.production ?? production) as Record<string, unknown>;
    const list = (Array.isArray(prod.shots) ? [...(prod.shots as ShotRow[])] : []) as (ShotRow & { reshooting?: boolean })[];
    const row = { scene: index, role, beat: String(sc.beat || ""), url: hosted || (list.find((s) => s.scene === index)?.url ?? null), error: hosted ? null : "no image", reshooting: false };
    const at = list.findIndex((s) => s.scene === index);
    if (at >= 0) list[at] = row; else list.push(row);
    // Re-shooting the still drops this scene's stale clip, then immediately re-renders just this
    // scene's clip (a-roll → fresh lip-synced video, b-roll → fresh motion) so the new clip drops
    // straight back into the step preview — no separate "render" click needed.
    const freshClips = Array.isArray(prod.clips) ? (prod.clips as { scene: number }[]).filter((c) => c.scene !== index) : prod.clips;
    const hasFrame = list.some((s) => Number(s.scene) === index && s.url);
    await step.run("save", () => updateInfluencer(influencerId, { persona: { ...fresh, production: { ...prod, shots: list, clips: freshClips, ...(hasFrame ? { clips_status: "running" } : {}) } } }));
    if (hasFrame) await step.run("queue-clip", () => inngest.send({ name: "influencer/generate.clips", data: { influencerId, scenes: [index] } }));
    return { ok: !!hosted };
  },
);

// VIDEO SPIKE — isolate-and-verify the two video engines on ONE existing frame: a Kling b-roll
// (verified schema) and a HeyGen Avatar IV a-roll (living background). Durable poll (step.sleep).
// Writes persona.spike = { broll_url, aroll_url, errors }. Super-admin triggered.
export const videoSpike = inngest.createFunction(
  { id: "video-spike", retries: 0, triggers: [{ event: "producer/spike" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string }[]) : [];
    const creatives = Array.isArray(persona.creatives) ? (persona.creatives as { url?: string | null }[]) : [];
    const img = (persona.hero_url as string) || (persona.face_card_url as string) || refs.find((r) => r.url)?.url || creatives.find((c) => c.url)?.url || (persona.reference_url as string) || (Array.isArray(persona.reference_images) ? (persona.reference_images as string[])[0] : "") || "";
    const ratio = "9:16";
    const save = async (tag: string, patch: Record<string, unknown>) => {
      const fresh = (((await step.run(`reload-${tag}`, () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
      await step.run(`save-${tag}`, () => updateInfluencer(influencerId, { persona: { ...fresh, spike: { ...((fresh.spike as Record<string, unknown>) || {}), ...patch } } }));
    };
    await save("init", { status: "running", source_image: img, broll_url: null, broll_error: null, aroll_url: null, aroll_error: null, at: event.data.at || null });
    if (!img) { await save("noimg", { status: "done", broll_error: "no source image on this influencer" }); return { error: "no image" }; }

    // B-ROLL — Kling, verified schema.
    const sub = await step.run("broll-submit", () => submitVideoFromImage({ imageUrl: img, prompt: "Cinematic b-roll: the scene is alive — background people walk past, gentle camera drift, leaves and light moving; natural ambient motion, photoreal.", ratio }));
    let brollUrl: string | null = sub.url;
    if (!brollUrl && sub.jobId) {
      for (let n = 0; n < 120; n++) { // ~16 min (video spike: Kling can be slow)
        const s = await step.run(`bpoll-${n}`, () => pollVideoJobOnce(sub.jobId as string));
        if (s.url) { brollUrl = s.url; break; }
        if (s.terminal) break;
        await step.sleep(`bwait-${n}`, "8s");
      }
    }
    if (brollUrl) { const h = (await step.run("broll-host", () => rehostToBlob(brollUrl as string, "spike").catch(() => null))) || brollUrl; await save("broll", { broll_url: h }); }
    else await save("broll-fail", { broll_error: sub.error || `submitted (${sub.model}) but did not finish in time` });

    // A-ROLL — HeyGen Avatar IV with a living background (needs a voice).
    const voiceId = persona.voice_id as string | undefined;
    if (voiceId) {
      try {
        const audioUrl = await step.run("aroll-tts", async () => putBytes(await tts(voiceId, "Hi, here is a quick look at what I have been loving lately.", { expressive: true }), "spike-vo", "mp3", "audio/mpeg"));
        const started = await step.run("aroll-start", () => startTalkingVideo({ imageUrl: img, audioUrl, ratio, motionPrompt: "She talks to camera with natural head movement and easy gestures. The WHOLE scene is alive and moving: background people walk past, traffic or ambient activity behind her, leaves in the breeze, shifting light — never a frozen backdrop." }));
        let arollUrl: string | null = null; let arollErr: string | null = null;
        for (let n = 0; n < 45; n++) {
          const s = await step.run(`apoll-${n}`, () => pollTalking(started.videoId, started.version).catch(() => ({ status: "unknown", url: null as string | null, error: null as string | null })));
          if (s.url) { arollUrl = s.url; break; }
          if (s.status === "failed") { arollErr = s.error; break; }
          await step.sleep(`await-${n}`, "8s");
        }
        if (arollUrl) { const h = (await step.run("aroll-host", () => rehostToBlob(arollUrl as string, "spike").catch(() => null))) || arollUrl; await save("aroll", { aroll_url: h }); }
        else await save("aroll-fail", { aroll_error: arollErr || "a-roll did not finish in time" });
      } catch (e) { await save("aroll-err", { aroll_error: String((e as Error)?.message || e).slice(0, 200) }); }
    } else {
      await save("aroll-novoice", { aroll_error: "no voice set — set a voice (Video & Voice) to test a-roll" });
    }

    await save("done", { status: "done" });
    return { ok: true };
  },
);
