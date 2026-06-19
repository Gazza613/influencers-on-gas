// Hyper-realism master prompt (influencer-builder.md). Auto-applied to every
// identity + b-roll generation so people don't read as AI. The user only picks
// simple controls (setting, wardrobe); this scaffolding stays hidden.

// Non-negotiable: every subject is FULLY CLOTHED, a top covering the torso AND bottoms.
export const CLOTHED =
  "fully and appropriately dressed in a complete, tasteful outfit: a top covering the torso and chest (shirt, blouse, t-shirt, knit, or dress) AND bottoms (trousers, jeans, a skirt or tailored shorts); the chest and torso are always fully covered; never shirtless, topless, bare-chested, in underwear or swimwear, and never nude";

// Single-frame guard, no collage / contact-sheet / split-panel outputs.
export const SINGLE_FRAME =
  "a single photograph, one continuous frame of one moment, NOT a collage, contact sheet, grid, diptych, triptych, split screen or multiple stacked panels";

// Background people: a FEW believable extras, naturally placed for THIS setting, each visibly
// DISTINCT (never clones), in a balanced diverse mix. Imperative so it isn't ignored.
export const SCENE_PEOPLE =
  "a FEW other people are present in the background (roughly two to five, not a packed crowd), placed naturally for THIS specific setting the way real people occupy it (for a cafe: seated at different tables, queuing loosely, walking past) and NEVER arranged in a uniform row or tidy line; " +
  "each background person is CLEARLY DISTINCT from the others, with a different age, build, hairstyle and a DIFFERENT outfit in different colours, doing a different natural activity; NEVER duplicate or near-duplicate people, and NEVER dress several of them in the same or matching clothing; " +
  "the mix is balanced and natural: roughly 55% white, 25% black, 12% coloured and 8% indian people, with an even 50/50 split of men and women across a range of ages; each rendered realistically, in sharp focus and at correct scale; " +
  "every background person is in a complete, tasteful outfit with a top and bottoms, never bare-legged, in underwear or swimwear";

// No extras: the subject is the ONLY person. Stated absolutely because image models love to
// populate public settings (cafes, streets) with crowds unless this is forced hard.
export const NO_EXTRAS =
  "CRITICAL: the influencer is the ONLY person anywhere in the entire image. Absolutely NO other people: no background people, no passersby, no bystanders, no crowd, no diners or staff, no silhouettes, no reflections of people, not even tiny, distant or blurred figures. The setting is genuinely empty and quiet, occupied by her alone; if the location would normally be busy, show it at a deserted, people-free moment";

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
// THE HUMANISER (ported from the archived gem): skin as concrete photographic FACT, not category
// words. This is what stops the plastic/AI look and must ride on every render that shows skin.
export const HUMANISER =
  "Skin rendered as concrete photographic fact, never category words: visible individual pores across the T-zone, nose, cheeks and forehead AND on all exposed skin (neck, jaw, ears, arms, hands), the pores on the lit side casting tiny directional micro-shadows from the key light; a believable skin reaction to the environment adapted to their skin tone (a faint thermal flush at the cheeks indoors, or light sun-warmth with a touch of micro-sweat sheen outdoors); one or two HONEST imperfections (a faint healing blemish, a barely-there old scar, asymmetric freckles or light pigmentation, fine vellus hair at the hairline); genuine facial asymmetry (one brow marginally higher, one nostril slightly narrower, an uneven cupid's bow); a satin sheen ONLY at the high points (nose tip, cheekbones, brow) with the rest matte and lived-in; subtle sensor noise in the shadows like a real phone camera. ZERO skin smoothing, ZERO airbrushing, no beauty filter, no waxy or plastic CGI skin, no uncanny porcelain glow, no over-sharpening.";
const SKIN_FACTS = HUMANISER;

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
    `Pose and expression: front-on to the camera, face and eyes looking straight into the lens, head level and upright. NOT looking up, NOT tilting the chin or head up, NOT gazing at the sky or off into the distance, NOT looking away from camera. A natural, un-posed candid moment. Hands relaxed at the sides or naturally occupied with the scene; NEVER a hand raised to the forehead, brow or face, never shielding or shading the eyes, never a hand-visor, never squinting into the sun.`,
    `Grooming: ${o.look}.`,
    camera,
    SKIN_FACTS,
    SCALE,
    `Wardrobe: ${CLOTHED}.`,
    `Constraints: ${aspectFraming(o.ratio)} ${ANTI_AI} ${SINGLE_FRAME}.`,
  ].join("\n\n");
}

// ── THE PRODUCER: a directed shot from a storyboard scene, coherent across the board.
// `worldAnchored` = a prior frame of the SAME world is supplied as an extra reference, so
// location, lighting and style stay continuous shot-to-shot (the "Popcorn"-style coherence).
export function buildShotPrompt(o: {
  location: string; blocking: string; shot: string; performance: string; role: string;
  subjectLine: string; look: string; refInstruction: string; ratio: string;
  hasPeople: boolean; worldAnchored: boolean;
}): string {
  return [
    "Photograph style: a real, candid documentary-style photo of the influencer living this exact moment in a real place, shot like a high-end social ad. Not a studio portrait, not a posed shot.",
    `Scene: ${o.location}. ${o.blocking}. The background is real and in sharp focus (never blurred), so the shot is reusable for video.`,
    o.worldAnchored ? "CONTINUITY: an additional reference image shows the ESTABLISHED world of this production; match its exact location, set dressing, lighting, time of day and colour grade so this shot cuts seamlessly with the others." : "",
    `Subject: ${o.subjectLine}. The influencer is physically IN the scene (${o.blocking}), never a floating head on a plain backdrop.`,
    `Identity:${o.refInstruction}`,
    `Framing: ${o.shot}.`,
    `Performance: ${o.performance}.`,
    `Grooming/wardrobe: ${o.look}. Keep the same outfit and styling as the established world for continuity.`,
    SKIN_FACTS,
    SCALE,
    o.hasPeople ? SCENE_PEOPLE : NO_EXTRAS,
    `Wardrobe: ${CLOTHED}.`,
    `Constraints: ${aspectFraming(o.ratio)} ${ANTI_AI} ${SINGLE_FRAME}.`,
  ].filter(Boolean).join("\n\n");
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
  "nude, naked, partial nudity, topless, underwear only, lingerie, no trousers, no pants, missing bottoms, bare crotch, exposed groin, blurred background, heavy bokeh, " +
  "hand shielding the eyes, hand raised to the forehead or brow, hand-visor over the eyes, shielding the face, squinting into the sun, " +
  "looking up, gazing upward, chin raised, head tilted back, looking at the sky, looking away from the camera, eyes off to the side, profile view, back to camera";

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
