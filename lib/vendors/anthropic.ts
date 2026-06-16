import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "../connections";

// Claude (Anthropic) — the producer co-pilot brain. Vendor-neutral in the UI.
// Sonnet 4.6 designs the Character Casting + refines prompts: near-Opus quality for a
// structured creative sheet, but markedly faster (Opus was noticeably slow here).
const MODEL = "claude-sonnet-4-6";

async function client(): Promise<Anthropic> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Co-pilot (Anthropic) is not connected");
  return new Anthropic({ apiKey: key });
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
- The character has ONE clear, consistent gender (as specified in the brief). Never ambiguous or blended; write the bio, build and wardrobe to match it unmistakably.
- core_traits: 3 to 5 dominant traits. behaviour_patterns: 3 telling habits.
- palette entries: short descriptors or hex values (e.g. "warm sienna #B5651D").
- signature_line: one short, in-character spoken line (their voice).
- Keep each field tight and vivid (one or two sentences), production-ready.

Humanising (critical for believability):
- Give this person a SMALL, UNIQUE set of natural imperfections that make them read as a real human, never an AI render. Draw from a WIDE range and vary it every time: freckles, sun spots, a beauty mark or mole, faint acne scarring, slightly uneven skin tone, a rosacea flush, a small scar, a chipped or slightly crooked tooth, an asymmetric smile, uneven brows, a crooked nose bridge, laugh lines, a cowlick, stubble shadow, and so on.
- Choose imperfections that suit THIS person's age, ethnicity and lifestyle, and make the combination distinctive to them. No two characters should share the same tells.
- Do NOT default to the same feature each time. In particular, do NOT reflexively write "a gap between the front teeth" unless it is genuinely the standout choice for this specific person (it rarely should be). Reach for different, fresh details.
- Keep imperfections SUBTLE, SPARING and believable, never caricatured or over-used. One or two understated tells is plenty. Spread them lightly across face.skin, face.distinct_features and face.structure.

Wardrobe (mandatory): always specify a COMPLETE outfit including BOTTOMS (trousers, jeans, a skirt or tailored shorts) and footwear. Never leave the lower body unspecified. Everything is tasteful and brand-safe, the subject is always fully clothed.

Look / finish (adapt to the requested look):
- "natural" look: minimal or no makeup, understated grooming, bare believable skin. Keep imperfections present but very subtle.
- "photoshoot" look: professionally styled hair and, for women, tasteful natural makeup; clean, well-prepped, camera-ready skin so visible blemishes are minimal and softened. Still photoreal, never plastic.`;

// Expand a brief into a full Character Bible.
export async function generateBible(name: string, brief: string, gender?: string, look?: string): Promise<CharacterBible> {
  const c = await client();
  const genderLine = gender ? `Gender: ${gender} (design unmistakably as a ${gender}).\n` : "";
  const lookLine = look ? `Look: ${look} look (adapt makeup, grooming and skin finish accordingly).\n` : "";
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 5000,
    system: SYSTEM,
    tools: [{ name: "character_bible", description: "Return the complete character bible for this influencer.", input_schema: BIBLE_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "character_bible" },
    messages: [{ role: "user", content: `Influencer name: ${name}\n${genderLine}${lookLine}\nBrief:\n${brief}\n\nDesign the complete character bible. Give them a fresh, distinctive set of subtle humanising imperfections unique to this person.` }],
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
// Uses Haiku (fast + cheap) — this runs on every image before the user sees it.
const QA_MODEL = "claude-haiku-4-5";
const QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean", description: "true ONLY if every check below is true" },
    fully_clothed: { type: "boolean", description: "subject wears a top covering the torso AND bottoms; false if shirtless, topless, bare-chested, underwear, swimwear or nude" },
    single_frame: { type: "boolean", description: "ONE continuous photograph of a single moment. false if there is ANY collage, grid, split-screen, diptych/triptych, stacked panels, OR a separate side strip / inset / border panel showing a different scene or different people (even a thin vertical or horizontal band down one edge)" },
    realistic_proportions: { type: "boolean", description: "natural human body and head-to-body proportions, and believable scale relative to the background; false if distorted, oversized, tiny or pasted-on" },
    coherent_photo: { type: "boolean", description: "a real, coherent photograph (not blank, corrupt, warped or garbled)" },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["pass", "fully_clothed", "single_frame", "realistic_proportions", "coherent_photo", "issues"],
} as unknown as Anthropic.Tool["input_schema"];

const QA_MEDIA = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function qaCreative(url: string): Promise<{ pass: boolean; issues: string[] }> {
  // Fetch + inspect as base64 (works on any SDK version; also validates the image loads).
  let b64: string, mt: string;
  try {
    const res = await fetch(url);
    if (!res.ok) return { pass: false, issues: ["image did not load"] }; // broken → reject
    mt = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!QA_MEDIA.has(mt)) mt = "image/jpeg";
    b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return { pass: false, issues: ["image fetch failed"] }; // broken → reject
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
          { type: "text", text: "You are QA for social-media creatives of an AI influencer. Judge this image strictly. pass must be true ONLY if: fully_clothed (top covering torso AND bottoms — FAIL shirtless/topless/underwear/nude), single_frame (ONE continuous photo — FAIL any collage/grid/split/stacked panels OR a side strip/inset/border band showing a different scene), realistic_proportions (natural body + believable scale vs background), and coherent_photo. List concrete issues." },
          { type: "image", source: { type: "base64", media_type: mt as "image/jpeg", data: b64 } },
        ],
      }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    const out = block && block.type === "tool_use" ? (block.input as { pass?: boolean; issues?: string[] }) : null;
    return { pass: !!out?.pass, issues: out?.issues ?? [] };
  } catch {
    // QA service itself errored (not the image) — fail OPEN so a hiccup can't empty the gallery.
    return { pass: true, issues: ["qa-unavailable"] };
  }
}

// Polish a producer's rough idea into a single vivid, art-directed image prompt for a
// social creative of this influencer. Always clothed; diverse, in-focus backgrounds.
export async function refineCreativePrompt(name: string, bible: Record<string, unknown>, scene: string): Promise<string> {
  const c = await client();
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "You are a creative director writing ONE vivid image prompt for a photoreal social-media shot of an existing AI influencer. " +
      "One or two sentences, concrete and art-directed: setting, action, wardrobe feel, mood, light. " +
      "The subject is ALWAYS fully clothed with a complete outfit including bottoms. Any background people reflect South African diversity " +
      "(Black, White, Indian, Coloured) and stay in sharp focus; backgrounds are never blurred. UK spelling, no em dashes. Return ONLY the prompt text, no preamble.",
    messages: [{ role: "user", content: `Influencer: ${name}\nCharacter (JSON): ${JSON.stringify(bible).slice(0, 3000)}\n\nProducer's rough idea: ${scene || "an on-brand lifestyle shot"}\n\nWrite the polished image prompt.` }],
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
