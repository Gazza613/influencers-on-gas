// Hyper-realism master prompt (influencer-builder.md). Auto-applied to every
// identity + b-roll generation so people don't read as AI. The user only picks
// simple controls (setting, wardrobe); this scaffolding stays hidden.

export const REALISM_POSITIVE =
  "photorealistic, natural skin with visible pores and fine vellus hair, subsurface scattering, " +
  "subtle imperfections and natural asymmetry, realistic catchlights in the eyes, natural under-eye area, " +
  "minimal or no makeup, soft directional key light with gentle falloff, shot on 85mm at f/2.0, " +
  "shallow depth of field, neutral filmic color grade, relaxed candid expression, true-to-life proportions";

// Scene/location realism (full-body, environmental) — keeps proportions, placement
// and colour/lighting believable when the person is set in a location.
export const SCENE_REALISM =
  "photorealistic editorial photograph, natural skin texture, true-to-life human proportions and correct scale relative to the scene, " +
  "the person standing naturally with feet firmly on the ground and realistic perspective, lighting direction and white balance matched to the environment, " +
  "natural shadows and contact with the ground, neutral filmic colour grade, candid and unposed, shot on 35mm at f/4 so the environment reads clearly, sharp and clean";

export const REALISM_NEGATIVE =
  "plastic or waxy skin, airbrushed, over-smoothed, beauty-filter, doll-like, CGI or 3D-render look, " +
  "uncanny symmetry, oversaturated, glossy plastic highlights, HDR halo, over-sharpened, excessive makeup, mannequin";

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
  return { prompt: `${genderPrefix}${subjectStr}${REALISM_POSITIVE}.`, negative: REALISM_NEGATIVE };
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
