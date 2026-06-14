// Hyper-realism master prompt (influencer-builder.md). Auto-applied to every
// identity + b-roll generation so people don't read as AI. The user only picks
// simple controls (setting, wardrobe); this scaffolding stays hidden.

export const REALISM_POSITIVE =
  "photorealistic, natural skin with visible pores and fine vellus hair, subsurface scattering, " +
  "subtle imperfections and natural asymmetry, realistic catchlights in the eyes, natural under-eye area, " +
  "minimal or no makeup, soft directional key light with gentle falloff, shot on 85mm at f/2.0, " +
  "shallow depth of field, neutral filmic color grade, relaxed candid expression, true-to-life proportions";

export const REALISM_NEGATIVE =
  "plastic or waxy skin, airbrushed, over-smoothed, beauty-filter, doll-like, CGI or 3D-render look, " +
  "uncanny symmetry, oversaturated, glossy plastic highlights, HDR halo, over-sharpened, excessive makeup, mannequin";

// Compose a persona spec with the always-on realism core into a generation prompt.
export function buildIdentityPrompt(persona: Record<string, unknown> = {}) {
  const order = ["gender", "age_range", "vibe", "wardrobe", "setting"];
  const bits = order
    .map((k) => persona[k])
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  const subject = bits.length ? bits.join(", ") + ". " : "";
  return { prompt: `${subject}${REALISM_POSITIVE}.`, negative: REALISM_NEGATIVE };
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
