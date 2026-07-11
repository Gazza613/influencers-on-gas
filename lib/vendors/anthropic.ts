import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "../connections";
import { PLATFORM_STATE } from "../platform-state";
import { isSafePublicUrl } from "../safe-url";

// Claude (Anthropic), the producer co-pilot brain. Vendor-neutral in the UI.
// Sonnet 4.6 designs the Character Casting + refines prompts: near-Opus quality for a
// structured creative sheet, but markedly faster (Opus was noticeably slow here).
const MODEL = "claude-sonnet-4-6";
// The DIRECTOR runs on the premium model: the storyboard is the highest-leverage reasoning step
// (it must stay context-aware about who does what, and read the reference creatives), so it's worth it.
export const PREMIUM = "claude-opus-4-8";

async function client(): Promise<Anthropic> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Co-pilot (Anthropic) is not connected");
  return new Anthropic({ apiKey: key });
}

// CONTENT MODERATION GATE - ElevenLabs requires screening text before TTS (their "Fraudulent,
// predatory or abusive" classifier flags scam-pattern copy). We run a fast Haiku safety check and
// skip any genuinely-prohibited line so it never reaches ElevenLabs. Fail-open so a moderation
// hiccup never blocks legitimate production.
export async function moderateText(text: string): Promise<{ allowed: boolean; category: string; reason: string }> {
  const t = (text || "").trim();
  if (!t) return { allowed: true, category: "", reason: "" };
  try {
    const c = await client();
    const r = await c.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: "You are a content-safety classifier for advertising voiceover text that will be turned into a synthetic voice. Flag ONLY content that genuinely violates: fraud/scams (fake prizes, phishing, impersonating a bank/government/authority, deceptive get-rich schemes), predatory lending or abusive behaviour, harassment, hate, sexual content involving minors, or illegal activity. LEGITIMATE brand and product advertising - including real fintech products, promotions, free data/airtime offers, discounts and normal calls-to-action - is ALLOWED and must NOT be flagged. Only flag clearly deceptive or predatory content. Respond via the tool.",
      tools: [{ name: "verdict", description: "Return the safety verdict", input_schema: { type: "object" as const, properties: { allowed: { type: "boolean" }, category: { type: "string" }, reason: { type: "string" } }, required: ["allowed"] } }],
      tool_choice: { type: "tool", name: "verdict" },
      messages: [{ role: "user", content: `Classify this advertising voiceover text:\n\n${t.slice(0, 4000)}` }],
    });
    const block = r.content.find((b) => b.type === "tool_use") as { input?: { allowed?: boolean; category?: string; reason?: string } } | undefined;
    const v = block?.input || {};
    return { allowed: v.allowed !== false, category: String(v.category || ""), reason: String(v.reason || "") };
  } catch {
    return { allowed: true, category: "", reason: "moderation-unavailable" };
  }
}

// The Character Bible: a film-grade casting + costume + performance sheet, expanded
// by Claude from a light brief. Drives casting, the photoshoot, voice and scripts.
export type CharacterBible = {
  identity: { profession: string; age: string; height: string; build: string; ethnicity_design: string; bio: string };
  face: { structure: string; skin: string; eyes: string; hair: string; distinct_features: string };
  psychology: { core_traits: string[]; internal_conflict: string; behaviour_patterns: string[]; emotional_baseline: string };
  performance: { body_language: string; movement_rhythm: string; idle_behaviour: string };
  wardrobe: { garments: { item: string; fabric: string; detail: string }[]; footwear: string; accessories: string[]; props: string[] };
  palette: { skin_tones: string[]; hair_eyes: string[]; wardrobe_colours: string[] };
  portrait: { environment: string; lighting: string; colour_tone: string; expression: string; camera: string };
  voice_descriptor: string;
  signature_line: string;
};

const BIBLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    identity: {
      type: "object", additionalProperties: false,
      properties: {
        profession: { type: "string" }, age: { type: "string" }, height: { type: "string" },
        build: { type: "string" }, ethnicity_design: { type: "string" }, bio: { type: "string" },
      },
      required: ["profession", "age", "height", "build", "ethnicity_design", "bio"],
    },
    face: {
      type: "object", additionalProperties: false,
      properties: { structure: { type: "string" }, skin: { type: "string" }, eyes: { type: "string" }, hair: { type: "string" }, distinct_features: { type: "string" } },
      required: ["structure", "skin", "eyes", "hair", "distinct_features"],
    },
    psychology: {
      type: "object", additionalProperties: false,
      properties: {
        core_traits: { type: "array", items: { type: "string" } },
        internal_conflict: { type: "string" },
        behaviour_patterns: { type: "array", items: { type: "string" } },
        emotional_baseline: { type: "string" },
      },
      required: ["core_traits", "internal_conflict", "behaviour_patterns", "emotional_baseline"],
    },
    performance: {
      type: "object", additionalProperties: false,
      properties: { body_language: { type: "string" }, movement_rhythm: { type: "string" }, idle_behaviour: { type: "string" } },
      required: ["body_language", "movement_rhythm", "idle_behaviour"],
    },
    wardrobe: {
      type: "object", additionalProperties: false,
      properties: {
        garments: { type: "array", items: { type: "object", additionalProperties: false, properties: { item: { type: "string" }, fabric: { type: "string" }, detail: { type: "string" } }, required: ["item", "fabric", "detail"] } },
        footwear: { type: "string" }, accessories: { type: "array", items: { type: "string" } }, props: { type: "array", items: { type: "string" } },
      },
      required: ["garments", "footwear", "accessories", "props"],
    },
    palette: {
      type: "object", additionalProperties: false,
      properties: { skin_tones: { type: "array", items: { type: "string" } }, hair_eyes: { type: "array", items: { type: "string" } }, wardrobe_colours: { type: "array", items: { type: "string" } } },
      required: ["skin_tones", "hair_eyes", "wardrobe_colours"],
    },
    portrait: {
      type: "object", additionalProperties: false,
      properties: { environment: { type: "string" }, lighting: { type: "string" }, colour_tone: { type: "string" }, expression: { type: "string" }, camera: { type: "string" } },
      required: ["environment", "lighting", "colour_tone", "expression", "camera"],
    },
    voice_descriptor: { type: "string" },
    signature_line: { type: "string" },
  },
  required: ["identity", "face", "psychology", "performance", "wardrobe", "palette", "portrait", "voice_descriptor", "signature_line"],
};

const SYSTEM = `You are an elite film casting director and character designer building a production-grade character bible for an AI influencer who must read as a real, believable human on camera (never an AI render).

From a short brief, design a fully realised person. Be specific, art-directed and intentional, never generic. Ground every detail in believable reality: real skin with pores and subtle asymmetry, natural imperfections, lived-in wardrobe with real fabrics and wear, micro-expressions caught mid-moment rather than posed.

Rules:
- UK British English spelling throughout (humaniser, colour, realise, neutralise).
- No em dashes. Use commas, full stops or brackets.
- The character has ONE clear, consistent gender (as specified in the brief). Never ambiguous or blended; write the bio, build and wardrobe to match it unmistakably. Use ONLY that gender's pronouns throughout every field (she/her for a woman, he/him for a man); NEVER use the opposite gender's pronouns anywhere.
- core_traits: 3 to 5 dominant traits. behaviour_patterns: 3 telling habits.
- palette entries: short descriptors or hex values (e.g. "warm sienna #B5651D").
- signature_line: one short, in-character spoken line (their voice).
- Keep each field tight and vivid (one or two sentences), production-ready.

Humanising (critical for believability):
- Give this person a SMALL, UNIQUE set of natural imperfections that make them read as a real human, never an AI render. Bias toward the SUBTLE, skin-level tells that don't dominate a face: fine freckles, faint sun pigmentation, slightly uneven skin tone, a soft rosacea flush, fine lines, a faint old scar, uneven brows, a cowlick, light stubble shadow.
- MOLES/BEAUTY MARKS: DEFAULT TO NONE. Do not give this person moles or beauty marks unless it is genuinely characterful, and even then it reads odd in generation, so almost always choose freckles, faint pigmentation or skin texture INSTEAD. NEVER prominent, dark, raised, or multiple moles, NEVER a mole on the nose, lip, cheek-centre or forehead, and NEVER any mole/mark on the chest, neck or décolletage. If you mention skin marks at all, keep them to faint freckles or a barely-perceptible detail only.
- Choose imperfections that suit THIS person's age, ethnicity and lifestyle, distinctive to them. No two characters share the same tells. Do NOT default to "a gap between the front teeth."
- Keep imperfections SUBTLE, SPARING and believable, never caricatured. ONE understated tell is usually plenty. face.distinct_features should be brief and barely-there - it must never read as an odd or distracting mark.

Wardrobe (mandatory): always specify a COMPLETE outfit including BOTTOMS (trousers, jeans, a skirt or tailored shorts) and footwear. Never leave the lower body unspecified. Everything is tasteful and brand-safe, the subject is always fully clothed.

Look / finish (adapt to the requested look):
- "natural" look: minimal or no makeup, understated grooming, bare believable skin. Keep imperfections present but very subtle.
- "photoshoot" look: professionally styled hair and, for women, tasteful natural makeup; clean, well-prepped, camera-ready skin so visible blemishes are minimal and softened. Still photoreal, never plastic.`;

// Expand a brief into a full Character Bible.
export async function generateBible(name: string, brief: string, gender?: string, look?: string, twin = false, referenceImageUrls: string[] = []): Promise<CharacterBible> {
  const c = await client();
  const refUrls = referenceImageUrls.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 4);
  const hasRefs = refUrls.length > 0;
  // PHOTO-LED when reference images are supplied (a twin, or a new influencer seeded from a photo):
  // the appearance must be READ from the image, never invented. Falls back to invention with no photo.
  const genderLine = gender ? `Gender: ${gender} (design unmistakably as a ${gender}; use only ${gender === "female" ? "she/her" : gender === "male" ? "he/him" : "their"} pronouns throughout, never the opposite).\n` : "";
  const lookLine = look ? `Look: ${look} look (adapt makeup, grooming and skin finish accordingly).\n` : "";
  const refLine = hasRefs
    ? `REFERENCE PHOTO(S) ATTACHED - these images ARE this person. Derive EVERY physical trait from what you actually SEE: face shape and bone structure, real skin tone and complexion (describe the actual colouring you observe, do not guess a heritage), eye colour, hair, apparent age, and body build/proportions. Describe ONLY what is visible. Do NOT invent, change, embellish or add any physical feature, mark or colouring that is not in the photo. ${twin ? "This is a digital twin of a real person - " : ""}keep face.distinct_features to ONLY marks clearly visible in the photo (else leave it generic/empty). The brief drives their PERSONALITY, story, wardrobe and voice - never their physical appearance.\n`
    : (twin ? "THIS IS A DIGITAL TWIN OF A REAL PERSON. Do NOT invent any moles, freckles, scars, birthmarks or distinctive marks; keep face.distinct_features empty or generic and face.skin generic.\n" : "");
  const imperfectionAsk = hasRefs || twin
    ? "The photo is the source of truth for their appearance - match it exactly and keep invented physical marks out."
    : "Give them a fresh, distinctive set of subtle humanising imperfections unique to this person.";
  const textPart = `Influencer name: ${name}\n${genderLine}${lookLine}${refLine}\nBrief:\n${brief}\n\nDesign the complete character bible. ${imperfectionAsk}\n\nWrite vivid but ECONOMICAL: every prose field 1 to 3 tight sentences (no flowery essays), every array 3 to 5 items. Production-useful detail, not padding. This keeps the casting fast and the bible sharp.`;
  const content: Anthropic.ContentBlockParam[] = hasRefs
    ? [...refUrls.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })), { type: "text" as const, text: textPart }]
    : [{ type: "text" as const, text: textPart }];
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 5000,
    system: SYSTEM,
    tools: [{ name: "character_bible", description: "Return the complete character bible for this influencer.", input_schema: BIBLE_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "character_bible" },
    messages: [{ role: "user", content }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No character bible returned");
  return block.input as CharacterBible;
}

// A short, baity marketing hook for the influencer showcase (rent-me-later catalogue).
export async function generateTagline(name: string, bible: Record<string, unknown>): Promise<string> {
  const c = await client();
  const res = await c.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 120,
    system:
      "You write a single short, baity marketing hook for an AI influencer a brand could hire. " +
      "12 to 20 words, third person, vivid and intriguing, selling their vibe, niche and the audience they'd win. " +
      "UK spelling, no em dashes, no surrounding quotes, no hashtags. Return ONLY the hook line.",
    messages: [{ role: "user", content: `Influencer: ${name}\nCharacter (JSON): ${JSON.stringify(bible).slice(0, 2500)}\n\nWrite the hook.` }],
  });
  const block = res.content.find((b) => b.type === "text");
  const t = block && block.type === "text" ? block.text.trim().replace(/^["'\s]+|["'\s]+$/g, "") : "";
  return t.slice(0, 160);
}

// Vision QA gate: inspect a generated creative and FAIL it if it breaks the rules.
// Uses Haiku (fast + cheap), this runs on every image before the user sees it.
const QA_MODEL = "claude-haiku-4-5";
const QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean", description: "true ONLY if every check below is true" },
    score_10: { type: "number", description: "Overall quality score from 0 to 10 (one decimal place). 10 means publication-ready, 0 means unusable." },
    fully_clothed: { type: "boolean", description: "EVERY person in the frame (the subject AND every background person) wears a complete outfit: a top covering the torso AND bottoms (trousers, jeans, skirt or tailored shorts). false if ANYONE, including someone in the background, is shirtless, topless, bare-chested, bare-legged with no visible bottoms, in underwear, in swimwear or nude" },
    single_frame: { type: "boolean", description: "ONE continuous photograph of a single moment. false if there is ANY collage, grid, split-screen, diptych/triptych, stacked panels, OR a separate side strip / inset / border panel showing a different scene or different people (even a thin vertical or horizontal band down one edge)" },
    realistic_proportions: { type: "boolean", description: "natural human body and head-to-body proportions AND correct real-world scale + perspective relative to the setting: the subject's size and distance are believable against doorways, furniture, vehicles, architecture and other people, feet/seat make natural ground contact, one consistent camera perspective. false if the subject is distorted, oversized, undersized, floating, pasted-on, or mis-scaled versus the background/background people" },
    coherent_photo: { type: "boolean", description: "a real, coherent photograph (not blank, corrupt, warped or garbled)" },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["pass", "score_10", "fully_clothed", "single_frame", "realistic_proportions", "coherent_photo", "issues"],
} as unknown as Anthropic.Tool["input_schema"];

const QA_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function qaCreative(url: string): Promise<{ pass: boolean; score10: number; issues: string[] }> {
  // Fetch + inspect as base64 (works on any SDK version; also validates the image loads).
  let b64: string, mt: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) }); // timeout so a hung fetch can't stall the job
    if (!res.ok) return { pass: false, score10: 0, issues: ["image did not load"] }; // broken → reject
    mt = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!QA_MEDIA.has(mt)) mt = "image/jpeg";
    b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return { pass: false, score10: 0, issues: ["image fetch failed"] }; // broken → reject
  }
  try {
    const c = await client();
    const res = await c.messages.create({
      model: QA_MODEL,
      max_tokens: 400,
      tools: [{ name: "qa", description: "Report the QA verdict for this creative image.", input_schema: QA_SCHEMA }],
      tool_choice: { type: "tool", name: "qa" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "You are QA for social-media creatives of an AI influencer. Judge this image strictly. pass must be true ONLY if: fully_clothed (EVERY person in frame, the subject AND anyone in the background, has a top covering the torso AND bottoms; FAIL if ANYONE is shirtless/topless/bare-legged/underwear/swimwear/nude, including background people), single_frame (ONE continuous photo, FAIL any collage/grid/split/stacked panels OR a side strip/inset/border band showing a different scene), realistic_proportions (natural body + believable scale vs background), and coherent_photo. Look carefully at the background figures for missing bottoms. List concrete issues." },
          { type: "image", source: { type: "base64", media_type: mt as "image/jpeg", data: b64 } },
        ],
      }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    const out = block && block.type === "tool_use" ? (block.input as { pass?: boolean; score_10?: number; issues?: string[] }) : null;
    const raw = Number(out?.score_10);
    const score10 = Number.isFinite(raw) ? Math.max(0, Math.min(10, Math.round(raw * 10) / 10)) : 0;
    return { pass: !!out?.pass, score10, issues: out?.issues ?? [] };
  } catch {
    // QA service itself errored (not the image), fail OPEN so a hiccup can't empty the gallery.
    return { pass: true, score10: 7, issues: ["qa-unavailable"] };
  }
}

// WARDROBE EXTRACTION: describe ONLY the outfit of the main person in a guide creative, head to toe, as a
// concise sentence. Used to LOCK the influencer's clothing as consistent TEXT across every scene (the image
// anchor alone drifts when a scene's anchor frame is a tight head-shot that hides the bottoms/shoes).
export async function describeOutfit(url: string): Promise<string> {
  if (!isSafePublicUrl(url)) return ""; // SSRF: never fetch a private/internal/metadata URL
  let b64: string, mt: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return "";
    mt = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!QA_MEDIA.has(mt)) mt = "image/jpeg";
    b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch { return ""; }
  try {
    const c = await client();
    const res = await c.messages.create({
      model: QA_MODEL,
      max_tokens: 150,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe ONLY the OUTFIT of the main foreground adult in this image, head to toe, in ONE concise sentence (about 25-35 words): the top, the bottoms (trousers/skirt/dress), the footwear, their colours and fabric, and any worn accessories (glasses, watch, jewellery, bag, scarf). Name each COLOUR PRECISELY and do not confuse similar tones - navy blue is NOT grey, beige/cream is NOT white, olive is NOT grey; look carefully and state the exact colour you actually see for the top, the bottoms and the footwear separately. If the bottoms or footwear are not visible in the image, say 'bottoms not visible' rather than guessing. Do NOT mention the person's face, hair, body, age, pose, or the background. Reply with just the outfit description, no preamble." },
          { type: "image", source: { type: "base64", media_type: mt as "image/jpeg", data: b64 } },
        ],
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim().replace(/\s+/g, " ").slice(0, 320) : "";
  } catch { return ""; }
}

// IDENTITY-MATCH QA: is the person in `frameUrl` the SAME individual as the `refUrl` anchor? Used to
// drop drifted photoshoot frames (a wide/full-body shot sometimes renders a different model). Fails
// OPEN (returns true) on any error so a QA hiccup can never empty the set.
const QA_MEDIA2 = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export async function matchesIdentity(frameUrl: string, refUrl: string): Promise<boolean> {
  if (!isSafePublicUrl(frameUrl) || !isSafePublicUrl(refUrl)) return true; // SSRF: don't fetch internal URLs (fail open, as this QA does on any error)
  const grab = async (u: string): Promise<{ mt: "image/jpeg"; data: string } | null> => {
    try {
      if (!isSafePublicUrl(u)) return null;
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); // timeout: a hung image fetch must NOT stall the photoshoot
      if (!r.ok) return null;
      let mt = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
      if (!QA_MEDIA2.has(mt)) mt = "image/jpeg";
      return { mt: mt as "image/jpeg", data: Buffer.from(await r.arrayBuffer()).toString("base64") };
    } catch { return null; }
  };
  try {
    const [ref, frame] = await Promise.all([grab(refUrl), grab(frameUrl)]);
    if (!ref || !frame) return true; // can't verify → don't reject
    const c = await client();
    const res = await c.messages.create({
      model: QA_MODEL,
      max_tokens: 80,
      tools: [{ name: "verdict", description: "Identity-match verdict.", input_schema: { type: "object" as const, properties: { same_person: { type: "boolean" } }, required: ["same_person"] } }],
      tool_choice: { type: "tool", name: "verdict" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Image 1 is the REFERENCE person. Image 2 is a generated photo. Is the person in Image 2 unmistakably the SAME individual as the reference - same face, bone structure, ethnicity/skin tone, hair and distinctive features? Ignore pose, outfit, camera distance, lighting and expression. If it's clearly a different person (or a different ethnicity/face), answer false. Reply via the tool." },
          { type: "image", source: { type: "base64", media_type: ref.mt, data: ref.data } },
          { type: "image", source: { type: "base64", media_type: frame.mt, data: frame.data } },
        ],
      }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    const out = block && block.type === "tool_use" ? (block.input as { same_person?: boolean }) : null;
    return out?.same_person !== false; // default true (fail open)
  } catch { return true; }
}

// Polish a producer's rough idea into a single vivid, art-directed image prompt for a
// social creative of this influencer. Always clothed; diverse, in-focus backgrounds.
export async function refineCreativePrompt(name: string, bible: Record<string, unknown>, scene: string): Promise<string> {
  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 500,
    system:
      "You are a creative director shaping a producer's rough idea into ONE clean, model-followable image brief for a " +
      "photoreal social-media shot of an existing AI influencer whose FACE and identity are already locked by a trained model. " +
      "RULES:\n" +
      "- The producer's idea is the brief. Expand and structure it, never replace its intent. Keep their specifics (outfit, location, props, mood).\n" +
      "- Order it: subject + action, then wardrobe, then setting/background (and any people in it), then framing/shot, then light + mood.\n" +
      "- Keep it tight: 3 to 5 sentences. A wall of forensic detail makes the model follow LESS, not more, so distil to what matters.\n" +
      "- Do NOT describe her facial features, skin marks, hair type or likeness. Her face comes from the trained identity, not the words; dictating it only causes drift. Refer to her simply as the influencer / the same person.\n" +
      "- Resolve any contradictions in the idea (for example a described pose that fights a described gaze).\n" +
      "- The subject is ALWAYS fully clothed with a complete outfit including bottoms. Any background people are a believable, natural, diverse multi-ethnic mix and stay in sharp focus; backgrounds are never blurred.\n" +
      "- UK spelling, no em dashes. Return ONLY the brief text, no preamble.",
    messages: [{ role: "user", content: `Influencer: ${name}\n\nProducer's rough idea:\n${scene || "an on-brand lifestyle shot for this influencer"}\n\nWrite the polished brief.` }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : scene;
}

// Reimagine ONE section of an existing bible, kept consistent with the rest.
export async function generateBibleSection(
  name: string, brief: string, bible: Record<string, unknown>, section: string,
): Promise<unknown> {
  const sub = (BIBLE_SCHEMA.properties as Record<string, unknown>)[section] as { type?: string } | undefined;
  if (!sub) throw new Error(`Unknown section: ${section}`);
  const isString = sub.type === "string";
  // Tool input must be an object; wrap scalar sections in { value }.
  const schema = isString
    ? { type: "object", additionalProperties: false, properties: { value: sub }, required: ["value"] }
    : sub;

  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: SYSTEM,
    tools: [{ name: "section", description: `Return ONLY the "${section}" section of the character bible.`, input_schema: schema as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "section" },
    messages: [{
      role: "user",
      content: `Influencer: ${name}\n\nBrief:\n${brief || "(no brief provided)"}\n\nHere is the current character bible as JSON. Reimagine ONLY the "${section}" section with a fresh, distinct take, while keeping it fully consistent with the rest of this character. Return just that section.\n\n${JSON.stringify(bible).slice(0, 6000)}`,
    }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No section returned");
  return isString ? (block.input as { value: unknown }).value : block.input;
}

// Daily "Higgsfield expert" research. Uses Claude with live web search to pull the
// latest Higgsfield features, Soul training and prompt best practices, and AI-influencer
// trends, then turns them into concrete ideas to implement in Influencers on GAS.
// Returns a clean HTML fragment (list of ideas) for the daily email.
function tipsSystem(today: string): string {
  return `You are the in-house Higgsfield and AI-influencer expert for "Influencers on GAS", an agency platform that builds consistent AI influencers and their social creatives. Today is ${today}.

${PLATFORM_STATE}

YOU MUST BE BUILD-AWARE. Before suggesting anything, check it against the CURRENT BUILD above. Do NOT propose anything we have already implemented (e.g. connecting the Higgsfield MCP, or a two-stage prompt writer) or anything we deliberately rejected (e.g. going back to Higgsfield Soul / soul_id for image identity). If a "best practice" you find conflicts with a decision we already made, either skip it or note explicitly why it still might be worth revisiting, do not naively recommend it.

Research the LATEST Higgsfield updates and AI-influencer best practices (new or updated models, prompt craft, consistency tricks, upscaling, cost and speed), prioritising the last few weeks. Use web search and rely on what you can actually verify.

STRICT BAR: only surface an idea if it (a) FITS our actual build, (b) is NOT already done or deliberately rejected, and (c) would either FUNDAMENTALLY optimise what we have built (a real step change in identity consistency, realism, quality or speed) OR materially improve COST CONTROL without compromising quality. Quality over quantity: 0 to 3 ideas is ideal. It is completely fine to return nothing.

If nothing today genuinely clears that bar, output EXACTLY this token and nothing else: NO_SIGNIFICANT_FINDINGS

Otherwise, for each qualifying idea output EXACTLY this block (and nothing else):
<h3 style="margin:16px 0 4px;font-size:15px;color:#e6e8eb;">[short punchy title]</h3>
<p style="margin:0 0 6px;color:#b8bcc4;font-size:13px;line-height:1.5;">[what it is and why it is a step change for OUR build specifically, 1 to 2 sentences]</p>
<p style="margin:0 0 2px;color:#8a8f98;font-size:12px;"><b style="color:#c79bff;">Implement:</b> [a specific, practical step for our actual stack]</p>
<p style="margin:0 0 2px;color:#6b7280;font-size:11px;"><b>Source:</b> [the source publication or site] · [the publication date you found, or "date unverified"] · [the full https URL as plain text]</p>

Source rules: every idea MUST carry a real source line. Prefer sources from the last few months and state their date. If you cannot verify a date or a source, say "date unverified" and do not dress it up as fresh. Never invent a URL.

Style: UK British spelling. NO em dashes (use commas or full stops). Output only the HTML blocks above (or the NO_SIGNIFICANT_FINDINGS token), no preamble, no closing remarks, no markdown fences.`;
}

export async function researchHiggsfieldTips(today: string): Promise<string> {
  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 2800,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as unknown as Anthropic.Tool],
    system: tipsSystem(today),
    messages: [{ role: "user", content: "Research today's best Higgsfield and AI-influencer practices and give me concrete, build-aware, dated and sourced ideas to implement in Influencers on GAS. Skip anything we already do or rejected." }],
  });
  const html = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  return html || "NO_SIGNIFICANT_FINDINGS";
}

// TWO-STAGE prompt writer (archive's core quality engine). Claude expands the producer's
// brief into a rich, art-directed SCENE paragraph using the influencer's bible. The face
// comes from a reference image (@image1), so this never describes facial features. The
// caller wraps the returned paragraph in the structured iPhone-realism prompt + identity
// lock + constraints. Returns null on failure (caller falls back to the raw brief).
export async function composeCreativeScene(opts: { bible: Record<string, unknown>; scene: string; cinematic: boolean; extras: boolean; gender?: string; role?: "a-roll" | "b-roll" }): Promise<string | null> {
  try {
    const c = await client();
    const id = (opts.bible?.identity ?? {}) as Record<string, string>;
    const wardrobe = (opts.bible?.wardrobe ?? {}) as Record<string, unknown>;
    const homeSetting = String((opts.bible?.scene as Record<string, string>)?.environment || "").slice(0, 160);
    const persona = [id.age, id.profession, id.ethnicity_design].filter(Boolean).join(", ") + (Object.keys(wardrobe).length ? `; signature wardrobe: ${JSON.stringify(wardrobe).slice(0, 300)}` : "");
    const gw = (opts.gender || "").toLowerCase();
    const pronouns = gw === "female" || gw === "woman" ? "she/her (a woman)" : gw === "male" || gw === "man" ? "he/him (a man)" : "they/them";
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        `You are a creative director writing the SCENE for ONE photoreal social-media image of an existing AI influencer. The face and identity come from a separate reference image, so NEVER describe facial features, skin marks, eye colour or hair. The influencer's pronouns are ${pronouns}, use ONLY these pronouns and NEVER the opposite gender's. ` +
        "Expand the producer's brief into a single vivid paragraph covering: the setting and time of day, the wardrobe (specific garments, fabric, colour, how worn), the pose and action, the mood, and the natural lighting. Keep the producer's specifics; fill gaps tastefully from the persona. " +
        (opts.cinematic ? "Cinematic film mood. " : "A natural, candid, everyday iPhone-snapshot mood, not a posed studio shoot. ") +
        (opts.extras ? "Include just a FEW background people (about two to five, not a packed crowd), placed naturally for this specific setting the way real people use it (seated at different tables, queuing loosely, walking past) and never in a tidy row or line. Each is clearly distinct, a different age, build and a DIFFERENT outfit in different colours, doing a different natural thing, never duplicated or dressed alike. The mix is balanced and natural: roughly 55% white, 25% black, 12% coloured and 8% indian, an even 50/50 men and women, all in sharp focus. Any couples or pairs are SAME-RACE (white with white, black with black, etc.), never mixed-race couples. " : "Do NOT add any random background crowd or strangers. BUT if the producer's brief explicitly names other people (friends, family, a partner, colleagues), INCLUDE exactly those named people as a real part of the scene, described and present - they are the cast, not extras. If the brief names no other people, the influencer is alone. ") +
        `Be LOCATION-AWARE: if the brief names a place or city, depict THAT place authentically (its real streets, signage, landmarks and transport are welcome and encouraged). If the brief names no place, set it in the influencer's established setting${homeSetting ? ` (${homeSetting})` : ""} or another believable setting that genuinely fits them, and do NOT invent or default to a random recognisable foreign city (no unprompted London, Paris or New York tells). ` +
        "Specify complete, tasteful outfits with bottoms and footwear, but do NOT write any disclaimer that people are clothed or dressed. " +
        (opts.role === "b-roll"
          ? "This is a CANDID B-ROLL lifestyle moment: the influencer (and anyone the brief names) are naturally absorbed in the activity - chatting, using a phone, laughing, doing something real - NOT posing for or looking into the camera. Relaxed, lived-in, observed-not-staged energy. "
          : "The influencer is front-on to the camera, looking straight into the lens with the head level (never looking up, never gazing at the sky or away from camera), a warm talking-to-camera presenter moment. ") +
        "Keep poses fresh and natural with hands relaxed; do NOT use the clichéd pose of a hand raised to shield or shade the eyes from the sun, and never describe squinting into the sun. Under 120 words. UK spelling, no em dashes. Output ONLY the paragraph, no preamble.",
      messages: [{ role: "user", content: `Influencer persona: ${persona || "not specified"}\n\nProducer brief: ${opts.scene}\n\nWrite the scene paragraph.` }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    return text || null;
  } catch {
    return null;
  }
}

// Map raw Anthropic SDK errors to a clear, user-facing message. The most common one in
// practice is an empty account balance, which reads as a cryptic 400 otherwise.
export function friendlyAnthropicError(e: unknown): string {
  const m = String((e as Error)?.message || e || "").toLowerCase();
  if (m.includes("credit") || m.includes("billing") || m.includes("insufficient") || m.includes("balance"))
    return "The AI co-pilot (Anthropic) is out of credits. Top up the Anthropic account for this key, then try again.";
  if (m.includes("rate") && m.includes("limit")) return "The AI co-pilot is rate-limited right now. Wait a moment and try again.";
  if (m.includes("not connected") || m.includes("api key") || m.includes("authentication")) return "The AI co-pilot (Anthropic) is not connected. Check ANTHROPIC_API_KEY.";
  return String((e as Error)?.message || e).slice(0, 200);
}

// Voice-direct a line for ElevenLabs v3 TTS: insert audio tags + emphasis so the read sounds
// like a real, believable human influencer (not flat TTS). Keeps the original words/meaning.
export async function expressifyScript(line: string, voiceDescriptor = "", tone = "natural and warm", accent = ""): Promise<string> {
  try {
    const c = await client();
    const accentRule = accent
      ? `Accent: deliver in a ${accent} accent. Begin the line with an accent cue tag like [${accent} accent], and lightly reflect that accent's natural rhythm and word choices WITHOUT changing the words. `
      : "";
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 600,
      system:
        "You are a voice director preparing a line for ElevenLabs v3 text-to-speech so it sounds like a REAL person talking to camera, expressive, natural and believable, never flat or robotic. " +
        "Insert ElevenLabs audio tags in square brackets SPARINGLY and only where they genuinely lift the delivery: [warm], [excited], [thoughtful pause], [laughs softly], [chuckles], [sighs], [whispers], [reassuring]. " +
        "Use natural punctuation and ellipses for real pauses and breaths, and CAPITALISE one or two key words per sentence for emphasis. Do NOT change, add or remove the actual words, only add tags, pauses and emphasis. Keep it conversational and human. " +
        accentRule +
        `Voice / persona: ${voiceDescriptor || "a natural, relatable influencer"}. Desired tone: ${tone}. ` +
        "Output ONLY the directed line, no preamble, no quotes.",
      messages: [{ role: "user", content: line }],
    });
    const out = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return out || line;
  } catch {
    return line; // fail open: a flat read beats no read
  }
}

// Voice designer: turn a casual description ("South African white female, 20s, slight Afrikaans
// twang, mild lisp") into a rich ElevenLabs Voice Design prompt + a natural 100+ char sample
// line. Returns { voice_description, sample_text }. Best-practice: cover age, gender, accent,
// timbre, pacing, character and audio quality.
export async function designVoiceBrief(description: string): Promise<{ voice_description: string; sample_text: string }> {
  const fallback = { voice_description: description, sample_text: "Hey, so I just had to share this with you, honestly it has completely changed how I think about my day to day routine." };
  try {
    const c = await client();
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 500,
      system:
        "You are an expert ElevenLabs Voice Design prompt engineer. Turn the user's casual voice description into the most effective Voice Design prompt for a REAL, believable human voice. " +
        "A great voice_description (40 to 250 words) explicitly covers: age range, gender, accent/region (be specific, e.g. 'South African accent with a soft Afrikaans inflection'), timbre and pitch, pacing and rhythm, emotional default, any distinctive quirk (e.g. a mild lisp), and recording quality ('clean, close-mic, studio quality, no background noise'). Faithfully include EVERY trait the user gave. " +
        "Also write a natural, conversational sample_text of 120 to 250 characters that shows the voice off (casual, first person, like an influencer talking to camera). " +
        'Return ONLY strict JSON: {"voice_description": "...", "sample_text": "..."}',
      messages: [{ role: "user", content: description }],
    });
    const txt = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const parsed = JSON.parse(m[0]) as { voice_description?: string; sample_text?: string };
    return {
      voice_description: parsed.voice_description?.trim() || description,
      sample_text: (parsed.sample_text?.trim() && parsed.sample_text.trim().length >= 100) ? parsed.sample_text.trim() : fallback.sample_text,
    };
  } catch {
    return fallback;
  }
}

// ── THE PRODUCER: brief → directed storyboard (MTN-MoMo house style) ────────
export type StoryScene = {
  beat: string; role: "a-roll" | "b-roll" | "graphic";
  start: string; end: string; location: string; talent: string[];
  shot: string; blocking: string; performance: string; graphics: string[];
  vo_line: string; caption: string; motion_prompt: string; music_sfx: string; transition: string;
  crowd_extras: boolean;
};
export type SupportingCast = { name: string; look: string };
export type Storyboard = {
  title: string; format: string; duration_seconds: number; tone: string;
  music_bed: string; full_vo: string; legal: string; scenes: StoryScene[];
  supporting_cast: SupportingCast[]; colour_grade: string;
};

const STORYBOARD_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string" }, format: { type: "string" }, duration_seconds: { type: "number" },
    tone: { type: "string" }, music_bed: { type: "string", description: "how the music behaves across the film" },
    colour_grade: { type: "string", description: "ONE locked colour grade / 'look' for the WHOLE film in a short phrase - palette, warmth, contrast and film character (e.g. 'warm golden natural light, soft filmic contrast, gently lifted shadows, true skin tones'). Every scene shares this exact grade so the cut reads as one graded piece." },
    full_vo: { type: "string", description: "the entire continuous voiceover as one block" },
    legal: { type: "string", description: "the mandatory legal line, verbatim, or empty" },
    scenes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          beat: { type: "string", description: "Hook, Offer, Benefits, CTA graphic, Montage, End card, etc." },
          role: { type: "string", enum: ["a-roll", "b-roll", "graphic"], description: "a-roll = presenter talks DIRECT to camera (lip-synced, head-on); b-roll = a video SCENE/cutaway - she is in-situ doing something and does NOT talk to or look at the camera (the voiceover narrates OVER it); graphic = branded card" },
          start: { type: "string" }, end: { type: "string" },
          location: { type: "string" },
          talent: { type: "array", items: { type: "string" } },
          shot: { type: "string", description: "ONE single framing/angle in one line, directed like a DoP: shot size, camera angle (eye-level or a touch above), lens feel (~35/50/85mm), the KEY LIGHT's direction + mood (e.g. 'soft window light from frame left, warm'), and a composition note (rule of thirds, foreground depth). Describe ONLY ONE shot - never list or combine multiple framings (no 'close-up of hands AND a wider shot', no 'over-the-shoulder and coffee-table shots'); that causes split-screen renders. For b-roll keep her a clearly visible, prominent subject (medium shot), not a tiny distant figure." },
          blocking: { type: "string" },
          performance: { type: "string" },
          graphics: { type: "array", items: { type: "string" } },
          vo_line: { type: "string", description: "the spoken line for this scene - REQUIRED for EVERY scene, never empty. The continuous voiceover covers ALL scenes (a-roll AND b-roll) so the audio is never silent; each scene carries a contiguous chunk of full_vo, sized to roughly match its on-screen seconds." },
          caption: { type: "string", description: "burned-in caption, matches vo_line, clean natural punctuation (commas/full stops) - NEVER use pipe/bar '|' separators" },
          motion_prompt: { type: "string", description: "for b-roll/a-roll: short natural movement direction for the video engine" },
          music_sfx: { type: "string" },
          transition: { type: "string" },
          crowd_extras: { type: "boolean", description: "true ONLY if this specific scene is set in a naturally BUSY PUBLIC place (cafe, street, shop, gym, market, station) where background strangers genuinely belong. false for any private/intimate or CONTROLLED setting (home, kitchen, bedroom, car, office, garden, AND any studio, podcast studio, recording studio, film/photo set, boardroom, meeting room or private room) - there only the influencer and the named talent are present, no random extras. A studio or podcast room is a closed private space: NEVER put strangers in it. Default to false when unsure." },
        },
        required: ["beat", "role", "start", "end", "location", "talent", "shot", "blocking", "performance", "graphics", "vo_line", "caption", "motion_prompt", "music_sfx", "transition", "crowd_extras"],
      },
    },
    supporting_cast: {
      type: "array",
      description: "Every RECURRING non-influencer character who appears in more than one scene (a child, partner, friend, colleague), locked ONCE so they look identical in every scene. Empty if the influencer is always alone.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string", description: "how this character is referred to in scenes' talent (e.g. 'her daughter Mia', 'the barista', 'her friend Thabo') - must match the talent entries" },
          look: { type: "string", description: "the LOCKED appearance + wardrobe: age, ethnicity, build, hairstyle, face notes, AND one specific everyday outfit (garments + colours, full-length bottoms). This exact look is reused in every scene they appear in - never changing." },
        },
        required: ["name", "look"],
      },
    },
  },
  required: ["title", "format", "duration_seconds", "tone", "music_bed", "full_vo", "legal", "scenes", "supporting_cast", "colour_grade"],
};

const PRODUCER_SYSTEM =
`You are an elite short-form video creative director. Produce a DIRECTED STORYBOARD for a vertical social ad in this exact house style (proven on real campaigns):

STRUCTURE - the proven high-converting short-form arc. Weight the beats by % of runtime (this exact split, for 60s, is the gold standard - scale it for other durations):
• HOOK ~7% (a-roll) - the ruthless first 3-4s: a pattern interrupt that stops the scroll and NAMES the product/benefit. The first 3 seconds decide 60-80% of performance - land it instantly, sound-off readable via the caption.
• PROBLEM / DESIRE ~16% (b-roll) - the relatable pain or want, shown in-scene while the VO names it; earns the rest of the watch.
• SOLUTION / REVEAL ~27% (a-roll, then b-roll) - she reveals the product to camera, then a b-roll shows it in use.
• PROOF / BENEFITS / DEMO ~30% (b-roll demos alternated with quick a-roll reactions to camera) - the meat: show it working, concrete benefits, social-proof energy.
• SPOKEN CTA ~15% (a-roll) - one clear, specific action, delivered to camera. This is the FINAL scene.
The remaining ~5% is the uploaded CLOSING card (appended at assembly - do NOT write it as a scene).

REFERENCE TIMINGS for 60s (scale proportionally for 15/30/45s): Hook 0:00-0:04 · Problem 0:04-0:14 · Solution 0:14-0:30 · Proof 0:30-0:48 · CTA 0:48-0:57. The scenes' timecodes should sum to ~95% of the target (the CTA ends a few seconds before the end, leaving the tail for the appended close).

PACING - change shot (a new scene) every ~4-6s as a pattern interrupt, and land a micro-payoff (a useful or satisfying beat) every ~10-15s; momentum must never sag. an ODD number of short single-shot scenes so the shot types alternate cleanly and END on a-roll: 7 or 9 for 60s, 5 or 7 for 45s, 5 for 30s, 3 for 15s (more short scenes beat fewer long ones). For 30s and under, compress PROOF and fold PROBLEM into the hook. SHOT-TYPE RHYTHM (important - the cut must breathe and never look static): STRICTLY ALTERNATE the two shot types scene to scene - a-roll (she talks straight to camera), then b-roll (an in-situ scene/demo the VO narrates over), then a-roll, then b-roll, and so on. NEVER put two a-roll scenes back to back, and NEVER two b-roll scenes back to back (two talking-head shots in a row looks odd and flat). ALWAYS start on an a-roll (the hook) and ALWAYS end on an a-roll (the CTA), so the role sequence reads a-roll, b-roll, a-roll, b-roll, ..., a-roll. Keep the hook and CTA as a-roll; show the problem, proof and demo on the b-roll scenes, and pop back to a-roll between them.

NO GRAPHIC CARDS - NEVER use the 'graphic' role and never write a standalone CTA card, text slate or end card. Every scene must be a real filmed moment (a-roll or b-roll). The CTA and the offer are SPOKEN by the presenter and the burned-in captions - not a separate graphic frame. The closing beat is the presenter delivering the CTA in-scene, not a card.

GRAPHICS FIELD - leave 'graphics' EMPTY ([]) for every scene. NEVER list the brand logo, a "logo bug", captions or any overlay as a graphic: the logo/promo is overlaid automatically at assembly and captions are burned in there too, so writing them as a scene graphic risks them being rendered INTO the shot. Only ever use 'graphics' for a genuine in-world object, which is almost never needed.

VOICE - ONE continuous voiceover across the whole film (never back-and-forth dialogue). Second person, warm, confident, effortless, optimistic, benefit-led, short active sentences, no jargon. Open with a hook in the first ~5s that names the product. Put the full continuous read in full_vo, and each scene's portion in vo_line. The voiceover runs UNBROKEN over the entire film - she delivers it to camera on a-roll scenes, and it NARRATES OVER the b-roll scenes - so EVERY scene has a vo_line and the audio never goes silent (the cut flows a-roll talking → VO over b-roll → a-roll → and so on). LENGTH/PACING (critical for high-impact production): write a FULL, substantial read that fills the whole duration at a natural speaking pace (~2.5 words/second, so roughly 150 words for 60s, 110 for 45s, 75 for 30s, 38 for 15s) - each a-roll scene's vo_line covers its piece to camera AND the line keeps flowing to narrate across the b-roll that follows it, so there are NO long silent gaps. Distribute the read so every scene's vo_line roughly matches its on-screen seconds. COPY WEIGHTING + HARD LENGTH CAPS (important - get this balance right): put the DENSER, meatier copy on the A-ROLL (talking-to-camera) beats. The presenter is lip-synced and comfortably carries longer, information-rich lines, so a-roll is where the heavier explanation, benefits and detail live - an A-ROLL line may run UP TO ~15 SECONDS of speech (about 35-38 words). Keep the B-ROLL lines LIGHTER and MEASURED: one clear, single thought, MAX ~9.5 SECONDS of speech (about 24 words, ideally 6-9s) - NEVER longer than 9.5s and never copy-heavy. This hard cap matters: a scene shot renders on a 10-second video clip, so a b-roll line that takes longer than ~9.5s to say leaves the video frozen on its last frame while the voice keeps going (a visible pause) - keep it inside 9.5s so the motion covers the whole line. A scene shot needs room to breathe as a VISUAL, not a wall of narration read over it. If a stretch of narration is dense or would run longer than 9.5s, make it an A-ROLL beat (which takes up to 15s) or split it across beats - never overload a single b-roll past 9.5s. Set each scene's start/end timecodes to the line's natural spoken length. So the rhythm is: a-roll carries the copy (up to 15s), b-roll is a lighter narrated visual moment (9.5s max). The final scene carries the spoken CTA. NEVER write "Ts&Cs apply", "T&Cs apply", "terms and conditions apply" or any tacked-on disclaimer into full_vo, any vo_line or any caption - it is never spoken; any required legal text is handled separately, not in the read.

COMPLIANCE - write LEGITIMATE, honest brand advertising. Do NOT use deceptive, predatory or scam-sounding phrasing: no fake-prize/"you've won" framing, no false urgency or pressure ("act now or lose it", countdowns to a fake deadline), no guaranteed-riches or get-rich-quick claims, no impersonating a bank, government or authority, no requests for passwords/PINs/personal details, no "free money". Real promotions (e.g. "register and get free data", a discount, a genuine offer) are fine - state them plainly and truthfully as a real brand would. Synthetic voices are heavily moderated for fraud, so keep every line clearly trustworthy and non-manipulative.

WORLD + CONTINUITY (critical for a world-class feel) - set the ENTIRE ad in ONE coherent, specific location/world (e.g. a particular sunlit coffee shop), with the SAME wardrobe, lighting and look on the influencer across every scene, so scenes cut together as one seamless film, never disconnected shots. The presenter is physically PRESENT IN the scene doing something real (sitting at a table with a coffee, leaning at the counter, walking through the space), NEVER a floating head on a plain backdrop - and background strangers appear ONLY where the setting is a genuinely busy public place (see CAST DISCIPLINE), not forced into every shot. Every b-roll uses the SAME location/world as the a-roll (different angles, details and moments of that same place) so the film flows. State the shared world in each scene's location and keep wardrobe consistent in blocking.

CAST DISCIPLINE (critical - viewers instantly notice extra or shape-shifting people):
• WHO DOES WHAT (context awareness - read the story properly): assign each action to the RIGHT person. The influencer is the on-camera VOICE / narrator and emotional anchor, but she is NOT automatically the one who performs every action. If the ad is about someone ELSE doing something - e.g. a mother talking about how HER DAUGHTER went back to study - then the DAUGHTER is the student and the DAUGHTER studies on screen (laptop, books) in the b-roll, while the mother (the influencer) narrates and reacts with pride. Never collapse two people into one, and never hand another character's action to the influencer. "My daughter studied with X" means you SHOW the daughter studying with the mother's voice over it - NOT the mother studying. Get the protagonist of each beat right.
• SHOW THE PEOPLE THE BRIEF FEATURES (do not drop them): if the concept, setting, script or product story names or implies a companion who should be SEEN on screen (e.g. "with her daughter", "showing her daughter", a son, a partner, a customer, a friend), that person is a REAL on-screen character, not just a name in the voiceover. Define them in supporting_cast (locked look) AND put them in the talent + blocking of the relevant b-roll scenes - physically present and doing something WITH the influencer (studying together, sharing the moment, reacting, being shown the product). If the ad is ABOUT that person (a mother and her daughter), they appear across MOST of the b-roll, never zero scenes. Reducing a featured family member to a passing mention is a failure.
• Keep the cast TIGHT. Most ads need only the influencer, or the influencer plus ONE named person. Do NOT pad scenes with friends or a crowd unless the concept truly calls for it.
• Each scene's 'talent' lists EXACTLY who is in that scene - the influencer and any named companions, nobody else. If a scene is just her, talent contains only her.
• RECURRING CHARACTERS: any non-influencer appearing in more than one scene (a child, partner, friend, colleague) MUST be defined ONCE in 'supporting_cast' with a fully locked look (age, ethnicity, build, hair, face, and ONE specific outfit with colours, full-length bottoms). Refer to them by the SAME name in every scene's talent so they render as the SAME person in the SAME clothes throughout - never a different-looking or re-dressed double. If nobody recurs, supporting_cast is [].
• BACKGROUND STRANGERS are OPT-IN per scene via 'crowd_extras': true ONLY for a genuinely busy PUBLIC place (cafe, street, shop, gym, market) where strangers belong; false for any private/intimate or CONTROLLED setting (home, car, kitchen, bedroom, office, garden, AND any studio, podcast/recording studio, film/photo set, boardroom or meeting room) - just the named cast, no random bystanders. A studio or podcast room is a CLOSED private space - never put passers-by or a crowd in it. When unsure, choose false: a clean intimate scene beats a crowd of distracting AI extras.

ROLES (get this exactly right) - classify every scene as ONLY 'a-roll' or 'b-roll' (never 'graphic'). 'a-roll' = she speaks DIRECT TO CAMERA: head-on, tighter framing, looking into the lens and delivering her line (this is lip-synced). 'b-roll' = a VIDEO SCENE / cutaway: a medium-to-wider shot of her IN the location doing something real (walking through the space, sitting, using or showing the product, glancing around) - she does NOT look at or talk to the camera. The voiceover NARRATES OVER b-roll (her same continuous voice), so b-roll is never silent, but she is not addressing the lens and is NOT lip-synced. Use a-roll for the direct, human beats (hook, key message, CTA) and b-roll for the demo / proof / lifestyle beats. The film cuts between a-roll and b-roll under ONE unbroken voiceover. A-ROLL BACKGROUND (important): keep a-roll a CLEAN presenter framing - a simple, uncluttered background with shallow depth of field and NO background crowd or moving extras behind her. Friends, companions, background people and lifestyle action belong ONLY in b-roll scenes, never behind an a-roll talking shot (the talking-photo engine animates her, not a crowd, so background people in an a-roll shot come out warped). Motion_prompts: for a-roll, only her own natural movement; for b-roll, the scene action and that background people move. SOLO B-ROLL = SILENT ACTION (critical): on a b-roll where the presenter is ALONE (no named companion in that scene), she is NOT talking - she performs the activity quietly with a relaxed, closed mouth (typing, sipping, reading, glancing around), never appearing to speak, mouth words or move her lips as if talking to herself, because a person talking to no one on screen looks broken. Write her blocking AND motion_prompt as focused, wordless action (no "she says", no "talking", no "chatting"). ONLY when a named companion (a friend, colleague, partner or family member) is physically in the b-roll may there be natural talking/conversation between them - then write that spoken interaction into the blocking and motion_prompt. The continuous voiceover still narrates over EVERY b-roll either way; this rule is purely about what her mouth does on screen.

CINEMATOGRAPHY (this is what makes it world-class, not merely consistent - direct every scene like a director of photography):
• LIGHT WITH INTENT: give each scene a MOTIVATED, DIRECTIONAL light from a believable real source (a window, a practical lamp, a doorway, golden-hour sun) coming from one clear direction so it shapes her face and the room - never flat, frontal, on-camera or hard studio light. Match the light's MOOD to the beat: bright and airy for warm/upbeat moments, softer with deeper shadows for intimate ones.
• LENS + ANGLE per shot: pick a lens feel that serves the beat - a wider ~35mm to sit intimately in the room on b-roll, ~50mm for a natural look, a tighter ~85mm to compress and isolate for a hero close-up. Shoot at eye level or a touch (10-15°) ABOVE for a flattering angle; use a slight low angle only to lend authority.
• COMPOSE THE VERTICAL FRAME: rule of thirds with her eyes on the upper third; build FOREGROUND DEPTH (a shoulder, a plant, a prop, a soft out-of-focus edge) so the tall 9:16 frame reads three-dimensional; use real leading lines (a counter, a doorway, a table edge) to draw the eye to her.
• COVERAGE RHYTHM: vary shot SIZE across the arc - an establishing wider shot, mediums for connection, a tight insert on the product or a telling detail - never a run of same-size shots.
• COLOUR GRADE: decide ONE consistent look for the WHOLE film and put it in 'colour_grade' - a palette, warmth, contrast and film character that fits the tone and world (e.g. 'warm golden natural light, soft filmic contrast, gently lifted shadows, true skin tones'). EVERY scene is graded the same so the cut reads as one film, never eight mismatched shots.
Put these choices (light direction + mood, lens feel, angle, composition) into each scene's 'shot' line so they carry into the render.

WORLD AUTHENTICITY - SIGNATURE LIFE (this is what separates "a shot at a place" from "a real moment AT that place" - do not skip it): give every location its characteristic, SIGNATURE ACTION alive in the background at a believable distance - the very thing that place is famous for, actually HAPPENING, not a frozen backdrop. At a racecourse: HORSES RACING down the track in the distance behind her, jockeys in bright silks, the crowd reacting to the race. At a beach: waves breaking, a surfer, someone walking a dog. At a coffee shop: baristas pulling shots, steam, people at tables. On a city street: moving traffic and pedestrians. At a market: stalls, vendors, shoppers. At an airport: planes, departure boards, travellers with cases. WRITE this signature life explicitly into the scene's blocking AND its motion_prompt so it is rendered in the keyframe AND animated in the clip (e.g. "in the distance behind her, racehorses thunder down the home straight and the grandstand crowd rises"). Reach for SPECIFIC, named, true-to-venue detail - the real branding, colours and props of that place (e.g. the purple Hollywoodbets Durban July signage, jockey silks, betting slips) - over a generic "crowd". This signature MOVING life belongs to B-ROLL ONLY (which truly animates the whole scene). NEVER put moving or action elements on A-ROLL - NO racing horses, NO moving vehicles, NO crowd in motion, nothing that should be moving - because the talking-photo engine animates ONLY her, so any such element FREEZES mid-action and looks broken (stationary horses frozen on the track). A-roll's background is a soft, out-of-focus, STATIC suggestion of the venue only (e.g. a blurred grandstand), never a depicted action. Do not even write racing horses or moving crowds into an a-roll scene's blocking or motion. The goal: every frame reads like a real photograph a friend caught at that exact place, mid-life.

DEPTH & MISE-EN-SCENE (compose in THREE layers so the frame reads three-dimensional, never flat): stage every b-roll shot with a real FOREGROUND close to the lens (a shoulder, a railing, a plant, a race card, a coffee cup - soft and slightly out of focus), a sharp MIDGROUND (her, the subject), and a live BACKGROUND (the signature world life). Each layer holds specific content that belongs to this exact place and moment - that layering is what makes a vertical frame feel deep and cinematic instead of a flat cut-out.

SPECIFICITY (specifics convince and persuade; adjectives don't): give every scene ONE concrete, NAMED, true-to-life detail - a crumpled Hollywoodbets Durban July race card in her hand, condensation on a glass, a lanyard, the real product with its label, the venue's actual branding and colours - never a vague "a crowd" or "some things". One precise real detail sells the whole world.

A CAUGHT MOMENT, NOT A POSE (the final 20% that reads as genuinely REAL): direct each scene as a tiny OBSERVED micro-moment that feels unscripted - she GLANCES up as the horses pass, a flicker of a real smile, a small natural action mid-flow (a sip, a glance at her phone, adjusting her hat) - never a held, posed, staring stock-photo beat. Match her micro-expression precisely to the line's emotion: curious/arrested on the hook, warm on the benefit, quietly assured on the CTA. Every frame should feel like a real second of life caught by chance, not set up for the camera.

CAPTIONS - burned-in, match vo_line word-for-word, split into short readable beats (~6-14 words each) with natural punctuation (commas and full stops). NEVER use pipe or bar '|' separators. Empty when there is no VO.

MOTION - give each scene a short motion_prompt (natural, not robotic). A-ROLL: only HER own subtle movement - gentle head movement and warm expression, with HANDS RESTING AND ESSENTIALLY STILL (do not write hand gestures for a-roll; she barely uses her hands) - and the CAMERA HELD STILL - the talking-head engine animates her, not the camera, so a moving camera warps her. B-ROLL: direct ONE deliberate, slow CINEMATIC camera move that serves the beat - a gentle push-in on a reveal, a slow dolly or soft lateral drift through the space, or a rack-focus onto her or the product - alongside the natural scene action. ONE single continuous move per scene, calm and controlled; NEVER multiple cuts, a whip-pan, a snap-zoom or a fast swoop.

BLOCKING / HANDS (critical - AI image models render deformed or extra hands when fingers do something fiddly) - keep blocking and gestures SIMPLE and hand-safe. Do NOT write poses that count on fingers, hold up a number of fingers, make hand signs (peace sign, thumbs up, finger guns), interlace fingers, or raise hands to the face. Prefer relaxed hands, a hand resting on a surface, holding a cup/phone/the product naturally, or one simple open gesture. Write hands as occupied and natural, never as the focal point of a precise finger pose.

ONE SHOT PER SCENE (critical) - every scene is EXACTLY ONE continuous shot/cut that renders as a single moving clip. NEVER pack multiple cuts into a scene: no "three rapid cuts", no "Cut 1 / Cut 2 / Cut 3", no in-scene montage. If an idea wants several cuts, make each its OWN consecutive scene in the SAME world (they get chained to flow seamlessly). Prefer MORE short single-shot scenes over one crammed montage. A "lifestyle montage" beat = a few separate single-shot b-roll scenes, not one multi-cut scene.

BRANDING + LEGAL - if a logo is provided it sits as a persistent overlay (handled at assembly, not a scene). Do NOT write an end-card / closing card / text slate scene - the closing clip or image is uploaded by the producer and appended automatically at the stitch. The film's last scene is the presenter delivering the spoken CTA in-scene. Use the provided legal line VERBATIM, never paraphrased; if none provided, leave legal empty.

CASTING THE WORLD (demographic fit - critical for a world-class feel) - the location, the influencer's wardrobe and the background extras must all be BELIEVABLE for THIS specific influencer's age, profession and life (given in the influencer profile). If the producer stipulated a setting/world - OR a reference creative is attached - honour that exact world (a reference creative's real location IS the stipulated world and OVERRIDES any demographic default; never swap a shown waterfront café for an office). ONLY if there is NO stipulated setting AND no reference creative do you choose an age- and demographic-appropriate world yourself: e.g. a 20-something student → campus, lecture courtyard, study cafe; a young professional → modern office, co-working space, city street; a parent → home, kitchen, school run, park; a fitness creator → gym, studio, track. Dress her naturally and age-appropriately for that world (and keep that ONE outfit consistent), and make the background extras the kind of people who would genuinely be in that place (right ages, right context). Never place her somewhere that doesn't fit her age, profession or story.

RECURRING CAST CONTINUITY - if any companions (friends, family, a colleague, a partner) feature in MORE THAN ONE scene, treat them as a FIXED supporting cast: decide who they are ONCE (a brief fixed description per person - e.g. "Thandi: late-20s, short natural hair, gold hoops, green dress"), and write that SAME described person into EVERY scene they appear in, word for word. Never let a recurring friend silently change into a different-looking person between scenes - the same two friends in the apartment in scene 2 are the same two friends in scene 6. Put their fixed descriptions in the blocking so each scene renders the same individuals. Only the influencer's face is locked from references; the companions stay consistent by these repeated descriptions.

MUSIC - describe a single music bed that runs throughout, lifts under the CTA, breathes in the montage, resolves on the end card; add ambient SFX per scene where it helps. Describe the music ONLY by genre, mood, tempo and instruments - NEVER name a real artist, band or song, and never say "in the style of" / "like" a real act (this gets the music generator rejected). Original, royalty-free vibes only.

UK spelling. No em dashes. Be specific and art-directed, never generic. Return the storyboard via the tool.`;

// SCRIPT-FIRST: write JUST the spoken voiceover (the continuous read) for the concept + length, so the
// producer can review/edit it BEFORE the scenes are built. Returns plain script text (the words spoken).
export async function generateScript(brief: {
  influencerName: string; brand: string; goal: string; offer: string; benefits: string;
  cta: string; ctaCode?: string; durationSeconds: number; tone: string; setting?: string; influencerProfile?: string; expressive?: boolean;
  storyline?: string; brainFacts?: string;
}): Promise<string> {
  const c = await client();
  const words = Math.round(brief.durationSeconds * 2.5);
  // The producer's own vision is the BRIEF, not a hint - same rule as shapeStory. Without this the script
  // writer could only see the structured fields and wrote a generic ad, ignoring what the producer actually
  // described. Their specifics (brand, mechanism, key terms, numbers) must survive into the spoken words.
  const story = (brief.storyline || "").trim().slice(0, 3000);
  const facts = (brief.brainFacts || "").trim().slice(0, 1600);
  // v3 (Expressive) reads ElevenLabs audio tags; v2 (Stable) would speak them aloud, so only tag for v3.
  const tagRule = brief.expressive
    ? `This script is voiced on ElevenLabs Eleven v3, so add a FEW inline AUDIO TAGS for natural, expressive delivery - bracketed lowercase tags such as [warm], [excited], [curious], [reassuring], [laughs softly], [whispers], [pause], [emphasis]. Use at most 1-2 per sentence, matched to the meaning and a ${brief.tone} tone; do NOT over-tag. Keep every spoken word.`
    : `Output ONLY the words she speaks - no audio tags, no scene labels, no stage directions, no quotation marks, no headings.`;
  const system = `You are a world-class RESPONSE-MARKETING copywriter, the calibre behind the highest-performing short-form ads on the planet. You live and breathe the science of stopping the scroll and seizing attention in the first second, then holding it to a single action. You are judged ONLY on retention and conversion, never on sounding clever or "salesy". Every line is engineered to earn the next one.

Write the SPOKEN VOICEOVER for a ${brief.durationSeconds}-second vertical social ad - ${brief.influencerName} speaking to camera and over b-roll, as one continuous read.

CRAFT (non-negotiable):
- Write like ONE real person talking to ONE real person. Conversational, specific, human - never brochure or "marketing voice".
- HOOK (first ~3 seconds decide 80% of performance): open on tension, a sharp specific, a curiosity gap, a bold honest truth, or the exact problem they feel - NOT a product boast or a greeting. Earn the next line.
- Earn the pitch: name the real problem or desire FIRST so the product lands as the obvious answer, not an interruption.
- Be concrete and sensory. Specifics persuade; adjectives don't. Show the moment, not the claim ("still awake at 1am, scrolling" beats "saves you time").
- One idea. Tight rhythm, short lines, varied cadence. It must sound like real speech read aloud, not written copy.
- Close on ONE clear, low-friction CTA that feels like the natural next step, not a hard sell.

SCROLL-STOP PLAYBOOK (open with the hook that fits this brief, never a greeting or a product boast):
- Pattern interrupt: frame something unexpected that breaks the scroll trance.
- Open loop: pose a gap the viewer NEEDS closed, then make them stay to close it.
- Sharp call-out: speak to the EXACT person and moment ("If your data runs out by mid-month...").
- Stakes / cost of inaction: name what they quietly keep losing by not acting.
- Specific over vague: a real number, place or detail out-pulls any adjective.
- A bold honest truth or mild contrarian take that makes them think "wait, what".
HOLD: land a micro-payoff every few seconds, keep an open loop running underneath, never a flat throwaway line, no dead air, momentum all the way to the last word.
DRIVE: one single action only, framed as the easy obvious next step. Real urgency only, never manufactured.

BANNED - these instantly read as cheap, AI, or salesy; NEVER use: "Introducing", "Say goodbye to", "Look no further", "Imagine a world/Imagine if", "In today's world", "fast-paced world", "game-changer", "revolutionary", "unlock", "elevate", "supercharge", "next level", "you deserve", "what if I told you", "that's right", "but wait, there's more", "tired of...?", "you need this", "I'm obsessed" / "obsessed with", "this changed my life", "run, don't walk", "it just hits different", "trust me", exclamation-mark spam, stacked rhetorical questions, and hype adjectives (amazing, incredible, ultimate, seamless, effortless). If a line could appear in a hundred other ads, rewrite it.

TONE: ${brief.tone}. Confident but real, persuasive without pressure, warm without cheese.
LENGTH: about ${words} words (~2.5/second for ${brief.durationSeconds}s) - fill the runtime at a natural speaking pace, no dead air, no padding.
RULES: UK spelling. NO em dashes. NEVER name a real artist, band or song. ${tagRule}${story ? `

HONOUR THE PRODUCER'S VISION (this is the most important rule): they have described the ad in their own words below. Read it FIRST and work out exactly what they want to say. KEEP every specific they gave - the brand and product names, the mechanism and how it works, their numbers, and their key terms - and write the spoken script around them, spelled as they spelled them. You SHARPEN their idea into words that land; you do NOT replace it, swap their product, or generalise their details away.` : ""}${facts ? `

VERIFIED FACTS: you are also given facts from the client's own knowledge base. Draw any new claim ONLY from them or the producer's vision - never state a number or claim that appears in neither. Mine them for the fact, then say it in your own concrete words; never copy their marketing phrasing.` : ""}`;
  const input = (story ? `THE PRODUCER'S VISION FOR THIS AD (their own words - this is the brief):\n"""${story}"""\n\n` : "")
    + (facts ? `VERIFIED FACTS FROM THE CLIENT'S BRAIN:\n${facts}\n\n` : "")
    + `Influencer: ${brief.influencerName}. ${brief.influencerProfile || ""}\nBrand / product: ${brief.brand || "(take it from the vision above)"}\nGoal: ${brief.goal}\nCore offer / hook: ${brief.offer || "(take it from the vision above)"}\nKey benefits: ${brief.benefits}\nCTA: ${brief.cta}${brief.ctaCode ? ` (code: ${brief.ctaCode})` : ""}\nTone: ${brief.tone}\nSetting: ${brief.setting || "(her natural world)"}\n\n`
    + (story ? `Write the ${brief.durationSeconds}-second voiceover script now, honouring my vision above and keeping every specific in it.` : `Write the ${brief.durationSeconds}-second voiceover script now.`);
  const res = await c.messages.create({ model: MODEL, max_tokens: 1200, system, messages: [{ role: "user", content: input }] });
  const b = res.content.find((x) => x.type === "text");
  return (b && b.type === "text" ? b.text : "").trim();
}

export async function generateStoryboard(brief: {
  influencerName: string; brand: string; goal: string; offer: string; benefits: string;
  cta: string; ctaCode?: string; durationSeconds: number; format: string; talent: string;
  setting: string; tone: string; logo?: string; legal?: string; influencerProfile?: string; script?: string;
  arollRefImage?: string; brollRefImage?: string; storyline?: string;
}): Promise<Storyboard> {
  const c = await client();
  // STORYLINE-FIRST: when the producer wrote the ad's story/idea in their own words, that is the HEART of the
  // brief - honour its intent, characters, beats and feeling, and infer any blank fields from it. You are their
  // world-class producer (top 1%): shape their story into a directed, high-converting storyboard.
  const storyPreface = brief.storyline && brief.storyline.trim()
    ? `THE PRODUCER'S STORY / CREATIVE VISION (their own words - this is the heart of the ad; honour its intent, characters, beats and feeling, then direct it into a world-class storyboard):\n"""${brief.storyline.trim().slice(0, 4000)}"""\nUse the fields below as supporting detail; where a field is blank or thin, INFER it from the story above.\n\n`
    : "";
  const input = storyPreface +
    `Brand / product: ${brief.brand}\nCampaign goal: ${brief.goal}\nCore offer / hook: ${brief.offer}\n` +
    `Key benefits: ${brief.benefits}\nPrimary CTA: ${brief.cta}\nCTA mechanic / code: ${brief.ctaCode || "(none)"}\n` +
    `Target duration: ${brief.durationSeconds} seconds\nFormat: ${brief.format}\n` +
    `Talent (the locked influencer is the main presenter): ${brief.influencerName}. ${brief.talent}\n` +
    `Influencer profile - cast the WORLD, wardrobe and background extras to suit THIS person's age, profession and life: ${brief.influencerProfile || "(infer from the talent description)"}\n` +
    `Setting / world: ${brief.setting ? brief.setting : (brief.arollRefImage || brief.brollRefImage) ? "(DEFINED BY the attached REFERENCE CREATIVES below - use the EXACT real-world place shown in them as the world for EVERY scene; do NOT invent or default to a different location such as an office)" : "(not stipulated - choose an age- and demographic-appropriate world for this influencer)"}\nTone words: ${brief.tone}\n` +
    `Brand overlay: the logo/promo is applied AUTOMATICALLY as an overlay at assembly - do NOT write the logo into any scene's graphics or render it in any shot.\n` +
    `Mandatory legal line (verbatim, or none): ${brief.legal || "(none)"}\n` +
    (brief.arollRefImage || brief.brollRefImage
      ? `\nREFERENCE CREATIVES (attached as images below) - these are the APPROVED look for this ad and the single most important context you have. STUDY them like a director studies a mood board:\n• WHO is in each one (the influencer? a second person - a child, daughter, partner, customer?), their apparent age and role.\n• WHAT they are DOING (studying on a laptop, using the product, talking to camera).\n• The wardrobe, setting and world.\nReproduce what you see. THE LOCATION IS AUTHORITATIVE: whatever real-world place the reference shows (for example an outdoor café terrace at the V&A Waterfront with Table Mountain and Lion's Head behind, a home kitchen, a city street) IS the world of this ENTIRE ad - set EVERY scene there, name that exact place specifically in each scene's location, and match its backdrop, landmarks, architecture, furniture, light and time of day. Do NOT relocate the shoot to a generic office, studio or co-working space, and do NOT override the reference's place with a demographic default - if the reference is an outdoor waterfront café, the whole film is at that outdoor waterfront café.\nIf a B-ROLL reference shows a SPECIFIC person (e.g. a young woman / a daughter) performing an action (e.g. studying on a laptop), that person is a REAL character in this film and that action is a REAL scene - put THAT person in the b-roll doing THAT thing (define them in supporting_cast, place them in the scene talent + blocking). Do NOT replace them with the influencer, and do NOT reassign their action to the influencer.\n`
      : "") +
    (brief.script && brief.script.trim()
      ? `\nAPPROVED SCRIPT - the producer has already written and approved this exact voiceover. You MUST use it VERBATIM: set full_vo to this script word-for-word, and split it sensibly across the scenes' vo_line fields (each scene a contiguous chunk, in order, covering the whole script). Do NOT rewrite, shorten, extend or add to the words - only decide how the scenes (a-roll/b-roll), visuals, pacing and timecodes carry this script. SCRIPT:\n"""${brief.script.trim()}"""\n\nNow build the directed storyboard around this approved script.`
      : `\nWrite the directed storyboard now.`);
  // Attach the approved reference creatives as vision so the director SEES the real cast + action,
  // not just text (fixes "it made the mum the student" + "it ignored the daughter-on-laptop b-roll").
  type Part = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
  const content: Part[] = [{ type: "text", text: input }];
  if (brief.arollRefImage) { content.push({ type: "text", text: "A-ROLL reference creative (the approved talking-shot look + cast):" }, { type: "image", source: { type: "url", url: brief.arollRefImage } }); }
  if (brief.brollRefImage) { content.push({ type: "text", text: "B-ROLL reference creative (study WHO is in it and WHAT they are doing - reproduce that person + action):" }, { type: "image", source: { type: "url", url: brief.brollRefImage } }); }
  const genOnce = async (): Promise<Storyboard> => {
    const res = await c.messages.create({
      model: PREMIUM,
      max_tokens: 6000,
      system: PRODUCER_SYSTEM,
      tools: [{ name: "storyboard", description: "Return the complete directed storyboard.", input_schema: STORYBOARD_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: "storyboard" },
      messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("No storyboard returned");
    return block.input as Storyboard;
  };
  // GUARANTEE the a-roll → b-roll → a-roll rhythm the team locked in (start + end on a-roll, never two of the
  // same role back to back). It's a prompt rule the LLM occasionally slips on, so validate + retry, and as a
  // final backstop force the role pattern so a NON-alternating cut can never ship again.
  const alternates = (sb: Storyboard): boolean => {
    const roles = (sb.scenes || []).map((s) => String(s.role || "")).filter((r) => r === "a-roll" || r === "b-roll");
    if (roles.length < 2) return true;
    if (roles[0] !== "a-roll" || roles[roles.length - 1] !== "a-roll") return false;
    for (let i = 1; i < roles.length; i++) if (roles[i] === roles[i - 1]) return false;
    return true;
  };
  let sb = await genOnce();
  for (let attempt = 0; attempt < 2 && !alternates(sb); attempt++) sb = await genOnce();
  if (!alternates(sb)) {
    // Backstop: force a-roll, b-roll, a-roll, … (even index = a-roll) so it starts + ends on a-roll.
    (sb.scenes || []).forEach((s, i) => { if (String(s.role) !== "graphic") s.role = (i % 2 === 0 ? "a-roll" : "b-roll") as StoryScene["role"]; });
  }
  return sb;
}

// THE PRODUCER's script helper: rewrite ONE scene's voiceover line + matching caption, in the
// single-continuous-VO house style, optionally following a quick instruction from the producer.
export async function rewriteSceneScript(o: { brand: string; tone: string; beat: string; role: string; blocking: string; currentVo: string; currentCaption: string; instruction?: string; fullVo?: string }): Promise<{ vo_line: string; caption: string }> {
  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "You are a sharp social-ad copy producer. Rewrite ONE scene's spoken VOICEOVER line for a short vertical video ad. House style: single continuous voiceover, second person, warm and confident, short punchy active sentences, benefit-led, no hard sell. UK spelling, no em dashes, no emojis, no quotes around the line. Also write a burned-in CAPTION that matches the VO almost word-for-word, 14 words max. Keep it the right length for the scene's beat. Return via the tool only.",
    tools: [{ name: "scene_script", description: "The rewritten VO line and caption for this one scene.", input_schema: { type: "object", additionalProperties: false, properties: { vo_line: { type: "string" }, caption: { type: "string" } }, required: ["vo_line", "caption"] } as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "scene_script" },
    messages: [{ role: "user", content: `Brand: ${o.brand || "the brand"}. Tone: ${o.tone || "warm, confident"}. Scene beat: ${o.beat} (${o.role}). On screen: ${o.blocking}. Current VO: "${o.currentVo}". Current caption: "${o.currentCaption}".${o.instruction ? ` Producer instruction: ${o.instruction}.` : ""}${o.fullVo ? `\nFull-ad VO for flow/context: ${o.fullVo}` : ""}${o.role === "b-roll" ? ` This is a B-ROLL (scene shot): keep the VO line LIGHT and measured - a single clear thought, MAX ~9.5 seconds of speech (about 24 words, ideally 6-9s), never longer than 9.5s and never copy-heavy. The scene shot renders on a 10-second clip, so a longer line leaves the video frozen under the tail (a visible pause) - keep it inside 9.5s. The denser copy belongs on a-roll (which takes up to 15s).` : ""}\n\nRewrite the VO line and its caption for THIS scene only.` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (block && block.type === "tool_use") return block.input as { vo_line: string; caption: string };
  return { vo_line: o.currentVo, caption: o.currentCaption };
}

// BRIEF CO-PILOT: from the brand + this influencer (+ whatever the producer has drafted so far), write a
// SHARP, world-class direct-response brief - a punchy offer/hook, concrete key benefits, one clear CTA and
// tone words. Sharpens what's there rather than discarding it. Powers the "Draft with AI" button on the brief.
export async function draftBrief(o: {
  influencerName: string; influencerProfile?: string; brand: string;
  offer?: string; benefits?: string; cta?: string; tone?: string; durationSeconds: number;
  audience?: string; keyMessage?: string; proof?: string; brainFacts?: string;
}): Promise<{ offer: string; benefits: string; cta: string; tone: string }> {
  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: `You are a world-class direct-response brand strategist and creative director - the calibre behind the highest-performing short-form ads on the planet. Given an AI influencer, a brand/product, and whatever the producer has drafted so far, write a SHARP, world-class brief for a ${o.durationSeconds}-second vertical social ad. Response-marketing best practice: lead with the real problem or desire, make every benefit CONCRETE and specific (never vague adjectives or hype), and land on ONE clear, low-friction CTA. Honest and trustworthy, on-brand for THIS influencer and her audience. If the producer already wrote something, SHARPEN and complete it rather than discarding it. UK spelling, no em dashes, no emojis. Return ONLY via the tool.`,
    tools: [{ name: "brief", description: "The sharpened world-class brief.", input_schema: { type: "object", additionalProperties: false, properties: {
      offer: { type: "string", description: "the core offer / hook in one punchy line" },
      benefits: { type: "string", description: "3 to 6 CONCRETE key benefits, comma separated (specifics, not adjectives)" },
      cta: { type: "string", description: "one clear, low-friction call to action" },
      tone: { type: "string", description: "3 to 4 tone words, comma separated" },
    }, required: ["offer", "benefits", "cta", "tone"] } as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "brief" },
    messages: [{ role: "user", content: `Influencer: ${o.influencerName}.${o.influencerProfile ? ` Who she is: ${o.influencerProfile}.` : ""}\nBrand / product: ${o.brand || "(not specified)"}.\n` +
      (o.audience ? `Target audience: ${o.audience}.\n` : "") +
      (o.keyMessage ? `The ONE thing to land: ${o.keyMessage}.\n` : "") +
      (o.proof ? `Proof / credibility to lean on: ${o.proof}.\n` : "") +
      (o.brainFacts ? `\nVERIFIED BRAND FACTS from the client's knowledge base - use these as ground truth, do NOT contradict or invent around them:\n${o.brainFacts}\n` : "") +
      `Current draft - offer: "${o.offer || ""}"; benefits: "${o.benefits || ""}"; CTA: "${o.cta || ""}"; tone: "${o.tone || ""}".\n\nWrite the sharpened, world-class brief for this ${o.durationSeconds}s ad.` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (block && block.type === "tool_use") return block.input as { offer: string; benefits: string; cta: string; tone: string };
  return { offer: o.offer || "", benefits: o.benefits || "", cta: o.cta || "", tone: o.tone || "" };
}

// STORY HELPER ("Sharpen my story"): shape the producer's rough idea into the vivid STORY they then direct.
// This is the CEILING of the whole pipeline - every scene, VO line, keyframe and clip is derived from it, and
// generateStoryboard is instructed to honour its intent, so a generic story is faithfully rendered into a
// generic ad. It therefore runs on PREMIUM and carries real craft. Built on evidence, not vibes:
//
//  • Plan-then-write (Plan-and-Write, Yao AAAI'19; Re3 EMNLP'22; DOME NAACL'25) - a short beat plan before the
//    prose measurably lifts narrative coherence. So: angles -> beat plan -> prose, in one call.
//  • Verbalized Sampling (arXiv 2510.01171) - generic "AI slop" is a documented RLHF typicality-bias artifact
//    (mode collapse); the best-supported training-free fix is forcing N genuinely DISTINCT candidates before
//    committing, rather than letting the model emit its first modal answer. So: 3 hook angles, then pick.
//  • Free-form prose, never a JSON/tool schema (arXiv 2408.02442 - rigid schemas degrade generation). The
//    downstream generateStoryboard call owns the structure; this one only has to write well.
//  • Anti-slop persona + explicit banned-cliche list (Anthropic prompting best practices).
//  • Craft rules: brand present from the FIRST beat (Google ABCD, validated across 17k campaigns w/ Kantar +
//    Ipsos; Facebook IQ: brand in first 3s -> 23% more likely recalled vs 13% at 4s+); land the idea inside
//    ~2s of active attention (Nelson-Field attention-memory threshold); but/therefore momentum (Parker/Stone);
//    open a loop at the hook and close it at the proof (Zeigarnik); ~2.4 spoken words/sec (NCVS: ad reads
//    150-180wpm); ONE ask, phrased as an instruction.
//
// Deliberately NOT used: a raised temperature (arXiv 2405.00492 - temperature is not the creativity parameter:
// weakly correlated with novelty, moderately with INCOHERENCE) and an extended-thinking budget (gains are
// reasoning-specific, not creative). The lift here comes from the plan + the diverse-angle pass.
const STORY_BANNED = `"in today's fast-paced world", "imagine a world where", "picture this", "unlock", "elevate", "supercharge", "game-changer", "revolutionary", "seamless", "cutting-edge", "take it to the next level", "look no further", "little did they know", "the secret to", "level up"`;

export async function shapeStory(o: {
  influencerName: string; influencerProfile?: string; storyline?: string; brand?: string; offer?: string;
  benefits?: string; cta?: string; tone?: string; setting?: string; durationSeconds: number; brainFacts?: string;
}): Promise<{ storyline: string }> {
  const c = await client();
  const dur = Math.max(10, Math.min(90, Math.round(o.durationSeconds || 45)));
  const spokenWords = Math.round(dur * 2.4); // NCVS-backed ad-read pace, the same constant PRODUCER_SYSTEM uses
  const beats = dur <= 15 ? 3 : dur <= 30 ? 5 : 6;
  const given = (o.storyline || "").trim().slice(0, 3000);
  const facts = (o.brainFacts || "").trim().slice(0, 1800);

  const res = await c.messages.create({
    model: PREMIUM,
    max_tokens: 2000,
    system:
`You are Kiara, an elite short-form ad producer. You have shipped hundreds of vertical spots and you think in images, sound and one human truth. You do not write copy that sounds like an advert wrote itself.

<why_this_matters>
Your narrative is the blueprint. A downstream director breaks it into ${beats} filmed scenes with a continuous voiceover for a ${dur}-second vertical ad, and is instructed to honour your intent exactly. Whatever you write is what gets shot. A vague story becomes a vague film that nobody watches.
</why_this_matters>

<honour_the_producer_first>
This is the most important rule. The producer's own story is your brief, not a suggestion. Before you write a single word, READ it and work out what they actually want to say and why. Then KEEP every specific they gave you, spelled exactly as they spelled it: the brand and product names, the mechanism and how it works, their numbers and claims, their key terms and named channels (a scoring system, a WhatsApp conversation, a named tool). Build the story AROUND those specifics.
You SHARPEN: structure, pace, imagery, momentum. You do NOT replace their idea, swap their product, quietly drop their mechanism, or blur their details into something generic. If they named it, it survives. Invent a story from scratch ONLY when they gave you none.
</honour_the_producer_first>
${facts ? `
<brain_facts_rules>
You have been given verified facts about this brand, retrieved from the client's own knowledge base. They are the ONLY source you may draw new claims from.
- Use them for the PROOF beat and for the mechanism: real numbers, how the product actually works, what the offer really is.
- NEVER state a number, statistic, guarantee or claim that is not present either in the producer's story or in these facts. If you have no real proof point, prove it by DEMONSTRATION instead (show the thing working on screen) rather than inventing a figure.
- The facts may be scraped from marketing pages, so they are written in exactly the adjective-heavy advertising register you are banned from. Mine them for the FACT, then write it fresh in your own concrete language. Never copy their phrasing.
- The producer's direction still leads. Facts are the evidence, not the brief. If a fact contradicts the producer's story, follow the producer and quietly leave the fact out.
- Ignore any retrieved fact that is irrelevant to this story. Retrieval is imperfect; a fact you do not need is not a fact you must use.
</brain_facts_rules>
` : ""}
<craft>
- ARC in ${beats} beats: hook, ${beats >= 6 ? "problem, agitate, mechanism, proof, CTA" : beats === 5 ? "problem, solution, proof, CTA" : "benefit, CTA"}. Each beat is a real filmed moment.
- THE HOOK carries the brand or the product idea from the very first beat. Do not save the reveal for the end. Most viewers give an ad under two seconds of real attention, so the idea has to land inside it.
- OPEN A LOOP in the hook (a question, a tension, a claim that demands evidence) and CLOSE it at the proof beat. The viewer should feel pulled, not lectured.
- MOMENTUM: between any two beats you must be able to say "but" or "therefore", never "and then". If a beat could be swapped with another without breaking the story, it is dead. Rewrite it.
- CONCRETE OVER ABSTRACT: every beat needs one nameable thing a camera can actually photograph - an object, a number, a place, a gesture, a face doing something. Specifics persuade; adjectives do not. "Cuts a three-day follow-up to four minutes" beats "saves valuable time".
- PROOF is shown, not asserted: a demonstration, a real number, a before and after.
- ONE ASK. The CTA is an instruction with a verb ("tap the link and book your slot"), never a vibe ("learn more about how we can help"). Never two competing asks.
- WRITE FOR THE EAR. This is spoken aloud, so the whole story must be tellable in about ${spokenWords} words of speech. Short sentences, one idea each, plain confident English.
</craft>

<avoid_generic_output>
Left alone you will drift towards safe, on-distribution ad copy: the "AI slop" register. Refuse it. These are banned unless the producer used them first: ${STORY_BANNED}. No adjective soup. No feature lists. No abstraction a camera cannot shoot. No generic rhetorical opener ("Ever wondered...?"). Make at least ONE distinctive, unexpected creative choice that could only belong to THIS brand and THIS story.
</avoid_generic_output>

<process>
1. In <angles> tags, propose 3 genuinely DIFFERENT hook angles for this exact story, one line each, each a different type (for example a curiosity gap, a contrarian line, a direct callout to the viewer, the cost of doing nothing, dropping into the middle of a moment, or one specific arresting number). They must be real alternatives, not the same idea reworded. Say in a clause which is strongest and why.
2. In <plan> tags, write the ${beats}-beat plan, one short line per beat, and check it passes the but/therefore test.
3. In <narrative> tags, write the final story as flowing cinematic prose: the world and setting, the presenter's moment and feeling, the beats in order, the producer's specifics intact, the offer and the one CTA woven in naturally. Never a shot list, never "VO:" labels, never headings. 120 to 180 words, one or two short paragraphs.
</process>

UK spelling. No em dashes. No emojis. Output only the three tagged blocks.`,
    // Retrieved facts sit ABOVE the brief and the instruction: Anthropic's long-context guidance is documents
    // at the top, the ask at the end. The ask stays last so the producer's direction is the freshest thing read.
    messages: [{ role: "user", content:
`${facts ? `<brain_facts source="${(o.brand || "the client").replace(/"/g, "")} knowledge base - verified">\n${facts}\n</brain_facts>\n\n` : ""}<brief>
  <presenter>${o.influencerName}.${o.influencerProfile ? ` ${o.influencerProfile}` : ""}</presenter>
  <brand>${o.brand || "(take it from my story below, else infer)"}</brand>
  <offer>${o.offer || "(take it from my story below)"}</offer>
  <benefits>${o.benefits || "(take them from my story below)"}</benefits>
  <cta>${o.cta || "(take it from my story below)"}</cta>
  <tone>${o.tone || "warm, confident, effortless"}</tone>
  <setting>${o.setting || "(choose one that fits the presenter and the story)"}</setting>
  <duration>${dur} seconds, roughly ${spokenWords} spoken words, ${beats} beats</duration>
</brief>

<my_story>
${given || "(I gave no story. Invent a strong one from the brief above.)"}
</my_story>

${given
  ? `Read my story above. Understand my direction and keep every specific I gave you. Now sharpen it.${facts ? " Ground the proof in the verified facts, in your own words, and invent nothing beyond them." : ""}`
  : `I gave no story, so write me a strong one from the brief.${facts ? " Build it on the verified facts above and invent nothing beyond them." : ""}`}` }],
  });

  const block = res.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text : "";
  // Return ONLY the narrative: the angles + beat plan are the model's scaffolding (plan-then-write), not the
  // producer's story. Fail open at every step so a missing tag can never blank the producer's storyline box.
  const tagged = raw.match(/<narrative>([\s\S]*?)<\/narrative>/i);
  const cleaned = (tagged ? tagged[1] : raw.replace(/<angles>[\s\S]*?<\/angles>/gi, "").replace(/<plan>[\s\S]*?<\/plan>/gi, ""))
    .replace(/<\/?[a-z_]+>/gi, "")
    .trim();
  return { storyline: cleaned || given || "" };
}

// Continuity pass: after the producer curates (keeps/rejects) the reference shots, re-flow the VO so
// the KEPT scenes read as ONE coherent narrative (no gaps from dropped scenes). Returns one rewritten
// vo_line + caption per kept scene (keyed by its scene index). Fails open (callers keep originals).
export async function reflowContinuity(o: { brand: string; tone: string; cta?: string; scenes: { scene: number; role: string; beat: string; vo_line: string }[] }): Promise<{ scene: number; vo_line: string; caption: string }[]> {
  const talking = o.scenes.filter((s) => s.role === "a-roll");
  if (!talking.length) return [];
  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system:
      "You are a sharp social-ad copy producer doing a CONTINUITY pass. You are given the FINAL ordered list of talking (a-roll) scenes the producer kept (others were dropped). Rewrite the spoken VOICEOVER so the kept scenes flow as ONE seamless narrative start-to-finish - no references to dropped/missing beats, smooth connective phrasing, a clear arc that lands the CTA last. House style: single continuous second-person voiceover, warm and confident, short punchy active sentences, benefit-led, no hard sell. UK spelling, no em dashes, no emojis, no quotes. For each scene also give a burned-in CAPTION matching its VO almost word-for-word (14 words max). Keep each line the right length for its beat. Return EVERY scene via the tool, keyed by its scene number.",
    tools: [{ name: "reflow", description: "The re-flowed VO line + caption for each kept talking scene.", input_schema: { type: "object", additionalProperties: false, properties: { lines: { type: "array", items: { type: "object", additionalProperties: false, properties: { scene: { type: "number" }, vo_line: { type: "string" }, caption: { type: "string" } }, required: ["scene", "vo_line", "caption"] } } }, required: ["lines"] } as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "reflow" },
    messages: [{ role: "user", content: `Brand: ${o.brand || "the brand"}. Tone: ${o.tone || "warm, confident"}.${o.cta ? ` CTA to land last: ${o.cta}.` : ""}\n\nKept talking scenes, IN ORDER:\n${talking.map((s) => `Scene ${s.scene} - beat "${s.beat}". Current VO: "${s.vo_line}"`).join("\n")}\n\nRewrite the VO + caption for each so they read as one continuous, gap-free script.` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (block && block.type === "tool_use") { const out = (block.input as { lines?: { scene: number; vo_line: string; caption: string }[] }).lines; if (Array.isArray(out)) return out; }
  return [];
}

// "Perfect with AI": take the user's rough one-line character idea and rewrite it into a single rich,
// castable casting brief (age, heritage, profession/world, personality, a visual signature). Returns
// improved prose the user can edit before casting. Fails open (returns the original on any problem).
export async function perfectCharacterBrief(brief: string, gender?: string): Promise<string> {
  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "You are an expert casting director for AI influencers. Take the user's rough idea and rewrite it into ONE vivid, specific casting brief (2-4 sentences of natural prose) that a generator can cast a believable, distinctive, real-looking human from. Weave in: approximate age, ethnicity/heritage, profession or world they live in, a couple of personality traits, and a clear visual signature (something memorable about their look). Keep their core idea - enrich, don't replace it. UK spelling, no em dashes, no emojis, no quotes, no lists. Return only the improved brief via the tool.",
    tools: [{ name: "brief", description: "The improved character casting brief.", input_schema: { type: "object", additionalProperties: false, properties: { brief: { type: "string" } }, required: ["brief"] } as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "brief" },
    messages: [{ role: "user", content: `${gender ? `Gender: ${gender}. ` : ""}Rough idea: ${brief}\n\nReturn a richer, castable character brief that keeps this idea but makes it vivid and specific.` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (block && block.type === "tool_use") { const out = (block.input as { brief?: string }).brief; if (out && out.trim()) return out.trim(); }
  return brief;
}
