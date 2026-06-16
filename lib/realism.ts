// Hyper-realism master prompt (influencer-builder.md). Auto-applied to every
// identity + b-roll generation so people don't read as AI. The user only picks
// simple controls (setting, wardrobe); this scaffolding stays hidden.

// Non-negotiable: every subject is FULLY CLOTHED — a top covering the torso AND bottoms.
export const CLOTHED =
  "fully and appropriately dressed in a complete, tasteful outfit: a top covering the torso and chest (shirt, blouse, t-shirt, knit, or dress) AND bottoms (trousers, jeans, a skirt or tailored shorts); the chest and torso are always fully covered; never shirtless, topless, bare-chested, in underwear or swimwear, and never nude";

// Single-frame guard — no collage / contact-sheet / split-panel outputs.
export const SINGLE_FRAME =
  "a single photograph, one continuous frame of one moment, NOT a collage, contact sheet, grid, diptych, triptych, split screen or multiple stacked panels";

// Background people: actively REQUIRE a diverse SA crowd (imperative, so it isn't ignored).
export const SCENE_PEOPLE =
  "the scene is busy with several other people clearly visible in the background — a believable, natural mix reflecting South African diversity (Black, White, Indian, Coloured), each rendered realistically, in sharp focus and at correct scale; a lived-in populated setting, never empty";

// No extras: the subject is alone in the scene.
export const NO_EXTRAS =
  "no other people anywhere in the scene, the subject is completely alone, clean and uncluttered background";

// Concise realism core for Soul generation (long stacked clauses confuse the model and
// hurt quality — the Soul + reference handle identity, so keep the scene direction tight).
export const SOUL_SCENE =
  "candid photoreal photograph, fully clothed with a top and bottoms (never shirtless or nude), " +
  "true-to-life body proportions and correct scale in the scene, background in sharp focus, " +
  "balanced natural exposure with no blown-out highlights, a single real photo (not a collage or split panels)";

export const REALISM_POSITIVE =
  "photorealistic, natural skin with visible pores and fine vellus hair, subsurface scattering, " +
  "subtle, restrained natural imperfections and gentle asymmetry, realistic catchlights in the eyes, natural under-eye area, " +
  "soft directional key light with gentle falloff, shot on 85mm at f/2.0, " +
  "neutral filmic color grade, relaxed candid expression, true-to-life proportions, " + CLOTHED + ", " + SINGLE_FRAME;

// Scene/location realism (full-body, environmental). Deep focus on purpose: backgrounds
// stay sharp (never blurred) so the shots are usable for video/b-roll later.
export const SCENE_REALISM =
  "photorealistic editorial photograph, natural skin texture, true-to-life human proportions, " +
  "the subject rendered at CORRECT REAL-WORLD SCALE and perspective relative to the background: head height, body size and distance consistent with doorways, counters, furniture and any other people in the scene, " +
  "feet firmly planted on the ground plane with natural contact shadows, accurate camera height and lens perspective, never oversized, undersized, floating or pasted-on, " +
  "lighting direction and white balance matched to the environment, balanced natural exposure with a full tonal range and NO blown-out highlights or over-exposure, neutral filmic colour grade, candid and unposed, " +
  "shot on 35mm at f/8 with deep depth of field, the entire scene and background in sharp focus (no bokeh, never blurred), " +
  CLOTHED + ", " + SINGLE_FRAME;

export const REALISM_NEGATIVE =
  "plastic or waxy skin, airbrushed, over-smoothed, beauty-filter, doll-like, CGI or 3D-render look, " +
  "uncanny symmetry, oversaturated, glossy plastic highlights, HDR halo, over-sharpened, excessive makeup, mannequin, " +
  "nude, naked, partial nudity, topless, underwear only, lingerie, no trousers, no pants, missing bottoms, bare crotch, exposed groin, blurred background, heavy bokeh";

// Compose a rich subject line from a Character Bible when present (far more specific
// than the simple persona fields), else fall back to the basic persona controls.
function subjectFromBible(b: Record<string, unknown>): string {
  const id = (b.identity ?? {}) as Record<string, string>;
  const face = (b.face ?? {}) as Record<string, string>;
  const wardrobe = (b.wardrobe ?? {}) as { garments?: { item: string; fabric: string }[]; footwear?: string };
  const garments = (wardrobe.garments ?? []).map((g) => `${g.item} (${g.fabric})`).join(", ");
  const parts = [
    [id.age, id.build, id.ethnicity_design].filter(Boolean).join(", "),
    id.profession,
    face.structure, face.skin, face.eyes, face.hair, face.distinct_features,
    garments && `wearing ${garments}`,
    wardrobe.footwear,
  ].map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  return parts.join(", ");
}

// Map the stored gender enum to a natural prompt word.
export function genderWord(gender?: unknown): string {
  const g = typeof gender === "string" ? gender.toLowerCase() : "";
  if (g === "female" || g === "woman") return "woman";
  if (g === "male" || g === "man") return "man";
  return "";
}

// Makeup / grooming clause driven by the chosen look (and gender). Defaults to the
// natural look (Gary prefers understated; blemishes were over-used).
export function lookClause(persona: Record<string, unknown> = {}): string {
  const look = typeof persona.look === "string" ? persona.look.toLowerCase() : "natural";
  const g = genderWord(persona.gender);
  if (look === "photoshoot") {
    return g === "woman"
      ? "professionally styled hair and tasteful natural makeup, camera-ready editorial grooming, clean well-prepped skin"
      : "well-groomed and styled, editorial polish, clean well-prepped skin";
  }
  // natural
  return "minimal or no makeup, natural understated grooming, bare believable skin";
}

// Compose a persona spec with the always-on realism core into a generation prompt.
export function buildIdentityPrompt(persona: Record<string, unknown> = {}) {
  const bible = persona.bible as Record<string, unknown> | undefined;
  let subject = "";
  if (bible && typeof bible === "object") {
    subject = subjectFromBible(bible);
  } else {
    const order = ["gender", "age_range", "vibe", "wardrobe", "setting"];
    subject = order
      .map((k) => persona[k])
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .join(", ");
  }
  // Pin the gender explicitly so every casting look is one consistent gender
  // (the bible's prose alone can read ambiguous to the image model).
  const g = genderWord(persona.gender);
  const genderPrefix = g ? `a ${g}, ` : "";
  const subjectStr = subject ? subject + ". " : "";
  const look = lookClause(persona);
  return { prompt: `${genderPrefix}${subjectStr}${look}, ${REALISM_POSITIVE}.`, negative: REALISM_NEGATIVE };
}

// Self-check before accepting a generated frame (influencer-builder.md).
export const BELIEVABILITY_CHECKLIST = [
  "Skin reads as skin (texture, not wax)",
  "Eyes have natural catchlights, not glassy",
  "Expression isn't frozen",
  "Lighting has real direction",
  "No smeared hands, ears, or teeth",
  "Identity matches the Soul",
];
