// Hyper-realism master prompt (influencer-builder.md). Auto-applied to every
// identity + b-roll generation so people don't read as AI. The user only picks
// simple controls (setting, wardrobe); this scaffolding stays hidden.

// Non-negotiable: every subject is FULLY CLOTHED, a top covering the torso AND bottoms.
export const CLOTHED =
  "fully and appropriately dressed in a complete, tasteful outfit: a top covering the torso and chest (shirt, blouse, t-shirt, knit, or dress) AND bottoms (trousers, jeans, a skirt or tailored shorts); the chest and torso are always fully covered; never shirtless, topless, bare-chested, in underwear or swimwear, and never nude";

// Single-frame guard, no collage / contact-sheet / split-panel outputs.
export const SINGLE_FRAME =
  "a single photograph, one continuous frame of one moment, NOT a collage, contact sheet, grid, diptych, triptych, split screen or multiple stacked panels";

// Background people: actively REQUIRE a BALANCED diverse crowd (imperative, so it isn't ignored).
export const SCENE_PEOPLE =
  "the scene is busy with several other people clearly visible in the background, a believable, natural crowd with a BALANCED mix of ethnicities and skin tones (white, black, brown and mixed, with NO single group dominating), a balanced mix of men and women across a range of ages, and a mix of individuals, couples and small groups; each rendered realistically, in sharp focus and at correct scale; a lived-in populated setting, never empty; " +
  "EVERY background person is also FULLY CLOTHED in a complete, tasteful outfit including a top covering the torso AND bottoms (trousers, jeans, a skirt or tailored shorts), never bare-legged, in underwear or swimwear, never partially nude";

// No extras: the subject is alone in the scene.
export const NO_EXTRAS =
  "no other people anywhere in the scene, the subject is completely alone, clean and uncluttered background";

// Concise realism core for Soul generation (long stacked clauses confuse the model and
// hurt quality, the Soul + reference handle identity, so keep the scene direction tight).
export const SOUL_SCENE =
  "candid photoreal photograph, fully clothed with a top and bottoms (never shirtless or nude), " +
  "true-to-life body proportions and correct scale in the scene, background in sharp focus, " +
  "balanced natural exposure with no blown-out highlights, a single real photo that fills the entire frame edge to edge (not a collage, split panels, or a side strip / inset / border band showing another scene)";

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

// CREATIVES realism (archive's secret to authentic renders): emulate a recent iPhone, a
// candid friend-shot, NOT a professional studio camera (pro-camera language is what makes
// AI images read as fake stock). Backgrounds stay sharp so shots are reusable for video.
export const UGC_REALISM =
  "a real photo a friend just took on a recent iPhone and posted to Instagram: handheld at arm's length, natural found light, automatic exposure, faint sensor noise in the shadows, " +
  "a real person living their life, NOT a model on a shoot, relaxed end-of-day lived-in energy, a genuine un-posed candid moment, " +
  "real un-retouched skin with visible pores, a little natural shine at the high points and a couple of honest imperfections and gentle asymmetry, no beauty filter, " +
  "true-to-life proportions and correct real-world scale, the whole scene and background in natural sharp focus (no bokeh, never blurred), " +
  CLOTHED + ", " + SINGLE_FRAME;

// CREATIVES cinematic tier: film-grade lighting and colour, but still believable and with
// a usable (not heavily blurred) background so the shot can be reused for video b-roll.
export const CINEMATIC_REALISM =
  "a cinematic film-grade photograph, rich filmic colour grade, dramatic but natural directional lighting, gentle depth with the background still clearly readable (not heavily blurred), " +
  "photorealistic natural skin with real texture and subtle imperfections, true-to-life proportions and correct real-world scale, candid and unposed, balanced exposure with no blown-out highlights, " +
  CLOTHED + ", " + SINGLE_FRAME;

// Aspect-ratio framing (archive gem): tell the model how to fill each frame so we never
// get a distant wide shot or a portrait crop rotated sideways.
export function aspectFraming(ratio: string): string {
  if (ratio === "16:9") return "Horizontal landscape frame: the subject is close to camera, filling at least half the frame height, environment visible on both sides. Not a distant wide shot, not a portrait crop rotated sideways.";
  if (ratio === "1:1") return "Square frame: the subject fills most of the frame, balanced natural composition.";
  return "Vertical 9:16 frame: the subject fills 60 to 70 percent of the frame, a tight candid crop, not a wide environmental shot.";
}

// Archive's anti-AI + raw-photo constraints, the single biggest 'looks real' lever.
const ANTI_AI = "No AI aesthetic markers: no unnaturally bright irises, no perfectly symmetrical face, no plastic-smooth skin, no uncanny glow, no over-sharpening. No phone screen, social-media UI, app overlay, notification or status bar, captions or interface elements anywhere. A real, raw, un-retouched photograph.";
// Subject scale + perspective relative to the scene (a common AI tell when wrong).
const SCALE = "Scale and perspective: the subject is rendered at correct real-world scale and perspective for this exact setting; head height, body size and distance are believable against any doorways, windows, furniture, vehicles, architecture and other people in the scene; feet (or seat) make natural contact with the ground plane with matching contact shadows; one consistent camera height and lens perspective across subject and background; the subject is NEVER oversized, undersized, floating, leaning at an impossible angle or pasted-on, and never a giant against tiny background people or vice versa.";
const SKIN_FACTS = "Skin as real photographic fact: visible pores on the nose, cheeks and forehead and on all exposed skin (neck, arms, hands), a couple of honest imperfections and gentle natural asymmetry, a satin sheen only at the high points with the rest matte and lived-in. Zero skin smoothing, zero airbrushing, no beauty filter.";

// Structured creative-image prompt (the archive's section format that gpt_image_2 follows
// far better than a run-on sentence). Scene/wardrobe/pose come from the user's brief; we
// wrap them in iPhone-realism (or cinematic) framing + identity lock + anti-AI constraints.
export function buildCreativeImagePrompt(o: {
  sceneText: string; variation: string; refInstruction: string; subjectLine: string;
  faceMarks: string; look: string; peopleClause: string; cinematic: boolean; ratio: string;
}): string {
  const style = o.cinematic
    ? "Photograph style: a cinematic film still, rich filmic colour grade, dramatic but natural directional light, the background still clearly readable (not heavily blurred)."
    : "Photograph style: a real iPhone snapshot taken by the subject or a nearby friend, handheld, automatic settings, raw unedited iPhone output. The subject is just living their life, not posing for a shoot, the kind of photo a friend would post to Instagram.";
  const camera = o.cinematic
    ? "Camera and capture: cinematic camera, gentle depth, the whole subject and setting clearly legible."
    : "Camera and capture: iPhone 16 Pro 24mm main lens f/1.78, handheld, natural sensor noise in the shadows, no bokeh, no artificial depth of field.";
  return [
    style,
    `Scene: ${o.sceneText}${o.variation}. ${o.peopleClause}. The background is real and in sharp focus (never blurred), so the shot is reusable for video.`,
    `Subject: ${o.subjectLine}. A real person living their life, NOT a model on a shoot, relaxed lived-in energy.${o.faceMarks ? ` Distinctive features to keep: ${o.faceMarks}.` : ""}`,
    `Identity:${o.refInstruction}`,
    `Pose and expression: a natural, un-posed candid moment, eyes toward the lens unless the scene says otherwise.`,
    `Grooming: ${o.look}.`,
    camera,
    SKIN_FACTS,
    SCALE,
    `Wardrobe: ${CLOTHED}.`,
    `Constraints: ${aspectFraming(o.ratio)} ${ANTI_AI} ${SINGLE_FRAME}.`,
  ].join("\n\n");
}

// ── Canonical identity reference set (archive gem). Generated once from the chosen face
// and reused as forensic @image refs in every creative. @image1 = the chosen face. ──────
export function buildIdentityCardPrompt(): string {
  return "A clean studio identity headshot, like a casting reference card. @image1 is the person, replicate their face EXACTLY: facial bone structure, face shape, eye shape and colour, brow arch, nose, lip shape, skin tone and texture, freckles, moles and natural asymmetries. Front on, head level, looking straight into the lens, neutral relaxed expression, head and shoulders. Clean seamless pale-grey background, soft even two-softbox lighting, subtle catchlights, real visible pore texture, zero retouching. One real photograph. " + CLOTHED + ".";
}
export function buildFeatureSheetPrompt(): string {
  return "A clinical beauty feature reference sheet on a pure white background, bold black uppercase labels above each panel, clear white gutters between panels. Replicate the person in @image1 EXACTLY. Panels: EYE (extreme macro of both irises), BROW (brow shape, arch and forehead skin), LIP (lip shape, cupid's bow and natural colour), SKIN TEXTURE (macro cheek skin showing pores and freckles), HAIR TEXTURE (close-up of hair strands), HANDS (hand showing nails and knuckle skin). Ultra-sharp photoreal macro detail, raw skin detail, zero retouching.";
}
export function buildTurnaroundPrompt(): string {
  return "A full-body character turnaround sheet on a pure white seamless background, soft even flat studio lighting. Four equal full-body panels in one row labelled FRONT VIEW, SIDE VIEW, BACK VIEW, THREE-QUARTER VIEW. Replicate the person in @image1 EXACTLY across all four panels: identical face, body, proportions, skin tone and hair, and the same outfit in every panel. Photoreal, raw skin detail, zero retouching. " + CLOTHED + ".";
}

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
