import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer, updateProductionFields, upsertClip } from "@/lib/influencers";
import { buildIdentityPrompt, lookClause, genderWord, REALISM_POSITIVE, SCENE_REALISM, SCENE_PEOPLE, NO_EXTRAS, buildCreativeImagePrompt, buildIdentityCardPrompt, buildFeatureSheetPrompt, buildTurnaroundPrompt, buildShotPrompt, castLockClause, CLOTHED, HUMANISER } from "@/lib/realism";
import { createFaceElement, generateBatch, generateBatchDetailed, generateAngles2_0, upscaleUrlTo, upscaleUrlToDetailed, filterLoadable, importMediaUrl, submitVideoFromImage, submitTalkingVideo, pollVideoJobOnce, humaniseUrl } from "@/lib/vendors/higgsfield";
import { submitOmniHuman, pollOmniHumanOnce } from "@/lib/vendors/fal";
import { submitDopVideo, pollDopOnce, dopConfigured, submitKlingRest, klingRestConfigured, submitImageRest, submitSeedanceRest, seedanceRestConfigured } from "@/lib/vendors/higgsfield-dop";
import { onProductionFailure, alertIfCritical } from "@/lib/alerts";
import { notifyRenderDone } from "@/lib/notify";
import { bibleWardrobe } from "@/lib/bible";
import { compressForFal } from "@/lib/image";
import { rehostToBlob, putBytes } from "@/lib/blob";
import { texturiseClip, texturePassEnabled } from "@/lib/texture";
import { normaliseToLufs, bedVolume, BED_REFERENCE_LUFS, VO_REFERENCE_LUFS, MUSIC_UNDER_VO_DB, AMBIENT_UNDER_VO_DB } from "@/lib/loudness";
import { tts, ttsWithDuration, ttsPcm, pcmSliceToWav, fadeWavEdges, normalizeWav, highpassWav, wavDataStart, generateMusic, generateSfx } from "@/lib/vendors/elevenlabs";
import { renderEdit, pollRenderOnce, probeDuration } from "@/lib/vendors/shotstack";
import { startTalkingVideo, pollTalking, remainingQuota } from "@/lib/vendors/heygen";
import { qaCreative, composeCreativeScene, moderateText, matchesIdentity, describeOutfit } from "@/lib/vendors/anthropic";
import { createTalkingPhoto } from "@/lib/vendors/heygen";
import { scrape, startCrawl, crawlStatus, sitemapUrls } from "@/lib/vendors/firecrawl";
import { chunkText, ingestChunks, clearSourceChunks } from "@/lib/rag";
import { setSourceStatus } from "@/lib/brains";
import { recordUsage } from "@/lib/usage";

const CANDIDATE_COUNT = 6;

// Image identity engine. Nano Banana Pro is best-of-breed for reference-conditioned face
// consistency (blends many refs, native square) AND is UNLIMITED on our Ultra plan, so it is
// free and should fix the gpt_image_2 1:1 failure. Env-overridable in case the live model id
// differs; generation falls back to a known-good model per call so a wrong id never hard-breaks.
// PAID model by default for PRIORITY: the free nano_banana_pro gets deprioritised in Higgsfield's
// queue (sits in a holding pattern), so we render on the paid nano_banana_2 (a couple credits) to
// jump the queue. Env-tunable (HF_IMAGE_MODEL=nano_banana_pro to go back to free).
// Auto Vision QA (Haiku) + re-roll add a vision call (and sometimes a full re-gen) per frame. Off by
// default — the prompt-level guards (clothed, identity lock, glasses) stay on, and the producer QAs
// the board/photoshoot manually. Set PRODUCER_QA=1 to re-enable automatic QA + re-roll.
const QA_ON = process.env.PRODUCER_QA === "1";
const IMAGE_MODEL = process.env.HF_IMAGE_MODEL || "gpt_image_2";
// The Humaniser always renders through nano_banana_pro (hard-coded in humaniseUrl), NOT the general image
// model. Metering it as IMAGE_MODEL billed every humanise at gpt_image_2's rate (4 credits / 308c) when the
// real call is free on the Ultra plan - it over-charged Cost Control on every keyframe.
const HUMANISER_MODEL = "nano_banana_pro";
const IMAGE_FALLBACK = "nano_banana_pro"; // free fallback (also covers gpt_image_2's only weak spot: 1:1/square)
// PRIORITY (faster, PAID) image model: jumps Higgsfield's queue when the producer opts in for speed.
// Metered at its rate_card cost (nano_banana_2 ≈ 1 credit). Env-tunable.
const PRIORITY_MODEL = process.env.HF_PRIORITY_MODEL || "nano_banana_2";
// IDENTITY BUILD model (casting + photoshoot): the free models sit in Higgsfield's deprioritised queue
// for 30+ min, so the foundational build renders on the FAST paid model by default - it's a one-time,
// metered cost per influencer and far better than a half-hour crawl. Env-tunable (HF_BUILD_MODEL).
const BUILD_MODEL = process.env.HF_BUILD_MODEL || PRIORITY_MODEL;
const CREATIVE_FALLBACK = "nano_banana_pro"; // free fallback for creatives/producer (gpt_image_2 is now primary)

// Stage 2 (Photoshoot) builds the Soul TRAINING SET from the chosen face. Recipe follows
// the Higgsfield Soul photo guide: 8 to 12 sharp, single-person frames that vary ANGLE,
// LIGHTING, EXPRESSION and DISTANCE while keeping ONE clear, consistent face. We do NOT
// vary outfit/scene to extremes (the guide warns against costumes): a Soul captures the
// FACE, and wardrobe + location are then driven by the prompt at generation time. Clean,
// neutral backgrounds keep the training focused on identity (no scene to clone later).
type TrainingLook = { frame: string; light: string; wardrobe: string; full?: boolean };
// Trimmed to 8 (from 11) — keeps the full forensic coverage (front/3-4 both sides/profile/back, neutral
// + smile + talking, close-up → full-length, a clean hands frame) while cutting ~25% of the render time.
const TRAINING_LOOKS: TrainingLook[] = [
  { frame: "tight head-shot close-up, front on, neutral relaxed expression, sharp eye catchlights and natural skin pores", light: "soft even indoor light", wardrobe: "a plain crew-neck t-shirt with jeans" },
  { frame: "head-and-shoulders portrait, three-quarter left angle, faint natural smile", light: "soft daylight from a window", wardrobe: "a casual button shirt with trousers" },
  { frame: "head-and-shoulders portrait, three-quarter right angle, mid-conversation talking expression", light: "warm indoor light", wardrobe: "a relaxed knit top with trousers" },
  { frame: "clean side profile of the face, neutral", light: "directional studio key light", wardrobe: "a plain top with trousers" },
  { frame: "head-and-shoulders, straight on into the lens, warm genuine smile", light: "soft golden-hour light", wardrobe: "a smart-casual top with tailored trousers" },
  { frame: "head-and-shoulders, one hand raised naturally near the jaw, the hand and fingers clearly visible and correctly formed", light: "soft daylight", wardrobe: "a casual top with jeans" },
  { frame: "three-quarter BACK view over the shoulder, face turned partly back to camera, showing the back of the head, hair and shoulders", light: "soft even light", wardrobe: "a plain top with trousers" },
  { frame: "full-length head to toe, standing in a relaxed natural pose, both feet and full legs visible and clothed", light: "even studio light", wardrobe: "a complete casual outfit — a top AND full-length trousers (legs fully covered, never bare)", full: true },
];

// STAGE 1, Casting. Generate CANDIDATE_COUNT distinct looks from the brief so the
// producer can choose the face. Each is an independent generation (different person),
// persisted as it lands for a live progress board. Images are free on Ultra.
export const generateCandidates = inngest.createFunction(
  {
    id: "generate-references",
    name: "Generate casting looks",
    retries: 1, onFailure: onProductionFailure,
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
      // Generate all candidates CONCURRENTLY (collapses casting to ~one image's wall-clock). Render at
      // 1K (env-tunable) — these are just for picking a face, and the photoshoot re-renders at full
      // quality after. 1K candidates generate faster AND download to the gallery far quicker (the 2K
      // PNGs were trickling in like a lazy-load).
      const castRes = process.env.HF_CAST_RES || "1k";
      const urls = await step.run("cast", () => generateBatch(Array(CANDIDATE_COUNT).fill(prompt), BUILD_MODEL, "9:16", { resolution: castRes }, IMAGE_FALLBACK));
      const produced = [...new Set(urls.filter((u): u is string => !!u))];
      // Meter what Higgsfield produced (billed), BEFORE dropping any that fail to load.
      if (produced.length) await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: BUILD_MODEL, unit: "image", action: "casting", count: produced.length }));
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
    retries: 1, onFailure: onProductionFailure,
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
      // Use the 2 strongest uploads as per-frame identity anchors (was 4) — fewer @image refs renders
      // noticeably faster and still holds the likeness. All uploads still appear as real frames below.
      const refMedias = await step.run("anchor-import", async () =>
        (await Promise.all(valid.slice(0, 2).map((u) => importMediaUrl(u).catch(() => null)))).filter((v): v is string => !!v),
      );
      const g = genderWord(persona.gender);
      const bibleId = ((persona.bible as { identity?: { age?: string; build?: string; ethnicity_design?: string } })?.identity) ?? {};
      const subjectLine = [bibleId.age, g, bibleId.build, bibleId.ethnicity_design].filter(Boolean).join(", ") || g;
      const look = lookClause(persona);

      if (refMedias.length) {
        const faceTags = refMedias.map((_, k) => `@image${k + 1}`).join(", ");
        const idLock = `${faceTags} are the SAME real person — replicate their face EXACTLY (bone structure, eye shape and colour, nose, lips, real skin tone and texture, hair); unmistakably the same individual in every frame, zero drift. If they wear glasses or any signature eyewear in the reference photos, keep that EXACT eyewear on them in EVERY frame, unchanged — never remove, add or restyle their glasses. IGNORE their original clothing, background and pose; take those from the direction below.`;
        const prompts = looks.map((l) => {
          const core = l.full ? SCENE_REALISM : REALISM_POSITIVE;
          return `A real photograph of ${subjectLine}. ${idLock} ${l.frame}, ${l.light}, wearing ${l.wardrobe}, against a clean simple neutral background, ${look}. She is ${CLOTHED}. ${core}.`;
        });
        // Reference frames at 1K — they feed the Soul + act as anchors (not 4K finals), so 1K halves
        // the photoshoot time with no meaningful loss. Identity cards below stay 2K for fidelity.
        const ex = { medias: refMedias.map((value) => ({ value, role: "image" })), resolution: "1k" };
        // LAND FRAMES IN LIVE WAVES: the old single batch generated all ~11 frames then saved ONCE at
        // the end — so the gallery sat on 1/12 for minutes and a single slow frame stalled everything.
        // Now we generate in small concurrent chunks and SAVE after each (durable reload-merge), so
        // frames appear as they land and a late hang can't lose the earlier waves. Chunk size tunable.
        const heroFrame = { url: valid[0], hero: true, face: true } as { url: string; hero?: boolean; face?: boolean };
        const extraReal = valid.slice(1).map((url) => ({ url }) as { url: string });
        const framesExpected = looks.length + valid.length;
        const CHUNK = Math.max(1, Number(process.env.HF_SHOOT_CHUNK) || 6); // ~2 waves for the full set — same speed as before, but frames land mid-way instead of all at the end
        let collected: string[] = [];
        const saveProgress = async (tag: string | number, done: boolean) => {
          const fresh = (((await step.run(`shoot-reload-${tag}`, () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
          const out: { url: string; hero?: boolean; face?: boolean }[] = [heroFrame, ...extraReal];
          for (const url of collected) if (!out.some((f) => f.url === url)) out.push({ url });
          await step.run(`shoot-save-${tag}`, () => updateInfluencer(influencerId, {
            look_refs: out, status: done ? "frames_ready" : "generating",
            persona: { ...fresh, hero_url: valid[0], frames_expected: framesExpected, face_card_url: valid[0], feature_sheet_url: null, turnaround_url: null },
          }));
        };
        for (let c = 0; c < prompts.length; c += CHUNK) {
          const urls = await step.run(`anchored-shoot-${c}`, () => generateBatch(prompts.slice(c, c + CHUNK), BUILD_MODEL, "9:16", ex, IMAGE_FALLBACK));
          const got = await step.run(`valid-shoot-${c}`, () => filterLoadable(urls.filter((u): u is string => !!u)));
          if (got.length) {
            await step.run(`u-shoot-${c}`, () => recordUsage({ influencerId, provider: "higgsfield", model: BUILD_MODEL, unit: "image", action: "photoshoot", count: got.length }).catch(() => {}));
            collected = [...collected, ...got];
            await saveProgress(c, false); // land this wave live
          }
        }
        // Optional identity/clothing QA (off by default) — drop any drifted/bare-legged frames, never empty.
        if (QA_ON && collected.length) {
          try {
            const filtered = await step.run("identity-qa", () => Promise.all(collected.map(async (u) => {
              const [idOk, qa] = await Promise.all([matchesIdentity(u, valid[0]).catch(() => true), qaCreative(u).catch(() => ({ pass: true }))]);
              return { u, ok: idOk && qa.pass };
            }))).then((rs) => rs.filter((r) => r.ok).map((r) => r.u));
            if (filtered.length) collected = filtered;
          } catch { /* keep all */ }
        }
        // HUMANISER on the primary generated FACE frame (always) — a real-skin foundation. The hero is
        // the real upload (already real, left untouched); we polish the lead generated close-up only.
        if (collected.length) {
          const h = await step.run("humanise-face", () => humaniseUrl(collected[0], { prompt: HUMANISER, ratio: "9:16" }).catch(() => null));
          if (h && (await step.run("vhuman-face", () => filterLoadable([h]))).length) {
            collected = [h, ...collected.slice(1)];
            await step.run("u-humanise-face", () => recordUsage({ influencerId, provider: "higgsfield", model: HUMANISER_MODEL, unit: "image", action: "humaniser", count: 1 }).catch(() => {}));
          }
        }
        await saveProgress("done", true);
        return { ok: true, frames: collected.length + valid.length, anchored: true, generated: collected.length };
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
          return `${head}, ${wardrobePhrase}, ${l.frame}, ${l.light}, against a clean simple neutral background, ${look}. ${CLOTHED}. ${core}.`;
        });
        urls = await step.run("variations", () => generateBatch(vPrompts, BUILD_MODEL, "9:16", { resolution: "1k" }, IMAGE_FALLBACK));
        const produced = urls.filter((u): u is string => !!u);
        if (produced.length) await step.run("usage", () => recordUsage({ influencerId, provider: "higgsfield", model: BUILD_MODEL, unit: "image", action: "photoshoot", count: produced.length }));
      }
      
      const produced = urls.filter((u): u is string => !!u);
      // looks[0] is the tight face close-up; tag it as the clean identity anchor for
      // creatives (a face reference clones far less wardrobe/scene than a full photo).
      let closeUpUrl = produced[0] || null;
      const validFrames = await step.run("validate-frames", () => filterLoadable(produced));
      // HUMANISER on the FACE anchor (always) — this AI close-up is the identity reference the creatives
      // + the board clone from, so a real-skin pass here propagates the realism everywhere downstream.
      if (closeUpUrl && validFrames.includes(closeUpUrl)) {
        const h = await step.run("humanise-face", () => humaniseUrl(closeUpUrl as string, { prompt: HUMANISER, ratio: "9:16" }).catch(() => null));
        if (h && (await step.run("vhuman-face", () => filterLoadable([h]))).length) {
          validFrames[validFrames.indexOf(closeUpUrl)] = h; closeUpUrl = h;
          await step.run("u-humanise-face", () => recordUsage({ influencerId, provider: "higgsfield", model: HUMANISER_MODEL, unit: "image", action: "humaniser", count: 1 }).catch(() => {}));
        }
      }
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
              generateBatch([buildIdentityCardPrompt()], BUILD_MODEL, "1:1", ex, IMAGE_FALLBACK).catch(() => []),
              generateBatch([buildFeatureSheetPrompt()], BUILD_MODEL, "3:4", ex, IMAGE_FALLBACK).catch(() => []),
              generateBatch([buildTurnaroundPrompt()], BUILD_MODEL, "16:9", ex, IMAGE_FALLBACK).catch(() => []),
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
        if (made) await step.run("usage-cards", () => recordUsage({ influencerId, provider: "higgsfield", model: BUILD_MODEL, unit: "image", action: "photoshoot", count: made }));
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
  { id: "ingest-source", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "brain/ingest.source" }] },
  async ({ event, step }) => {
    const sourceId = String(event.data.sourceId);
    const clientId = String(event.data.clientId);
    const type = String(event.data.type || "text");
    const uri = String(event.data.uri || "");
    const text = String(event.data.text || "");
    const includePath = event.data.includePath ? String(event.data.includePath) : null;

    try {
      let items: { content: string; metadata?: Record<string, unknown> }[];
      if (type === "crawl") {
        // SITEMAP FIRST. Firecrawl's crawler would not follow this site's article links however it was
        // configured - pointed at the index it returned a case study, a privacy policy and the sitemap, but
        // never one of the 76 articles, which are plain anchors in the served HTML. So we stop relying on
        // another crawler's link heuristics and read the site's own sitemap, which lists every page by
        // definition, then scrape exactly the ones the path filter asks for.
        const listed = await step.run("sitemap", () => sitemapUrls(uri, includePath));

        let pages: { url: string; title: string; content: string }[] = [];
        if (listed.length) {
          // Scrape in small batches, each its own step. A step that tries 76 pages will time out, and a
          // timed-out step is retried - which is exactly how the previous version doubled a brain's chunks.
          const targets = listed.slice(0, 90);
          const B = 6;
          for (let i = 0; i < targets.length; i += B) {
            const slice = targets.slice(i, i + B);
            const got = await step.run(`scrape-${i / B}`, async () =>
              (await Promise.all(slice.map((u) => scrape(u).catch(() => null))))
                .filter((p): p is { url: string; title: string; content: string } => !!p && p.content.length > 400));
            pages = pages.concat(got);
          }
          await step.run("usage-crawl", () => recordUsage({ clientId, provider: "firecrawl", model: "scrape", unit: "page", action: "ingest", count: pages.length }));
        } else {
          // No sitemap: fall back to the crawler.
          const started = await step.run("crawl-start", () => startCrawl(uri, 80, includePath));
          let seen = 0;
          for (let i = 0; i < 80; i++) {
            await step.sleep(`crawl-wait-${i}`, "15s");
            const st = await step.run(`crawl-poll-${i}`, () => crawlStatus(started.id));
            pages = st.pages; seen = st.seen;
            if (st.done) break;
          }
          if (!pages.length) {
            throw new Error(seen
              ? `fetched ${seen} page${seen === 1 ? "" : "s"} but none had enough readable text`
              : "the crawler was not allowed to read a single page. This is usually robots.txt: sites often allow Google and Bing and block everything else. Add 'User-agent: FirecrawlAgent' with 'Allow: /' to that site's robots.txt.");
          }
        }

        if (!pages.length) {
          throw new Error(`the sitemap listed ${listed.length} page${listed.length === 1 ? "" : "s"} under that path but none could be read`);
        }
        // Each page keeps its OWN url and title, so a passage can always be traced back to the article it came
        // from - the difference between a citable brain and a pile of text.
        items = pages.flatMap((pg) => chunkText(pg.content).map((c) => ({ content: c, metadata: { url: pg.url, title: pg.title, kind: "article" } })));
      } else if (type === "website") {
        const page = await step.run("scrape", () => scrape(uri));
        await step.run("usage-scrape", () => recordUsage({ clientId, provider: "firecrawl", model: "scrape", unit: "page", action: "ingest", count: 1 }));
        if (!page.content) throw new Error("page had no readable content");
        items = chunkText(page.content).map((c) => ({ content: c, metadata: { url: page.url, title: page.title } }));
      } else if (type === "file") {
        // AN UPLOADED DOCUMENT (article, PDF, deck, notes). The browser put it straight into Blob, so `uri` is
        // a public blob URL and `text` carries the original filename.
        //
        // PDFs go through Firecrawl, which already parses them - rather than adding a PDF library to a bundle
        // that is already fighting Vercel's 250MB function limit. Plain text is just read.
        const name = text || uri;
        const isPdf = /\.pdf(\?|$)/i.test(uri);
        const doc = await step.run("read-file", async () => {
          if (isPdf) {
            const page = await scrape(uri);
            return { content: page.content, title: name };
          }
          const r = await fetch(uri);
          if (!r.ok) throw new Error(`could not read the uploaded file (${r.status})`);
          return { content: (await r.text()).trim(), title: name };
        });
        if (isPdf) await step.run("usage-parse", () => recordUsage({ clientId, provider: "firecrawl", model: "scrape", unit: "page", action: "ingest-pdf", count: 1 }));
        if (!doc.content) throw new Error("that file had no readable text in it (a scanned image PDF has no text layer)");
        items = chunkText(doc.content).map((c) => ({ content: c, metadata: { url: uri, title: doc.title } }));
      } else {
        items = chunkText(text).map((c) => ({ content: c, metadata: { title: uri || "Pasted note" } }));
      }
      if (!items.length) throw new Error("nothing to ingest");

      // IDEMPOTENT BY DESIGN. Inserting everything in one step meant that if that step timed out - and on a
      // multi-page crawl it did - Inngest retried it and inserted the whole set a SECOND time. Chunk counts
      // doubled silently, which is the worst way for this to fail: the brain looks fuller and is just repeating
      // itself, and duplicates crowd real facts out of the top few retrieval slots.
      //
      // Clearing this source's chunks first makes a retry replace rather than duplicate, and splitting the
      // work into batched steps keeps any single step short enough not to time out in the first place.
      await step.run("clear-existing", () => clearSourceChunks(sourceId));
      let stored = 0;
      const BATCH = 40;
      for (let i = 0; i < items.length; i += BATCH) {
        const slice = items.slice(i, i + BATCH);
        stored += await step.run(`embed-store-${i / BATCH}`, () => ingestChunks(clientId, sourceId, slice));
      }
      await step.run("usage-embed", () => recordUsage({ clientId, provider: "voyage", model: "voyage-4-lite", unit: "embed", action: "ingest", count: stored }));
      await step.run("mark-indexed", () => setSourceStatus(sourceId, "indexed"));
      return { ok: true, chunks: stored };
    } catch (e) {
      // Record WHY. "failed" on its own is not a diagnosis, and the person looking at it cannot read our logs.
      const why = String((e as Error)?.message || e).slice(0, 400);
      await step.run("mark-failed", () => setSourceStatus(sourceId, "failed", why));
      throw e;
    }
  },
);

// PRESENTER, turn the chosen hero into a HeyGen Talking Photo (the talking a-roll
// avatar). Fast; stored as heygen_avatar_id for the produce pipeline to drive later.
export const createPresenter = inngest.createFunction(
  { id: "create-presenter", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/create.presenter" }] },
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
  { id: "train-soul", retries: 0, onFailure: onProductionFailure, triggers: [{ event: "influencer/train.soul" }] },
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
  role?: "a-roll" | "b-roll";
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
  { id: "generate-creatives", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/generate.creatives" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const ratios = (Array.isArray(event.data.ratios) ? event.data.ratios : ["9:16"]) as string[];
    const resolution = String(event.data.resolution || "2k");
    const scene = String(event.data.scene || "").trim();
    const perRatio = Math.max(1, Math.min(6, Number(event.data.count) || 3));
    const clothingRef = (event.data.clothingRef as string) || "";
    // Multiple location references — shots are spread across them for varied backdrops. Back-compat single.
    const locationRefs = ((Array.isArray(event.data.locationRefs) ? event.data.locationRefs : [event.data.locationRef]) as unknown[]).filter((u): u is string => typeof u === "string" && !!u).slice(0, 8);
    // A-ROLL = presenter (front-on, talking to camera, no extras by default). B-ROLL = lifestyle/scene
    // (candid, in-situ, extras on by default). Either default is overridable by the explicit extras flag.
    const role: "a-roll" | "b-roll" = event.data.role === "b-roll" ? "b-roll" : "a-roll";
    const extrasOn = role === "b-roll" ? event.data.extras !== false : event.data.extras === true;
    const peopleClause = extrasOn ? SCENE_PEOPLE : NO_EXTRAS;

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
    // PRIORITY is now ALWAYS ON (Gary's call): every image renders on the fast paid model - ~1 credit is
    // negligible on Ultra and a foundation image should never sit in the slow free queue. No opt-in flag;
    // the server forces it so it can't accidentally be off. genModel drives both generation and metering.
    // (HF_IMAGES_FREE=1 is an emergency escape hatch back to the free model.)
    const genModel = process.env.HF_IMAGES_FREE === "1" ? IMAGE_MODEL : PRIORITY_MODEL;
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
      // MATCH THIS LOOK: a previously-generated creative the producer chose to match. We reproduce its
      // SECONDARY people (a daughter/companion) + the WARDROBE from it, while the main subject's FACE
      // still comes from the identity lock - so people + clothes stay consistent across creative sets.
      const matchRefUrl = typeof event.data.matchRef === "string" && event.data.matchRef ? event.data.matchRef : "";
      const imported = await step.run("import-refs", async () => {
        const ids = (await Promise.all(idRefUrls.map((u) => importMediaUrl(u).catch(() => null)))).filter((v): v is string => !!v);
        const [feat, cloth, locs, match] = await Promise.all([
          featureUrl ? importMediaUrl(featureUrl).catch(() => null) : Promise.resolve(null),
          clothingRef ? importMediaUrl(clothingRef).catch(() => null) : Promise.resolve(null),
          Promise.all(locationRefs.map((u) => importMediaUrl(u).catch(() => null))).then((a) => a.filter((v): v is string => !!v)),
          matchRefUrl ? importMediaUrl(matchRefUrl).catch(() => null) : Promise.resolve(null),
        ]);
        return { ids, feat, cloth, locs, match };
      });
      const idMedias = imported.ids;
      const medias = [...idMedias, imported.feat, imported.cloth, ...imported.locs, imported.match].filter((v): v is string => !!v).map((value) => ({ value, role: "image" }));
      // Source URLs in the SAME @image order (identity, feature, cloth, locations, match) for the FAST REST image
      // lane (nano-banana ~22s vs ~10 min on the MCP lane). `medias` above are MCP media-ids; submitImageRest
      // needs the original URLs. Only the count of imported refs that survived is used, but order is preserved.
      const restRefUrls = [...idRefUrls, featureUrl, clothingRef, ...locationRefs, matchRefUrl].map((u) => String(u || "")).filter((u) => u.trim());
      // Render the preview pass at 1K (env-tunable) — these are for SELECTION; the keepers upscale to
      // 4K after. 1K generates much faster and the tiles stop trickling in. Explicit-4K requests keep a
      // 2K working base for the upscale.
      const extra = { ...(medias.length ? { medias } : {}), resolution: fourK ? "2k" : (process.env.HF_CREATIVE_RES || "1k") };
      // @image tags follow the medias order. Identity refs come first.
      let n = 0;
      const faceTags = idMedias.map(() => `@image${++n}`);
      const faceRange = faceTags.length > 1 ? `${faceTags[0]} to ${faceTags[faceTags.length - 1]}` : faceTags[0];
      const featTag = imported.feat ? `@image${++n}` : null;
      const clothTag = imported.cloth ? `@image${++n}` : null;
      const locTags = imported.locs.map(() => `@image${++n}`);
      const locRange = locTags.length > 1 ? `${locTags[0]} to ${locTags[locTags.length - 1]}` : locTags[0];
      const matchTag = imported.match ? `@image${++n}` : null;
      const refInstruction = [
        faceTags.length && (faceTags.length > 1
          ? `IDENTITY LOCK: ${faceRange} are photos of the SAME real person from different angles, lighting and expressions. Replicate this exact person faithfully, the same face, bone structure, eyes, nose, lips, skin tone and hair across all of them. Zero facial drift, unmistakably the same individual. Use them ONLY for the face and identity; IGNORE their clothing, backgrounds, poses and lighting.`
          : (lockMode === "flexible"
            ? `IDENTITY REFERENCE: ${faceTags[0]} shows the person. Match their facial bone structure, face shape, eye shape and colour, brow arch, nose, lip shape, skin tone and hair. IGNORE ${faceTags[0]}'s clothing, background, pose and lighting; take the wardrobe, scene and pose from the description above.`
            : `IDENTITY LOCK: ${faceTags[0]} is the appearance reference. Replicate this person EXACTLY, facial bone structure, face shape, jaw, nose, lip shape, eye shape and colour, eyebrow arch, skin tone and texture, freckles, moles and natural asymmetries. Zero facial drift, it must be unmistakably the same individual. IGNORE ${faceTags[0]}'s clothing, background, pose and lighting; take those only from the scene described above.`)),
        // CRITICAL when the scene has more than one person: bind the lock to the MAIN subject so the
        // influencer never drifts (or gets cloned onto the second person) just because someone shares the frame.
        faceTags.length && "ONE PERSON ONLY: the locked identity above belongs to the SINGLE MAIN SUBJECT (the influencer). If the scene includes ANY other person (a child, daughter, partner, friend, passer-by) they are a COMPLETELY DIFFERENT individual with their own distinct face, age, build, hair and styling — never the locked face on a second body, no twins, clones or look-alikes. Reproduce the locked face on the main subject ONLY, and her own face must NOT drift, soften or change just because another person is in the frame.",
        // A-ROLL = solo talking shot: render her ALONE even if the scene names companions (they belong in
        // b-roll). So one scene description works for both roles - a-roll auto-strips the second person.
        role === "a-roll" && "SOLO PRESENTER SHOT: this is a talking-to-camera shot — the influencer is the ONLY person in the entire frame. Even though the scene description may mention other people (a daughter, family, friends), DO NOT include anyone else here: render her completely alone, addressing the camera, in that same world and wardrobe. Companions appear only in the scene (b-roll) shots, never in this solo talking shot.",
        faceTags.length && "EYEWEAR (critical): if the person wears optical or prescription glasses in ANY reference photo, those exact glasses are a PERMANENT part of her identity — she MUST wear them in EVERY shot without exception, never removed, omitted, swapped or restyled. (This is for real optical glasses, not fashion sunglasses.)",
        anchored && "The reference photos are the ONLY source of truth for their skin: do NOT add any moles, freckles, scars, beauty spots or skin marks that are not clearly visible in those photos.",
        featTag && `${featTag} is a forensic FEATURE reference: match the exact eyes, brows, lips, skin texture and hair shown in it. Do NOT copy its panel layout, labels or white background.`,
        clothTag && `${clothTag} is the WARDROBE reference (CRITICAL): dress her in this EXACT outfit — the identical garments, colours, fabric and styling — in EVERY shot of this set, never changed, swapped, recoloured or restyled between shots. The garments are PLAIN: no brand logos, company names or printed text on them. Do NOT copy any face or person from ${clothTag}.`,
        locTags.length === 1 && `${locTags[0]} is the EXACT SET/LOCATION for this shot - reproduce THIS specific real place precisely and put the subject INSIDE it: match its architecture, layout, wall and furniture COLOURS, glass, materials, lighting and overall mood exactly as shown in ${locTags[0]}. Do NOT invent a generic, different or merely 'similar' room; if the scene text names the setting only generically (e.g. 'a boardroom', 'an office'), ${locTags[0]}'s ACTUAL room WINS and is what you render. Do NOT copy any face or person from it.`,
        locTags.length > 1 && `${locRange} are ${locTags.length} DIFFERENT real SET/LOCATION references. Set each shot INSIDE one of these EXACT places - reproduce its architecture, colours, furniture, materials and lighting precisely (never a generic or 'similar' version) - and VARY which one across the set so no backdrop repeats. If the scene text names the setting only generically, these reference rooms WIN. Do NOT copy any face or person from them.`,
        // MATCH THIS LOOK: carry the companions + the wardrobe from a chosen earlier creative, but keep the
        // main subject's face from the identity lock above (never her face from the match).
        matchTag && `${matchTag} is the MATCH reference (CRITICAL for consistency across sets): reproduce EVERY OTHER person in it — any companion such as a daughter, partner, child or friend — EXACTLY as they appear: the SAME face, age, build, hair and the SAME clothing. ALSO dress the MAIN SUBJECT in the SAME outfit as in ${matchTag}. The ONE thing you do NOT take from ${matchTag} is the main subject's FACE — her face comes ONLY from the identity references above. So: her face = identity lock; her outfit + all other people + their outfits = matched to ${matchTag}.`,
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
      const gender = String(persona.gender || "");
      const segments = splitScenes(scene);
      const multiScene = segments.length >= 2;
      let richScenes: string[] = [];
      if (multiScene) {
        richScenes = await step.run("compose-multi", () => Promise.all(segments.map((seg) => composeCreativeScene({ bible: bibleObj, scene: seg, cinematic, extras: extrasOn, gender, role }).then((c) => c || seg))));
        await step.run("usage-compose-multi", () => recordUsage({ influencerId, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "compose", count: segments.length }).catch(() => {}));
      } else {
        let rs = sceneText;
        if (scene) {
          const composed = await step.run("compose-scene", () => composeCreativeScene({ bible: bibleObj, scene: sceneText, cinematic, extras: extrasOn, gender, role }));
          if (composed) { rs = composed; await step.run("usage-compose", () => recordUsage({ influencerId, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "compose", count: 1 }).catch(() => {})); }
        }
        richScenes = [rs];
      }
      const buildPrompt = (idx: number, ratio: string) =>
        buildCreativeImagePrompt({ sceneText: multiScene ? richScenes[idx] : richScenes[0], variation: multiScene ? "" : variations[idx % variations.length], refInstruction, subjectLine, faceMarks, look, peopleClause, cinematic, ratio, role });

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
        // FAST lane (default ON): render each creative on nano-banana REST (~22s) with the SAME @image ref stack,
        // instead of the ~10-min MCP lane. Per-shot: submit → poll ~3 min → on ANY miss fall back to the MCP
        // generateBatchDetailed for that one shot, so it's strictly no slower than before. Needs >=1 reference.
        const IMAGE_REST_ON = process.env.IMAGE_REST !== "0" && klingRestConfigured() && restRefUrls.length > 0;
        const detailed = IMAGE_REST_ON
          ? await Promise.all(prompts.map(async (prompt, k) => {
              const sub = await step.run(`crest-${rid}-${k}`, () => submitImageRest({ prompt, refUrls: restRefUrls, aspectRatio: ratio }));
              if (sub.jobSetId) {
                let url: string | null = null;
                for (let n2 = 0; n2 < 45 && !url; n2++) { // ~45 x 4s ≈ 3 min ceiling
                  const s = await step.run(`crest-poll-${rid}-${k}-${n2}`, () => pollDopOnce(sub.jobSetId as string));
                  if (s.url) { url = s.url; break; }
                  if (s.terminal) break;
                  await step.sleep(`crest-wait-${rid}-${k}-${n2}`, "4s");
                }
                if (url) {
                  const hosted = (await step.run(`crest-host-${rid}-${k}`, () => rehostToBlob(url as string, "creatives").catch(() => null))) || url;
                  return { url: hosted, error: null, model: "nano-banana" };
                }
              }
              // REST miss (submit failed / timed out / terminal) → MCP fallback for THIS shot only.
              const fb = await step.run(`gen-${rid}-${k}`, () => generateBatchDetailed([prompt], genModel, ratio, extra, CREATIVE_FALLBACK));
              return fb[0] ?? { url: null as string | null, error: "no result", model: genModel };
            }))
          : await step.run(`gen-${rid}`, () => generateBatchDetailed(prompts, genModel, ratio, extra, CREATIVE_FALLBACK));
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
        if (QA_ON && valid.length) await step.run(`usage-qa-${rid}`, () => recordUsage({ influencerId, provider: "anthropic", model: "claude-haiku-4-5", unit: "image", action: "qa", count: valid.length }));
        // Per attempt: failed generation stays visible, QA gets a score, and only approved
        // shots are upscaled/rehosted.
        const attempts = await Promise.all(rawProduced.map((sourceUrl, k) =>
          step.run(`finalize-${rid}-${k}`, async () => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            if (!sourceUrl) {
              return { id, url: null, ratio, resolution: "n/a", scene: sceneText, at: Date.now(), status: "failed_generation", qa: null, error: genErrors[k] || "generation returned no image", role } as Creative;
            }

            if (!validSet.has(sourceUrl)) {
              return { id, url: sourceUrl, ratio, resolution: "n/a", scene: sceneText, at: Date.now(), status: "failed_generation", qa: null, error: "image url failed to load", role } as Creative;
            }

            const verdict = QA_ON ? await qaCreative(sourceUrl).catch(() => ({ pass: true, score10: 7, issues: ["qa-unavailable"] })) : { pass: true, score10: 0, issues: [] as string[] };
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
                role,
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
              role,
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
  { id: "upscale-creative", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/upscale.creative" }] },
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
  { id: "generate-aroll", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/generate.aroll" }] },
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
  { id: "generate-shots", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/generate.shots" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as { brief?: Record<string, unknown>; storyboard?: { scenes?: Record<string, unknown>[]; format?: string; supporting_cast?: { name: string; look: string }[]; colour_grade?: string } } | null;
    const scenes = production?.storyboard?.scenes ?? [];
    const supportingCast = production?.storyboard?.supporting_cast ?? [];
    const grade = String(production?.storyboard?.colour_grade || "").trim(); // one locked look, applied to every keyframe
    if (!scenes.length) return { error: "no storyboard" };
    // Role filter: shoot only the a-roll (talking) references, or only the b-roll (scene) references —
    // the producer curates each gallery separately. Empty = the whole board (back-compat).
    const roleFilter = event.data.roleFilter === "a-roll" || event.data.roleFilter === "b-roll" ? String(event.data.roleFilter) : "";
    // Scene filter: shoot only these scene indices' KEYFRAMES (per-scene reference shoot). Empty = all.
    const sceneFilter: number[] | null = Array.isArray(event.data.scenes) && event.data.scenes.length ? (event.data.scenes as unknown[]).map(Number) : null;
    // PRIORITY is now ALWAYS ON (Gary's call): producer keyframes always render on the fast paid model,
    // regardless of any caller flag, so a keyframe never waits in the slow free queue. ~1 credit, negligible
    // on Ultra. This also keeps the keyframe on the SAME model the identity was built on (BUILD_MODEL).
    // (HF_IMAGES_FREE=1 is an emergency escape hatch back to the free model.)
    const shotModel = process.env.HF_IMAGES_FREE === "1" ? IMAGE_MODEL : PRIORITY_MODEL;
    const speed = event.data.speed === true; // DRAFT speed: faster/cheaper PREVIEW renders (720p, quick engine). The keyframe humaniser still ALWAYS runs (see below) - draft never ships a plastic face.
    // Aspect ratio is producer-chosen per shoot (9:16 reels / 1:1 feed / 16:9 youtube); falls back to the storyboard format.
    const allowedRatios = ["9:16", "1:1", "16:9"];
    const ratio = allowedRatios.includes(String(event.data.aspectRatio)) ? String(event.data.aspectRatio) : (String(production?.storyboard?.format || "").includes("1:1") ? "1:1" : "9:16");

    // Identity references — EXACT same recipe as creatives. Uploaded photos win; else fall back through
    // the canonical identity cards AND the photoshoot frames (look_refs). A synthetic with no card still
    // anchors to its shot identity set, so the producer can NEVER silently render a stranger.
    const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean; face?: boolean }[]) : [];
    const uploadedRefs = Array.isArray(persona.reference_images) ? (persona.reference_images as string[]).filter((u) => typeof u === "string") : [];
    const refFromUrl = typeof persona.reference_url === "string" && persona.reference_url ? [persona.reference_url] : [];
    const twinPhotos = (uploadedRefs.length ? uploadedRefs : refFromUrl).slice(0, 4);
    const anchored = twinPhotos;
    const idRefUrls = twinPhotos.length
      ? twinPhotos
      : [(persona.face_card_url as string) || (persona.hero_realism_url as string) || (persona.hero_url as string) || (persona.chosen_url as string) || refs.find((r) => r.hero)?.url || refs.find((r) => r.face)?.url || refs[0]?.url || (persona.reference_url as string) || ""].filter(Boolean);
    const featureUrl = twinPhotos.length ? "" : ((persona.feature_sheet_url as string) || "");
    const idMedias = await step.run("import-identity", async () => {
      const ids = (await Promise.all(idRefUrls.map((u) => importMediaUrl(u).catch(() => null)))).filter((v): v is string => !!v);
      if (featureUrl) { const f = await importMediaUrl(featureUrl).catch(() => null); if (f) ids.push(f); }
      return ids;
    });
    const bible = (persona.bible as { identity?: Record<string, string>; face?: Record<string, string> }) ?? {};
    const bibleId = bible.identity ?? {};
    const bibleFace = bible.face ?? {};
    // Re-thread the LOCKED physical description into the subject line on EVERY shot (v1's anti-drift
    // recipe) so the text reinforces the face reference images, not just generic age/build/ethnicity.
    // Skin + hair always; invented distinctive features only for a SYNTHETIC — when anchored to uploaded
    // photos the photo is the truth and we must not describe marks that could fight it.
    const faceDesc = [bibleFace.skin, bibleFace.hair, anchored.length ? "" : bibleFace.distinct_features].filter(Boolean).join(", ");
    const subjectLine = [bibleId.age, bibleId.build, bibleId.ethnicity_design, faceDesc].filter(Boolean).join(", ") || `${inf.name}, the influencer`;
    // Dress her in her SIGNATURE wardrobe (from the bible) by default, so the cast aligns to the character.
    const bibleLook = bibleWardrobe(persona.bible as Record<string, unknown>);
    const lookBase = lookClause(persona); // appearance WITHOUT a specific outfit
    const look = [lookBase, bibleLook && `wearing ${bibleLook}`].filter(Boolean).join(". ");

    // Optional producer uploads: a clothing reference (wardrobe) and a location reference (world).
    const brief = (production?.brief ?? {}) as Record<string, string>;
    // WARDROBE LOCK value first (it drives the cloth reference below). One concrete outfit, head to toe,
    // read once from the chosen A-ROLL guide (else B-ROLL guide, else bible) and persisted, so every scene +
    // every re-shoot uses the IDENTICAL outfit even when a scene's anchor frame hides the bottoms/shoes.
    // ONE canonical wardrobe source for the WHOLE production (explicit upload, else the A-ROLL guide, else the
    // B-ROLL guide). Its outfit governs EVERY scene of both roles. We re-read the lock whenever this source
    // CHANGES (not only when it's missing), so swapping to a matching-outfit guide actually updates the lock
    // instead of the shoot obeying a stale one (the bug: a re-picked guide still came out in the old trousers).
    const wardrobeSrcUrl = String(brief.clothingRef || persona.aroll_ref_url || persona.broll_ref_url || "").trim();
    const storedLockSrc = String((production as { wardrobe_ref_url?: string })?.wardrobe_ref_url || "").trim();
    let wardrobeLock = String((production as { wardrobe_lock?: string })?.wardrobe_lock || "").trim();
    // Only ADVANCE the stored source-marker when we actually read a lock from it. If describeOutfit fails
    // transiently, we must NOT record the new source (else storedLockSrc==wardrobeSrcUrl on the next run and it
    // never retries → the ad stays stuck on the fallback bible text forever). Leave the marker on failure so a
    // later run re-extracts this source.
    let lockSrcToStore = storedLockSrc;
    if (wardrobeSrcUrl && wardrobeSrcUrl !== storedLockSrc) {
      const d = await step.run("wardrobe-extract", async () => {
        const out = await describeOutfit(wardrobeSrcUrl).catch(() => "");
        if (out) await recordUsage({ influencerId, provider: "anthropic", model: "claude-haiku-4-5", unit: "image", action: "wardrobe", count: 1 }).catch(() => {});
        return out;
      });
      if (d) { wardrobeLock = d; lockSrcToStore = wardrobeSrcUrl; }
    } else if (wardrobeSrcUrl) {
      lockSrcToStore = wardrobeSrcUrl; // unchanged source that already has a lock - keep the marker current
    }
    if (!wardrobeLock) wardrobeLock = bibleLook;
    // CLOTH reference = the ONE canonical wardrobe image, passed to EVERY scene of BOTH roles so it beats a
    // role guide (or cast-anchor frame) that shows a DIFFERENT outfit. Images beat text, so we fight a
    // wrong-colour image with the right-colour wardrobe image.
    const clothSrc = wardrobeSrcUrl;
    const clothMedia = clothSrc ? await step.run("import-cloth", () => importMediaUrl(clothSrc).catch(() => null)) : null;
    const clothIsLock = !brief.clothingRef && !!wardrobeLock && !!clothMedia; // the cloth ref IS the wardrobe lock, not an upload
    const locMedia = brief.locationRef ? await step.run("import-loc", () => importMediaUrl(brief.locationRef).catch(() => null)) : null;
    // CREATIVE REFERENCES (Phase 1): a chosen creative becomes the wardrobe + world anchor per role.
    const arollRefMedia = persona.aroll_ref_url ? await step.run("import-aroll-ref", () => importMediaUrl(String(persona.aroll_ref_url)).catch(() => null)) : null;
    const brollRefMedia = persona.broll_ref_url ? await step.run("import-broll-ref", () => importMediaUrl(String(persona.broll_ref_url)).catch(() => null)) : null;

    await step.run("mark-running", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, shots_status: "running", wardrobe_lock: wardrobeLock || undefined, wardrobe_ref_url: lockSrcToStore || undefined } } }));

    let worldRef: string | null = null; // first good frame, imported, reused to lock the world
    let castAnchor: string | null = null; // first b-roll frame WITH companions - locks the daughter/companion look + outfit across every b-roll scene
    // SOURCE urls of the anchors above - kept so a scene that fails with "Media input not found" (a stale
    // shared media_id on a long shoot) can RE-IMPORT the reference fresh and retry.
    let worldRefUrl: string | null = null;
    let castAnchorUrl: string | null = null;
    // CONTINUITY across SEPARATE shoots (one role, or a single re-shot scene): anchor to a frame ALREADY
    // shot for ANOTHER scene so the world stays IDENTICAL to the rest of the production. (Whole-board shoots
    // set worldRef from frame 1.) For a per-scene re-shoot, exclude the scene being re-shot from the search.
    // CRITICAL: SKIP this when a wardrobe is LOCKED. That prior frame can be a STALE frame in the WRONG
    // outfit (e.g. an old teal shot), and its IMAGE colour bleeds through the "ignore its clothing" text -
    // exactly why a re-shot scene came back teal while a full run stayed cream. With a lock, the outfit comes
    // from the locked text + the (correct-colour) guide, and the world from the guide + the location text.
    if ((roleFilter || sceneFilter) && !wardrobeLock) {
      const prior = ((production as { shots?: { scene?: number; url?: string | null }[] } | null)?.shots ?? [])
        .find((s) => s?.url && (!sceneFilter || !sceneFilter.includes(Number(s.scene))));
      if (prior?.url) { worldRefUrl = prior.url as string; worldRef = await step.run("worldref-anchor", () => importMediaUrl(prior.url as string).catch(() => null)); }
    }
    // CAST ANCHOR for a filtered/per-scene b-roll re-shoot: lock the COMPANION (the daughter) so re-shooting
    // ONE b-roll scene doesn't invent a DIFFERENT person. Prefer the b-roll GUIDE (the fixed creative the
    // producer chose, which shows the daughter); else anchor to a PRIOR b-roll frame. (Whole-board runs set
    // this from the first companion frame below.)
    if ((roleFilter || sceneFilter) && !castAnchor) {
      // Prefer a PRIOR b-roll frame that already has the companion (from the good run): Leah is in her CORRECT
      // locked outfit there AND the daughter is consistent, so nothing leaks. Only fall back to the b-roll
      // GUIDE if there's no such frame - the guide can show Leah in a DIFFERENT outfit, which then bleeds onto
      // her (why the mom's top changed on a single-scene b-roll re-shoot).
      const priorCast = ((production as { shots?: { scene?: number; url?: string | null }[] } | null)?.shots ?? [])
        .find((s) => { const sc = scenes[Number(s.scene)] as Record<string, unknown> | undefined; return !!s?.url && String(sc?.role || "") === "b-roll" && Array.isArray(sc?.talent) && (sc.talent as unknown[]).length > 1 && (!sceneFilter || !sceneFilter.includes(Number(s.scene))); });
      if (priorCast?.url) { castAnchorUrl = priorCast.url as string; castAnchor = await step.run("castanchor-prior", () => importMediaUrl(priorCast.url as string).catch(() => null)); }
      else if (brollRefMedia) { castAnchor = brollRefMedia; castAnchorUrl = String(persona.broll_ref_url || ""); }
    }

    // Render ONE scene to a keyframe (pure — reads worldRef which is set by the anchor pass first).
    const renderShot = async (i: number, sc: Record<string, string>): Promise<ShotRow> => {
      const beat = String(sc.beat || ""); const role = String(sc.role || "a-roll");
      // BACKGROUND LIFE, and the engine that has to animate it.
      //
      // A-ROLL renders on HeyGen, which animates the PERSON and not the scene: anything else in the frame is a
      // still photograph it never touches. So a background person in an a-roll keyframe CANNOT move - they hover
      // and smear (Gary, scene 7: "2 people hovering unnaturally and on fast forward"). Keeping HeyGen is the
      // right call (its lip-sync beats the full-scene engines, and sync is what a viewer notices on a talking
      // shot), so the answer is to never bake a stranger into an a-roll still in the first place. The ONE
      // exception is the explicit live_bg opt-in, which routes that scene to a full-scene engine on purpose.
      //
      // B-ROLL is a real video model (Kling/Seedance/DoP/Veo) which animates the WHOLE frame, so background
      // people there genuinely move and crowd_extras works as intended.
      const crowdOn = (sc as Record<string, unknown>).crowd_extras === true;
      const liveBg = role === "a-roll" && String((sc as Record<string, unknown>).live_bg) === "true"; // presenter + moving venue
      const hasBackgroundPeople = liveBg || (role === "b-roll" && crowdOn);
      const phoneMedia = sc.phone_screen_url ? await step.run(`phone-${i}`, () => importMediaUrl(String(sc.phone_screen_url)).catch(() => null)) : null;
      // PER-SCENE reference: a gallery image the producer pinned to THIS scene overrides the production-wide
      // guide + wardrobe lock, so the scene's chosen Set & Wardrobe image is the single source of truth here.
      const sceneRefUrl = String((sc as Record<string, unknown>).ref_url || "").trim();
      const sceneRefMedia = sceneRefUrl ? await step.run(`scene-ref-${i}`, () => importMediaUrl(sceneRefUrl).catch(() => null)) : null;
      const roleRefMedia = sceneRefMedia || (role === "a-roll" ? arollRefMedia : role === "b-roll" ? brollRefMedia : null);
      const lockEff = sceneRefMedia ? "" : wardrobeLock; // scene ref defines the outfit → drop the global lock here
      const clothMediaEff = sceneRefMedia ? null : clothMedia; // …and the global cloth anchor
      // Is THIS role's guide the ONE canonical wardrobe source? If yes, its clothing IS the wardrobe. If no
      // (e.g. a b-roll world guide showing DIFFERENT trousers while the a-roll guide is the wardrobe), the guide
      // steers only the WORLD/pose here and the outfit comes from the locked wardrobe - so BOTH roles wear one
      // outfit. A per-scene ref stays authoritative for its own outfit (its lock was already dropped above).
      const roleGuideUrl = String(sceneRefUrl || (role === "a-roll" ? persona.aroll_ref_url : role === "b-roll" ? persona.broll_ref_url : "") || "").trim();
      const roleGuideIsWardrobe = !!sceneRefMedia || (!!roleRefMedia && !!wardrobeSrcUrl && roleGuideUrl === wardrobeSrcUrl);
      // When a GUIDE is chosen for this role it IS the character (her right face, right outfit, right set), so
      // it becomes the AUTHORITATIVE reference: pass only ONE identity crop (a light face-confirm) and DROP the
      // separate world anchor, so no other image fights the guide's face, clothing or location. This is the
      // fix for "I picked a guide but her face + clothes came out different" - too many competing references,
      // and the guide was explicitly BANNED from setting her face.
      const guided = !!roleRefMedia;
      const idForRender = guided ? idMedias.slice(0, 1) : idMedias;
      const worldTagOn = !!worldRef && !guided;
      // @image order: identity, [clothing], [location], [world anchor], [phone screen], [role ref].
      let n = idForRender.length;
      const faceTags = idForRender.map((_, k) => `@image${k + 1}`);
      const clothTag = clothMediaEff ? `@image${++n}` : "";
      const locTag = locMedia ? `@image${++n}` : "";
      const worldTag = worldTagOn ? `@image${++n}` : "";
      const phoneTag = phoneMedia ? `@image${++n}` : "";
      const roleRefTag = roleRefMedia ? `@image${++n}` : "";
      // Cast anchor: only on b-roll scenes that actually have a companion (talent beyond the influencer),
      // and only once one has been shot. It locks the daughter/companion's look + outfit across b-roll.
      const hasCompanions = role === "b-roll" && Array.isArray((sc as Record<string, unknown>).talent) && (sc as unknown as { talent: string[] }).talent.length > 1;
      const castTag = (castAnchor && hasCompanions) ? `@image${++n}` : "";
      // Clause (b) of the guide instruction. If the guide IS the wardrobe source, take clothing from it; if it
      // is only a WORLD guide (different outfit), take clothing from the LOCKED wardrobe + wardrobe reference so
      // both roles wear ONE outfit and the guide's different trousers/colour never leak in.
      const guideClothingClause = roleGuideIsWardrobe
        ? `(b) her CLOTHING EXACTLY as in ${roleRefTag} - every garment, colour, fabric and footwear${lockEff ? ` (her locked outfit: ${lockEff})` : ""} - and do NOT take clothing from any identity image, which may show a DIFFERENT outfit${clothTag ? `; and if ${roleRefTag} shows only her BACK or side (so the front of the outfit is not visible in it), take the FRONT of her garment - the exact neckline, collar and front detailing - from the wardrobe reference ${clothTag}, and NEVER invent or restyle a front that ${roleRefTag} doesn't show` : ""}`
        : `(b) do NOT take her CLOTHING from ${roleRefTag} - it may show a DIFFERENT outfit and is used here ONLY for the location and framing. Her outfit is her ONE LOCKED wardrobe${lockEff ? `: ${lockEff}` : ""}${clothTag ? `, shown in the wardrobe reference ${clothTag}` : ""} - dress her in that EXACT outfit, IDENTICAL to every other scene, and IGNORE whatever ${roleRefTag} shows her wearing (any different colour or garment)`;
      const refInstruction = [
        faceTags.length ? `IDENTITY LOCK: ${faceTags.join(", ")} are the SAME real person, replicate them EXACTLY (face shape, bone structure, eyes, nose, lips, ETHNICITY and heritage, skin tone and texture, AND her exact hair colour, length and style, AND her apparent AGE); zero drift, unmistakably the same individual. Her ethnicity and skin tone are FIXED by these references and must be identical in EVERY scene — never lighten, darken or change her race/ethnicity to match a companion, a guide image or the scene. She looks IDENTICAL in every scene whether she is alone or beside another person — NEVER make her look younger or older, never change or darken her hair, and never soften or blend her features to match a companion or the scene.${guided ? " The chosen GUIDE below shows her TRUE current look - match her face to the guide exactly; this identity image only confirms she is the same person." : " These face references are the ONLY source of her face, hair, age and identity — take NOTHING about her from any wardrobe, world, location, companion or reference-look image."} EYEWEAR (critical): if she wears optical/prescription glasses in ANY reference, those glasses are a PERMANENT part of her identity — she MUST wear them in EVERY scene, never removed, omitted, swapped or restyled (real optical glasses, not sunglasses). IGNORE their clothing, background and pose; take those from the direction below. ONE PERSON ONLY: this identity belongs to the single MAIN subject (the influencer) — she is the PRIMARY adult in the frame and the locked face is hers. Every OTHER person in the scene — a daughter, friend, companion, anyone in the background — is a COMPLETELY DIFFERENT individual with their own distinct face, age, build and styling (a daughter is clearly YOUNGER). NEVER duplicate her face, hair or look onto anyone else, and never swap her identity onto the companion: absolutely no twins, clones or look-alikes.` : "",
        // WARDROBE LOCK (text): her ONE outfit, head to toe, identical every scene - the durable fix for
        // clothing drifting between scenes (the image anchor alone misses the bottoms/shoes on tight shots).
        lockEff ? `LOCKED OUTFIT - the influencer wears the SAME single outfit in EVERY scene of this production, head to toe: ${lockEff}. Identical garments, colours, fabric, footwear and accessories every time; never change, swap, recolour, add or restyle ANY part of her clothing between scenes, whether she is talking to camera or in a wider scene - only her pose, action and the framing change. This is her established wardrobe and overrides any different outfit implied by the scene text.` : "",
        roleRefTag ? `${roleRefTag} is the CHOSEN ${role.toUpperCase()} GUIDE and the DEFINITIVE reference for this influencer's FACE and the SET/LOCATION of this ad, so reproduce those from ${roleRefTag} precisely: (a) her FACE and features EXACTLY as in ${roleRefTag}${faceTags.length ? ` (${faceTags.join(", ")} is the same person and only confirms her identity; if they differ at all, ${roleRefTag} wins for her current look)` : ""}; ${guideClothingClause}; (c) the LOCATION, set dressing, lighting, time of day and colour grade EXACTLY as in ${roleRefTag} - and if the scene direction below names a DIFFERENT place (for example an office when ${roleRefTag} is an outdoor waterfront café), ${roleRefTag}'s location WINS: reproduce the guide's real place, never the scene text's. ONLY her pose, action and framing change per the direction below - never her face, her outfit or the place.${role === "b-roll" ? ` Also REPRODUCE any COMPANION shown in ${roleRefTag} (for example her daughter) EXACTLY - the SAME person: same face, age, build, hair AND the same outfit - identical in every b-roll scene.` : ` Do NOT copy any other person from it.`}${
          // PEOPLE ARE NOT SET DRESSING. "Reproduce the set dressing exactly" made the model copy the strangers
          // standing in the guide photo (Gary, scene 7: "I said no people in background... the result 2 people
          // hovering unnaturally"). crowd_extras=false was honoured in the TEXT and then silently overruled by
          // the guide IMAGE - a picture of two barmen beats the sentence "no people".
          //
          // This strips them ONLY when the scene is set to have no crowd. A scene that WANTS background life
          // keeps it (and is routed to a full-scene engine below, so that life actually moves).
          !hasBackgroundPeople
            ? ` PEOPLE ARE NOT PART OF THE SET: reproduce ${roleRefTag}'s PLACE (architecture, furniture, bar, rail, view, light) but NOT the people standing in it. Any bystander, barman, waiter, staff member, diner, passer-by or background figure visible in ${roleRefTag} must be REMOVED and the space behind her left EMPTY - rebuild whatever they were standing in front of. She is ALONE in this frame apart from anyone the scene direction explicitly names. Do not add, keep, blur or silhouette a single stranger.${role === "a-roll" ? ` The room must still feel LIVED-IN and real, not sterile or abandoned: keep the venue's warmth and evidence of life (glasses and bottles on the bar, a cloth over a rail, a half-finished drink, a chair pulled out, steam, warm practical lights) and hold it in genuinely SHALLOW depth of field so the backdrop reads as a real out-of-focus place. A quiet, believable, softly blurred room - never an empty white void.` : ""}`
            : ` The background people in ${roleRefTag} are REAL LIFE in this venue and belong here: keep them, but render them as believable individuals mid-action (a barman actually pouring, a couple genuinely mid-conversation), each with a natural posture and their own clear activity - never vacant, stiff, hovering or staring figures standing about doing nothing. They sit BEHIND her in soft focus and never crowd, overlap or upstage her.`
        }` : "",
        clothTag ? `${clothTag} is the WARDROBE reference and shows the FRONT of her outfit: dress the influencer in this EXACT outfit (silhouette, fabric, COLOUR, styling) and treat ${clothTag} as the DEFINITIVE source for the FRONT of her garment — its exact neckline shape and depth, collar, lapels, straps, buttons, zips, closures and any front detailing. Apply this front in EVERY shot, INCLUDING shots where the ${role} guide, world anchor or cast anchor shows only her BACK, her side, or a partial view: in those shots you must NEVER invent, guess, restyle, raise, lower or change the neckline/front — reconstruct it EXACTLY as in ${clothTag} so the front of the outfit is identical in every scene whether she faces camera or is turned away. (A back-turned reference does not show the front, so the front comes ONLY from ${clothTag}, never from imagination.)${clothIsLock ? ` This is her ONE LOCKED outfit and it OVERRIDES her clothing in EVERY other reference image here (the world anchor, the ${role} guide, and the cast-anchor frame) AND in the scene text — if any other image shows her in a different colour or garment (e.g. teal/green), IGNORE that and dress her in THIS outfit's colour and garments.` : ""} Do NOT copy any face or person from it.` : "",
        locTag ? `${locTag} is a LOCATION reference: set this scene in that exact place, matching its environment, architecture, lighting and mood. Do NOT copy any face or person from it.` : "",
        worldTag ? `${worldTag} is the ESTABLISHED world of this production: match its location, set dressing, lighting, time of day and colour grade exactly for seamless continuity — but take the influencer's FACE only from the identity references, never from ${worldTag}. ${wardrobeLock
          ? `Take her WARDROBE from the LOCKED OUTFIT stated above, NOT from ${worldTag} — ${worldTag} may show her in a DIFFERENT outfit or colour; IGNORE its clothing entirely and dress her in the locked outfit (do not copy ${worldTag}'s top, dress or colour).`
          : `LOCKED WARDROBE: the influencer wears the EXACT SAME outfit as in ${worldTag} — identical garments, colours, fabric and styling — in every single scene. Never change, swap or restyle her clothing; one consistent outfit across the whole shoot (only her pose, action and the framing change).`} SUPPORTING CAST CONTINUITY: if ${worldTag} shows any friends or companions, the same people recur here — the SAME individuals (same faces, ages, hair and outfits), not different-looking people swapped in scene to scene.` : "",
        phoneTag ? `${phoneTag} is the PHONE SCREEN content: if the influencer is holding or showing a phone, render its screen displaying THIS exact image, crisp and legible, correctly perspective-fitted to the phone. Do NOT copy any person from it.` : "",
        // WHO DOES WHAT (stops the mom/daughter action swap): the image model locks WHOSE face it is, but not
        // WHO performs each action, so it would put the influencer on the laptop doing the course instead of
        // the daughter. Assign actions explicitly on companion b-roll.
        (role === "b-roll" && hasCompanions) ? `WHO DOES WHAT (do not swap the people or merge them into one): render EACH person doing EXACTLY the action the direction below assigns them. The locked-face influencer is the OLDER adult; the companion (e.g. her daughter) is a DISTINCT, clearly YOUNGER person. If the scene shows someone studying, using a laptop or phone, reading, or doing a course, that is the COMPANION doing it while the influencer watches, reacts with pride or is simply present beside her - NEVER transfer the studying / laptop / phone / course / working action onto the influencer unless the direction explicitly says SHE is the one doing it. Two separate individuals, each kept in their assigned role.` : "",
        // Lock recurring companions to a fixed look + outfit so they don't change scene to scene.
        castLockClause(supportingCast, (Array.isArray((sc as Record<string, unknown>).talent) ? (sc as unknown as { talent: string[] }).talent : [])),
        // Image-anchor the companion(s) to the first b-roll frame so the daughter + her outfit never drift.
        castTag ? `${castTag} is the CAST ANCHOR: the companion(s) in this scene (e.g. the daughter / family member) are the SAME individuals as in ${castTag} — identical face, age, build, hair AND the SAME outfit/clothing, scene to scene. Take ONLY the companion(s) and their wardrobe from ${castTag}. The MAIN influencer's face comes from the identity references, and her OUTFIT is her LOCKED outfit${lockEff ? ` (${lockEff})` : ""} - NOT whatever she happens to be wearing in ${castTag}; if she wears a different top or colour in ${castTag}, IGNORE it and keep her in the locked outfit.` : "",
      ].filter(Boolean).join(" ");
      const prompt = buildShotPrompt({
        location: String(sc.location || ""), blocking: String(sc.blocking || ""), shot: String(sc.shot || ""),
        // When a guide is chosen, DROP the bible's signature outfit from the text so it can't fight the
        // guide's wardrobe; the guide reference becomes the single source of truth for her clothing.
        performance: String(sc.performance || ""), role, subjectLine, look: roleRefMedia ? lookBase : look, refInstruction, ratio,
        // A-ROLL = clean presenter shot (no crowd — HeyGen Avatar IV warps animated background people).
        // EXCEPTION: a LIVE-BACKGROUND a-roll renders on Veo (full-scene animation), so it KEEPS the presenter
        // framing but SHOWS the living venue behind her (the track + crowd) - the background will actually move.
        // B-ROLL gets background strangers ONLY when the director flagged this scene a busy public place.
        hasPeople: hasBackgroundPeople, worldAnchored: worldTagOn,
        liveBg, // live-background a-roll: presenter framing WITH the full live venue scene behind her
        lockedOutfit: lockEff || undefined, // her one outfit OVERRIDES any per-scene outfit the storyboard wrote
        grade: grade || undefined, // the film's ONE locked colour grade, identical on every keyframe
        holdMic: role === "a-roll" && (sc as { mic?: boolean }).mic === true, // producer-toggled: hold a handheld mic (a-roll only)
      });
      const medias = [...idForRender, ...(clothMediaEff ? [clothMediaEff] : []), ...(locMedia ? [locMedia] : []), ...(worldTagOn ? [worldRef as string] : []), ...(phoneMedia ? [phoneMedia] : []), ...(roleRefMedia ? [roleRefMedia] : []), ...(castTag ? [castAnchor as string] : [])].map((value) => ({ value, role: "image" }));
      // Board keyframes at 1K (env-tunable): they're animated into 720p/1080p video, so 2K stills add
      // no quality but ~double the render time. 1K ~halves the board with no visible loss.
      const shotExtra = { resolution: process.env.HF_BOARD_RES || "1k" };
      const runGen = (m: { value: string; role: string }[]) => generateBatchDetailed([prompt], shotModel, ratio, { ...shotExtra, ...(m.length ? { medias: m } : {}) }, CREATIVE_FALLBACK).then((a) => a[0] ?? { url: null as string | null, error: "no result", model: shotModel });
      let activeMedias = medias;
      // FAST first-party image lane (default ON; verified ~22s vs ~10 min on MCP): render the keyframe on
      // nano-banana REST with the SAME reference stack in the SAME @image order (identity face first). On ANY
      // miss it falls straight through to the MCP path below, so it can't make a scene fail that MCP would render.
      // Set IMAGE_REST=0 to disable. EYEBALL the first keyframe's face when enabling - identity must hold.
      let res: { url: string | null; error: string | null; model: string } | null = null;
      if (process.env.IMAGE_REST !== "0" && klingRestConfigured()) {
        const refUrls = [
          ...(guided ? idRefUrls.slice(0, 1) : idRefUrls),
          ...(featureUrl && !guided ? [featureUrl] : []),
          ...(clothMediaEff ? [clothSrc] : []),
          ...(locMedia && brief.locationRef ? [brief.locationRef] : []),
          ...(worldTagOn && worldRefUrl ? [worldRefUrl] : []),
          ...(phoneMedia && sc.phone_screen_url ? [String(sc.phone_screen_url)] : []),
          ...(roleRefMedia ? [String(sceneRefUrl || (role === "a-roll" ? persona.aroll_ref_url : role === "b-roll" ? persona.broll_ref_url : "") || "")] : []),
          ...(castTag && castAnchorUrl ? [castAnchorUrl] : []),
        ].map((u) => String(u || "")).filter((u) => u.trim());
        if (refUrls.length) {
          const sub = await step.run(`imgrest-${i}`, () => submitImageRest({ prompt, refUrls, aspectRatio: ratio }));
          if (sub.jobSetId) {
            let irUrl: string | null = null;
            for (let n = 0; n < 45 && !irUrl; n++) { // ~45 x 4s ≈ 3 min ceiling
              const s = await step.run(`imgrest-poll-${i}-${n}`, () => pollDopOnce(sub.jobSetId as string));
              if (s.url) { irUrl = s.url; break; }
              if (s.terminal) break;
              await step.sleep(`imgrest-wait-${i}-${n}`, "4s");
            }
            if (irUrl) {
              await step.run(`u-imgrest-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "nano-banana", unit: "image", action: "keyframe", count: 1 }).catch(() => {}));
              res = { url: irUrl, error: null, model: "nano-banana:rest" };
            }
          }
        }
      }
      if (!res) res = await step.run(`shot-${i}`, () => runGen(activeMedias));
      // "Media input not found" = a SHARED reference media_id (identity/world/cast/cloth) imported once at the
      // top of the shoot has gone STALE by the time this (later) scene renders - the classic mid-shoot b-roll
      // failure. Re-import EVERY reference this scene uses FRESH from its source URL, then retry once.
      if (!res.url && medias.length && /not found|media input|expired|invalid media/i.test(String(res.error || ""))) {
        const fresh = await step.run(`reimport-${i}`, async () => {
          const imp = async (u?: string | null) => (u ? await importMediaUrl(String(u)).catch(() => null) : null);
          const ids = (await Promise.all((guided ? idRefUrls.slice(0, 1) : idRefUrls).map((u) => imp(u)))).filter((v): v is string => !!v);
          if (featureUrl && !guided) { const f = await imp(featureUrl); if (f) ids.push(f); }
          const cloth = clothMediaEff ? await imp(clothSrc) : null;
          const loc = locMedia ? await imp(brief.locationRef) : null;
          const world = worldTagOn ? await imp(worldRefUrl) : null;
          const roleU = sceneRefUrl || (role === "a-roll" ? persona.aroll_ref_url : role === "b-roll" ? persona.broll_ref_url : "");
          const roleM = roleRefMedia ? await imp(roleU ? String(roleU) : null) : null;
          const cast = (castTag && castAnchor) ? await imp(castAnchorUrl) : null;
          return [...ids, ...(cloth ? [cloth] : []), ...(loc ? [loc] : []), ...(world ? [world] : []), ...(phoneMedia ? [phoneMedia] : []), ...(roleM ? [roleM] : []), ...(cast ? [cast] : [])].map((value) => ({ value, role: "image" }));
        });
        if (fresh.length) { activeMedias = fresh; res = await step.run(`shot-retry-${i}`, () => runGen(activeMedias)); }
      }
      const url = res.url;
      const gen = () => runGen(activeMedias).then((r) => r.url);
      let usable = url && (await step.run(`valid-${i}`, () => filterLoadable([url as string]))).length > 0 ? url : null;
      // QA GATE (opt-in): reject waxy/malformed/drift frames and re-roll once. Off by default for speed.
      if (usable && QA_ON) {
        const verdict = await step.run(`qa-${i}`, () => qaCreative(usable as string).catch(() => ({ pass: true, score10: 7, issues: [] as string[] })));
        await step.run(`uqa-${i}`, () => recordUsage({ influencerId, provider: "anthropic", model: "claude-haiku-4-5", unit: "image", action: "qa", count: 1 }).catch(() => {}));
        if (!verdict.pass) {
          const reroll = await step.run(`reroll-${i}`, gen);
          if (reroll && (await step.run(`valid2-${i}`, () => filterLoadable([reroll as string]))).length > 0) { usable = reroll; await step.run(`u2-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: shotModel, unit: "image", action: "creative", count: 1 }).catch(() => {})); }
        }
      }
      // THE HUMANISER (realism pass): re-render the keyframe through Nano Banana Pro using itself as
      // the reference — holds identity/pose/wardrobe/framing, fixes ONLY the skin so it reads as a real
      // photo (kills the plastic/AI sheen). This is the world-class-scene finish.
      // ALWAYS ON, even in Draft speed: the keyframe LOCKS the shot, and the final-quality conform pass
      // re-animates this EXACT still - so if the still weren't humanised, the delivered clip couldn't be
      // full quality without re-shooting (which would drift). Draft speed is animation-only; the still is
      // always the real thing. (HF_HUMANISE=0 is the global off switch.)
      if (usable && process.env.HF_HUMANISE !== "0") {
        const human = await step.run(`humanise-${i}`, () => humaniseUrl(usable as string, { prompt: HUMANISER, ratio }).catch(() => null));
        if (human && (await step.run(`vhuman-${i}`, () => filterLoadable([human]))).length > 0) {
          usable = human;
          await step.run(`uhuman-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: HUMANISER_MODEL, unit: "image", action: "humaniser", count: 1 }).catch(() => {}));
        }
      }
      let hosted: string | null = null;
      if (usable) {
        hosted = (await step.run(`host-${i}`, () => rehostToBlob(usable as string, "shots").catch(() => null))) || usable;
        await step.run(`usage-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: shotModel, unit: "image", action: "creative", count: 1 }));
      }
      return { scene: i, role, beat, url: hosted, error: hosted ? null : "no image" };
    };

    // DURABLE SEQUENTIAL: each scene shoots, then saves by reloading the latest from the DB and
    // merging its frame in (never in-memory — Inngest discards in-memory state between steps, which
    // hung the board). Sequential → race-free, frames drop in live one-by-one. 1K keeps each quick.
    const saveShot = async (i: number, row: ShotRow) => {
      const fresh = (((await step.run(`reload-${i}`, () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
      const prod = (fresh.production ?? production) as Record<string, unknown>;
      const list = Array.isArray(prod.shots) ? [...(prod.shots as ShotRow[])] : [];
      const at = list.findIndex((s) => s.scene === i); if (at >= 0) list[at] = row; else list.push(row);
      list.sort((a, b) => a.scene - b.scene);
      await step.run(`save-${i}`, () => updateInfluencer(influencerId, { persona: { ...fresh, production: { ...prod, shots: list, shots_status: "running" } } }));
    };
    // Collect the role-matching scenes (graphics pass straight through).
    const targets: { i: number; sc: Record<string, string> }[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i] as Record<string, string>;
      const scRole = String(sc.role || "a-roll");
      // When filtering by role/scene, leave the others untouched (don't re-render them).
      if (roleFilter && scRole !== roleFilter) continue;
      if (sceneFilter && !sceneFilter.includes(i)) continue;
      if (scRole === "graphic") { await saveShot(i, { scene: i, role: "graphic", beat: String(sc.beat || ""), url: null }); continue; }
      targets.push({ i, sc });
    }
    // Shoot the MASTER ANCHOR frame FIRST to establish the world (continuity anchor), then render the REST
    // CONCURRENTLY so one slow image can never stall the whole board — each failed frame just comes back as
    // an error to re-shoot. Saves stay sequential (in scene order) so the DB merge can't race; frames land live.
    if (targets.length) {
      // CRITICAL: the anchor must be a LOCATION-RICH frame, NOT the a-roll hook. The hook is a deliberately
      // clean presenter shot (plain, shallow-DoF, blurred background), so anchoring the whole film's world to
      // it gave the b-roll scenes nothing to match — and they invented a NEW location (the "apartment →
      // coffee shop" drift). Prefer the first b-roll-WITH-companion scene (it shows the full set AND Leah's
      // outfit AND the daughter — one frame that locks world + wardrobe + companion), else any b-roll (shows
      // the set), else fall back to the hook (all-a-roll films have no location to drift). worldRef locks the
      // location + lighting + Leah's wardrobe for EVERY later scene (a-roll and b-roll); castAnchor locks the
      // companion. So the whole film copies one real establishing frame instead of a blurred talking head.
      const isBrollCompanion = (t: { sc: Record<string, string> }) => String(t.sc.role || "") === "b-roll" && Array.isArray((t.sc as Record<string, unknown>).talent) && (t.sc as unknown as { talent: string[] }).talent.length > 1;
      let anchorAt = targets.findIndex(isBrollCompanion);
      if (anchorAt < 0) anchorAt = targets.findIndex((t) => String(t.sc.role || "") === "b-roll");
      if (anchorAt < 0) anchorAt = 0;
      const anchor = targets[anchorAt];
      const anchorRow = await renderShot(anchor.i, anchor.sc);
      await saveShot(anchor.i, anchorRow);
      if (anchorRow.url) {
        if (!worldRef) { worldRefUrl = anchorRow.url as string; worldRef = await step.run(`worldref-${anchor.i}`, () => importMediaUrl(anchorRow.url as string).catch(() => null)); }
        if (isBrollCompanion(anchor) && !castAnchor) { castAnchor = worldRef; castAnchorUrl = worldRefUrl; } // this frame already includes the companion
      }
      // If the anchor wasn't a companion frame, still lock the cast from the first companion b-roll before the
      // concurrent render, so every later b-roll scene locks the daughter/companion's look + outfit to it.
      let rest = targets.filter((_, k) => k !== anchorAt);
      if (!castAnchor) {
        const bi = rest.findIndex(isBrollCompanion);
        if (bi >= 0) {
          const b = rest[bi];
          const bRow = await renderShot(b.i, b.sc);
          await saveShot(b.i, bRow);
          if (bRow.url) { castAnchorUrl = bRow.url as string; castAnchor = await step.run(`castanchor-${b.i}`, () => importMediaUrl(bRow.url as string).catch(() => null)); }
          rest = rest.filter((_, k) => k !== bi);
        }
      }
      const pending = rest.map((t) => ({ i: t.i, p: renderShot(t.i, t.sc) }));
      for (const { i, p } of pending) await saveShot(i, await p);
    }
    const done = (((await step.run("reload-done", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const prodDone = (done.production ?? production) as Record<string, unknown>;
    const finalShots = (Array.isArray(prodDone.shots) ? (prodDone.shots as ShotRow[]) : []).slice().sort((a, b) => a.scene - b.scene);
    await step.run("done", () => updateInfluencer(influencerId, { persona: { ...done, production: { ...prodDone, shots: finalShots, shots_status: "done", status: "shots" } } }));
    return { ok: true, shots: finalShots.length };
  },
);

// THE PRODUCER — "render the clips": turn each board frame into a moving clip. A-ROLL scenes
// become HeyGen talking clips (the frame + our expressive VO); B-ROLL scenes become Kling
// image->video motion clips (face-safe). Graphic scenes pass through to assembly. Durable +
// progressive; every clip metered; one failed clip never blocks the rest.
type ClipRow = { scene: number; role: string; beat: string; kind: string; url: string | null; status: string; error?: string | null; synced?: boolean; audio_url?: string | null; duration?: number; engine?: string; draft?: boolean };
// Keep at least the old ~16 minute floor even when env-tuned lower; default to ~24 minutes for slow vendor queues.
const CLIP_POLL_ROUNDS = Math.max(120, Number(process.env.CLIP_POLL_ROUNDS) || 240); // ~240 x 8s ≈ 32 min: give the slow Kling lane more time to LAND a full-length clip before it ever falls back to the fixed-~5s DoP proxy (the b-roll "freeze" cause on a final render)
export const generateClips = inngest.createFunction(
  { id: "generate-clips", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/generate.clips" }] },
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
    const existingClips = Array.isArray(production?.clips) ? (production!.clips as ClipRow[]) : [];
    // INCREMENTAL by default: a whole-board "animate" only renders scenes that DON'T already have a good
    // clip (so a partial 6/8 run finishes the last 2 instead of re-rendering all 8 - that was pointless +
    // costly). force=true re-animates everything; an explicit scene filter always re-renders those scenes.
    const force = event.data.force === true;
    // reanimate = an EXPLICIT per-scene redo (the card's ↻ Re-animate). Only force or reanimate may
    // re-render a scene that already has a good clip; a bulk/role animate NEVER re-renders a good clip.
    const reanimate = event.data.reanimate === true;
    const speed = event.data.speed === true; // draft SPEED mode: render a-roll clips at 720p (faster); the final stitch always outputs 1080p
    const hasGoodClip = (i: number) => existingClips.some((c) => Number(c.scene) === i && c.url && c.status !== "failed");
    // Rejected references: scenes the producer dropped from the galleries — never animate them.
    const dropped = new Set((Array.isArray((production as { dropped_scenes?: number[] })?.dropped_scenes) ? (production as { dropped_scenes?: number[] }).dropped_scenes! : []).map(Number));

    // Only WIPE clips on a forced full redo. A normal/per-scene run must NOT re-write the whole clips array
    // (that bulk write would clobber a clip a CONCURRENT per-scene run just saved) - it only flips the status.
    await step.run("mark-running", () => updateProductionFields(influencerId, force ? { clips_status: "running", clips: [] } : { clips_status: "running" }));

    // VOICE-ONCE: synthesize the WHOLE script as one continuous take, slice per scene by the timestamps
    // → identical voice across every scene + WYSIWYG. Returns the slices FROM the step (Inngest replays
    // cached step results, so in-memory maps don't survive — we rebuild the map outside). Best-effort:
    // any failure leaves the map empty and each scene falls back to per-scene TTS. Disable VOICE_ONCE=0.
    const sceneAudio = new Map<number, { url: string; duration: number | null }>();
    // PREFER the full voiceover the producer generated + LISTENED TO in the Voice step (stored slices) —
    // animate then ships the exact audio they approved (WYSIWYG). Only generate here if they didn't.
    const storedVO = (Array.isArray((production as { scene_audio?: { scene: number; url: string; duration: number }[] } | null)?.scene_audio)
      ? (production as { scene_audio: { scene: number; url: string; duration: number }[] }).scene_audio : []);
    if (storedVO.length) {
      for (const e of storedVO) sceneAudio.set(e.scene, { url: e.url, duration: e.duration });
    } else if (voiceId && process.env.VOICE_ONCE !== "0") {
      const slices = await step.run("voice-once", async () => {
        const parts: { i: number; start: number; end: number }[] = [];
        let full = "";
        for (let s = 0; s < scenes.length; s++) {
          const ln = String((scenes[s] as Record<string, string>).vo_line || "").trim();
          if (!ln) continue;
          const start = full.length ? full.length + 1 : 0; // +1 for the joining space
          full += (full.length ? " " : "") + ln;
          parts.push({ i: s, start, end: full.length });
        }
        if (!full.trim() || !parts.length) return [];
        let pcm: Buffer; let charEndTimes: number[];
        try { ({ pcm, charEndTimes } = await ttsPcm(voiceId as string, full, { expressive: (persona.voice_model === "v3" || process.env.AROLL_EXPRESSIVE === "1"), speed: Number(persona.voice_speed) || undefined })); }
        catch { return []; }
        if (!charEndTimes.length) return [];
        const timeAt = (c: number) => charEndTimes[Math.min(charEndTimes.length - 1, Math.max(0, c))] || 0;
        const out: { i: number; url: string; duration: number }[] = [];
        for (const p of parts) {
          const startSec = p.start > 0 ? timeAt(p.start - 1) : 0;
          const endSec = timeAt(p.end - 1);
          if (!(endSec > startSec)) continue;
          const url = await putBytes(pcmSliceToWav(pcm, startSec, endSec), "scene-vo", "wav", "audio/wav").catch(() => null);
          if (url) out.push({ i: p.i, url, duration: endSec - startSec });
        }
        if (out.length) await recordUsage({ influencerId, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {});
        return out;
      });
      for (const e of slices || []) sceneAudio.set(e.i, { url: e.url, duration: e.duration });
    }

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
      // LIVE BACKGROUND a-roll: render this talking scene on Veo (the whole scene animates - e.g. horses
      // racing behind her) instead of HeyGen (which freezes the background). Veo generates the mouth movement;
      // her real ElevenLabs voice is laid OVER it in the stitch (approximate lip-sync, moving world - the
      // documented pro workflow). Opt-in per scene; HeyGen stays the default for tight-sync clean talking heads.
      // A-ROLL STAYS ON HEYGEN. Its lip-sync is materially better than the full-scene engines (Veo/DoP), and on
      // a talking shot the sync is the thing a viewer notices first - so we do NOT trade it away for background
      // motion. crowd_extras on an a-roll therefore does NOT reroute the engine; only the explicit live_bg
      // opt-in does (that switch exists for the rare "living venue behind her" hero shot, and it knowingly
      // accepts looser sync in exchange).
      //
      // The consequence is a hard constraint, and it is honest: HeyGen animates the PERSON, not the scene, so
      // an a-roll background is a still photograph. A background person in that still cannot move, and if we let
      // one in it hovers and smears. So realism on a-roll is won in the KEYFRAME (a naturally quiet backdrop with
      // real depth of field), never by asking HeyGen for motion it cannot produce. See the keyframe rules.
      const liveBg = role === "a-roll" && String((sc as Record<string, unknown>).live_bg) === "true";
      const presetAudio = String(sc.vo_audio_url || "").trim(); // producer's own uploaded VO for this scene
      // Steer the video model away from its two worst tells: shaky camera + people clipping through
      // the world. Appended to every clip prompt.
      const MOTION_SAFE = " MOTION + PHYSICS RULES (obey strictly, in priority order): (1) SPEED - everyone moves at NORMAL real-time pace, never slow-motion, sped-up, floaty, stuttering or time-lapsed. (2) NATURAL HUMAN WALK - everyone moves with a real, human GAIT: proper weight, balance, heel-to-toe stride and arm swing, ONE natural continuous action in ONE direction. NEVER stiff, gliding, floating, robotic, moon-walking or physically impossible; nobody walks backwards, reverses, about-turns or paces back and forth. (3) PEOPLE ARE SOLID - nobody walks into, through or over another person, a queue or any object; they flow naturally AROUND each other, never clipping, merging or ghosting through anyone. (4) SAME-PERSON CONTINUITY (critical) - when someone passes BEHIND the subject or an object, the EXACT SAME person re-emerges on the far side a moment later: identical face, hair, gender, age, build and clothing. A man who walks behind stays that same man - he NEVER turns into a different person, a woman, or a stranger, and NEVER vanishes, duplicates, teleports or morphs. Every background person keeps their own fixed identity for the whole clip. (5) HELD OBJECTS - a bag, handbag, phone, cup or product stays firmly GRIPPED in the SAME hand for the whole clip and moves WITH that hand and body; it NEVER floats, hovers where it was, drops or detaches when the hand moves away. (6) SOLID WORLD - nothing melts, warps, morphs or turns into another object; walls, furniture, signage, poles, trees and buildings hold their exact shape and position, shifting across frame only through natural camera parallax. (7) BACKGROUND CROWD - keep any background people calm, sparse and mostly STILL, sitting or standing to the SIDES and well BEHIND the subject and softly out of focus; at most one or two move gently, and NONE walks across directly behind the subject or passes behind her body. Never a busy, fast-moving or dense crowd. Hands and fingers stay anatomically correct throughout. Keep skin REAL - natural pores and texture, never plastic, waxy or airbrushed. Camera stays smooth and gentle; only living things move, the built world stays still.";
      // When a scene has water, the video model's worst tell is fake/jelly water — force real physics.
      const sceneText = `${sc.location || ""} ${sc.blocking || ""} ${base}`.toLowerCase();
      const WATER = /\b(water|pool|waves?|sea|ocean|beach|river|lake|splash|swim|swimming|fountain|rain|surf|wave pool)\b/.test(sceneText)
        ? " WATER REALISM (critical): all water — pool, waves, sea, splashes — must move with HYPER-REALISTIC fluid physics: natural ripples and rolling wave motion, light refraction and caustics on the surface, sparkling sunlight highlights, believable splashes and foam. NEVER plastic, jelly-like, gelatinous, frozen, smeared, looping or fake-looking water."
        : "";
      // Fixed structures (trees, buildings, mountains, signage) WARP/hallucinate on lateral pans + dollies — the
      // model has to invent parallax for the occluded world and gets it wrong. Detect them so the b-roll camera
      // stays near-locked (a tiny straight push-in only, no sideways move), which distorts fixed geometry the least.
      const RIGID = /\b(tree|trees|palm|palms|forest|hedge|building|buildings|tower|towers|skyscraper|architecture|skyline|mountain|mountains|table mountain|lion'?s head|bridge|pillar|column|columns|monument|landmark|facade|statue|scaffold|railing|fence|pole|poles|signage|billboard|cityscape)\b/.test(sceneText);

      // VO AUDIO for this scene — her ONE continuous voiceover. On A-ROLL it drives the lip-sync (she
      // talks DIRECT to camera). On B-ROLL it is laid OVER the silent scene in the stitch as narration,
      // so the audio flows unbroken across the cut (a-roll talking → VO over b-roll → a-roll → …) and
      // the film never goes silent. Computed ONCE here for both paths.
      let audioUrl: string | null = null;
      let audioDur: number | null = null; // EXACT spoken length — drives the a-roll scene slot (no more timecode-estimate pause/overlap)
      const preSlice = sceneAudio.get(i); // voice-once slice (one continuous take) for this scene, if available
      if (role !== "graphic" && (presetAudio || preSlice || (line && voiceId))) {
        if (presetAudio) { audioUrl = presetAudio; }
        else if (preSlice) { audioUrl = preSlice.url; audioDur = preSlice.duration; } // consistent voice-once slice
        else {
          // Moderate the line BEFORE any ElevenLabs TTS call (skip if it trips the safety classifier).
          // Use the WITH-TIMESTAMPS endpoint to also get the exact audio duration. WYSIWYG: same stable
          // model the producer previewed (eleven_v3 renders the voice differently; opt in via
          // AROLL_EXPRESSIVE=1). Verbatim line — no <break> tags (v2 speaks them).
          const r = await step.run(`tts-${i}`, async () => {
            const mod = await moderateText(line);
            if (!mod.allowed) return null;
            const exp = (persona.voice_model === "v3" || process.env.AROLL_EXPRESSIVE === "1");
            try {
              const { buffer, durationSeconds } = await ttsWithDuration(voiceId as string, line, { expressive: exp, speed: Number(persona.voice_speed) || undefined });
              const url = await putBytes(buffer, "scene-vo", "mp3", "audio/mpeg");
              return { url, duration: durationSeconds };
            } catch {
              // Fallback: plain TTS (no duration) so a-roll never hard-fails on the timestamps endpoint.
              const url = await putBytes(await tts(voiceId as string, line, { expressive: exp, speed: Number(persona.voice_speed) || undefined }), "scene-vo", "mp3", "audio/mpeg").catch(() => null);
              return url ? { url, duration: null as number | null } : null;
            }
          });
          if (r) { audioUrl = r.url; audioDur = r.duration; }
        }
        if (audioUrl && !presetAudio && !preSlice) await step.run(`u-tts-${i}`, () => recordUsage({ influencerId, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {}));
      }
      // BULLETPROOF VO LENGTH: if we have the voiceover but not its exact duration (e.g. a preset upload, or a
      // plain-TTS fallback with no timestamps), MEASURE the file. The b-roll clip length + the stitch slot are
      // both driven off this, so it must be the REAL spoken length, never the storyboard's 8s timecode estimate.
      if (audioUrl && !(typeof audioDur === "number" && audioDur > 0)) {
        const d = await step.run(`voprobe-clip-${i}`, () => probeDuration(audioUrl as string).catch(() => null));
        if (typeof d === "number" && d > 0.3) audioDur = d;
      }

      // A-ROLL ONLY = she speaks DIRECT TO CAMERA, lip-synced (OmniHuman drives her lips from our VO).
      // B-ROLL is a video SCENE: NEVER lip-synced — its VO narrates OVER the silent motion (laid in the
      // stitch via audio_url below). This is the standard a-roll/b-roll split.
      if (role === "a-roll" && audioUrl && !liveBg) {
        // A-ROLL prompt for HeyGen Avatar IV: it animates the PERSON, not the scene. Asking it to move
        // "background people" makes it WARP/fast-forward the crowd in the still (the hallucination we saw).
        // So this is SUBJECT-ONLY motion + an explicitly CALM, still background. No MOTION_SAFE/WATER here
        // (that crowd-motion language is for the b-roll video model, not a talking-photo engine).
        const handsMotion = (sc as { mic?: boolean }).mic === true
          ? "Her hand KEEPS HOLDING the small handheld microphone up near her chin for the whole clip — steady and natural, angled toward her mouth as she speaks into it. The mic hand does NOT lower, drop, wave or gesture; it stays holding the mic near her chin with only tiny natural micro-motion, and her OTHER hand rests low and still. The microphone stays firmly gripped in the SAME hand the entire time and never floats, detaches or disappears."
          : "HANDS STAY RESTING FOR ESSENTIALLY THE ENTIRE CLIP (in her lap, at her sides, or lightly clasped) and barely move at all — AT MOST ONE tiny, slow, low hand motion across the whole clip, or none. NEVER raised to chest height or above, never wide, sweeping, repeated, waving, pointing, gesturing, flailing or animated. She barely uses her hands: the warmth and life come from her FACE and gentle head movement, NOT her hands, which stay quiet and still like a composed person calmly speaking to a friend — err firmly on the side of NO hand movement.";
        const prompt = `Natural, lifelike talking-to-camera delivery: ${base}. She FINISHES her sentence completely and then SETTLES calmly — mouth closing, a composed beat, holding her relaxed expression — never inhaling, never looking about to speak again, never cut mid-word. Her movement is entirely SUBJECT-driven, calm and human: gentle natural head movement, subtle shoulder and posture shifts, natural blinking and warm micro-expressions as she speaks. ${handsMotion} Real, like a person calmly talking to a friend. The camera holds a steady, gentle, essentially locked frame on her — no pan, tilt, zoom, push or crane — and she stays centred and fully in frame throughout. The BACKGROUND behind her has shallow depth of field and stays CALM and naturally STILL: do NOT animate, move, warp, duplicate or fast-forward any background people or objects. Any people in the background are a STILL, calm backdrop FAR behind her - they do NOT walk, cross, step, turn, duplicate, vanish, reappear or repeat, and NOBODY walks behind her and pops out the other side; treat the background like a near-frozen, softly out-of-focus backdrop. ONLY she moves, naturally and at real-life speed. SKIN REALISM (critical): keep her REAL skin texture, visible pores and natural imperfections exactly as in the source photo - do NOT smooth, wax, plastic-ify, airbrush, beautify, retouch or porcelain-glaze her face; she must read as a real person filmed on camera, never a glossy plastic CGI render.`;

        // PRIMARY a-roll engine: HeyGen Avatar IV (v3) — purpose-built talking-photo lip-sync, cheap
        // (subscription), and it animates OUR photo so skin texture is preserved. It is the ONLY a-roll
        // engine in heygen mode: if it fails we FAIL LOUD with the real reason (no silent drop to a worse
        // engine, which hid the "static photo, weak motion" problem). Set AROLL_ENGINE=omnihuman to opt out.
        const AROLL_ENGINE = process.env.AROLL_ENGINE || "heygen";
        if (AROLL_ENGINE === "heygen") {
          // HeyGen RATE-LIMITS concurrent submits (429). Retry the submit with exponential back-off so a
          // burst of a-roll scenes all land instead of failing — each waits out the limiter and gets in.
          const HG_TRIES = Math.max(1, Number(process.env.HEYGEN_SUBMIT_RETRIES) || 6);
          // HeyGen often returns a TRANSIENT "render failed" (no real reason) that succeeds on a fresh submit.
          // Wrap the whole submit+poll in an outer RETRY (default 3) on a render-level failure, so a scene
          // isn't lost to a HeyGen hiccup. A genuine content failure still gives up after the retries.
          const RENDER_TRIES = Math.max(1, Number(process.env.HEYGEN_RENDER_RETRIES) || 3);
          let hgUrl: string | null = null; let hgErr = "not attempted"; let hgVariant: string | undefined;
          for (let render = 0; render < RENDER_TRIES && !hgUrl; render++) {
            let hg: { ok: true; videoId: string; version: "v2" | "v3"; variant?: string } | { ok: false; error: string } = { ok: false, error: "not attempted" };
            for (let attempt = 0; attempt < HG_TRIES; attempt++) {
              hg = await step.run(`hg-submit-${i}-${render}-${attempt}`, () => startTalkingVideo({ imageUrl: img as string, audioUrl, ratio, motionPrompt: prompt, speed }).then((r) => ({ ok: true as const, ...r })).catch((e) => ({ ok: false as const, error: String((e as Error)?.message || e).slice(0, 200) })));
              if (hg.ok || !/429|rate.?limit/i.test((hg as { error: string }).error)) break;
              await step.sleep(`hg-rl-${i}-${render}-${attempt}`, `${Math.min(120, 12 * (attempt + 1))}s`); // 20s,40s,60s,80s,100s,120s
            }
            if (!hg.ok) { hgErr = `submit failed: ${(hg as { error: string }).error}`; if (render < RENDER_TRIES - 1) await step.sleep(`hg-resubmit-${i}-${render}`, "8s"); continue; }
            for (let n = 0; n < 170; n++) { // POLL FAST early (clips usually land in 1-3 min): 4s for ~5 min, then 8s. ~13 min total.
              const s = await step.run(`hg-poll-${i}-${render}-${n}`, () => pollTalking(hg.videoId, hg.version));
              if (s.url) { hgUrl = s.url; hgVariant = hg.variant; break; }
              if (s.error || s.status === "failed") { hgErr = s.error || "render failed"; break; }
              await step.sleep(`hg-wait-${i}-${render}-${n}`, n < 75 ? "4s" : "8s");
            }
            if (!hgUrl && render < RENDER_TRIES - 1) await step.sleep(`hg-render-retry-${i}-${render}`, "10s"); // let HeyGen settle, then re-render fresh
          }
          if (hgUrl) {
            // model=avatar_iv always (no legacy path); the VARIANT records whether full motion+expressiveness applied.
            await step.run(`u-hg-${i}`, () => recordUsage({ influencerId, provider: "heygen", model: "avatar_iv", unit: "video", action: "aroll", count: 1 }).catch(() => {}));
            const hosted = (await step.run(`hghost-${i}`, () => rehostToBlob(hgUrl as string, "clips").catch(() => null))) || hgUrl;
            return { scene: i, role, beat, kind: role, url: hosted, status: "ready", synced: true, audio_url: audioUrl, duration: audioDur ?? undefined, engine: `heygen:avatar_iv:${hgVariant}`, draft: speed };
          }
          // Surface remaining HeyGen credits on failure - "render failed" across many scenes is usually the
          // account running out of quota (like Shotstack did), and this makes that obvious instead of guessing.
          const hgQuota = await step.run(`hg-quota-${i}`, () => remainingQuota().then((q) => { const r = (q as { remaining_quota?: number; data?: { remaining_quota?: number } })?.remaining_quota ?? (q as { data?: { remaining_quota?: number } })?.data?.remaining_quota; return typeof r === "number" ? r : null; }).catch(() => null));
          return { scene: i, role, beat, kind: role, url: null, status: "failed", error: `HeyGen Avatar IV did not finish: ${hgErr}${hgQuota != null ? ` — HeyGen credits remaining: ${hgQuota}${hgQuota <= 0 ? " (OUT OF CREDITS - top up HeyGen)" : ""}` : ""}`, engine: "heygen:avatar_iv" };
        } else {
          // OPT-IN fal OmniHuman path (expensive, per-second). fal rejects inputs >5MB so re-encode first.
          const ohImg = await step.run(`oh-prep-${i}`, () => compressForFal(img as string));
          const oh = await step.run(`oh-submit-${i}`, () => submitOmniHuman({ imageUrl: ohImg, audioUrl, prompt }));
          if (oh.statusUrl && oh.responseUrl) {
            let ohUrl: string | null = null; let ohSeconds: number | null = null;
            for (let n = 0; n < 220; n++) { // ~22 min
              const s = await step.run(`oh-poll-${i}-${n}`, () => pollOmniHumanOnce(oh.statusUrl as string, oh.responseUrl as string));
              if (s.url) { ohUrl = s.url; ohSeconds = s.seconds; break; }
              if (s.terminal) break;
              await step.sleep(`oh-wait-${i}-${n}`, "6s");
            }
            if (ohUrl) {
              const billSeconds = Math.max(1, Math.round(ohSeconds || 8));
              await step.run(`u-oh-${i}`, () => recordUsage({ influencerId, provider: "fal", model: "omnihuman_1_5", unit: "second", action: "aroll", count: billSeconds }).catch(() => {}));
              const hosted = (await step.run(`ohhost-${i}`, () => rehostToBlob(ohUrl as string, "clips").catch(() => null))) || ohUrl;
              return { scene: i, role, beat, kind: role, url: hosted, status: "ready", synced: true, audio_url: audioUrl, duration: ohSeconds && ohSeconds > 0 ? ohSeconds : undefined, draft: speed };
            }
          }
        }

        const sub = await step.run(`asubmit-${i}`, () => submitTalkingVideo({ imageUrl: img, audioUrl, ratio, prompt }));
        let url: string | null = sub.url;
        if (!url && sub.jobId) {
          let grace = 6; // soft-terminal retry: a job can report "done" a few polls before its URL propagates
          for (let n = 0; n < CLIP_POLL_ROUNDS; n++) { // default ~180 x 8s ≈ 24 min; env-tunable for slow vendor queues
            const s = await step.run(`apoll-${i}-${n}`, () => pollVideoJobOnce(sub.jobId as string));
            if (s.url) { url = s.url; break; }
            if (s.terminal && grace-- <= 0) break;
            await step.sleep(`await-a-${i}-${n}`, "8s");
          }
        }
        if (url) {
          await step.run(`u-aroll-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "seedance_2_0", unit: "video", action: "aroll", count: 1 }).catch(() => {}));
          const hosted = (await step.run(`ahost-${i}`, () => rehostToBlob(url as string, "clips").catch(() => null))) || url;
          // Save the EXACT audio we lip-synced to — Seedance outputs a SILENT video (the audio
          // only drives the lips), so the stitch lays this same clip back over it for sound.
          return { scene: i, role, beat, kind: role, url: hosted, status: "ready", synced: true, audio_url: audioUrl, duration: audioDur ?? undefined, draft: speed };
        }
        // fall through to Kling motion (no sync) if both OmniHuman and Seedance failed
      }

      // B-ROLL = a video SCENE (silent; the VO narrates OVER it in the stitch). A-ROLL fallback keeps
      // her front-on. B-ROLL: she is naturally absorbed in the scene and does NOT address the camera.
      // SOLO vs COMPANION: if the subject is ALONE in a b-roll they must NOT appear to talk (mouth relaxed,
      // closed) - a person talking to no one reads as broken. With a named companion, natural conversation
      // between them is fine. Talent beyond the influencer = a companion is present.
      const talentArr = Array.isArray((sc as Record<string, unknown>).talent) ? (sc as unknown as { talent: string[] }).talent : [];
      const soloBroll = role === "b-roll" && talentArr.length <= 1;
      const motion = (liveBg
        ? `${base}. She looks STRAIGHT INTO THE LENS and talks to camera, her lips moving naturally as she clearly speaks the line: "${line}". Behind and around her the WHOLE SCENE is fully ALIVE and moving in real time - the signature life of this exact place actually happening (e.g. racehorses thundering down the track, the grandstand crowd reacting, flags moving). ANY PERSON IN THE BACKGROUND MOVES LIKE A REAL HUMAN BEING, at a normal, unhurried, real-world pace: each one is genuinely DOING something with a clear purpose and follows it through for the whole shot (a barman pouring and setting down a glass, two friends talking and gesturing to each other, someone walking a steady straight line across the frame and out of it). Their weight shifts, their limbs and gait are anatomically correct, their feet stay on the ground and they never glide, hover, drift, twitch, jitter, stutter, teleport, morph, warp, duplicate, walk in place, move in fast-forward or stand frozen and vacant. NOBODY in the background looks at or reacts to the camera. If a background person cannot be animated convincingly and naturally, leave that part of the background EMPTY instead - a believable empty space always beats an uncanny figure. She is the sharp foreground subject addressing the viewer while the living world plays out softly behind her. Calm, warm, natural delivery; hands mostly at rest. A steady, gentle, essentially locked frame - only a very slow, subtle push-in at most.`
        : role === "a-roll"
        // NOTE: this branch is HeyGen (talking photo), kept because its lip-sync beats the full-scene engines.
        // It animates HER ONLY - it cannot move anything else in the frame, so we must not ask it to. The old
        // prompt promised "background people... move", which HeyGen silently ignored: any bystander stayed a
        // frozen photo and smeared (the hovering barmen). The keyframe now keeps strangers OUT of an a-roll, so
        // there is nobody left to mangle, and the background is a real, lived-in, softly blurred place.
        ? `${base}. She is front-on, looking into the lens, talking to camera. CAMERA holds a steady, locked frame on her — no pan, tilt, push, zoom or crane; she stays centred and fully in frame the whole time. ONLY SHE MOVES: her face, expression, gentle head movement and natural micro-motion. The background is a real, lived-in place held in soft focus, and it stays CALM and essentially STILL - do NOT animate, warp, duplicate, fast-forward or invent movement anywhere in it, and never add a person to it.`
        : `${base}. A natural, candid video SCENE: she is IN the environment doing something real (sitting, using or showing the product, a relaxed glance or small gesture) and is NOT looking at or talking to the camera — observed b-roll, not a piece to camera. NOBODY in the scene looks at, mouths words to, or addresses the camera; her mouth is NOT moving as if speaking to camera (her voice is a voiceover laid over the top).${soloBroll ? " The subject is ALONE in this scene, so their mouth stays RELAXED and CLOSED for the whole clip - they do NOT talk, mouth words, chew or move their lips as if speaking to themselves (a person talking to no one on screen looks broken); they are quietly, naturally focused on what they are doing - a calm, wordless moment." : " A named companion is present in this scene, so natural, relaxed conversation between them is fine - they may talk and react to each other (never to the camera), lips moving naturally as real people chatting."} The scene has GENTLE, restrained life: she moves naturally at a calm real-life pace with only SUBTLE ambient motion (a soft breeze, light shifting, any water or leaves). The CAMERA is almost locked off: at most a very slow, subtle straight PUSH-IN, otherwise STATIC - NO pan, lateral dolly, sideways drift, arc, crane, whip-pan or zoom (sideways moves are where trees and buildings warp).${RIGID ? " Prominent fixed structures here (trees/buildings/landmark) - keep the camera essentially STILL." : ""}`) + MOTION_SAFE + WATER;
      // SEAMLESS FLOW: end this clip on the NEXT scene's frame (when the next scene is in the same
      // world, i.e. not a graphic card), so the motion resolves there and the cut is seamless — and
      // the background can't drift/reverse (it's anchored to a defined end frame).
      // Chain to the NEXT scene's frame ONLY for b-roll (seamless scene-to-scene flow). NEVER for
      // a-roll — the presenter must stay in their own scene, not morph into the next backdrop.
      const next = scenes[i + 1] as Record<string, string> | undefined;
      // END-FRAME CHAINING (seamless cut) makes Kling render a start→end INTERPOLATION — much heavier,
      // and it was hanging past the poll window (b-roll spinning for ages, then failing). OFF by default
      // for reliability: b-roll now renders a simple start-frame motion clip that finishes fast. Re-enable
      // the seamless-cut chaining with BROLL_END_FRAME=1 once Kling render times are healthy.
      // CAMERA LOCK (deterministic - the real answer to "make the platform obey"): Kling via Higgsfield exposes
      // NO camera-control / motion-strength / cfg parameter (the verified generate_video schema is just model +
      // prompt + aspect + duration + sound + the start/end keyframes). So a prompt is only a REQUEST. The one HARD
      // lever is the start/end keyframe pair: for scenes with rigid structures (trees, buildings, a landmark) that
      // warp on any camera move, BOOKEND the clip on its OWN start frame (end_image = start_image). Kling must
      // resolve the motion back to the identical composition, so the camera physically cannot travel and the fixed
      // structures cannot warp - only the living things (people, leaves, water) move, driven by the prompt. This
      // GUARANTEES the lock at the platform level rather than asking for it. Set BROLL_LOCK_RIGID=0 to disable.
      const lockRigid = role === "b-roll" && RIGID && process.env.BROLL_LOCK_RIGID !== "0";
      const endImageUrl = lockRigid
        ? (img || undefined)
        : (process.env.BROLL_END_FRAME === "1" && role === "b-roll" && next && String(next.role || "a-roll") !== "graphic" ? (shotUrl(i + 1) || undefined) : undefined);
      // Clip length: b-roll is rendered to the length of ITS NARRATION (the approved VO slice), so the
      // video is always at least as long as the audio and never freezes waiting for the voice to finish
      // (Gary's "pause at the end of every b-roll"). We CEIL the narration so clip ≥ audio, then the stitch
      // trims the slot to the exact audio length → seamless. Falls back to the storyboard timecode when no
      // narration slice exists. a-roll is synced to its audio separately, so it uses the timecode here.
      const a = tcSeconds(String(sc.start)); const b = tcSeconds(String(sc.end));
      const sceneDur = a != null && b != null && b > a ? b - a : 5;
      // Drive the clip length off the ACTUAL measured voiceover (audioDur - covers voice-once slices, per-scene
      // TTS AND probed presets), NOT just the pre-slice map. Falling back to the pre-slice, then the timecode.
      // This is why the b-roll used to render 8s (timecode) for a 12s VO - audioDur was captured but ignored.
      const narrationDur = (typeof audioDur === "number" && audioDur > 0) ? audioDur : sceneAudio.get(i)?.duration;
      // B-ROLL length = the MEASURED VO (Kling 3.0 renders native 3-15s), so the clip has real motion for the
      // WHOLE line and the slot matches it - no forced 10s floor freezing a short line, no VO cut. A 3s min
      // avoids a flicker-short cutaway; env-tunable (BROLL_MIN_SECONDS) if a longer default is ever wanted.
      const BROLL_MIN = Math.max(3, Math.min(15, Number(process.env.BROLL_MIN_SECONDS) || 3));
      const clipSeconds = (liveBg && typeof narrationDur === "number" && narrationDur > 0)
        ? Math.max(3, Math.min(15, Math.ceil(narrationDur))) // live-bg a-roll: match her FULL spoken line - Kling 3.0 does 3-15s so a long script (e.g. scene 3) is never cut. Veo snaps down to 8s and DoP ignores duration (fixed ~5s), so the length only truly holds on the Kling lane - which is why Kling is the live-bg default.
        : (role === "b-roll" && typeof narrationDur === "number" && narrationDur > 0)
        ? Math.max(BROLL_MIN, Math.min(15, Math.ceil(narrationDur)))
        : Math.max(3, Math.min(15, Math.round(sceneDur)));
      // HERO shot (b-roll only): route to Veo 3.1 (4K + native ambient audio) for this scene.
      const hero = role === "b-roll" && String(sc.hero) === "true";
      // B-ROLL ENGINE — KLING 3.0 is now the DEFAULT final engine (Gary's call). Kling renders native 3-15s
      // (NO loop) for clean long motion, and the DoP fallback below covers it if the MCP lane stalls. Veo is
      // opt-in (BROLL_ENGINE=veo) or forced by a HERO shot. CRITICAL: DRAFT b-roll always uses the FAST DoP
      // proxy (looped to the 8s slot in the stitch) regardless of the chosen final engine, so iteration stays
      // quick - only the FINAL (non-draft) render uses Kling/Veo. BROLL_ENGINE=dop keeps DoP for the final too.
      // Per-production override (producer-selected in the UI) wins over the env default. "seedance" routes b-roll
      // to the Seedance 1.5 REST lane; anything else keeps the default Kling fast lane.
      const brollEngine = String((production as { broll_engine?: string })?.broll_engine || process.env.BROLL_ENGINE || "kling").toLowerCase();
      // LIVE-BG ENGINE (tunable for A/B): dop = fast first-party lane (~5 min, scene-not-lips); kling/veo = MCP
      // lane (slower, but a fuller talking-moving look). Default KLING now for the scene-3 quality test vs DoP;
      // set LIVEBG_ENGINE=dop to switch back to the fast lane. (First-party only exposes DoP, so Kling is MCP.)
      const LIVEBG_ENGINE = (process.env.LIVEBG_ENGINE || "kling").toLowerCase();
      // FINAL b-roll → Veo only when hero or explicitly chosen; DRAFT b-roll never uses Veo.
      // DoP renders a FIXED ~5s clip - the Higgsfield SDK has NO duration control for image2video/dop, so it
      // CANNOT be told to go longer (that's why a b-roll under an 8s VO always came out 5.37s). So DoP is only
      // valid when the clip actually needs <= ~5s; a LONGER b-roll line MUST render on Kling (native 3-15s) or
      // the video runs out of motion. THIS is the real fix for "the scene shot maxed out at 5s".
      const DOP_OUT_SECONDS = Math.max(3, Number(process.env.DOP_OUT_SECONDS) || 5);
      const dopFits = clipSeconds <= DOP_OUT_SECONDS + 0.8; // does the needed clip length fit DoP's fixed output?
      const useVeo = (role === "b-roll" && !speed && (hero || brollEngine === "veo")) || (liveBg && LIVEBG_ENGINE === "veo");
      // SETUP B (Gary's pick): DRAFT SPEED = a FAST ~5s DoP preview to iterate the LOOK; RENDER FINAL QUALITY =
      // full-length KLING (native 3-15s = correct length + real motion the whole line). So a DRAFT b-roll uses
      // DoP (instant), a FINAL b-roll uses Kling. The voiceover plays its FULL measured length either way (the
      // audio track is independent of the clip), so you hear the whole line on a draft; only the FINAL has
      // full-length video motion. RULE, enforced in the UI: always Render Final Quality before you stitch.
      // FAST first-party REST Kling (verified: a COMPLETED clip in ~81s, reliable) is the DEFAULT scene-shot
      // engine now - it renders FULL-LENGTH Kling for BOTH draft AND final, so the 5-second DoP freeze is GONE
      // (the two-week "b-roll caps at 5s" problem). Eligible = a non-rigid scene shot that fits Kling 2.1 (<=10s).
      // Rigid scenes keep the MCP path (end_image camera lock); >10s keep MCP Kling 3.0 (up to 15s); any REST miss
      // falls through to MCP. When REST handles a scene we SKIP the 5s DoP proxy. Set BROLL_KLING_REST=0 to disable.
      // Covers ALL non-rigid scene shots, incl. >10s: Kling 2.1 REST maxes at 10s, so a 12s-voiceover scene gets
      // a 10s REST clip with ~1-2s held under the tail of the voice - far better than 30-40 min on the MCP lane
      // (that single >10s scene was gating the whole final render). Rigid scenes still use MCP (end_image lock).
      const KLING_REST_ON = process.env.BROLL_KLING_REST !== "0" && klingRestConfigured();
      // INCLUDE rigid-structure scenes (trees / buildings / a mountain / waterfront). They used to be excluded to
      // keep the MCP end_image camera lock - but that meant a whole waterfront ad (every scene rigid) fell back to
      // the 5s DoP proxy in draft (Gary's recurring "b-roll caps at 5s"). REST has no end-frame lock, so rigid
      // scenes rely on the near-locked motion PROMPT (no pan, subtle push-in) to keep structures steady. Speed +
      // full length win. RIGID_MCP=1 forces the old MCP-lock path for rigid scenes if warping ever returns.
      const rigidToMcp = RIGID && process.env.RIGID_MCP === "1";
      const restWouldHandle = KLING_REST_ON && role === "b-roll" && !liveBg && !useVeo && !rigidToMcp;
      // SEEDANCE (producer-selected b-roll engine): try it FIRST on the same fast REST lane; on any miss it falls
      // through to the Kling REST block below, so switching engines can never make a scene fail to render.
      const seedanceWouldHandle = brollEngine === "seedance" && seedanceRestConfigured() && role === "b-roll" && !liveBg && !useVeo && !rigidToMcp;
      const useDop = ((liveBg && LIVEBG_ENGINE === "dop") || (role === "b-roll" && speed) || (role === "b-roll" && !speed && brollEngine === "dop" && dopFits)) && !useVeo && dopConfigured() && !restWouldHandle;
      if (useDop) {
        // SUBMIT non-blocking, then poll in SHORT steps (never block one step on the whole render).
        // DoP is a real REST queue that handles parallel submits, but retry on rate-limit with back-off
        // anyway (same backstop as HeyGen) so a 429 waits-and-lands instead of silently dropping to Kling.
        let dop: { jobSetId: string | null; error: string | null } = { jobSetId: null, error: "not attempted" };
        const DOP_TRIES = Math.max(1, Number(process.env.DOP_SUBMIT_RETRIES) || 5);
        for (let attempt = 0; attempt < DOP_TRIES; attempt++) {
          dop = await step.run(`dop-submit-${i}-${attempt}`, () => submitDopVideo({ imageUrl: img as string, prompt: motion, seconds: clipSeconds }));
          if (dop.jobSetId || !/429|rate.?limit/i.test(dop.error || "")) break;
          await step.sleep(`dop-rl-${i}-${attempt}`, `${Math.min(120, 12 * (attempt + 1))}s`);
        }
        if (dop.jobSetId) {
          let dopUrl: string | null = null;
          // DoP turbo can sit in the queue ~20-30 min under load, so poll for ~40 min (env-tunable)
          // before giving up — a too-short window abandons a render that would have completed.
          const DOP_POLL_ROUNDS = Math.max(60, Number(process.env.DOP_POLL_ROUNDS) || 360); // poll FAST early (5s ~6 min) then 10s → ~40 min ceiling
          for (let n = 0; n < DOP_POLL_ROUNDS; n++) {
            const s = await step.run(`dop-poll-${i}-${n}`, () => pollDopOnce(dop.jobSetId as string));
            if (s.url) { dopUrl = s.url; break; }
            if (s.terminal) break; // failed/nsfw/canceled → fall through to Kling
            await step.sleep(`dop-wait-${i}-${n}`, n < 72 ? "5s" : "10s");
          }
          if (dopUrl) {
            await step.run(`u-dop-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "dop_turbo", unit: "video", action: "broll", count: 1 }).catch(() => {}));
            const hosted = (await step.run(`dophost-${i}`, () => rehostToBlob(dopUrl as string, "clips").catch(() => null))) || dopUrl;
            // Record the clip's REAL rendered length (DoP may honour our requested duration and render >5s).
            // The stitch uses this to play the FULL clip — a single smooth b-roll instead of a 5s loop — and
            // only loops when the clip is genuinely shorter than its narration. Falls back to the old assumed 5s.
            const realDur = await step.run(`dopdur-${i}`, () => probeDuration(hosted as string).catch(() => null));
            return { scene: i, role, beat, kind: role, url: hosted, status: "ready", duration: (typeof realDur === "number" && realDur > 0.5) ? realDur : DOP_OUT_SECONDS, audio_url: audioUrl || undefined, synced: false, engine: "higgsfield:dop_turbo", draft: speed };
          }
        }
        // DoP submit failed / render not done / errored → fall through to MCP-Kling below. But if the
        // submit error was CRITICAL (out of credits, bad key, vendor down) email the admin — otherwise
        // this silently degrades to Kling and the real cause (e.g. "Not enough credits") stays hidden.
        if (dop.error) await step.run(`dop-alert-${i}`, async () => { await alertIfCritical("Higgsfield DoP (b-roll video)", dop.error as string, { Influencer: influencerId, Scene: i }); return { checked: true }; });
      }

      let url: string | null = null;
      let subErr = ""; let subModel = "";

      // PHASE 1 (flagged, default OFF via BROLL_KLING_REST=1): FAST first-party REST Kling for eligible scene
      // shots - a COMPLETED clip in ~1-2 min vs ~40 min on the MCP session (verified: /v1/image2video/kling,
      // kling-v2-1, 81s). Only for a FINAL, NON-rigid scene-shot that fits Kling 2.1 (<=10s): rigid scenes keep
      // the MCP path below for the end_image camera lock, and >10s keeps MCP Kling 3.0 for the up-to-15s length.
      // Self-contained: on success it returns a delivery-quality clip (metered); on ANY miss it falls straight
      // through to the MCP Kling loop, so it can never make a scene fail that MCP would have rendered.
      // SEEDANCE lane (producer-selected). Submit → poll (~5 min ceiling) → on success return the clip; on any
      // miss, DON'T return, so control falls through to the Kling REST lane below (Seedance never blocks a render).
      if (seedanceWouldHandle && !url) {
        const sd = await step.run(`sdsubmit-${i}`, () => submitSeedanceRest({ imageUrl: img, prompt: motion, seconds: clipSeconds }));
        if (sd.jobSetId) {
          const SD_ROUNDS = Math.max(24, Number(process.env.SEEDANCE_POLL_ROUNDS) || 75); // ~75 x 4s ≈ 5 min
          let sdUrl: string | null = null;
          for (let n = 0; n < SD_ROUNDS && !sdUrl; n++) {
            const s = await step.run(`sdpoll-${i}-${n}`, () => pollDopOnce(sd.jobSetId as string));
            if (s.url) { sdUrl = s.url; break; }
            if (s.terminal) break;
            await step.sleep(`sdwait-${i}-${n}`, "4s");
          }
          if (sdUrl) {
            await step.run(`u-seedance-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: sd.model || "seedance1_5", unit: "video", action: "broll", count: 1 }).catch(() => {}));
            const hosted = (await step.run(`sdhost-${i}`, () => rehostToBlob(sdUrl as string, "clips").catch(() => null))) || sdUrl;
            const realDur = await step.run(`sddur-${i}`, () => probeDuration(hosted as string).catch(() => null));
            return { scene: i, role, beat, kind: role, url: hosted, status: "ready", duration: (typeof realDur === "number" && realDur > 0.5) ? realDur : clipSeconds, audio_url: audioUrl || undefined, synced: false, engine: `higgsfield:${sd.model || "seedance1_5"}:rest`, draft: false };
          }
        }
        if (sd.error) await step.run(`sd-alert-${i}`, async () => { await alertIfCritical("Higgsfield Seedance (b-roll)", sd.error as string, { Influencer: influencerId, Scene: i }); return { checked: true }; });
        // fall through to the Kling REST lane below (Seedance miss → Kling covers the scene).
      }
      if (restWouldHandle && !url) {
        // FAST DELIVERY LANE. Kling REST renders a full-length scene-shot in ~90s. A submit that stalls in the
        // queue almost always clears on a FRESH submit, so we RETRY the fast lane a couple of times (each with a
        // ~5 min ceiling) rather than dropping into the ~30-60 min MCP Kling lane below - that slow fall-through
        // was the "stuck for 40 min" trap. When the fast lane still can't land, we FAIL THE SCENE CLEANLY so the
        // user just taps Anim for another fast try. (Opt back into the slow lane with BROLL_MCP_FALLBACK=1.)
        const KR_TRIES = Math.max(1, Number(process.env.KLING_REST_TRIES) || 2);
        const KR_ROUNDS = Math.max(24, Number(process.env.KLING_REST_POLL_ROUNDS) || 60); // ~60 x 5s ≈ 5 min per try
        let krErr: string | null = null;
        for (let attempt = 0; attempt < KR_TRIES && !url; attempt++) {
          const sub = await step.run(`krsubmit-${i}-${attempt}`, () => submitKlingRest({ imageUrl: img, prompt: motion, seconds: clipSeconds }));
          krErr = sub.error || krErr;
          if (!sub.jobSetId) continue; // submit failed - a fresh submit usually lands
          let krUrl: string | null = null;
          for (let n = 0; n < KR_ROUNDS && !krUrl; n++) {
            const s = await step.run(`krpoll-${i}-${attempt}-${n}`, () => pollDopOnce(sub.jobSetId as string));
            if (s.url) { krUrl = s.url; break; }
            if (s.terminal) break; // failed/nsfw/canceled - resubmit on the next attempt
            await step.sleep(`krwait-${i}-${attempt}-${n}`, "5s");
          }
          if (krUrl) {
            await step.run(`u-krest-${i}-${attempt}`, () => recordUsage({ influencerId, provider: "higgsfield", model: sub.model || "kling-v2-1", unit: "video", action: "broll", count: 1 }).catch(() => {}));
            const hosted = (await step.run(`krhost-${i}-${attempt}`, () => rehostToBlob(krUrl as string, "clips").catch(() => null))) || krUrl;
            const realDur = await step.run(`krdur-${i}-${attempt}`, () => probeDuration(hosted as string).catch(() => null));
            return { scene: i, role, beat, kind: role, url: hosted, status: "ready", duration: (typeof realDur === "number" && realDur > 0.5) ? realDur : clipSeconds, audio_url: audioUrl || undefined, synced: false, engine: `higgsfield:${sub.model || "kling-v2-1"}:rest`, draft: false };
          }
        }
        if (krErr) await step.run(`kr-alert-${i}`, async () => { await alertIfCritical("Higgsfield Kling REST (b-roll)", krErr as string, { Influencer: influencerId, Scene: i }); return { checked: true }; });
        // FAIL FAST with a clear, actionable message rather than silently dropping to the slow ~40-min MCP lane.
        // A credit/403 means the developer-API wallet (which the fast lane bills, separate from the app Ultra
        // plan) is empty - say so plainly so the fix is obvious. Any other stall just needs a fresh Anim.
        // (BROLL_MCP_FALLBACK=1 is the escape hatch to grind through on the slow lane if ever needed.)
        if (process.env.BROLL_MCP_FALLBACK !== "1") {
          const restCreditBlocked = /not enough credits|insufficient|payment|quota|402|403/i.test(krErr || "");
          const msg = restCreditBlocked
            ? "your Higgsfield API credits are empty - top up the API wallet at platform.higgsfield.ai, then tap Anim to render this scene-shot."
            : (krErr || "the scene-shot render stalled on the fast lane") + " - tap Anim to try again (a fresh render usually lands in about 90 seconds).";
          return { scene: i, role, beat, kind: role, url: null, status: "failed", error: msg };
        }
        // else fall through to the MCP Kling loop below (opt-in only).
      }

      // KLING with a RE-SUBMIT retry: the MCP lane can stall or terminally-fail transiently, so a FRESH submit
      // often lands. We deliberately do NOT fall back to a broken 5s DoP clip (Gary's call) - if Kling can't
      // deliver a full-length clip after the retries, the scene FAILS cleanly and the user re-animates (another
      // fresh Kling try), rather than shipping a frozen 5s proxy.
      const KLING_TRIES = Math.max(1, Number(process.env.BROLL_KLING_TRIES) || 2);
      for (let attempt = 0; attempt < KLING_TRIES && !url; attempt++) {
        const sub = await step.run(`vsubmit-${i}-${attempt}`, () => submitVideoFromImage({ imageUrl: img, prompt: motion, ratio, endImageUrl, duration: clipSeconds, hero: useVeo }));
        subErr = sub.error || subErr; subModel = sub.model || subModel;
        if (sub.url) { url = sub.url; break; }
        if (sub.jobId) {
          let grace = 6; // soft-terminal retry: a job can report "done" a few polls before its URL propagates
          for (let n = 0; n < CLIP_POLL_ROUNDS; n++) { // default ~240 x 8s ≈ 32 min; env-tunable for slow vendor queues
            const s = await step.run(`vpoll-${i}-${attempt}-${n}`, () => pollVideoJobOnce(sub.jobId as string));
            if (s.url) { url = s.url; break; }
            if (s.terminal && grace-- <= 0) break;
            await step.sleep(`vwait-${i}-${attempt}-${n}`, "8s");
          }
        }
      }
      // LIVE-BG A-ROLL did not land in time → fall back to a reliable HeyGen talking-head (frozen background)
      // so the scene ALWAYS lands instead of failing. A still-background a-roll beats a dead clip; live-bg on
      // Higgsfield's Kling lane is slow + flaky, so this is the safety net. (The moving background is the
      // nice-to-have that gracefully degrades to HeyGen when the slow lane can't deliver.)
      if (!url && role === "a-roll" && liveBg && audioUrl && (process.env.AROLL_ENGINE || "heygen") === "heygen") {
        const fbPrompt = `Natural, lifelike talking-to-camera delivery: ${base}. Calm, human, subject-driven motion: gentle head movement, warm micro-expressions, hands resting and essentially still. The camera holds a steady, essentially locked frame on her, centred and fully in frame. The background stays calm and naturally STILL - only she moves, at real-life speed.`;
        let hgUrl: string | null = null; let hgVariant: string | undefined;
        const hg = await step.run(`lbhg-submit-${i}`, () => startTalkingVideo({ imageUrl: img as string, audioUrl, ratio, motionPrompt: fbPrompt, speed }).then((r) => ({ ok: true as const, ...r })).catch((e) => ({ ok: false as const, error: String((e as Error)?.message || e).slice(0, 200) })));
        if (hg.ok) {
          for (let n = 0; n < 170; n++) {
            const s = await step.run(`lbhg-poll-${i}-${n}`, () => pollTalking(hg.videoId, hg.version));
            if (s.url) { hgUrl = s.url; hgVariant = hg.variant; break; }
            if (s.error || s.status === "failed") break;
            await step.sleep(`lbhg-wait-${i}-${n}`, n < 75 ? "4s" : "8s");
          }
        }
        if (hgUrl) {
          await step.run(`u-lbhg-${i}`, () => recordUsage({ influencerId, provider: "heygen", model: "avatar_iv", unit: "video", action: "aroll", count: 1 }).catch(() => {}));
          const hosted = (await step.run(`lbhghost-${i}`, () => rehostToBlob(hgUrl as string, "clips").catch(() => null))) || hgUrl;
          return { scene: i, role, beat, kind: role, url: hosted, status: "ready", synced: true, audio_url: audioUrl, duration: audioDur ?? undefined, engine: "heygen:avatar_iv:livebg-fallback", draft: speed };
        }
      }
      // OPT-IN ONLY (BROLL_DOP_FALLBACK=1): fall back to a ~5s DoP clip if Kling didn't land. OFF by default -
      // Gary's call: a 5s DoP proxy under a longer VO is a frozen/broken clip, so we'd rather FAIL the scene
      // cleanly (below) and let the user re-animate than ship a freeze. Kept as an escape hatch only.
      if (process.env.BROLL_DOP_FALLBACK === "1" && !url && role === "b-roll" && !useDop && dopConfigured()) {
        const fb = await step.run(`dopfb-submit-${i}`, () => submitDopVideo({ imageUrl: img as string, prompt: motion, seconds: clipSeconds }));
        if (fb.jobSetId) {
          const FB_ROUNDS = Math.max(60, Number(process.env.DOP_POLL_ROUNDS) || 360);
          let dopUrl: string | null = null;
          for (let n = 0; n < FB_ROUNDS; n++) {
            const s = await step.run(`dopfb-poll-${i}-${n}`, () => pollDopOnce(fb.jobSetId as string));
            if (s.url) { dopUrl = s.url; break; }
            if (s.terminal) break;
            await step.sleep(`dopfb-wait-${i}-${n}`, n < 72 ? "5s" : "10s");
          }
          if (dopUrl) {
            await step.run(`u-dopfb-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: "dop_turbo", unit: "video", action: "broll", count: 1 }).catch(() => {}));
            const hosted = (await step.run(`dopfbhost-${i}`, () => rehostToBlob(dopUrl as string, "clips").catch(() => null))) || dopUrl;
            const realDur = await step.run(`dopfbdur-${i}`, () => probeDuration(hosted as string).catch(() => null));
            return { scene: i, role, beat, kind: role, url: hosted, status: "ready", duration: (typeof realDur === "number" && realDur > 0.5) ? realDur : DOP_OUT_SECONDS, audio_url: audioUrl || undefined, synced: false, engine: "higgsfield:dop_turbo:veo-fallback", draft: false };
          }
        }
      }
      if (url) {
        const usedModel = useVeo ? "veo3_1" : (process.env.HF_VIDEO_MODEL || "kling3");
        await step.run(`u-vid-${i}`, () => recordUsage({ influencerId, provider: "higgsfield", model: usedModel, unit: "video", action: role === "a-roll" ? "aroll" : "broll", count: 1 }).catch(() => {}));
        const hosted = (await step.run(`vhost-${i}`, () => rehostToBlob(url as string, "clips").catch(() => null))) || url;
        // B-ROLL (and silent a-roll fallback) carries its VO as audio_url so the stitch lays the
        // narration OVER the silent scene — the continuous voiceover never drops out across the cut.
        const realDur = await step.run(`vdur-${i}`, () => probeDuration(hosted as string).catch(() => null));
        // This path is Veo (b-roll) or Kling (live-bg) at full engine + 1080p - already delivery quality
        // regardless of the draft flag, so it's never a proxy and the conform pass must skip it.
        return { scene: i, role, beat, kind: role, url: hosted, status: "ready", duration: (typeof realDur === "number" && realDur > 0.5) ? realDur : clipSeconds, audio_url: audioUrl || undefined, synced: false, draft: false };
      }
      return { scene: i, role, beat, kind: role, url: null, status: "failed", error: (subErr || `the Kling render (${subModel || "kling"}) stalled and didn't finish in time`) + " — re-animate this scene to try again (Kling stalls are usually transient)." };
    };

    // Render EVERY scene CONCURRENTLY (wall-clock ≈ the slowest single clip, not the sum). Each
    // scene merge-saves its result as it lands so the UI fills in live; a final save is authoritative.
    // Only render the scenes in the role filter (all of them when no filter).
    // FINAL COST GUARD: never re-render a scene that already has a good clip unless this is a forced full
    // redo or an explicit per-scene re-animate - even if the caller's scene list mistakenly includes it.
    const targets = scenes.map((sc, i) => ({ sc, i })).filter(({ sc, i }) => !dropped.has(i) && (!roleFilter || roleFilter.includes(String(sc.role || "a-roll"))) && (!sceneFilter || sceneFilter.includes(i)) && (force || reanimate || !hasGoodClip(i)));
    // Each clip saves via an ATOMIC per-scene upsert (upsertClip) - the row lock makes it safe both across
    // the parallel renders in THIS run AND across SEPARATE concurrent runs (animating several scenes at once),
    // with no reload-merge-write race. This replaces the old serialized saveLock that only guarded one run.
    const renderAndSave = async ({ sc, i }: { sc: Record<string, string>; i: number }) => {
      // Contain a single scene's failure: if renderOne throws (a vendor error after retries), save a
      // "failed" clip instead of rejecting the whole batch — otherwise the final "done" step never runs.
      let row: ClipRow;
      try { row = await renderOne(i, sc); }
      catch (e) { row = { scene: i, role: String(sc.role || "a-roll"), beat: String(sc.beat || ""), kind: String(sc.role || "a-roll"), url: null, status: "failed", error: String((e as Error)?.message || e).slice(0, 160) }; }
      await step.run(`csave-${i}`, () => upsertClip(influencerId, row as unknown as Record<string, unknown> & { scene: number }));
      return row;
    };
    // Render scenes in PARALLEL so clips queue at their vendor simultaneously (wall-clock ≈ slowest clip,
    // not the sum). BUT split by role: HeyGen (a-roll) RATE-LIMITS concurrent submits (429), so the
    // talking clips run at a LOW concurrency; b-roll (DoP — a real REST queue) runs wide. The two pools
    // run concurrently. The HeyGen 429 back-off above is the backstop if the limiter still bites.
    const CLIP_CONCURRENCY = Math.max(1, Number(process.env.CLIP_CONCURRENCY) || 12);
    const AROLL_CONCURRENCY = Math.max(1, Number(process.env.AROLL_CONCURRENCY) || 2);
    const runPool = async (items: typeof targets, conc: number) => {
      for (let c = 0; c < items.length; c += conc) await Promise.all(items.slice(c, c + conc).map(renderAndSave));
    };
    const arollTargets = targets.filter((t) => String(t.sc.role || "a-roll") === "a-roll");
    const otherTargets = targets.filter((t) => String(t.sc.role || "a-roll") !== "a-roll");
    await Promise.all([runPool(arollTargets, AROLL_CONCURRENCY), runPool(otherTargets, CLIP_CONCURRENCY)]);

    // DONE: only flip the status - never bulk-write the clips array (the upserts already saved each clip, and
    // a bulk write here would clobber a CONCURRENT per-scene run's clip). Order doesn't matter: everything
    // that reads clips looks them up BY SCENE. clips_status="done" is a hint; the UI tracks per-scene finish.
    await step.run("done", () => updateProductionFields(influencerId, { clips_status: "done", status: "clips" }));
    // NOTIFY (option B): a full-quality "Render final quality" run is the ~40-min job - email the producer that
    // it's done (ready to stitch) so they don't have to sit and watch. Only on finalize (event.data.notify);
    // fast draft animates don't email. Guarded + wrapped so it can never fail the render.
    if ((event.data as { notify?: boolean }).notify) await step.run("notify-render", () => notifyRenderDone({ name: String(inf.name || ""), kind: "final-render", to: (event.data as { userEmail?: string }).userEmail }).catch(() => ({ sent: false })));
    return { ok: true, clips: targets.length };
  },
);

// Ambient SFX prompt: use the producer's OWN description when they set one, else the scene's setting - ALWAYS
// with a hard negative so ElevenLabs can't invent sirens/alarms/traffic/music/speech (the "why is there a
// siren at a coffee shop?" bug). One builder shared by the audio step and the stitch so they stay in sync.
function buildAmbientPrompt(desc: string, setting: string): string {
  const want = desc && desc.trim() ? desc.trim() : `the natural, characteristic gentle background sounds of ${setting}`;
  // CRITICAL: ElevenLabs Sound Effects is a text-to-audio model that does NOT understand negation. Listing
  // "NO sirens / alarms / traffic" made it LATCH onto those words and GENERATE a siren (the recurring bug).
  // So the prompt must be PURELY POSITIVE - describe ONLY the gentle sounds we WANT, and it fills the bed with
  // exactly those. No "no ..." clauses, ever.
  // Generate at a NATURAL, clearly AUDIBLE level. The stitch already mixes ambient softly under the voice
  // (ambientVol ~0.16), so telling the model "quiet / sits quietly in the background" here made a DOUBLE-quiet,
  // near-silent bed (measured rms ~0.001 = inaudible). Describe a full, present room tone; the mix lowers it.
  return `Realistic, continuous ambient background atmosphere of ${want}. The true environmental room tone of that place, natural and clearly PRESENT at a normal recording level - render it audible and full (it gets mixed softly under the voice later, so it must NOT be faint or near-silent).`;
}

// Music bed prompt: force a REAL, STRUCTURED corporate / brand-video TRACK, not a vibe-only description. Pure
// mood words ("warm, confident, unhurried") made ElevenLabs Music compose a slow low sustained PAD - a drone/
// hum with ~all its energy below 250Hz. So we always pin concrete musical structure (groove, percussion, a
// bright melodic hook, bass, airy highs) + an explicit "not a low droning pad". Any storyboard music_bed / tone
// rides along as the flavour.
function buildMusicPrompt(sb?: { music_bed?: string; tone?: string } | null): string {
  const flavour = String(sb?.music_bed || sb?.tone || "warm, confident, modern").trim();
  return `Polished, upbeat MODERN CORPORATE / brand-video background music - a real instrumental TRACK with clear structure, not a mood pad. Flavour: ${flavour}. Production: a steady, light, positive groove with gentle percussion and a soft kick, a simple BRIGHT melodic hook (piano or plucked synth), a warm smooth bassline and airy pads; confident, professional and forward-moving. Instrumental only, no vocals. Keep it LIGHT and AIRY with clearly present mids and highs so it sits cleanly under a voiceover - it must NOT be a slow, low, sustained pad or drone.`;
}

// THE PRODUCER — "music & ambient" (its own gated step): generate the music bed + ambient room
// tone up front so the producer can hear them BEFORE the stitch. Saved to production.music_url /
// ambient_url; the stitch reuses them instead of regenerating. Durable; both metered.
export const generateAudio = inngest.createFunction(
  { id: "generate-audio", retries: 0, onFailure: onProductionFailure, triggers: [{ event: "influencer/generate.audio" }] }, // retries:0 so a timed-out music call falls back to ambient-only fast (no 2.5-min re-try)
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as { storyboard?: { scenes?: Record<string, string>[]; duration_seconds?: number; tone?: string; music_bed?: string }; brief?: { setting?: string } } | null;
    const sb = production?.storyboard;
    if (!sb?.scenes?.length) return { error: "no storyboard" };
    // Length the music must cover = the REAL video length, not the storyboard estimate. The actual cut runs
    // to the sum of the per-scene narration (each scene plays for its voice), which often overruns the
    // estimate - that's why the music was stopping ~20s early. Use the voiceover slices' total + a buffer
    // (the music plays UNDER the video, so a little extra just fades out; too SHORT leaves dead silence).
    const sa = Array.isArray((production as { scene_audio?: { scene: number; duration?: number }[] })?.scene_audio) ? (production as { scene_audio: { scene: number; duration?: number }[] }).scene_audio : [];
    const droppedA = new Set((Array.isArray((production as { dropped_scenes?: number[] })?.dropped_scenes) ? (production as { dropped_scenes?: number[] }).dropped_scenes! : []).map(Number));
    const voTotal = sa.filter((e) => !droppedA.has(Number(e.scene))).reduce((s, e) => s + (Number(e.duration) || 0), 0);
    // Music/ambient bed length = the CONTENT (the voiceover total + a small margin so it covers to the last word).
    // NOT padded to the brief/storyboard target - the cut is exactly its content length, so the bed only needs to
    // cover that; the soundtrack fades at the timeline end. (Padding to 60 was what left the silent tail.)
    const total = Math.max(15, Math.ceil(voTotal) + 6);
    await step.run("mark", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, audio_status: "running" } } }));

    // Generate music + ambient IN PARALLEL (they're independent) — this halves the wait vs running
    // them back-to-back. Each is a single slow ElevenLabs request.
    const brief = buildMusicPrompt(sb);
    const setting = String(production?.brief?.setting || sb.scenes[0]?.location || "the location").slice(0, 120);
    // Producer overrides: a custom ambient description (what they want to HEAR) and an OFF switch (no ambient).
    const ambientOff = (production as { ambient_off?: boolean })?.ambient_off === true;
    const ambientDesc = String((production as { ambient_prompt?: string })?.ambient_prompt || "").trim();
    // CATCH INSIDE each step (return {url,error}) so a failed vendor call NEVER throws the step - with
    // retries:0 a thrown step would fail the whole run and save NOTHING (the "audio step produces nothing"
    // bug). This way whichever bed succeeds still shows, and a real failure surfaces its reason in the UI.
    // LOUDNESS-NORMALISE BOTH BEDS to a known reference before they are stored (see lib/loudness.ts).
    // ElevenLabs hands back wildly different absolute levels per generation - on Dave's cut the ambient stem
    // arrived 29 dB quieter than the music - so a fixed Shotstack volume like 0.16 means something different
    // on every render. The gain MUST be baked into the file: Shotstack caps volume at 1.0, so a -47.8 LUFS
    // ambient bed can never be lifted to its target at the mixer. Fails open (returns the original buffer).
    const [music, ambient] = await Promise.all([
      step.run("music", async () => { try { const m = await generateMusic(brief, total * 1000); const buf = await normaliseToLufs(m.buf, m.ext, BED_REFERENCE_LUFS); return { url: await putBytes(buf, "music", m.ext, m.mime), error: null as string | null }; } catch (e) { return { url: null as string | null, error: String((e as Error)?.message || e).slice(0, 180) }; } }),
      ambientOff
        ? Promise.resolve({ url: null as string | null, error: null as string | null }) // producer turned ambient OFF
        : step.run("ambient", async () => { try { const raw = await generateSfx(buildAmbientPrompt(ambientDesc, setting), 22); const buf = await normaliseToLufs(raw, "mp3", BED_REFERENCE_LUFS); return { url: await putBytes(buf, "ambient", "mp3", "audio/mpeg"), error: null as string | null }; } catch (e) { return { url: null as string | null, error: String((e as Error)?.message || e).slice(0, 180) }; } }),
    ]);
    const musicUrl = music.url, ambientUrl = ambient.url;
    if (musicUrl) await step.run("u-music", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "music", count: 1 }).catch(() => {}));
    if (ambientUrl) await step.run("u-ambient", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "ambient", count: 1 }).catch(() => {}));

    const done = (((await step.run("reload", () => getInfluencer(influencerId)))?.persona as Record<string, unknown>) || persona);
    const prod = (done.production ?? production) as Record<string, unknown>;
    const audioError = [music.error && `Music: ${music.error}`, ambient.error && `Ambient: ${ambient.error}`].filter(Boolean).join(" · ") || null;
    await step.run("save", () => updateInfluencer(influencerId, { persona: { ...done, production: { ...prod, music_url: musicUrl, ambient_url: ambientUrl, music_seconds: total, audio_error: audioError, audio_status: "done" } } }));
    return { ok: true, music: !!musicUrl, ambient: !!ambientUrl, error: audioError };
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
  { id: "assemble-video", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/assemble.video" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as {
      brief?: { brand?: string; logo?: string; logoUrl?: string; promoUrl?: string; logoPosition?: string };
      storyboard?: { scenes?: Record<string, string>[]; format?: string; music_bed?: string; tone?: string; duration_seconds?: number; legal?: string };
      clips?: { scene: number; role: string; url: string | null; kind?: string; synced?: boolean; audio_url?: string | null; duration?: number; textured?: boolean }[];
    } | null;
    const sb = production?.storyboard;
    const scenes = sb?.scenes ?? [];
    const clips = production?.clips ?? [];
    if (!scenes.length || !clips.some((c) => c.url)) return { error: "render the clips first" };
    const voiceId = persona.voice_id as string | undefined;
    const fmt = String(sb?.format || "");
    const ratio = fmt.includes("16:9") ? "16:9" : fmt.includes("1:1") ? "1:1" : "9:16";

    await step.run("mark-running", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, assembly_status: "running", final_url: null } } }));

    // SELF-HEAL: older clips were saved with a ".png" extension (a re-host bug), which Shotstack
    // rejects as a video. Re-host any clip whose URL isn't a video extension to a proper .mp4 so the
    // stitch works without forcing a re-render. (New clips already save correctly.)
    const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|flv)(\?|$)/i;
    let fixedAny = false;
    for (const c of clips) {
      if (c.url && !VIDEO_EXT.test(c.url)) {
        const fixed = await step.run(`fixclip-${c.scene}`, () => rehostToBlob(c.url as string, "clips").catch(() => null));
        if (fixed && VIDEO_EXT.test(fixed)) { c.url = fixed; fixedAny = true; }
      }
    }
    if (fixedAny) await step.run("save-fixed-clips", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, clips } } }));

    // TEXTURE PASS (see lib/texture.ts): the animators smooth away the Humaniser's skin detail (HeyGen -24%
    // on the face, Kling -35% whole-frame). Restore it here, once, on the way into the stitch - this is the
    // single place every engine's clips converge (Kling, Seedance, DoP, HeyGen and per-scene re-takes).
    // Idempotent: a clip carries `textured` so a re-stitch never re-processes (or re-sharpens) it. Each clip
    // is its own step, so a long encode can't blow the function's window. Fails open: on any error the
    // original clip is kept and the cut still ships.
    if (texturePassEnabled()) {
      let texturedAny = false;
      for (const c of clips) {
        if (!c.url || c.textured) continue;
        const better = await step.run(`texture-${c.scene}`, () => texturiseClip(c.url as string, String(c.role)));
        if (better) { c.url = better; c.textured = true; texturedAny = true; }
      }
      if (texturedAny) await step.run("save-textured-clips", () => updateInfluencer(influencerId, { persona: { ...persona, production: { ...production, clips } } }));
    }

    const clipUrl = (i: number) => clips.find((c) => c.scene === i)?.url || null;

    // Rejected references: scenes the producer dropped from the galleries — leave them out of the cut.
    const dropped = new Set((Array.isArray((production as { dropped_scenes?: number[] })?.dropped_scenes) ? (production as { dropped_scenes?: number[] }).dropped_scenes! : []).map(Number));
    const kept = scenes.map((sc, i) => ({ sc, i })).filter(({ i }) => !dropped.has(i));
    // Lay the kept clips BACK-TO-BACK at each clip's REAL rendered duration. This is the fix for the
    // "pause" between scenes: the storyboard timecodes are estimates, so a clip shorter than its slot
    // used to FREEZE on its last frame to fill the gap. Using the actual clip length (a-roll = the
    // OmniHuman/VO length, b-roll = the duration we rendered) means every clip plays fully then cuts —
    // no freeze, no gap. Falls back to the timecode (then 5s) when a clip duration is unknown.
    const clipDur = (i: number) => { const c = clips.find((x) => x.scene === i); return typeof c?.duration === "number" && c.duration > 0 ? c.duration : null; };
    // b-roll is a SILENT clip with the voiceover laid over it, and the video engine (DoP) typically HOLDS
    // (freezes) its final frame — playing the full requested length runs into that freeze = the "pause"
    // before the next scene. So for b-roll, lay the scene to its NARRATION length (the approved VO slice):
    // the continuous voiceover stays seamless AND we cut just before the frozen tail. a-roll already plays
    // to its exact synced length, so it's untouched.
    const sceneAudioDur = new Map<number, number>();
    (Array.isArray((production as { scene_audio?: { scene: number; duration?: number }[] })?.scene_audio) ? (production as { scene_audio: { scene: number; duration?: number }[] }).scene_audio : []).forEach((e) => { if (typeof e?.duration === "number" && e.duration > 0) sceneAudioDur.set(Number(e.scene), e.duration); });
    // GENEROUS word-count estimate (~2.0 words/sec, deliberately slow so it errs LONG) - the last-ditch floor
    // for the scene length + VO audio length if BOTH the live probe and the stored slice duration are somehow
    // missing, so the voiceover can never be cut short. Erring long only leaves harmless trailing silence.
    const wordSecs = (t: string) => { const w = String(t || "").trim().split(/\s+/).filter(Boolean).length; return w ? w / 2.0 : 0; };
    // Per-scene WORD CUES (start time of each spoken word, relative to the scene) → exact caption sync.
    const sceneCues = new Map<number, number[]>();
    (Array.isArray((production as { scene_audio?: { scene: number; cues?: number[] }[] })?.scene_audio) ? (production as { scene_audio: { scene: number; cues?: number[] }[] }).scene_audio : []).forEach((e) => { if (Array.isArray(e?.cues) && e.cues.length) sceneCues.set(Number(e.scene), e.cues); });
    // The approved per-scene VO slice URL, for probing the REAL audio duration below.
    const sceneAudioUrl = new Map<number, string>();
    (Array.isArray((production as { scene_audio?: { scene: number; url?: string }[] })?.scene_audio) ? (production as { scene_audio: { scene: number; url?: string }[] }).scene_audio : []).forEach((e) => { if (e?.url) sceneAudioUrl.set(Number(e.scene), e.url); });
    // BULLETPROOF VO LENGTH for EVERY scene (a-roll AND b-roll): MEASURE the actual voiceover file we'll lay
    // down (probe its real duration), not a stored slice length that can be stale/missing. Both the scene SLOT
    // and the audio track length below are driven by this, so the voice can NEVER be cut short (the slot is
    // always >= the audio) and the clip never has to freeze far past its motion (the slot = the VO, not a floor).
    const voRealDur = new Map<number, number>();
    for (const { sc, i } of kept) {
      if (!String(sc.vo_line || "").trim()) continue;
      const vurl = (clips.find((c) => c.scene === i)?.audio_url as string | undefined) || sceneAudioUrl.get(i);
      let d = sceneAudioDur.get(i) ?? 0;
      if (vurl) { const probed = await step.run(`voprobe-${i}`, () => probeDuration(vurl).catch(() => null)); if (typeof probed === "number" && probed > 0.3) d = Math.max(d, probed); }
      if (d > 0) voRealDur.set(i, d);
    }
    let cursor = 0;
    const placed = kept.map(({ sc, i }) => {
      const role = String(sc.role || "a-roll");
      const vo = String(sc.vo_line || "").trim();
      const a = tcSeconds(String(sc.start)); const b = tcSeconds(String(sc.end));
      const tcLen = a != null && b != null && b > a ? b - a : 5;
      let len = clipDur(i) ?? tcLen;
      // Real VO length = the MEASURED audio (probe, else stored slice); the word-count floor is only a
      // last-ditch fallback if BOTH are missing. (Taking a max WITH the word estimate over-inflated the slot -
      // an 8.4s VO padded to a 10s slot - which made the b-roll freeze WORSE. Use the true duration.)
      const realVo = voRealDur.get(i) ?? sceneAudioDur.get(i) ?? wordSecs(vo);
      // A scene runs EXACTLY as long as its measured voiceover - slot = the VO length. NOT max'd with the clip's
      // own length: a REST Kling clip is a discrete 5s/10s, so a 10s clip under an 8s VO was padding the scene to
      // 10s = a 2s VO-less gap. We now TRIM a longer clip to the VO (play its first N seconds) and only HOLD when
      // the clip is genuinely shorter than the VO. Either way the scene = the voiceover: no gap, no cut voice.
      // b-roll keeps a tiny 3s min for a very short line; a sanity ceiling stops a bad probe ballooning the cut.
      // NATURAL BREATH, PUNCTUATION-AWARE (Gary's call): if this scene's line ENDS A SENTENCE (. ! ?) give it a
      // small tail beat so it lands and settles instead of cutting on the last syllable; if the line RUNS ON into
      // the next scene (a continuation - ends on a comma or no terminal mark), keep the gap near-zero so the two
      // scenes flow as one unbroken thought. The VO itself is never touched - only the length of the scene's beat.
      // Env-tunable: SCENE_PAD (sentence end, default 0.35s) and SCENE_CONT_PAD (continuation, default 0.05s).
      // A-ROLL can't be slowed (it's lip-synced), so a pad beyond the clip becomes a FROZEN presenter frame - a
      // visible mid-video pause. B-ROLL is slowed to fill its slot, so a pad there stays smooth motion. So the
      // sentence-end breath is FULL on b-roll but only a tiny micro-settle on a-roll (below freeze-perception, so
      // it doesn't cut ON the syllable yet never reads as a pause). Continuations stay near-seamless for both.
      const endsSentence = /[.!?]["'”’)\]]*$/.test(vo);
      // NaN-safe env read: a mis-set (non-numeric) pad must fall back to the default, not corrupt the timeline
      // (Number("x") → NaN → NaN scene length). Allows an explicit 0.
      const padEnv = (v: string | undefined, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : def; };
      const contPad = padEnv(process.env.SCENE_CONT_PAD, 0.05);
      const scenePad = !endsSentence ? contPad
        : role === "a-roll" ? padEnv(process.env.AROLL_SCENE_PAD, 0.1)
        : padEnv(process.env.SCENE_PAD, 0.35);
      if (vo && realVo > 0) {
        const floor = role === "b-roll" ? 3 : 0;
        len = Math.min(Math.max(realVo + scenePad, floor), Math.max(20, Number(process.env.BROLL_MAX_SECONDS) || 30));
      }
      // Silent b-roll (no narration line + no slice): keep it a BRIEF cutaway, not a long silent hold.
      else if (role === "b-roll") len = Math.min(len, 2.8);
      const start = cursor;
      cursor = start + len;
      return { i, start, len, role, vo, caption: String(sc.caption || "").trim(), captionPos: String(sc.caption_pos || ""), captionOff: String(sc.caption_off) === "true" };
    });
    // End on her last word - NOT a long hold. A ~2s tail froze the actor on her last frame (looked odd).
    // Now just a brief beat (0.4s) so the final word fully lands and the cut doesn't clip, then end. The
    // music's fade-out runs over her last line (soundtrack fadeInFadeOut), so it eases out as she finishes.
    const TAIL = Math.max(0, Number(process.env.END_TAIL) || 0.4);
    // The cut is EXACTLY as long as its content: cursor = the sum of scene slots, each of which is already >= its
    // measured voiceover. We do NOT pad to the brief/storyboard duration - padding left a silent held-frame tail
    // (video ran to 60s while the voiceover ended at ~52s = "audio cut, video longer"). Verified on Dave:
    // voTotal 51.5s == slotTotal 51.5s. If a full 60s is wanted the SCRIPT must fill it; we never pad silence.
    const total = (cursor || 30) + TAIL;
    // Carry the last scene's frame across just that brief beat (no black tail), not a noticeable freeze.
    if (placed.length) placed[placed.length - 1].len = Math.max(placed[placed.length - 1].len, total - placed[placed.length - 1].start);

    // The music (and ambient) must cover the FULL timeline INCLUDING the appended end card, or the bed stops
    // ~endLen (up to 6s) before the real end — the "music dies ~6s before the video ends" bug. Add the end
    // card length to the music length so the soundtrack survives to the very last second.
    const endCardLenForBed = String((production?.brief as { endCardUrl?: string })?.endCardUrl || "").trim()
      ? ((production?.brief as { endCardKind?: string })?.endCardKind === "image" ? 4 : 6) : 0;
    const musicLen = total + endCardLenForBed;
    // Overshoot the REQUEST by a margin so even a short ElevenLabs render still covers the last second.
    const MUSIC_MARGIN = Math.max(2, Number(process.env.MUSIC_END_MARGIN) || 6);
    // Music bed (full length) → Blob. REUSE the audio step's bed if it already produced one.
    let musicUrl: string | null = (production as { music_url?: string })?.music_url || null;
    // MEASURE the reused bed's REAL length (music_seconds is the REQUESTED length, which LIES when ElevenLabs
    // returns a file shorter than asked - the true cause of "the music dies ~6s before the end"). If the real
    // file falls short of the timeline, drop it and regenerate. Otherwise the fade-out lands at the FILE's end,
    // leaving dead air after it.
    if (musicUrl) {
      const realMusic = await step.run("musicprobe", () => probeDuration(musicUrl as string).catch(() => null));
      if (typeof realMusic === "number" && realMusic + 0.5 < musicLen) musicUrl = null;
    }
    if (!musicUrl) try {
      const brief = buildMusicPrompt(sb);
      musicUrl = await step.run("music", async () => { const m = await generateMusic(brief, (musicLen + MUSIC_MARGIN) * 1000); return putBytes(m.buf, "music", m.ext, m.mime); }); // request timeline + margin so it covers to the last second even if the render comes back short
      await step.run("u-music", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "music", count: 1 }).catch(() => {}));
    } catch { musicUrl = null; }

    // Ambient bed: a continuous low room/location tone under everything (ElevenLabs SFX). SFX clips
    // max ~22s, so tile copies across the full duration. Mixed UNDER the VO + music. Reuse if present.
    // Producer turned ambient OFF → no ambient bed at all (even if one was generated earlier). Else reuse the
    // pre-generated bed, or build one from their custom description (with the hard no-siren negative).
    const ambientOff = (production as { ambient_off?: boolean })?.ambient_off === true;
    let ambientUrl: string | null = ambientOff ? null : ((production as { ambient_url?: string })?.ambient_url || null);
    if (!ambientOff && !ambientUrl) try {
      const setting = String((production?.brief as { setting?: string })?.setting || scenes[0]?.location || "the location").slice(0, 120);
      const ambientDesc = String((production as { ambient_prompt?: string })?.ambient_prompt || "").trim();
      ambientUrl = await step.run("ambient", async () => putBytes(await generateSfx(buildAmbientPrompt(ambientDesc, setting), 22), "ambient", "mp3", "audio/mpeg"));
      await step.run("u-ambient", () => recordUsage({ influencerId, provider: "elevenlabs", model: "music", unit: "music", action: "ambient", count: 1 }).catch(() => {}));
    } catch { ambientUrl = null; }
    const ambientTrack: Record<string, unknown>[] = [];
    // MIX (see lib/loudness.ts). The VOICE is the anchor element - ATSC A/85 anchors programme loudness to
    // dialogue - so both beds are placed a fixed dB OFFSET below the voiceover's MEASURED loudness, not at a
    // blind multiplier. Music sits 12-18 dB under speech, ambient 18-26 dB under (broadcast/post practice).
    // The beds were normalised to a known reference when they were generated, so this arithmetic is honest
    // whatever level ElevenLabs happened to output. If the VO can't be measured we fall back to the reference,
    // which reproduces the old behaviour rather than silencing anything.
    // Every scene's voice is normalised to VO_REFERENCE_LUFS and both beds to BED_REFERENCE_LUFS, so the mixer
    // needs no measurement: the offsets are exact constants. That is the whole point - the balance is now
    // reproducible on every render instead of depending on whatever level ElevenLabs happened to output.
    // The producer's sliders stay meaningful: they TRIM around the calibrated level (1.0 = calibrated,
    // >1 louder, <1 softer) rather than setting an absolute gain against an unknown source.
    const trim = (set: unknown, legacyDefault: number) =>
      typeof set === "number" && set >= 0 ? Math.min(3, set / legacyDefault) : 1;
    const musicVol = bedVolume(null, MUSIC_UNDER_VO_DB, trim((production as { music_vol?: number })?.music_vol, 0.18));
    const ambientVol = bedVolume(null, AMBIENT_UNDER_VO_DB, trim((production as { ambient_vol?: number })?.ambient_vol, 0.16));
    if (ambientUrl) for (let t = 0; t < total; t += 22) ambientTrack.push({ asset: { type: "audio", src: ambientUrl, volume: ambientVol }, start: t, length: Math.min(22, total - t) });

    // Voiceover track. A-roll: lay back the EXACT audio we lip-synced to (Seedance video is silent),
    // so the voice matches the lips perfectly. B-roll/graphic: generate the VO from the scene line.
    // The producer's APPROVED voiceover, sliced per scene (generated or uploaded) - this is the exact
    // audio they listened to. Use it for EVERY scene (a-roll's synced slice + b-roll's narration slice)
    // so the final cut ships the take they approved, byte-for-byte. Only re-synthesize if a slice is
    // genuinely missing (e.g. a line added after the voiceover was generated).
    const approvedSlice = new Map<number, string>();
    (Array.isArray((production as { scene_audio?: { scene: number; url: string }[] }).scene_audio)
      ? (production as { scene_audio: { scene: number; url: string }[] }).scene_audio : [])
      .forEach((e) => { if (e?.url) approvedSlice.set(Number(e.scene), e.url); });
    const voTrack: Record<string, unknown>[] = [];
    for (const p of placed) {
      const clip = clips.find((c) => c.scene === p.i);
      const synced = (clip?.audio_url as string | undefined) || approvedSlice.get(p.i);
      // A-roll: the scene slot (p.len) now equals the EXACT audio duration, so play the voice to its
      // precise length — NO +tail bleeding into the next scene (that bleed was the "two audios at once").
      // B-roll: lay the APPROVED slice as narration over the silent scene (not a fresh re-synthesis).
      if (synced) {
        // Fade the slice EDGES so it starts/ends at zero amplitude → no click where it butts the next scene's
        // clip. ElevenLabs varies each take, so a boundary can land on a sharp sound; a longer fade (18ms,
        // env VO_FADE_MS) reliably smooths it where 4ms was hit-and-miss. Still inaudible (a syllable is
        // ~150ms), so a-roll lip-sync is unaffected. WAV only; a one-off MP3 TTS passes through unchanged.
        const fadeMs = Math.max(2, Number(process.env.VO_FADE_MS) || 18);
        const fadedSrc = await step.run(`vofade-${p.i}`, async () => {
          try {
            const r = await fetch(synced as string);
            if (!r.ok) return synced as string;
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.subarray(0, 4).toString("latin1") !== "RIFF") return synced as string; // not a WAV → leave as-is
            // Clean the voice: high-pass the sub-bass rumble (the "background" exposed when ambient is off),
            // then bring the scene to the VOICE ANCHOR loudness, then de-click the edges.
            //
            // The voice is the anchor element the whole mix is balanced against (ATSC A/85 anchors programme
            // loudness to dialogue), so it must land on a KNOWN loudness, not a peak/RMS approximation. Dave's
            // cut measured -22.2 LUFS: about 6 dB under target, which is why the whole ad sounded quiet and the
            // beds felt soft under it. It also matters for delivery - YouTube (and Spotify's default) only turn
            // audio DOWN, never up, so shipping quieter than the platform target is the one mistake with no
            // recovery. Normalising every scene to the same anchor also evens out quiet scenes, which is what
            // the old RMS normalizeWav was reaching for. Fails open: on any error the buffer passes through.
            const hpHz = process.env.VO_HIGHPASS_HZ != null ? Number(process.env.VO_HIGHPASS_HZ) : 90;
            const cleaned = highpassWav(buf, hpHz);
            const anchored = await normaliseToLufs(cleaned, "wav", VO_REFERENCE_LUFS);
            const faded = fadeWavEdges(anchored === cleaned ? normalizeWav(cleaned) : anchored, fadeMs);
            // GUARD: never hand Shotstack a WAV whose `data` chunk we can't find. A header-offset bug once
            // wrote samples over the header here and the whole render died with "not a valid media file".
            // If the processed buffer doesn't parse, ship the untouched original instead of a corrupt file.
            if (wavDataStart(faded) < 0) return synced as string;
            return await putBytes(faded, "vo-faded", "wav", "audio/wav");
          } catch { return synced as string; }
        });
        // Play the FULL measured VO (never truncate to a shorter slot = the "voice cut off" bug). The slot is
        // built >= this, so it also never bleeds into the next scene.
        voTrack.push({ asset: { type: "audio", src: fadedSrc }, start: p.start, length: (voRealDur.get(p.i) ?? sceneAudioDur.get(p.i) ?? wordSecs(p.vo)) || p.len }); continue;
      }
      if (voiceId && p.vo) {
        try {
          const url = await step.run(`vo-${p.i}`, async () => {
            const mod = await moderateText(p.vo); // screen before any ElevenLabs TTS call
            if (!mod.allowed) return null;
            return putBytes(await tts(voiceId, p.vo, { expressive: (persona.voice_model === "v3" || process.env.AROLL_EXPRESSIVE === "1"), speed: Number(persona.voice_speed) || undefined }), "vo", "mp3", "audio/mpeg");
          });
          if (url) {
            await step.run(`u-vo-${p.i}`, () => recordUsage({ influencerId, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {}));
            voTrack.push({ asset: { type: "audio", src: url }, start: p.start, length: (voRealDur.get(p.i) ?? sceneAudioDur.get(p.i) ?? wordSecs(p.vo)) || p.len });
          }
        } catch { /* skip this VO */ }
      }
    }

    // Build the Shotstack timeline (top track renders on top). All clips are silent; voice is the
    // voTrack above (a-roll's exact synced audio + b-roll VO), so nothing doubles up.
    // CLEAN HARD CUTS between scenes. Fades made the screen DIP TO BLACK between clips (clips are
    // back-to-back on one track, so a fade-out/in fades through black) — that black flash read as the
    // "pause". With each clip now playing its full real duration (no freeze) and one continuous
    // voiceover carrying across the cuts, hard cuts are clean and seamless — the world-class look for a
    // fast ad. (A true crossfade needs overlapping clips on separate tracks — a later refinement.)
    // fit:cover + a hair of OVERSCAN so the clip always fully covers the 1080×1920 frame — kills the thin
    // white/edge lines left & right when a source video is a pixel or two off the exact 9:16 ratio.
    const VIDEO_OVERSCAN = Math.max(1, Number(process.env.VIDEO_OVERSCAN) || 1.06);
    // A-ROLL needs MORE overscan: HeyGen Avatar IV renders a 16:9 canvas and can bake a thin white edge; a
    // small extra zoom pushes that border off the 9:16 frame so there's never a white line. Env-tunable.
    const AROLL_OVERSCAN = Math.max(VIDEO_OVERSCAN, Number(process.env.AROLL_OVERSCAN) || 1.12);
    const overscanFor = (role: string) => (role === "a-roll" ? AROLL_OVERSCAN : VIDEO_OVERSCAN);
    const videoClips = placed.filter((p) => clipUrl(p.i)).flatMap((p) => {
      const src = clipUrl(p.i) as string;
      // NO LOOPING (Gary's hard rule). The clip plays ONCE for the slot length.
      // GUARANTEE the motion covers the WHOLE voice - it is IMPOSSIBLE for a b-roll line to outrun its video.
      // A scene shot renders on a Kling clip that maxes at 10s; if the voiceover runs longer than the clip, we
      // gently SLOW the clip (Shotstack `speed`) so its motion stretches to fill the voice instead of freezing
      // on the last frame (the old "held tail" pause). Clamped to >=0.7x so the slow-mo stays subtle and
      // cinematic on ambient b-roll; with the ~9.5s b-roll copy cap this is usually ~0.95x (imperceptible), and
      // it fully covers up to ~14s of voice on a 10s clip without ever touching the slow 15s render lane.
      // A-ROLL is NEVER slowed (it is lip-synced to the voice - slowing it would desync the mouth).
      const cd = clipDur(p.i);
      const speed = (p.role === "b-roll" && cd && p.len > cd + 0.15) ? Math.max(0.7, Math.round((cd / p.len) * 1000) / 1000) : undefined;
      return [{ asset: { type: "video", src, volume: 0, ...(speed ? { speed } : {}) }, start: p.start, length: p.len, fit: "cover", scale: overscanFor(p.role) }];
    });
    // END CARD (optional, from the End Cards library): append the chosen closing clip/frame after
    // the last scene. Extends the timeline so the music bed carries under it.
    const endCardUrl = String((production?.brief as { endCardUrl?: string })?.endCardUrl || "").trim();
    const endCardKind = (production?.brief as { endCardKind?: string })?.endCardKind === "image" ? "image" : "video";
    let endCardClip: Record<string, unknown> | null = null;
    if (endCardUrl) {
      const endLen = endCardKind === "image" ? 4 : 6;
      endCardClip = { asset: { type: endCardKind, src: endCardUrl, ...(endCardKind === "video" ? { volume: 0.9 } : {}) }, start: total, length: endLen, fit: "cover" };
    }
    // Captions are OPT-IN at stitch time (the producer ticks "Burn captions"). Default OFF.
    // Rendered as an HTML asset (NOT the basic "title" asset, which mis-sized and rendered unreliably) —
    // this gives controlled font size, wrapping, and a legible rounded background pill, sized for 9:16.
    const captionsOn = event.data.captions === true;
    // Strip any v3 audio tags ([excited] etc.) so they never render on screen, then HTML-escape.
    const esc = (s: string) => s.replace(/\[[^\]]*\]/g, " ").replace(/\s*\|\s*/g, ", ").replace(/\s+([,.;:!?])/g, "$1").replace(/,\s*([.!?;:])/g, "$1").replace(/([.!?;:])\s*,/g, "$1").replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Full-width caption box within the frame (16:9 is 1920 wide, 1:1/9:16 are 1080). Placement narrows it per-scene below.
    const capW = ratio === "16:9" ? 1680 : ratio === "1:1" ? 920 : 940;
    // CAPTION STYLES the producer can pick (the old dark pill read "low-level"). Each is a full CSS look for
    // the per-scene caption line. Default = "bold" (the punchy social standard). Picked via captionStyle.
    const CAPTION_STYLES: Record<string, { css: string; height: number; offY: number }> = {
      pill: { css: ".cap{width:100%;text-align:center}span{display:inline-block;color:#FFFFFF;font-family:'Open Sans',sans-serif;font-weight:700;font-size:36px;line-height:1.3;padding:10px 20px;background:rgba(0,0,0,0.6);border-radius:12px;-webkit-box-decoration-break:clone;box-decoration-break:clone}", height: 260, offY: 0.10 },
      bold: { css: ".cap{width:100%;text-align:center}span{display:inline-block;color:#FFFFFF;font-family:'Open Sans',sans-serif;font-weight:800;font-size:48px;line-height:1.22;text-transform:uppercase;letter-spacing:0.5px;text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 -3px 0 #000,0 3px 0 #000,-3px 0 0 #000,3px 0 0 #000,0 2px 9px rgba(0,0,0,0.75),0 6px 28px rgba(0,0,0,0.62);padding:4px 14px}", height: 330, offY: 0.13 },
      highlight: { css: ".cap{width:100%;text-align:center}span{display:inline-block;color:#FFFFFF;font-family:'Open Sans',sans-serif;font-weight:800;font-size:42px;line-height:1.45;padding:6px 16px;background:#a855f7;border-radius:10px;-webkit-box-decoration-break:clone;box-decoration-break:clone;text-shadow:0 2px 4px rgba(0,0,0,0.35)}", height: 300, offY: 0.12 },
      clean: { css: ".cap{width:100%;text-align:center}span{display:inline-block;color:#FFFFFF;font-family:'Open Sans',sans-serif;font-weight:700;font-size:42px;line-height:1.3;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 -2px 0 #000,0 2px 0 #000,-2px 0 0 #000,2px 0 0 #000,0 3px 7px rgba(0,0,0,0.55);padding:4px 14px}", height: 280, offY: 0.11 },
      sunny: { css: ".cap{width:100%;text-align:center}span{display:inline-block;color:#FFE14D;font-family:'Open Sans',sans-serif;font-weight:800;font-size:46px;line-height:1.25;text-transform:uppercase;letter-spacing:0.5px;text-shadow:-3px -3px 0 #111,3px -3px 0 #111,-3px 3px 0 #111,3px 3px 0 #111,0 -3px 0 #111,0 3px 0 #111,-3px 0 0 #111,3px 0 0 #111,0 4px 10px rgba(0,0,0,0.5);padding:4px 14px}", height: 320, offY: 0.13 },
    };
    // SAFE ZONE: sit captions ~20% up from the bottom (env CAPTION_Y) so they clear the platform's bottom UI
    // (TikTok/Reels caption bar, username, CTA + the right-side action buttons). The old ~11% sat too low.
    const CAP_Y = Math.max(0, Math.min(0.4, Number(process.env.CAPTION_Y) || 0.2));
    // PER-SCENE caption PLACEMENT (9-zone map the producer picks per scene). Maps a zone key to a
    // Shotstack anchor + a safe-zone offset + text alignment + a box width (narrower for side columns so
    // the caption actually hugs that side). Default (empty) = lowerCenter, the current safe-zone bottom.
    const CAP_POS: Record<string, string> = {
      topLeft: "topLeft", topCenter: "top", topRight: "topRight",
      midLeft: "left", center: "center", midRight: "right",
      lowerLeft: "bottomLeft", lowerCenter: "bottom", lowerRight: "bottomRight",
    };
    const CAP_EDGE = 0.06;
    const placeCaption = (posKey: string, boxW: number) => {
      const key = CAP_POS[posKey] ? posKey : "lowerCenter";
      const col = key.includes("Left") ? "L" : key.includes("Right") ? "R" : "C";
      const row = key.startsWith("top") ? "T" : (key.startsWith("mid") || key === "center") ? "M" : "B";
      const x = col === "L" ? CAP_EDGE : col === "R" ? -CAP_EDGE : 0;
      const y = row === "T" ? -CAP_EDGE : row === "B" ? CAP_Y : 0; // bottom lifts into the safe zone; top drops off the edge
      const align = col === "L" ? "left" : col === "R" ? "right" : "center";
      return { position: CAP_POS[key], offset: { x, y }, align, w: col === "C" ? boxW : Math.round(boxW * 0.62) };
    };
    // CHUNK a long scene line into short, screen-safe pieces that play in SEQUENCE across the scene, so a long
    // a-roll line never overflows the box and clips off the bottom of the frame (the "long copy gets cut off"
    // bug). Break at sentence + comma boundaries first (natural phrases), grouping whole phrases up to a char
    // budget (~2 lines); any single phrase longer than the budget is hard-split on word boundaries. The budget
    // is tighter for the UPPERCASE styles (bold/sunny) since their glyphs are wider.
    const chunkCaption = (text: string, maxChars: number): string[] => {
      const clean = text.trim();
      if (!clean) return [];
      const segs = (clean.match(/[^.!?,]+[.!?,]*/g) || [clean]).map((s) => s.trim()).filter(Boolean);
      const chunks: string[] = [];
      let cur = "";
      const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
      for (const seg of segs) {
        if (seg.length > maxChars) { // a single phrase too long for the box - hard-split on words
          flush();
          let line = "";
          for (const w of seg.split(/\s+/)) {
            if (line && (line + " " + w).length > maxChars) { chunks.push(line); line = w; }
            else line = line ? line + " " + w : w;
          }
          if (line) cur = line; // carry the tail so a short next phrase can join it
          continue;
        }
        if (!cur) cur = seg;
        else if ((cur + " " + seg).length <= maxChars) cur += " " + seg;
        else { flush(); cur = seg; }
      }
      flush();
      return chunks;
    };
    const capSel = String(event.data.captionStyle || "");
    let captionClips: Record<string, unknown>[] = [];
    if (captionsOn) {
      const STATIC = new Set(["pill", "bold", "highlight", "clean", "sunny"]);
      if (!STATIC.has(capSel)) {
        // WORD-SYNCED captions (DEFAULT + "karaoke"): each word highlights EXACTLY when it's spoken, using the
        // REAL per-word ElevenLabs timestamps (scene_audio `cues`), driven by the VOICEOVER text so the words
        // map 1:1 to the cues (the old path used the caption text + a ratio guess = drift). Short 3-4 word
        // phrases show at a time (modern social style); the active word gets an accent pill. Big bold outline +
        // haze for legibility on any footage. Falls back to even spacing only if a scene has no cues.
        // Active-word pill colour: producer-picked (captionAccent), else env, else brand purple.
        const HL = /^#[0-9a-fA-F]{6}$/.test(String(event.data.captionAccent)) ? String(event.data.captionAccent)
          : /^#[0-9a-fA-F]{6}$/.test(String(process.env.CAPTION_ACCENT)) ? String(process.env.CAPTION_ACCENT) : "#a855f7";
        // WORD SPACING: the Shotstack HTML renderer collapses BOTH a plain space text-node AND CSS margin between
        // inline spans (words ran together: "drowninginWhatsAppthreads"). The one separator it can't drop is a
        // NON-BREAKING SPACE (&nbsp;) as its OWN inline word - so each gap is an explicit   span between words.
        // "Bold Extra": big UPPERCASE words each on a solid black box, the SPOKEN word in the picked colour
        // (TikTok/Reels look the team liked). Default word-sync: white words + an accent PILL on the active word.
        const boldX = capSel === "boldextra";
        const WS_CSS = boldX
          ? ".cap{width:100%;font-family:'Open Sans',sans-serif;line-height:1.55;text-transform:uppercase}"
            + ".sp{display:inline-block;font-size:52px;width:.28em}"
            + ".w{display:inline-block;color:#fff;font-weight:900;font-size:52px;letter-spacing:.5px;background:rgba(0,0,0,0.85);border-radius:7px;padding:1px 11px;text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 -3px 0 #000,0 3px 0 #000,-3px 0 0 #000,3px 0 0 #000}"
            + `.hl{color:${HL}}`
          : ".cap{width:100%;font-family:'Open Sans',sans-serif;line-height:1.45}"
            + ".sp{display:inline-block;font-size:46px;width:.28em}"
            + ".w{color:#fff;font-weight:800;font-size:46px;text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 -3px 0 #000,0 3px 0 #000,-3px 0 0 #000,3px 0 0 #000,0 2px 9px rgba(0,0,0,0.75),0 6px 28px rgba(0,0,0,0.62)}"
            + `.hl{color:#fff;background:${HL};border-radius:10px;padding:2px 12px;box-shadow:0 3px 14px ${HL}88}`;
        const MAXW = Math.max(2, Number(process.env.CAPTION_PHRASE_WORDS) || 4);
        captionClips = placed.filter((p) => (p.vo || p.caption) && !p.captionOff).flatMap((p) => {
          const src = String(p.vo || p.caption || "").trim();
          const rawWords = src.split(/\s+/).filter(Boolean); // keeps punctuation, for phrase breaks
          const words = rawWords.map((w) => esc(w)).filter(Boolean); // display words (escaped, tags stripped)
          if (!words.length) return [];
          const sceneEnd = p.start + p.len;
          // Per-word ABSOLUTE start times from the real cues (relative to the scene). If the count matches,
          // it's exact; if not, resample proportionally; if there are no cues, even-space across the scene.
          const cues = sceneCues.get(p.i) || [];
          const starts: number[] = cues.length === words.length
            ? words.map((_, i) => p.start + (cues[i] || 0))
            : cues.length
              ? words.map((_, i) => p.start + (cues[Math.min(cues.length - 1, Math.round((i / words.length) * cues.length))] || 0))
              : words.map((_, i) => p.start + (p.len * i) / words.length);
          for (let i = 1; i < starts.length; i++) if (starts[i] <= starts[i - 1]) starts[i] = starts[i - 1] + 0.08;
          for (let i = 0; i < starts.length; i++) starts[i] = Math.min(starts[i], sceneEnd - 0.1);
          // Group into short phrases: break after MAXW words OR after clause/sentence punctuation (natural read).
          const groups: number[][] = []; let cur: number[] = [];
          for (let i = 0; i < words.length; i++) {
            cur.push(i);
            if (cur.length >= MAXW || /[.!?,:;]$/.test(rawWords[i] || "")) { groups.push(cur); cur = []; }
          }
          if (cur.length) groups.push(cur);
          const cp = placeCaption("lowerCenter", capW); // captions ALWAYS sit in the bottom safe zone (consistent for social)
          const off = { ...cp.offset, y: Math.max(CAP_Y, 0.13) };
          const clips: Record<string, unknown>[] = [];
          for (let g = 0; g < groups.length; g++) {
            const idxs = groups[g];
            const phraseEnd = g < groups.length - 1 ? starts[groups[g + 1][0]] : sceneEnd;
            for (let k = 0; k < idxs.length; k++) {
              const wi = idxs[k];
              const st = starts[wi];
              const rawEnd = k < idxs.length - 1 ? starts[idxs[k + 1]] : phraseEnd;
              // Guarantee a visible beat for EVERY word: on a run-on (continuation-padded) scene the last word's
              // start can clamp onto the previous one, giving a zero-length window that used to be dropped - so the
              // word showed with NO highlight pill. Floor the window at 0.12s so its accent pill always renders.
              const end = Math.max(rawEnd, st + 0.12);
              const html = `<div class="cap">${idxs.map((j) => `<span class="w${j === wi ? " hl" : ""}">${words[j]}</span>`).join("<span class=\"sp\">&nbsp;</span>")}</div>`;
              clips.push({ asset: { type: "html", html, css: WS_CSS + `.cap{text-align:${cp.align}}`, width: cp.w, height: 340, background: "transparent" }, start: st, length: end - st, position: cp.position, offset: off });
            }
          }
          return clips;
        });
      } else {
        const capStyle = CAPTION_STYLES[capSel] || CAPTION_STYLES.bold;
        // Uppercase styles (bold/sunny + the default) are wider per glyph, so fewer chars fit a line.
        const maxChars = (capSel === "bold" || capSel === "sunny" || capSel === "") ? 38 : 50;
        const offY = Math.max(capStyle.offY, CAP_Y);
        captionClips = placed.filter((p) => p.caption && !p.captionOff).flatMap((p) => {
          const text = esc(p.caption);
          const chunks = chunkCaption(text, maxChars);
          const cp = placeCaption("lowerCenter", capW); // captions ALWAYS sit in the bottom safe zone (consistent for social)
          // Bottom placements honour the style's own safe-zone offY (>= CAP_Y); other zones use the map offset.
          const off = cp.position === "bottom" || cp.position === "bottomLeft" || cp.position === "bottomRight" ? { ...cp.offset, y: offY } : cp.offset;
          const clip = (html: string, start: number, length: number) => ({
            asset: { type: "html", html: `<div class="cap"><span>${html}</span></div>`, css: capStyle.css + `.cap{text-align:${cp.align}}`, width: cp.w, height: capStyle.height, background: "transparent" },
            start, length, position: cp.position, offset: off,
          });
          if (chunks.length <= 1) return [clip(text, p.start, p.len)];
          // START TIME per chunk: from the REAL per-word speech timestamps (cues) when we have them - so a
          // chunk appears exactly when she starts speaking it - else fall back to length-weighting.
          const cues = sceneCues.get(p.i);
          const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;
          const capWords = chunks.reduce((s, c) => s + wc(c), 0) || 1;
          const starts: number[] = [];
          if (cues && cues.length) {
            let before = 0;
            for (const c of chunks) {
              const si = Math.min(cues.length - 1, Math.max(0, Math.round((before / capWords) * cues.length)));
              let st = p.start + (cues[si] || 0);
              if (starts.length) st = Math.max(st, starts[starts.length - 1] + 0.4);
              starts.push(Math.min(st, p.start + p.len - 0.4));
              before += wc(c);
            }
          } else {
            const totalChars = chunks.reduce((s, c) => s + c.length, 0) || 1;
            let acc = 0;
            for (const c of chunks) { starts.push(p.start + acc); acc += Math.max(0.5, (p.len * c.length) / totalChars); }
          }
          return chunks.map((c, ci) => {
            const st = starts[ci];
            const end = ci < chunks.length - 1 ? starts[ci + 1] : p.start + p.len;
            return clip(c, st, Math.max(0.4, end - st));
          });
        });
      }
    }
    // Brand overlay: ONLY an uploaded logo (top-left) / promo (top-right) — both explicit. No auto
    // "brand name as text" bug (it was burning the brand name on cuts nobody asked to brand).
    const logoUrl = (production?.brief?.logoUrl || "").trim();
    const promoUrl = (production?.brief?.promoUrl || "").trim();
    const brandTrack: Record<string, unknown>[] = [];
    if (logoUrl) brandTrack.push({ asset: { type: "image", src: logoUrl }, start: 0, length: total, position: "topLeft", scale: 0.16, offset: { x: 0.04, y: -0.04 } });
    if (promoUrl) brandTrack.push({ asset: { type: "image", src: promoUrl }, start: 0, length: total, position: "topRight", scale: 0.18, offset: { x: -0.04, y: -0.04 } });

    // ON-SCREEN OFFER CALLOUT (frosted glass): an animated overlay of the client's hook offer near the top.
    // Shotstack renders the HTML as ONE static frame, so the motion is the clip-level transition (slide-up in,
    // fade out) - a clean, premium land. Faux-frosted (translucent gradient + hairline border + soft shadow +
    // inset highlight); a live backdrop-blur of the video isn't possible in the compositor. Text is escaped.
    // PER-SCENE offer callouts: each scene can carry its OWN frosted-glass callout, rendered ONLY during that
    // scene's window (so it lands with the right shot and different scenes can show different offers). Robust
    // inline-block layout (Shotstack renders HTML statically and mishandles complex flex - the old flex layout
    // overlapped the chip onto the headline). Motion = the clip transition (slide-up in, fade out). Text escaped.
    type Callout = { on?: boolean; kick?: string; line?: string; num?: string; suffix?: string; accent?: string; hold?: number; pos?: string };
    const sceneCallouts = ((production as { scene_callouts?: Record<string, Callout> })?.scene_callouts) || {};
    const buildCalloutClip = (co: Callout, startSec: number, lenSec: number): Record<string, unknown> | null => {
      const kick = esc(String(co.kick || "")); const line = esc(String(co.line || ""));
      const cnum = esc(String(co.num || "")); const suffix = esc(String(co.suffix || ""));
      if (!(kick || line || cnum || suffix)) return null;
      const accent = /^#[0-9a-fA-F]{6}$/.test(String(co.accent)) ? String(co.accent) : "#ffcb05";
      const inner = [
        kick ? `<div class="k">${kick}</div>` : "",
        line ? `<div class="l">${line}</div>` : "",
        (cnum || suffix) ? `<div class="o">${cnum ? `<span class="n">${cnum}</span>` : ""}${suffix ? `<span class="f">${suffix}</span>` : ""}</div>` : "",
      ].join("");
      // DARK NAVY FROSTED GLASS (Gary's approved mockup). The overlay is now the FULL FRAME (matches the output
      // resolution) with the card positioned by CSS flexbox - the old fixed 1000x680 landscape box was being
      // stretched onto the 1080x1920 portrait frame, which SQUASHED the card. Full-frame = pixel-for-pixel, no
      // distortion. Dark translucent base so it's clearly a card over ANY footage (the white-sheen version
      // vanished over dark scenes). Shotstack-safe: no @keyframes / pseudo-elements.
      // AUTO-SIZE the offer chip to its text so a long word (e.g. "SMARTLEADS") shrinks to fit the card instead
      // of overflowing it - "1GB" stays big and punchy. The chip stays on ONE line and never exceeds the card.
      const nLen = cnum.replace(/&[a-z]+;/g, "x").length; // count escaped entities as ~1 char
      const nFont = nLen <= 4 ? 52 : nLen <= 6 ? 44 : nLen <= 9 ? 36 : nLen <= 12 ? 28 : 22;
      const fFont = nLen <= 6 ? 30 : nLen <= 12 ? 25 : 21;
      // RELIABLE positioning via Shotstack's own position/offset (placeCaption) + a self-sized card - NOT CSS
      // flexbox on a full-frame asset (Shotstack's HTML renderer ignored the flex + gradient, so the card lost
      // its glass and stuck top-left). The card is an inline-block that hugs its content; text-align:center in
      // .wrap centres it horizontally within the asset box, and Shotstack places the box at the chosen zone.
      const css = `.wrap{width:100%;text-align:center;font-family:'Open Sans',sans-serif}`
        + `.card{box-sizing:border-box;display:inline-block;text-align:left;max-width:760px;padding:32px 44px 36px;border-radius:34px;`
        + `background:linear-gradient(180deg,rgba(26,30,46,0.72) 0%,rgba(13,15,25,0.66) 100%);`
        + `border:1px solid rgba(255,255,255,0.34);box-shadow:0 26px 60px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.28)}`
        + `.k{display:block;font-weight:700;font-size:20px;letter-spacing:5px;text-transform:uppercase;color:rgba(255,255,255,0.82);margin-bottom:13px}`
        + `.l{display:block;font-weight:800;font-size:42px;line-height:1.16;color:#fff;margin-bottom:22px;text-shadow:0 2px 8px rgba(0,0,0,0.45)}`
        + `.o{display:block;line-height:1.1}`
        + `.n{display:inline-block;vertical-align:middle;max-width:100%;white-space:nowrap;font-weight:900;font-size:${nFont}px;line-height:1;color:#0c0d10;background:${accent};padding:8px 22px;border-radius:14px;box-shadow:0 8px 26px ${accent}88}`
        + `.f{display:inline-block;vertical-align:middle;margin-left:16px;font-weight:800;font-size:${fFont}px;letter-spacing:1px;color:#fff}`;
      const cp = placeCaption(String(co.pos || "lowerCenter"), 0); // Shotstack 9-zone placement + safe-zone offset
      return { asset: { type: "html", html: `<div class="wrap"><div class="card">${inner}</div></div>`, css, width: 1000, height: 620, background: "transparent" }, start: Math.max(0, startSec), length: Math.max(1, lenSec), position: cp.position, offset: cp.offset, transition: { in: "zoom", out: "fade" } };
    };
    const calloutClips: Record<string, unknown>[] = [];
    for (const p of placed) {
      const co = sceneCallouts[String(p.i)];
      if (!co || co.on === false) continue;
      // SHORT PUNCHY POP (~1.6s default), not a long hold - it zooms in, holds briefly, fades. Appears a
      // beat into the scene (when the offer is being said), capped by the scene length.
      const hold = Math.max(1, Math.min(p.len - 0.3, Number(co.hold) || 1.6));
      const c = buildCalloutClip(co, p.start + Math.min(0.6, p.len * 0.15), hold);
      if (c) calloutClips.push(c);
    }
    // Back-compat: a single legacy brief.callout with no per-scene callouts lands on the opening hook.
    const cb = (event.data.callout ?? (production?.brief as { callout?: Callout & { start?: number; duration?: number } })?.callout ?? {}) as Callout & { start?: number; duration?: number };
    if (!calloutClips.length && cb.on) {
      const cStart = Math.max(0, Math.min(total - 0.6, Number(cb.start) || 0.6));
      const c = buildCalloutClip(cb, cStart, Math.max(1.5, Math.min(total - cStart, Number(cb.duration) || 4)));
      if (c) calloutClips.push(c);
    }

    const tracks: Record<string, unknown>[] = [];
    if (calloutClips.length) tracks.push({ clips: calloutClips });
    if (brandTrack.length) tracks.push({ clips: brandTrack });
    if (captionClips.length) tracks.push({ clips: captionClips });
    if (voTrack.length) tracks.push({ clips: voTrack });
    if (ambientTrack.length) tracks.push({ clips: ambientTrack });
    // MUSIC bed plays STRAIGHT through (single soundtrack, see timeline.soundtrack below) - NO looping. The
    // earlier tiled loop restarted the bed from the top every 45s, and that hard restart was an audible POP
    // even on a perfectly clean file. One continuous play = no pop. (If a long cut outruns the composed
    // music, that's the GENERATION length to fix at source, not by re-looping.)
    // Scene transitions. Default = a SUBTLE CROSSFADE so cuts aren't abrupt (Gary's note). Each scene goes
    // on its OWN track with the LATER scene pushed FIRST (= higher z), starting a touch before the previous
    // ends and fading in over it → a real dissolve (not a dip-to-black, which a single-track fade caused).
    // Audio is on its own track, so sync is unaffected. Set SCENE_XFADE=0 for clean hard cuts.
    // DEFAULT = clean hard cuts (perfectly in sync). SCENE_XFADE>0 opts into a crossfade that extends each
    // clip's TAIL (never shifts its START), so the a-roll video stays exactly aligned to its audio - the
    // earlier version shifted starts and threw the voice out of sync.
    const XFADE = Math.max(0, Math.min(1.2, Number(process.env.SCENE_XFADE) || 0));
    if (XFADE > 0 && videoClips.length > 1) {
      const xf = videoClips.map((c, idx) => ({ ...c, length: (c.length as number) + (idx < videoClips.length - 1 ? XFADE : 0), ...(idx > 0 ? { transition: { in: "fade" } } : {}) }));
      for (let j = xf.length - 1; j >= 0; j--) tracks.push({ clips: [xf[j]] }); // last scene topmost → each fades in over the previous tail
    } else {
      tracks.push({ clips: videoClips });
    }
    if (endCardClip) tracks.push({ clips: [endCardClip] });

    const edit: Record<string, unknown> = {
      timeline: { background: "#000000", fonts: [{ src: "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/fonts/OpenSans-Bold.ttf" }, { src: "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/fonts/OpenSans-Regular.ttf" }], ...(musicUrl && musicVol > 0 ? { soundtrack: { src: musicUrl, effect: "fadeInFadeOut", volume: musicVol } } : {}), tracks },
      output: { format: "mp4", aspectRatio: ratio === "1:1" ? "1:1" : ratio === "16:9" ? "16:9" : "9:16", resolution: "1080", fps: 25 },
    };

    let finalUrl: string | null = null; let err: string | null = null;
    try {
      const renderId = await step.run("render", () => renderEdit(edit));
      // DURABLE poll: short status checks with step.sleep between, so the Shotstack render (which
      // can take minutes) never blocks one invocation long enough to time out + retry-loop.
      let out: { url: string | null; error: string | null } = { url: null, error: "render timed out" };
      for (let n = 0; n < 125; n++) { // ~125 x 6s ≈ 12.5 min - headroom for caption-heavy cuts (per-word HTML clips render slowly); still inside maxDuration=800s
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
    // NOTIFY (option B): the finished cut is ready - email a watch link. Only for a FINAL cut (no draft clips
    // left); a quick draft-preview stitch doesn't email. Guarded + wrapped so mail can never fail the stitch.
    const anyDraft = Array.isArray((prod as { clips?: { draft?: boolean }[] }).clips) && (prod as { clips: { draft?: boolean }[] }).clips.some((c) => c.draft === true);
    if (finalUrl && !anyDraft) await step.run("notify-cut", () => notifyRenderDone({ name: String(inf.name || ""), kind: "cut-ready", url: finalUrl, to: (event.data as { userEmail?: string }).userEmail }).catch(() => ({ sent: false })));
    return { ok: !!finalUrl, error: err };
  },
);

// THE PRODUCER — re-shoot ONE scene (keep the rest). Same identity + clothing/location refs as the
// full board; anchors to an existing good frame for continuity; honours the scene's (edited) direction.
export const reshootShot = inngest.createFunction(
  { id: "reshoot-shot", retries: 1, onFailure: onProductionFailure, triggers: [{ event: "influencer/reshoot.shot" }] },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);
    const index = Number(event.data.scene);
    const inf = await step.run("load", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "not found" };
    const persona = (inf.persona ?? {}) as Record<string, unknown>;
    const production = (persona.production ?? null) as { brief?: Record<string, string>; storyboard?: { scenes?: Record<string, string>[]; format?: string; supporting_cast?: { name: string; look: string }[] }; shots?: ShotRow[] } | null;
    const scenes = production?.storyboard?.scenes ?? [];
    const supportingCast = production?.storyboard?.supporting_cast ?? [];
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
    const bible = (persona.bible as { identity?: Record<string, string>; face?: Record<string, string> }) ?? {};
    const bibleId = bible.identity ?? {};
    const bibleFace = bible.face ?? {};
    // Re-thread the LOCKED physical description into the subject line on EVERY shot (v1's anti-drift
    // recipe) so the text reinforces the face reference images, not just generic age/build/ethnicity.
    // Skin + hair always; invented distinctive features only for a SYNTHETIC — when anchored to uploaded
    // photos the photo is the truth and we must not describe marks that could fight it.
    const faceDesc = [bibleFace.skin, bibleFace.hair, anchored.length ? "" : bibleFace.distinct_features].filter(Boolean).join(", ");
    const subjectLine = [bibleId.age, bibleId.build, bibleId.ethnicity_design, faceDesc].filter(Boolean).join(", ") || `${inf.name}, the influencer`;
    // Dress her in her SIGNATURE wardrobe (from the bible) by default, so the cast aligns to the character.
    const bibleLook = bibleWardrobe(persona.bible as Record<string, unknown>);
    const lookBase = lookClause(persona); // appearance WITHOUT a specific outfit
    const look = [lookBase, bibleLook && `wearing ${bibleLook}`].filter(Boolean).join(". ");
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
      castLockClause(supportingCast, (Array.isArray((sc as Record<string, unknown>).talent) ? (sc as unknown as { talent: string[] }).talent : [])),
    ].filter(Boolean).join(" ");
    const prompt = buildShotPrompt({
      location: String(sc.location || ""), blocking: String(sc.blocking || ""), shot: String(sc.shot || ""),
      performance: String(sc.performance || ""), role, subjectLine, look, refInstruction, ratio,
      // Background strangers only when the director flagged this scene a busy public place.
      hasPeople: role === "b-roll" && (sc as Record<string, unknown>).crowd_extras === true, worldAnchored: !!worldRef,
      holdMic: role === "a-roll" && (sc as { mic?: boolean }).mic === true, // producer-toggled handheld mic (a-roll only)
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
    // KEYFRAME ONLY: re-shooting the still drops this scene's stale clip but does NOT render a new video.
    // Animation is a separate, later step (after the voice is set) — the storyboard only produces
    // reference images, never final production.
    const freshClips = Array.isArray(prod.clips) ? (prod.clips as { scene: number }[]).filter((c) => c.scene !== index) : prod.clips;
    await step.run("save", () => updateInfluencer(influencerId, { persona: { ...fresh, production: { ...prod, shots: list, clips: freshClips } } }));
    return { ok: !!hosted };
  },
);

// VIDEO SPIKE — isolate-and-verify the two video engines on ONE existing frame: a Kling b-roll
// (verified schema) and a HeyGen Avatar IV a-roll (living background). Durable poll (step.sleep).
// Writes persona.spike = { broll_url, aroll_url, errors }. Super-admin triggered.
export const videoSpike = inngest.createFunction(
  { id: "video-spike", retries: 0, onFailure: onProductionFailure, triggers: [{ event: "producer/spike" }] },
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
