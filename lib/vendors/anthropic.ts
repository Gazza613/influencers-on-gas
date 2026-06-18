import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "../connections";
import { PLATFORM_STATE } from "../platform-state";

// Claude (Anthropic), the producer co-pilot brain. Vendor-neutral in the UI.
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
- The character has ONE clear, consistent gender (as specified in the brief). Never ambiguous or blended; write the bio, build and wardrobe to match it unmistakably. Use ONLY that gender's pronouns throughout every field (she/her for a woman, he/him for a man); NEVER use the opposite gender's pronouns anywhere.
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
export async function generateBible(name: string, brief: string, gender?: string, look?: string, twin = false): Promise<CharacterBible> {
  const c = await client();
  const genderLine = gender ? `Gender: ${gender} (design unmistakably as a ${gender}; use only ${gender === "female" ? "she/her" : gender === "male" ? "he/him" : "their"} pronouns throughout, never the opposite).\n` : "";
  const lookLine = look ? `Look: ${look} look (adapt makeup, grooming and skin finish accordingly).\n` : "";
  // A DIGITAL TWIN is a real person from their own photo: never invent facial marks.
  const twinLine = twin
    ? "THIS IS A DIGITAL TWIN OF A REAL PERSON, built from their own reference photo. Do NOT invent any moles, freckles, scars, birthmarks or distinctive marks, the real photo defines the actual face. Keep face.distinct_features EMPTY or to truly generic descriptors only, and face.skin generic. Never add features the person may not have.\n"
    : "";
  const imperfectionAsk = twin ? "Keep the face fields generic; the real photo is the source of truth for their appearance." : "Give them a fresh, distinctive set of subtle humanising imperfections unique to this person.";
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 5000,
    system: SYSTEM,
    tools: [{ name: "character_bible", description: "Return the complete character bible for this influencer.", input_schema: BIBLE_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "character_bible" },
    messages: [{ role: "user", content: `Influencer name: ${name}\n${genderLine}${lookLine}${twinLine}\nBrief:\n${brief}\n\nDesign the complete character bible. ${imperfectionAsk}` }],
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
    realistic_proportions: { type: "boolean", description: "natural human body and head-to-body proportions, and believable scale relative to the background; false if distorted, oversized, tiny or pasted-on" },
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
    const res = await fetch(url);
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
export async function composeCreativeScene(opts: { bible: Record<string, unknown>; scene: string; cinematic: boolean; extras: boolean; gender?: string }): Promise<string | null> {
  try {
    const c = await client();
    const id = (opts.bible?.identity ?? {}) as Record<string, string>;
    const wardrobe = (opts.bible?.wardrobe ?? {}) as Record<string, unknown>;
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
        (opts.extras ? "Include a believable, busy background crowd that is a natural, diverse multi-ethnic mix, all fully clothed and in sharp focus. " : "No other people in the scene. ") +
        "Everyone is always fully clothed in complete outfits. Under 120 words. UK spelling, no em dashes. Output ONLY the paragraph, no preamble.",
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
