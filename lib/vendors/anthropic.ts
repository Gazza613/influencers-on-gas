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
- Give this person a SMALL, UNIQUE set of natural imperfections that make them read as a real human, never an AI render. Bias toward the SUBTLE, skin-level tells that don't dominate a face: fine freckles, faint sun pigmentation, slightly uneven skin tone, a soft rosacea flush, fine lines, a faint old scar, uneven brows, a cowlick, light stubble shadow.
- MOLES/BEAUTY MARKS: use sparingly and ONLY if genuinely fitting — AT MOST ONE, small, flat and natural, on the FACE only. NEVER multiple moles, never a prominent or dark raised mole, and NEVER any mole or mark on the chest, neck or décolletage. When in doubt, prefer freckles or skin texture over a mole.
- Choose imperfections that suit THIS person's age, ethnicity and lifestyle, distinctive to them. No two characters share the same tells. Do NOT default to "a gap between the front teeth."
- Keep imperfections SUBTLE, SPARING and believable, never caricatured. ONE understated tell is usually plenty. face.distinct_features should be brief and barely-there — it must never read as an odd or distracting mark.

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
    ? `REFERENCE PHOTO(S) ATTACHED — these images ARE this person. Derive EVERY physical trait from what you actually SEE: face shape and bone structure, real skin tone and complexion (describe the actual colouring you observe, do not guess a heritage), eye colour, hair, apparent age, and body build/proportions. Describe ONLY what is visible. Do NOT invent, change, embellish or add any physical feature, mark or colouring that is not in the photo. ${twin ? "This is a digital twin of a real person — " : ""}keep face.distinct_features to ONLY marks clearly visible in the photo (else leave it generic/empty). The brief drives their PERSONALITY, story, wardrobe and voice — never their physical appearance.\n`
    : (twin ? "THIS IS A DIGITAL TWIN OF A REAL PERSON. Do NOT invent any moles, freckles, scars, birthmarks or distinctive marks; keep face.distinct_features empty or generic and face.skin generic.\n" : "");
  const imperfectionAsk = hasRefs || twin
    ? "The photo is the source of truth for their appearance — match it exactly and keep invented physical marks out."
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
        (opts.extras ? "Include just a FEW background people (about two to five, not a packed crowd), placed naturally for this specific setting the way real people use it (seated at different tables, queuing loosely, walking past) and never in a tidy row or line. Each is clearly distinct, a different age, build and a DIFFERENT outfit in different colours, doing a different natural thing, never duplicated or dressed alike. The mix is balanced and natural: roughly 55% white, 25% black, 12% coloured and 8% indian, an even 50/50 men and women, all in sharp focus. " : "CRITICAL: there are NO other people anywhere in the scene, not even distant, blurred or background figures, the influencer is completely alone. Choose or frame the setting so it is genuinely empty of other people. ") +
        `Be LOCATION-AWARE: if the brief names a place or city, depict THAT place authentically (its real streets, signage, landmarks and transport are welcome and encouraged). If the brief names no place, set it in the influencer's established setting${homeSetting ? ` (${homeSetting})` : ""} or another believable setting that genuinely fits them, and do NOT invent or default to a random recognisable foreign city (no unprompted London, Paris or New York tells). ` +
        "Specify complete, tasteful outfits with bottoms and footwear, but do NOT write any disclaimer that people are clothed or dressed. The influencer is front-on to the camera, looking straight into the lens with the head level (never looking up, never gazing at the sky or away from camera). Keep poses fresh and natural with hands relaxed; do NOT use the clichéd pose of a hand raised to shield or shade the eyes from the sun, and never describe squinting into the sun. Under 120 words. UK spelling, no em dashes. Output ONLY the paragraph, no preamble.",
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
};
export type Storyboard = {
  title: string; format: string; duration_seconds: number; tone: string;
  music_bed: string; full_vo: string; legal: string; scenes: StoryScene[];
};

const STORYBOARD_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string" }, format: { type: "string" }, duration_seconds: { type: "number" },
    tone: { type: "string" }, music_bed: { type: "string", description: "how the music behaves across the film" },
    full_vo: { type: "string", description: "the entire continuous voiceover as one block" },
    legal: { type: "string", description: "the mandatory legal line, verbatim, or empty" },
    scenes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          beat: { type: "string", description: "Hook, Offer, Benefits, CTA graphic, Montage, End card, etc." },
          role: { type: "string", enum: ["a-roll", "b-roll", "graphic"], description: "a-roll = presenter talks to camera; b-roll = scene/montage with motion, no talking; graphic = branded card" },
          start: { type: "string" }, end: { type: "string" },
          location: { type: "string" },
          talent: { type: "array", items: { type: "string" } },
          shot: { type: "string", description: "type, angle, movement, lens feel in one line" },
          blocking: { type: "string" },
          performance: { type: "string" },
          graphics: { type: "array", items: { type: "string" } },
          vo_line: { type: "string", description: "the spoken line for this scene, or empty if none" },
          caption: { type: "string", description: "burned-in caption, matches vo_line, short beats split with |" },
          motion_prompt: { type: "string", description: "for b-roll/a-roll: short natural movement direction for the video engine" },
          music_sfx: { type: "string" },
          transition: { type: "string" },
        },
        required: ["beat", "role", "start", "end", "location", "talent", "shot", "blocking", "performance", "graphics", "vo_line", "caption", "motion_prompt", "music_sfx", "transition"],
      },
    },
  },
  required: ["title", "format", "duration_seconds", "tone", "music_bed", "full_vo", "legal", "scenes"],
};

const PRODUCER_SYSTEM =
`You are an elite short-form video creative director. Produce a DIRECTED STORYBOARD for a vertical social ad in this exact house style (proven on real campaigns):

STRUCTURE — a 6-beat arc, scaled to the target duration (pacing guide of total runtime): Hook ~8%, Offer ~23%, Benefits ~28%, CTA graphic ~13%, Lifestyle montage ~22%, End card ~6%. Use ~6 scenes for 60s; fewer for shorter durations. Give each scene approximate start/end timecodes that sum to the duration.

VOICE — ONE continuous voiceover across the whole film (never back-and-forth dialogue). Second person, warm, confident, effortless, optimistic, benefit-led, short active sentences, no jargon. Open with a hook in the first ~5s that names the product. Put the full continuous read in full_vo, and each scene's portion in vo_line (montage and end card usually have empty vo_line, carried by music).

WORLD + CONTINUITY (critical for a world-class feel) — set the ENTIRE ad in ONE coherent, specific location/world (e.g. a particular sunlit coffee shop), with the SAME wardrobe, lighting and look on the influencer across every scene, so scenes cut together as one seamless film, never disconnected shots. The presenter is physically PRESENT IN the scene doing something real (sitting at a table with a coffee, leaning at the counter, walking through the space), with believable background people moving naturally, NEVER a floating head on a plain backdrop. Every b-roll uses the SAME location/world as the a-roll (different angles, details and moments of that same place) so the film flows. State the shared world in each scene's location and keep wardrobe consistent in blocking.

ROLES — classify every scene: 'a-roll' = the influencer IN the scene talking to camera (sitting, standing or walking in the location, setting + extras visible behind, never a plain backdrop); 'b-roll' = a lifestyle/scene shot in the SAME location with NATURAL MOTION and believable background people, NO talking (music carries it); 'graphic' = a branded card (CTA badge or end card). In a-roll and b-roll motion_prompts include believable body movement (sitting down, gesturing, walking) and that background people move.

CAPTIONS — burned-in, match vo_line word-for-word, split into short beats (~6-14 words each) using ' | '. Empty when there is no VO.

MOTION — for a-roll and b-roll give a short motion_prompt (natural, not robotic): for a-roll subtle head movement + hand gestures; for b-roll the scene action and that background people move naturally.

BRANDING + LEGAL — persistent logo top-left every scene (note in graphics). The end card restates the offer, CTA mechanic and the legal line. Use the provided legal line VERBATIM, never paraphrased; if none provided, leave legal empty.

MUSIC — describe a single music bed that runs throughout, lifts under the CTA, breathes in the montage, resolves on the end card; add ambient SFX per scene where it helps.

UK spelling. No em dashes. Be specific and art-directed, never generic. Return the storyboard via the tool.`;

export async function generateStoryboard(brief: {
  influencerName: string; brand: string; goal: string; offer: string; benefits: string;
  cta: string; ctaCode?: string; durationSeconds: number; format: string; talent: string;
  setting: string; tone: string; logo?: string; legal?: string;
}): Promise<Storyboard> {
  const c = await client();
  const input =
    `Brand / product: ${brief.brand}\nCampaign goal: ${brief.goal}\nCore offer / hook: ${brief.offer}\n` +
    `Key benefits: ${brief.benefits}\nPrimary CTA: ${brief.cta}\nCTA mechanic / code: ${brief.ctaCode || "(none)"}\n` +
    `Target duration: ${brief.durationSeconds} seconds\nFormat: ${brief.format}\n` +
    `Talent (the locked influencer is the main presenter): ${brief.influencerName}. ${brief.talent}\n` +
    `Setting / world: ${brief.setting}\nTone words: ${brief.tone}\n` +
    `Persistent branding: ${brief.logo || `"${brief.brand}" logo top-left throughout`}\n` +
    `Mandatory legal line (verbatim, or none): ${brief.legal || "(none)"}\n\nWrite the directed storyboard now.`;
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: PRODUCER_SYSTEM,
    tools: [{ name: "storyboard", description: "Return the complete directed storyboard.", input_schema: STORYBOARD_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: "storyboard" },
    messages: [{ role: "user", content: input }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No storyboard returned");
  return block.input as Storyboard;
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
    messages: [{ role: "user", content: `Brand: ${o.brand || "the brand"}. Tone: ${o.tone || "warm, confident"}. Scene beat: ${o.beat} (${o.role}). On screen: ${o.blocking}. Current VO: "${o.currentVo}". Current caption: "${o.currentCaption}".${o.instruction ? ` Producer instruction: ${o.instruction}.` : ""}${o.fullVo ? `\nFull-ad VO for flow/context: ${o.fullVo}` : ""}\n\nRewrite the VO line and its caption for THIS scene only.` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (block && block.type === "tool_use") return block.input as { vo_line: string; caption: string };
  return { vo_line: o.currentVo, caption: o.currentCaption };
}
