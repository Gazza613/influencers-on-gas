// Hyper-realism master prompt (influencer-builder.md). Auto-applied to every
// identity + b-roll generation so people don't read as AI. The user only picks
// simple controls (setting, wardrobe); this scaffolding stays hidden.

// Non-negotiable: every subject is FULLY CLOTHED, a top covering the torso AND bottoms.
export const CLOTHED =
  "fully and appropriately dressed in a complete, tasteful outfit: a top covering the torso and chest (shirt, blouse, t-shirt, knit, or dress) AND FULL-LENGTH bottoms — long trousers, jeans, or a long (knee-length-or-below) skirt or a maxi dress that covers the legs down toward the ankles. Her LEGS ARE NEVER BARE: no shorts, no short skirts above the knee, no bare thighs, even when she is seated, cross-legged, leaning forward with elbows on knees, or kneeling — the trousers/long skirt clearly cover her legs in every pose. The chest and torso are always fully covered; never shirtless, topless, bare-chested, bare-legged, in underwear, shorts, swimwear, a towel, or nude";

// Single-frame guard, no collage / contact-sheet / split-panel outputs.
export const SINGLE_FRAME =
  "a single photograph, one continuous frame of one moment, NOT a collage, contact sheet, grid, diptych, triptych, split screen or multiple stacked panels";

// Background people: a FEW believable extras, naturally placed for THIS setting, each visibly
// DISTINCT (never clones), in a balanced diverse mix. Imperative so it isn't ignored.
export const SCENE_PEOPLE =
  "a FEW other people are present in the background (roughly two to five, not a packed crowd), placed naturally for THIS specific setting the way real people occupy it (for a cafe: seated at different tables, queuing loosely, walking past) and NEVER arranged in a uniform row or tidy line; " +
  "each background person is CLEARLY DISTINCT from the others, with a different age, build, hairstyle and a DIFFERENT outfit in different colours, doing a different natural activity; NEVER duplicate or near-duplicate people, and NEVER dress several of them in the same or matching clothing; " +
  "the mix is balanced and natural: roughly 55% white, 25% black, 12% coloured and 8% indian people, with an even 50/50 split of men and women across a range of ages; each rendered realistically, in sharp focus and at correct scale; " +
  "ABSOLUTE RULE ON COUPLES — background couples and pairs are welcome and natural, BUT any couple or pair (two people walking, sitting or standing together) MUST be the SAME race as each other (white+white, black+black, coloured+coloured, indian+indian). A mixed-race / interracial couple is STRICTLY FORBIDDEN — never pair two people of different races together as a couple. Same-race couples are encouraged; mixed-race couples are never allowed; " +
  "every background person is in a complete, tasteful outfit with a top and bottoms, never bare-legged, in underwear or swimwear";

// No EXTRAS = no incidental/background crowd. It must NOT delete people the scene explicitly asks
// for (e.g. "with her son"): "extras off" means no random bystanders, not "the influencer totally
// alone". Stated hard because image models love to populate public settings with crowds.
export const NO_EXTRAS =
  "No incidental or background people: no passersby, bystanders, crowd, diners, staff, silhouettes, reflections of strangers, or tiny/distant/blurred figures. ONLY the people explicitly named in the scene are present — if the scene names just the influencer, she is alone; if the scene names a companion (for example a child, son, daughter, partner, friend or colleague), include exactly those named people and NO others. If the location would normally be busy, show it quiet and free of strangers apart from the named subjects";

// Lock recurring supporting characters (a daughter, friend, colleague) to ONE fixed look + outfit so
// they don't shape-shift or change clothes between scenes. Matches the scene's `talent` names against
// the storyboard's supporting_cast and returns a clause naming exactly who is in THIS scene.
export function castLockClause(cast: { name: string; look: string }[], talent: string[]): string {
  if (!cast?.length || !talent?.length) return "";
  const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const tnorm = talent.map(norm).filter(Boolean);
  const inScene = cast.filter((c) => {
    const cn = norm(c.name);
    return cn && tnorm.some((t) => t.includes(cn) || cn.includes(t));
  });
  if (!inScene.length) return "";
  return "LOCKED SUPPORTING CAST — render these named companions with a FIXED, identical look in every scene they appear in (the same face, age, build and hair AND the exact same outfit and colours; never restyled, re-dressed, swapped, duplicated, and NEVER given the influencer's face): " +
    inScene.map((c) => `${c.name} — ${c.look}`).join("; ") + ". No people other than the influencer and these named companions.";
}

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
  role?: "a-roll" | "b-roll";
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
    o.role === "b-roll"
      ? `Pose and expression (B-ROLL — lifestyle/scene): a CANDID, un-posed moment — she is genuinely DOING something in the scene (walking through it, using her phone, sipping a coffee, browsing, glancing around), NOT posing and NOT staring into the lens. She may look at what she's doing, to the side, or mid-action; relaxed, lived-in body language as if unaware of the camera. Hands naturally occupied with the activity; never a hand-visor or shielding the eyes.`
      : `Pose and expression (A-ROLL — presenter): front-on to the camera, face and eyes looking straight into the lens, head level and upright, a warm natural talking-to-camera moment (as if speaking to the viewer). NOT looking up, NOT tilting the chin up, NOT gazing off into the distance, NOT looking away. Hands relaxed or gesturing naturally; NEVER a hand raised to the forehead/brow/face, never shielding or shading the eyes, never a hand-visor, never squinting into the sun.`,
    `Grooming: ${o.look}.`,
    camera,
    SKIN_FACTS,
    SCALE,
    `Wardrobe: ${CLOTHED}. Her clothing is PLAIN with NO branding: absolutely no brand logos, company names, sponsor marks, slogans or printed text on any garment (never put a real brand such as MTN on what she wears). Any brand appears only as a separate overlay added later, never printed on her clothes.`,
    `Constraints: ${aspectFraming(o.ratio)} ${ANTI_AI} ${SINGLE_FRAME}.`,
  ].join("\n\n");
}

// Focused negative for PRODUCER shots/video keyframes. Deliberately omits the pose-specific
// negatives in REALISM_NEGATIVE (looking away, profile, back-to-camera) because b-roll blocking
// legitimately uses those — but hard-blocks the rules that kept slipping into the shots.
export const SHOT_NEGATIVE =
  "mixed-race couple, interracial couple, two people of different races shown together as a pair or walking side by side; " +
  "a second copy, twin, clone or look-alike of the influencer; duplicated or identical background people; matching/uniform outfits on extras; " +
  "moles, beauty marks, prominent facial moles, moles on the chest/neck/décolletage; " +
  "plastic or waxy skin, airbrushed, beauty-filtered, doll-like, CGI or 3D-render look; " +
  "editorial fashion-shoot look, studio portrait, professional model headshot, glamour shot, magazine cover, polished commercial advert, 8K, ultra-detailed, hyper-detailed, flawless, perfectly symmetrical face, glossy beauty render; " +
  "nudity, underwear, swimwear, shorts, short skirt, bare thighs, bare legs, bare-legged while seated, missing trousers or missing clothing; split-screen, diptych, triptych, collage, grid or stacked panels; " +
  "brand logos, company names, sponsor marks, slogans or printed text on her clothing or garments (a real brand such as MTN must never appear on what she wears)";

// ── THE PRODUCER: a directed shot from a storyboard scene, coherent across the board.
// `worldAnchored` = a prior frame of the SAME world is supplied as an extra reference, so
// location, lighting and style stay continuous shot-to-shot (the "Popcorn"-style coherence).
export function buildShotPrompt(o: {
  location: string; blocking: string; shot: string; performance: string; role: string;
  subjectLine: string; look: string; refInstruction: string; ratio: string;
  hasPeople: boolean; worldAnchored: boolean;
}): string {
  return [
    "Photograph style: a real, candid photo of the influencer living this exact moment, CAPTURED ON A PHONE — iPhone 16 Pro main lens, handheld at a natural height, automatic exposure and focus, faint natural sensor noise in the shadows and a touch of lens distortion at the edges. NOT a studio camera, NOT studio lighting, NOT a posed studio portrait — it reads like a real moment a friend caught on their phone, never a glossy AI render.",
    "CRITICAL — ONE FRAME, ONE ANGLE: output a SINGLE continuous photograph from ONE camera angle of ONE moment, filling the whole frame edge to edge. It is ONE framing only — do NOT combine a close-up with a wider shot, and do NOT stack or place two views together top-and-bottom or side-by-side. If the direction below lists several shots, cuts, framings or moments (e.g. 'close-up of hands… then a wider shot', 'three rapid cuts', 'over-the-shoulder and coffee-table shots'), choose ONLY the single most important one and render that alone. ABSOLUTELY NEVER a split-screen, diptych, triptych, grid, collage, stacked panels, top/bottom halves or side-by-side images.",
    "CRITICAL — EVERYONE FULLY CLOTHED, LEGS COVERED: the influencer AND every other person (including seated, partial and background people) wears a COMPLETE everyday outfit — a top covering the torso PLUS FULL-LENGTH bottoms (long trousers, jeans, or a long skirt) that clearly cover the legs toward the ankles, plus footwear. NO shorts, NO short skirts, NO bare thighs, NO bare legs — even when seated, cross-legged, or leaning forward with elbows on knees, the trousers fully cover the legs. Nobody is in underwear, a towel, half-dressed, or missing their trousers. If a person's lower half is anywhere in frame, it is in full-length trousers. This is non-negotiable.",
    "CRITICAL — DISTINCT EXTRAS: every background/other person wears a clearly DIFFERENT outfit in different colours and a different style — no two people are dressed alike, in matching, similar or near-identical clothing (not all in white/beige tees, not a uniform look). Vary their ages, builds, hairstyles and what they are doing, so they read as real, individual strangers, never a styled set.",
    `Scene: ${o.location}. ${o.blocking}. The background is real and in sharp focus (never blurred), so the shot is reusable for video.`,
    o.worldAnchored ? "CONTINUITY: an additional reference image shows the ESTABLISHED world of this production; match its exact location, set dressing, lighting, time of day and colour grade so this shot cuts seamlessly with the others." : "",
    `Subject: ${o.subjectLine}. The influencer is physically IN the scene (${o.blocking}), never a floating head on a plain backdrop. She appears EXACTLY ONCE in the frame: there is only one of her. Every background person is a clearly DIFFERENT individual — NEVER a second copy, twin, reflection or look-alike of the influencer.`,
    `Identity:${o.refInstruction}`,
    o.role === "a-roll"
      ? `Framing: ${o.shot}. CRITICAL A-ROLL FRAMING — this is a TIGHT presenter shot: frame her from roughly mid-chest up (a medium close-up), with her FACE LARGE and dominant in the frame (filling a good portion of it) so her exact identity from the reference images is unmistakable and holds. Do NOT render a full-body, full-length, wide or long shot; her legs and feet are NOT in frame and she is never small or distant. ONE single framing of ONE camera angle only.`
      : `Framing: ${o.shot}. B-ROLL FRAMING — a CANDID, OBSERVED scene (not a piece to camera): she is a clear, PROMINENT subject (a medium shot, her face plainly visible and identifiable in a natural three-quarter angle so her locked identity holds), BUT she is NOT looking at or talking to the camera — her attention is on her activity, her phone or her companions, with NO eye-contact with the lens and never mid-speech to camera. NO other person in the frame looks at or addresses the camera either; everyone is naturally absorbed in the moment as if unaware of it. ONE single framing of ONE camera angle only — never a close-up combined with a wider shot, and never two views stacked together.`,
    `Performance: ${o.performance}.`,
    `Grooming/wardrobe: ${o.look}. Keep the same outfit and styling as the established world for continuity.`,
    SKIN_FACTS,
    SCALE,
    o.hasPeople ? SCENE_PEOPLE : NO_EXTRAS,
    o.role === "a-roll" ? "SOLO PRESENTER SHOT: the influencer is the ONLY person anywhere in the frame — no friends, companions, bystanders, reflections or background people of ANY kind, even distant or blurred. Just her talking to camera against a simple, softly out-of-focus background. NEVER add anyone the direction did not explicitly request." : "",
    `Wardrobe: ${CLOTHED}.`,
    `Constraints: ${aspectFraming(o.ratio)} ${ANTI_AI} ${SINGLE_FRAME}.`,
    `Avoid entirely (do NOT depict any of these): ${SHOT_NEGATIVE}.`,
  ].filter(Boolean).join("\n\n");
}

// ── Canonical identity reference set (archive gem). Generated once from the chosen face
// and reused as forensic @image refs in every creative. @image1 = the chosen face. ──────
export function buildIdentityCardPrompt(): string {
  return "A clean studio identity headshot, like a casting reference card. @image1 is the person, replicate their face EXACTLY: facial bone structure, face shape, eye shape and colour, brow arch, nose, lip shape, skin tone and texture, freckles, moles and natural asymmetries. Front on, head level, looking straight into the lens, neutral relaxed expression, head and shoulders. Clean seamless pale-grey background, soft even two-softbox lighting, subtle catchlights, real visible pore texture, zero retouching. One real photograph. " + CLOTHED + ".";
}
export function buildFeatureSheetPrompt(): string {
  return "A clinical beauty feature reference sheet on a pure white background, six equal panels in a clean grid with white gutters. Replicate the person in @image1 EXACTLY. Above each panel print its label in bold black uppercase sans-serif, using EXACTLY these label words and nothing else (do not invent, translate or change any label): \"EYES\", \"BROWS\", \"LIPS\", \"SKIN\", \"HAIR\", \"HANDS\". Panel contents in that order: EYES = extreme macro of both irises; BROWS = brow shape and arch; LIPS = lip shape and natural colour; SKIN = macro cheek skin showing pores; HAIR = close-up of hair strands; HANDS = a hand showing nails and knuckle skin. Each label sits above its matching panel. Ultra-sharp photoreal macro detail, raw skin detail, zero retouching.";
}
export function buildTurnaroundPrompt(): string {
  return "A full-body character turnaround sheet on a pure white seamless background, soft even flat studio lighting. Four equal full-body panels in one row labelled FRONT VIEW, SIDE VIEW, BACK VIEW, THREE-QUARTER VIEW. Replicate the person in @image1 EXACTLY across all four panels: identical face, body, proportions, skin tone and hair, and the same outfit in every panel. Photoreal, raw skin detail, zero retouching. " + CLOTHED + ".";
}

export const REALISM_NEGATIVE =
  "plastic or waxy skin, airbrushed, over-smoothed, beauty-filter, doll-like, CGI or 3D-render look, " +
  "uncanny symmetry, oversaturated, glossy plastic highlights, HDR halo, over-sharpened, excessive makeup, mannequin, " +
  "nude, naked, partial nudity, topless, underwear only, lingerie, no trousers, no pants, missing bottoms, bare crotch, exposed groin, blurred background, heavy bokeh, " +
  "hand shielding the eyes, hand raised to the forehead or brow, hand-visor over the eyes, shielding the face, squinting into the sun, " +
  "looking up, gazing upward, chin raised, head tilted back, looking at the sky, looking away from the camera, eyes off to the side, profile view, back to camera, " +
  "moles, beauty marks, prominent or dark facial moles, raised moles, mole clusters, a mole on the nose, lip, cheek or forehead, large beauty spots, moles on the chest, neck or décolletage, exaggerated or distracting skin marks, blemishes on the chest, " +
  "mixed-race couple, interracial couple, mixed-race pair walking together, a couple of two different ethnicities, a couple of two different races";

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
