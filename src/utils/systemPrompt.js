// ── Helpers ───────────────────────────────────────────────────
const R = arr => arr[Math.floor(Math.random() * arr.length)]

// ── Time / lighting configurations ───────────────────────────
const TIME_CONFIGS = [
  {
    label: 'golden hour late afternoon',
    lighting: 'late afternoon sun hitting from behind-right — warm golden light rimming the hair and the lit cheek, open sky filling the shadow side in cooler bluish tones. Both temperatures visible on the face at the same time. The kind of accidental perfect light you get outside around 5pm.',
  },
  {
    label: 'overcast soft daylight',
    lighting: 'solid overcast sky diffusing everything into even, directionless softness — no hard shadows anywhere, just gentle top-down modeling from the brightest patch of cloud. Cool and neutral throughout. Flat but honest.',
  },
  {
    label: 'bright sunny mid-morning',
    lighting: 'direct mid-morning sun from the front-left — hard, honest daylight with a clear nose shadow and a bright lit side. The shadow side filled by open blue sky. Exactly the kind of full-sun look an iPhone captures with auto exposure outdoors.',
  },
  {
    label: 'blue-hour dusk',
    lighting: 'sun already down — a warm sodium streetlamp from camera-left is the main light, directional and orange. The open sky fills the shadow side in deep cool blue. A nearby shopfront or neon sign catches the hair from behind. Three natural color sources on the face simultaneously, all because of where she is standing.',
  },
  {
    label: 'soft indoor afternoon window',
    lighting: 'afternoon daylight coming through a large window to camera-left — the near cheek lit and warm, falling off across the shadow side. Warm overhead room lighting fills the shadows gently. Window light and ambient room fill present at the same time. Natural, found, not arranged.',
  },
  {
    label: 'morning indoor café',
    lighting: 'window to the right letting in morning daylight as the main light source — warm overhead café bulbs secondary, faint cool screen or phone glow on the shadow side. Three natural light sources visible on the face because of where she\'s sitting, not because anything was set up.',
  },
]

function getTimesForNiche() {
  return TIME_CONFIGS
}

// ── Soul-safe poses — simple natural descriptions Soul can follow ─
// Higgsfield Soul struggles with detailed spatial pose instructions,
// so these strip body-angle / weight / hand geometry down to a natural feel cue.
const POSES_SOUL = {
  facing: prop => `standing upright facing the camera, body straight and balanced, shoulders level, ${prop ? `${prop} held loosely at the side in one hand` : 'arms relaxed at the sides'} — calm and simple, not leaning, not posed`,
  angled: prop => `standing upright with the body turned slightly toward the camera, balanced and straight, ${prop ? `${prop} held naturally in one hand at the side` : 'shoulders relaxed, arms at sides'} — simple and still, not leaning forward, not posed`,
  candid: prop => `standing upright and looking toward the camera with a calm, natural expression, ${prop ? `${prop} held loosely in one hand at the side` : 'body balanced and still, arms relaxed'} — simple presence, not leaning, not mid-motion, not posed`,
}

// ── Pose — driven by personality slider ──────────────────────
const POSES = {
  frontfacing: prop => `body facing directly toward camera, weight shifted onto one leg for a subtle hip tilt — relaxed, not stiff. ${prop ? `${prop} held naturally in front of the body, cradled loosely in both hands at mid-chest` : 'arms relaxed at the sides or one hand resting loosely near the hip, fingers natural'}. Eyes meeting the lens directly with a quiet, present expression — not forced, not a performance. The "comfortable in front of the camera" framing. Face fully visible and front-lit.`,
  contemplative: prop => `body facing 45° away from camera, weight forward on one leg. ${prop ? `${prop} held loosely at the side, almost forgotten` : 'hands relaxed loosely in front, fingers barely interlaced'}. Head turned back toward the lens mid-thought, eyes glancing toward but not fully meeting it — somewhere else mentally. A quiet, inward expression — not performing.`,
  plandid: prop => `body angled 25–30° to camera, weight settled on the back leg, hips slightly offset. ${prop ? `${prop} held naturally in one hand, wrist relaxed` : 'one hand mid-loose-gesture near the hip, the other hanging naturally'}. Eyes glancing down-and-off-axis, 15° away from lens. Expression caught mid-thought — a specific private moment. The "noticed the camera half a second ago" framing.`,
  posed_cute: prop => `body in soft 3/4 angle to camera, shoulders relaxed and slightly dropped. ${prop ? `${prop} held in both hands at chest height, elbows soft` : 'one hand gently touching the side of the jaw, fingers loose and natural'}. Eyes meeting the lens with a quiet small expression — a half-smile just forming, not fully committed. Posing but acting like she isn't.`,
  candid: prop => `mid-action — caught at the apex of ${prop && DRINK_PROP_PATTERN.test(prop) ? `bringing the ${prop} toward the mouth, mid-sip, body naturally leaning slightly forward` : 'a genuine mid-laugh or bright spontaneous expression, body and shoulders caught in motion, one hand mid-gesture near the chest'}. Eyes looking directly toward the lens — spontaneous, unguarded eye contact full of real energy. Not posed, not looking away — the camera caught them in a real moment while they were already looking at it.`,
}

function getPoseFromPersonality(p) {
  if (p < 28) return POSES.contemplative
  if (p < 50) return POSES.plandid
  if (p < 70) return Math.random() > 0.5 ? POSES.plandid : POSES.posed_cute
  return Math.random() > 0.5 ? POSES.candid : POSES.posed_cute
}

// ── Wardrobe library ──────────────────────────────────────────
// Each entry: { text, gender, tags, energy (0–100), niches }
// energy: 0 = most understated/quiet, 100 = most bold/expressive
// Personality slider maps directly to energy range — this is what makes it "deeper than pose"
//
// Tag families:
//   quiet, minimalist, clean, structured, editorial
//   casual, urban, street, dark, moody
//   earthy, natural, bohemian, cottagecore
//   y2k, playful, nostalgic
//   glam, bold, evening
//   sport, functional, active
//   preppy, classic, polished

const WARDROBE = [
  // ── FEMALE ──────────────────────────────────────────────────
  // Quiet / understated (energy 0–20)
  { gender: 'female', energy: 5,  tags: ['quiet','minimalist','natural'],
    niches: ['fashion','lifestyle','travel','any'],
    text: 'Oversized linen shirt worn as a dress, belted loosely at the waist with a thin leather cord, hem falling mid-thigh; bare legs; flat leather mule — no jewelry, no logos visible' },
  { gender: 'female', energy: 10, tags: ['quiet','minimalist','clean'],
    niches: ['fashion','beauty','lifestyle','any'],
    text: 'Wide-leg linen trousers, slightly cropped at the ankle; fine-knit long-sleeve top tucked in; no accessories; clean leather slide — no logos visible' },
  { gender: 'female', energy: 12, tags: ['quiet','minimalist','structured'],
    niches: ['fashion','tech','finance','lifestyle'],
    text: 'Soft oversized turtleneck, hem just untucked; wide-leg tailored trousers, clean break; worn-in leather loafer — no accessories, no logos visible' },
  { gender: 'female', energy: 18, tags: ['quiet','glam','minimalist'],
    niches: ['fashion','lifestyle','any'],
    text: 'Slip dress in heavy satin, midi length, thin straps, no jewelry; flat leather thong sandal — no logos visible' },

  // Understated with one intentional element (energy 20–40)
  { gender: 'female', energy: 22, tags: ['editorial','minimalist','structured'],
    niches: ['fashion','tech','finance'],
    text: 'Oversized blazer worn as a top, one button fastened, no shirt visible underneath; wide-leg trousers; clean pointed-toe leather flat — one thin gold chain, the only jewelry — no logos visible' },
  { gender: 'female', energy: 28, tags: ['clean','minimalist','casual'],
    niches: ['lifestyle','fashion','any'],
    text: 'Straight-leg denim, clean hem; fitted ribbed tank top tucked in; two thin layered delicate gold chains at the collarbone; clean low-top leather sneakers — no logos visible' },
  { gender: 'female', energy: 30, tags: ['quiet','minimalist','casual'],
    niches: ['lifestyle','travel','fashion'],
    text: 'Worn oversized cashmere crewneck sweater, slightly pilling at the cuffs; slim straight denim; clean leather loafer; small pebbled leather crossbody — no logos visible' },
  { gender: 'female', energy: 35, tags: ['minimalist','clean','travel'],
    niches: ['travel','lifestyle','fashion'],
    text: 'Linen shirt, collar open, sleeves slightly rolled once at the forearm; high-waist straight-leg linen trousers, clean hem; leather strappy sandal, minimal ankle strap — no logos visible' },
  { gender: 'female', energy: 38, tags: ['preppy','classic','polished'],
    niches: ['fashion','lifestyle','tech'],
    text: 'Fitted polo shirt, collar up slightly; high-waist straight-leg chino; leather sneaker, clean; a single thin gold band ring — no logos visible' },

  // Balanced / versatile (energy 40–60)
  { gender: 'female', energy: 42, tags: ['casual','clean','urban'],
    niches: ['lifestyle','travel','any'],
    text: 'Oversized vintage-wash tee, neckline slightly relaxed, tucked loosely at the front; high-waist straight-leg denim; low-top canvas shoe, faintly scuffed — no logos visible' },
  { gender: 'female', energy: 45, tags: ['minimalist','structured','clean'],
    niches: ['fashion','lifestyle','tech'],
    text: 'Fitted ribbed mock-neck top; tailored wide-leg trousers, clean hem; minimal leather loafer; a thin gold bracelet — no logos visible' },
  { gender: 'female', energy: 48, tags: ['earthy','casual','natural'],
    niches: ['lifestyle','travel','any'],
    text: 'Well-worn straight-leg medium-wash denim; linen shirt tucked in, collar open; small simple gold hoop earrings; clean sneaker — no logos visible' },
  { gender: 'female', energy: 52, tags: ['casual','quiet','cottagecore'],
    niches: ['lifestyle','any'],
    text: 'Long open cardigan in soft knit over a simple fitted tee; straight-leg jeans; leather low sneaker; a thin woven cord bracelet — no logos visible' },
  { gender: 'female', energy: 55, tags: ['bohemian','earthy','natural'],
    niches: ['travel','lifestyle','wellness'],
    text: 'Flowy midi dress in lightweight gauze or crinkled cotton, slightly tiered skirt, adjustable thin straps; flat leather sandal worn soft at the footbed; layered cord and thin beaded bracelets on both wrists, a simple thin pendant necklace — no logos visible' },
  { gender: 'female', energy: 58, tags: ['clean','casual','sport'],
    niches: ['fitness','lifestyle','any'],
    text: 'Oversized cotton hoodie, slightly cropped, hood down; bike shorts; thick-sole trainer; small silver hoop earrings — no logos visible' },

  // Personality pieces emerging (energy 60–80)
  { gender: 'female', energy: 62, tags: ['editorial','urban','street'],
    niches: ['fashion','entertainment','lifestyle'],
    text: 'Fluid-cut collarless oversized blazer worn open over a fitted ribbed bodysuit or tank; clean straight-leg tailored trousers in a contrasting neutral; pointed-toe leather mule, slight block heel; one sculptural resin or stone ring — no logos visible' },
  { gender: 'female', energy: 65, tags: ['y2k','casual','playful'],
    niches: ['lifestyle','entertainment','fashion'],
    text: 'Y2K-adjacent low-rise straight-leg medium-wash denim; fitted ribbed halter top; a thin silver chain belt; clean low-top sneaker — no logos visible' },
  { gender: 'female', energy: 68, tags: ['earthy','bohemian','natural'],
    niches: ['travel','lifestyle','fashion'],
    text: 'Wrap blouse in lightweight viscose, tied at the front, slightly billowing at the sleeves; high-waist wide-leg denim; leather wedge espadrille; two thin layered necklaces — no logos visible' },
  { gender: 'female', energy: 72, tags: ['dark','moody','street'],
    niches: ['entertainment','fashion','lifestyle'],
    text: 'Oversized faded graphic tee, neckline slightly wide, tucked at the front into high-waist straight-leg denim with subtle knee distress; chunky platform boot, zip detail at ankle; a worn leather cuff — no logos visible' },
  { gender: 'female', energy: 75, tags: ['casual','street','y2k'],
    niches: ['lifestyle','entertainment','fashion'],
    text: 'Cropped raw-edge denim jacket worn open over a fitted ribbed tank; high-waist flared denim; a simple thin leather belt; clean vintage leather sneaker — no logos visible' },
  { gender: 'female', energy: 78, tags: ['editorial','structured','polished'],
    niches: ['fashion','finance','tech'],
    text: 'Sharply tailored double-breasted blazer with a strong shoulder, worn as the only top layer; matching wide-leg trouser; clean pointed-toe leather oxford; a single architectural earring — no logos visible' },

  // Bold / expressive (energy 80–100)
  { gender: 'female', energy: 82, tags: ['glam','editorial','bold'],
    niches: ['fashion','entertainment'],
    text: 'Faux-fur trim coat, worn open; fitted ribbed turtleneck underneath; straight tailored trousers; pointed-toe ankle boot; statement oversized resin drop earrings — no logos visible' },
  { gender: 'female', energy: 88, tags: ['editorial','bold','structured'],
    niches: ['fashion'],
    text: 'Wide-leg trousers in structured crepe; matching blazer worn open over a barely-there bralette; sculptural square-toe block heel; one architectural cuff — no logos visible' },
  { gender: 'female', energy: 92, tags: ['editorial','dark','glam'],
    niches: ['fashion','entertainment'],
    text: 'Sheer organza blouse, buttons to the collar, translucent over a bralette; wide-leg tailored trousers; strappy heeled sandal; a single large sculptural resin ring — no logos visible' },
  { gender: 'female', energy: 96, tags: ['bold','playful','editorial'],
    niches: ['fashion','entertainment'],
    text: 'Cropped structured blazer worn open, no top underneath; wide-leg tailored trouser; pointed-toe leather kitten heel; a stack of thin gold rings — no logos visible' },

  // Dressy / glam at medium energy
  { gender: 'female', energy: 48, tags: ['glam','evening','polished'],
    niches: ['fashion','lifestyle','entertainment','any'],
    text: 'Satin slip midi dress, thin adjustable straps, fabric draping softly at the hip with a subtle liquid sheen; dainty thin-strap sandal; two delicate layered chains at the collarbone — no logos visible' },
  { gender: 'female', energy: 56, tags: ['glam','editorial','structured'],
    niches: ['fashion','entertainment','lifestyle'],
    text: 'Tailored blazer dress, single-button, hitting mid-thigh with slight shoulder structure; sheer tights; pointed-toe kitten heel; a simple gold bracelet — no logos visible' },
  { gender: 'female', energy: 62, tags: ['glam','evening','polished'],
    niches: ['fashion','entertainment','any'],
    text: 'Fitted ribbed knit midi dress with a modest scoop neckline; strappy heeled sandal; thin layered gold chains and small sculptural gold hoops — no logos visible' },
  { gender: 'female', energy: 70, tags: ['glam','bold','evening'],
    niches: ['fashion','entertainment'],
    text: 'Silky wrap midi dress, thin tie at the waist, the fabric catching light as she moves; pointed-toe strappy heeled sandal; gold drop earrings and a single thin chain — no logos visible' },

  // Dark & Moody (expanded) — all entries embed explicit dark colors so Soul model renders correctly
  { gender: 'female', energy: 60, tags: ['dark','moody','structured'],
    niches: ['fashion','entertainment','lifestyle'],
    text: 'Fitted ribbed all-black turtleneck, long sleeve; high-waist wide-leg tailored trousers in black or deep charcoal; pointed-toe ankle boot in black leather; a single thin silver chain at the collarbone — no logos visible' },
  { gender: 'female', energy: 65, tags: ['dark','moody','editorial'],
    niches: ['fashion','entertainment'],
    text: 'Midi-length slip-style dress in deep black matte satin, thin straps, fabric skimming the body closely; barely-there heeled sandal in black; a thin silver chain stacked with a small drop pendant — no logos visible' },
  { gender: 'female', energy: 78, tags: ['dark','moody','street'],
    niches: ['fashion','entertainment','lifestyle'],
    text: 'Oversized structured black leather-look jacket, slightly stiff at the shoulder; fitted ribbed black midi skirt underneath; chunky black lug-sole boot; no jewelry — no logos visible' },
  { gender: 'female', energy: 85, tags: ['dark','moody','editorial'],
    niches: ['fashion','entertainment'],
    text: 'Long draped overcoat in black or deep charcoal, minimal lapel, worn open or loosely belted; slim-cut trousers in the same dark tone; sleek pointed-toe boot in black leather; one architectural sculptural ring — no logos visible' },

  // Cottagecore (expanded)
  { gender: 'female', energy: 30, tags: ['cottagecore','natural','earthy'],
    niches: ['lifestyle','any'],
    text: 'Flowy midi-length printed cotton dress, fitted at the chest with a square neckline and soft gathered skirt; flat leather sandal with a simple strap; small delicate stud earrings — no logos visible' },
  { gender: 'female', energy: 42, tags: ['cottagecore','earthy','quiet'],
    niches: ['lifestyle','any'],
    text: 'Linen pinafore dress, adjustable shoulder straps, worn over a long-sleeve fitted top; simple leather mule; small woven basket bag — no logos visible' },
  { gender: 'female', energy: 55, tags: ['cottagecore','natural','bohemian'],
    niches: ['lifestyle','any'],
    text: 'Puff-sleeve cotton blouse with smocking at the wrists, collar slightly open; high-waist straight-leg denim; leather ankle boot, round-toe; a small delicate crossbody bag — no logos visible' },
  { gender: 'female', energy: 65, tags: ['cottagecore','earthy','editorial'],
    niches: ['lifestyle','fashion'],
    text: 'Prairie-style cotton midi dress with a fitted bodice, long flowing skirt, and small puffed sleeves; leather loafer or low boot; thin layered necklaces, dainty and botanical in feel — no logos visible' },

  // Coastal (female)
  { gender: 'female', energy: 25, tags: ['coastal','natural','quiet'],
    niches: ['lifestyle','travel','any'],
    text: 'Wide-leg linen trousers, slightly relaxed; simple fitted ribbed tank, thin straps; flat leather sandal, worn soft; no jewelry — no logos visible' },
  { gender: 'female', energy: 42, tags: ['coastal','natural','casual'],
    niches: ['lifestyle','travel','any'],
    text: 'Linen button-down shirt, oversized and half-tucked, sleeves rolled high; straight-leg denim cut-offs, frayed hem at mid-thigh; flat leather slide; thin woven cord anklet — no logos visible' },
  { gender: 'female', energy: 58, tags: ['coastal','natural','earthy'],
    niches: ['lifestyle','travel','fashion'],
    text: 'Lightweight crochet cover-up worn over a simple ribbed bralette, hem hitting mid-thigh; flat woven sandal; layered cord and natural-material necklaces — no logos visible' },
  { gender: 'female', energy: 72, tags: ['coastal','natural','bohemian'],
    niches: ['lifestyle','travel','fashion'],
    text: 'Flowy wrap midi skirt in lightweight woven fabric, tied at the hip; fitted linen crop top; strappy flat sandal; layered shell and cord jewellery, sun-worn and natural — no logos visible' },

  // Fitness/sport — gym context
  { gender: 'female', energy: 30, tags: ['sport','functional','clean'],
    niches: ['fitness','wellness','lifestyle'],
    text: 'Seamless sports bra with subtle vertical ribbing; matching high-waist compression leggings, slight sheen at the hip; clean training shoe — no logos visible' },
  { gender: 'female', energy: 40, tags: ['sport','earthy','natural'],
    niches: ['fitness','wellness','lifestyle'],
    text: 'Seamless sports bra with subtle cross-back detail; matching high-waist compression leggings; trail-running shoe — no logos visible' },
  { gender: 'female', energy: 50, tags: ['sport','clean','natural'],
    niches: ['fitness','wellness','lifestyle'],
    text: 'Matching set: ribbed high-neck sports bra and high-waist leggings; clean low-profile trainer; small pearl stud earrings — no logos visible' },
  { gender: 'female', energy: 65, tags: ['sport','earthy','casual'],
    niches: ['fitness','wellness','lifestyle'],
    text: 'Sports bra with wide straps; matching full-length high-waist leggings; clean gum-sole running shoe — a thin gold chain necklace — no logos visible' },

  // Athleisure — sporty vibe for non-gym lifestyle contexts
  { gender: 'female', energy: 48, tags: ['sport','casual','clean'],
    niches: ['lifestyle','fashion','any'],
    text: 'Wide-leg track pants in soft jersey fabric, slight sheen; fitted ribbed crop top with thin straps; clean low-profile trainer; small gold hoops — no logos visible' },
  { gender: 'female', energy: 55, tags: ['sport','casual','urban'],
    niches: ['lifestyle','fashion','any'],
    text: 'Pleated tennis mini skirt; fitted ribbed athletic tank, thin straps; clean low-top leather sneaker; a thin chain necklace — no logos visible' },
  { gender: 'female', energy: 62, tags: ['sport','casual','street'],
    niches: ['lifestyle','fashion','entertainment','any'],
    text: 'Fitted zip-up track jacket, zipped halfway; matching wide-leg track pants; chunky clean trainer; small hoop earrings — no logos visible' },
  { gender: 'female', energy: 75, tags: ['sport','casual','playful'],
    niches: ['lifestyle','fashion','entertainment','any'],
    text: 'Pleated tennis mini skirt; fitted cropped athletic zip-up, zipped halfway; clean chunky-sole trainer; small gold hoops — no logos visible' },
  { gender: 'female', energy: 85, tags: ['sport','casual','bold'],
    niches: ['lifestyle','fashion','entertainment'],
    text: 'Pleated micro tennis mini skirt; fitted cropped graphic athletic tee, slightly oversized at the shoulder; bold chunky trainer with a thick sole; stacked thin gold chains — no logos visible' },

  // ── MALE ────────────────────────────────────────────────────
  // Quiet / understated (energy 0–20)
  { gender: 'male', energy: 8,  tags: ['quiet','minimalist','natural'],
    niches: ['fashion','lifestyle','travel','any'],
    text: 'Washed linen overshirt, all buttons done, sleeves folded; loose straight-leg trousers; leather sandal; no accessories — no logos visible' },
  { gender: 'male', energy: 15, tags: ['quiet','minimalist','clean'],
    niches: ['fashion','tech','finance','lifestyle'],
    text: 'Soft cotton crewneck sweater, slightly oversize; straight-leg wool-blend trousers, clean break at the ankle; clean leather low sneaker — no logos visible' },
  { gender: 'male', energy: 18, tags: ['quiet','structured','minimalist'],
    niches: ['tech','finance','fashion'],
    text: 'Fine-knit turtleneck; tailored straight-leg dark trousers; clean leather oxford; no accessories — no logos visible' },

  // Understated with one intentional element (energy 20–40)
  { gender: 'male', energy: 25, tags: ['minimalist','earthy','casual'],
    niches: ['lifestyle','travel','fashion'],
    text: 'Unstructured linen jacket worn open; fitted tee underneath; slim straight denim; leather loafer — no logos visible' },
  { gender: 'male', energy: 30, tags: ['minimalist','quiet','preppy'],
    niches: ['tech','finance','lifestyle'],
    text: 'Soft quarter-zip merino sweater; slim straight chino; clean low-profile sneaker; a simple stainless steel watch — no logos visible' },
  { gender: 'male', energy: 35, tags: ['casual','clean','natural'],
    niches: ['lifestyle','travel','any'],
    text: 'Relaxed-fit linen button-down, collar open, tucked at front only; straight-leg medium-wash denim; clean suede chukka — no logos visible' },
  { gender: 'male', energy: 38, tags: ['preppy','classic','clean'],
    niches: ['lifestyle','fashion','tech'],
    text: 'Relaxed Oxford shirt, collar open one button; slim straight-leg chino; clean leather low sneaker — a single thin woven bracelet — no logos visible' },

  // Balanced (energy 40–60)
  { gender: 'male', energy: 42, tags: ['casual','clean','urban'],
    niches: ['any'],
    text: 'Heavyweight cotton tee, crew neck slightly relaxed from washing; well-worn straight-leg dark denim; clean low-profile trainer — no logos visible' },
  { gender: 'male', energy: 45, tags: ['casual','dark','urban'],
    niches: ['lifestyle','fashion','entertainment'],
    text: 'Washed overshirt worn open over a fitted tee; slim straight dark jeans; clean leather low sneaker — no logos visible' },
  { gender: 'male', energy: 50, tags: ['earthy','casual','natural'],
    niches: ['lifestyle','travel'],
    text: 'Soft relaxed-fit shirt, collar open two buttons, sleeves rolled; straight-leg chino; leather loafer — no logos visible' },
  { gender: 'male', energy: 55, tags: ['minimalist','casual','clean'],
    niches: ['lifestyle','any'],
    text: 'Relaxed-fit linen shirt, collar open, slightly untucked; straight-leg denim; clean canvas slip-on; no accessories — no logos visible' },

  // Dark & Moody (male) — all entries embed explicit dark colors so Soul model renders correctly
  { gender: 'male', energy: 55, tags: ['dark','moody','casual'],
    niches: ['lifestyle','entertainment','fashion'],
    text: 'Oversized ribbed crewneck sweater in black or deep charcoal, relaxed fit, hem sitting at the hip; dark straight-leg denim; clean black leather low sneaker; a worn thin leather cord bracelet — no logos visible' },

  // Personality pieces (energy 60–80)
  { gender: 'male', energy: 62, tags: ['street','urban','casual'],
    niches: ['fashion','entertainment','lifestyle'],
    text: 'Washed oversized heavyweight jersey crewneck, dropped shoulder seam; straight-leg dark denim, clean hem; clean low-profile leather sneakers, toe box faintly creased — no logos visible' },
  { gender: 'male', energy: 68, tags: ['urban','casual','dark'],
    niches: ['lifestyle','travel','entertainment'],
    text: 'Waxed canvas overshirt, collar slightly popped; fitted tee underneath; slim straight dark denim; clean leather low sneaker; a worn thin leather cord necklace — no logos visible' },
  { gender: 'male', energy: 72, tags: ['street','y2k','urban'],
    niches: ['fashion','entertainment'],
    text: 'Wide-leg carpenter denim with subtle hardware at the thigh pocket; oversized washed tee, hem asymmetric; clean chunky trainer; a thin chain around the neck — no logos visible' },
  { gender: 'male', energy: 75, tags: ['street','casual','urban'],
    niches: ['lifestyle','entertainment'],
    text: 'Oversized washed crewneck hoodie, drawstrings slightly uneven; wide-leg sweatpant, tapered at the ankle; clean low-top canvas shoe; a small hoop earring — no logos visible' },
  { gender: 'male', energy: 78, tags: ['editorial','structured','dark'],
    niches: ['fashion','entertainment'],
    text: 'Long black overcoat in a heavy wool-blend, collar turned up; fitted black turtleneck; slim straight trouser in the same dark tone; clean leather chelsea boot in black; no accessories — no logos visible' },

  // Bold / expressive (energy 80–100)
  { gender: 'male', energy: 82, tags: ['dark','moody','editorial'],
    niches: ['fashion','entertainment'],
    text: 'Heavy structured overcoat in all-black, draped open; fitted black turtleneck underneath; slim straight trouser in black; pointed-toe leather boot in black; one thin silver chain at the collarbone — no logos visible' },
  { gender: 'male', energy: 85, tags: ['editorial','bold','glam'],
    niches: ['fashion','entertainment'],
    text: 'Wide-leg patterned suit trouser; matching blazer worn open, no shirt, a thin chain at the collarbone; clean pointed-toe leather oxford — no logos visible' },
  { gender: 'male', energy: 92, tags: ['editorial','bold','colorful'],
    niches: ['fashion','entertainment'],
    text: 'Wide-leg cord trousers; fitted ribbed turtleneck; clean leather boot; a stack of thin silver rings — no logos visible' },

  // Male fitness — gym context
  { gender: 'male', energy: 30, tags: ['sport','functional','clean'],
    niches: ['fitness','lifestyle'],
    text: 'Fitted performance tee, slightly damp at the collar; tapered training shorts with small side-slit; clean training shoe, toe box faintly scuffed — no logos visible' },
  { gender: 'male', energy: 50, tags: ['sport','casual','street'],
    niches: ['fitness','lifestyle'],
    text: 'Oversized washed hoodie, hem hitting mid-thigh; fitted training short; clean minimalist training shoe — no logos visible' },
  { gender: 'male', energy: 40, tags: ['sport','clean','functional'],
    niches: ['fitness','lifestyle'],
    text: 'Tech-fabric sleeveless training vest, slight drape; compression training shorts; clean trainer — no logos visible' },

  // Male athleisure — sporty vibe for lifestyle contexts
  { gender: 'male', energy: 45, tags: ['sport','casual','urban'],
    niches: ['lifestyle','any'],
    text: 'Straight-leg jogger in soft jersey, slightly tapered at the ankle; clean fitted crewneck; low-profile trainer; no accessories — no logos visible' },
  { gender: 'male', energy: 60, tags: ['sport','casual','street'],
    niches: ['lifestyle','entertainment','any'],
    text: 'Athletic shorts, mid-thigh, slight technical drape; clean fitted tee; clean mid-top trainer; a thin cord bracelet — no logos visible' },

  // Coastal (male)
  { gender: 'male', energy: 20, tags: ['coastal','natural','quiet'],
    niches: ['lifestyle','travel','any'],
    text: 'Loose straight-leg linen trousers, slightly creased from wear; simple fitted cotton tee; leather sandal; no accessories — no logos visible' },
  { gender: 'male', energy: 35, tags: ['coastal','casual','natural'],
    niches: ['lifestyle','travel','any'],
    text: 'Linen short-sleeve shirt, collar open three buttons, slightly oversized, half-tucked; straight-leg chino shorts, hem at mid-thigh; leather sandal; a thin cord necklace — no logos visible' },
  { gender: 'male', energy: 52, tags: ['coastal','casual','earthy'],
    niches: ['lifestyle','travel'],
    text: 'Worn canvas shorts, slightly baggy, faded at the hem; fitted cotton tee, slightly faded; flat leather sandal; a thin leather wristband — no logos visible' },
  { gender: 'male', energy: 65, tags: ['coastal','natural','casual'],
    niches: ['lifestyle','travel','fashion'],
    text: 'Loose linen trousers, cropped slightly above the ankle; linen overshirt, collar open, sleeves rolled; woven sandal; a small pendant on a cord — no logos visible' },

  // ── OLD MONEY / QUIET LUXURY ─────────────────────────────────
  { gender: 'male', energy: 15, tags: ['old-money','classic','quiet','polished'],
    niches: ['lifestyle','fashion','travel','any'],
    text: 'Unstructured linen blazer, lapels slightly soft from wear, over an Oxford shirt with three buttons casually open; slim straight-leg chino with a faint crease; penny loafer in full-grain leather, slightly worn at the heel; a chunky gold signet ring on the left pinky; a simple leather-strap watch on the wrist — no logos visible' },
  { gender: 'male', energy: 18, tags: ['old-money','natural','casual'],
    niches: ['lifestyle','travel','any'],
    text: 'Fine-knit cotton polo, very relaxed fit, lightly sun-faded; well-worn straight-leg denim with a clean hem; leather tennis sneaker, slightly soft at the toe; a gold signet ring on the left pinky; a steel watch on a leather strap — no logos visible' },
  { gender: 'male', energy: 22, tags: ['old-money','preppy','polished'],
    niches: ['lifestyle','fashion'],
    text: 'Linen blazer worn open over a faded linen shirt, collar three buttons open, sleeves pushed; straight-leg chino; leather loafer, worn smooth at the sole edge; a thin gold watch with a worn leather strap — no logos visible' },
  { gender: 'male', energy: 28, tags: ['old-money','casual','quiet'],
    niches: ['lifestyle','travel'],
    text: 'Soft washed Oxford shirt, oversized and fully untucked, buttons open to mid-chest; well-worn straight-leg chino; faded canvas boat shoe; a gold signet ring; a simple leather-strap watch — no logos visible' },
  { gender: 'male', energy: 20, tags: ['old-money','structured','quiet'],
    niches: ['fashion','lifestyle'],
    text: 'Tailored linen trousers with a clean crease; a linen shirt, collar open, untucked; leather loafer with a light scuff at the toe; a thin gold chain at the collarbone; a slim leather-strap watch — no logos visible' },
  { gender: 'male', energy: 35, tags: ['old-money','classic','relaxed'],
    niches: ['lifestyle','any'],
    text: 'Soft cable-knit crewneck sweater, slightly oversize, hem relaxed over the waistband; slim straight-leg chino; clean leather low sneaker; a gold signet ring; no other jewelry — no logos visible' },

  { gender: 'female', energy: 12, tags: ['old-money','classic','quiet','polished'],
    niches: ['lifestyle','fashion','any'],
    text: 'Perfectly tailored wide-leg linen trousers; a fine-knit short-sleeve polo, tucked neatly; a single strand of small pearls at the collarbone; leather loafer, buffed; a simple gold bracelet — no logos visible' },
  { gender: 'female', energy: 18, tags: ['old-money','natural','casual'],
    niches: ['lifestyle','travel','fashion'],
    text: 'Oversize washed Oxford shirt, three buttons open, half-tucked into straight-leg linen trousers; gold signet ring; worn-in leather sandal with a minimal strap — no logos visible' },
  { gender: 'female', energy: 22, tags: ['old-money','preppy','polished'],
    niches: ['lifestyle','fashion'],
    text: 'Slim-fit blazer, single button, worn over a striped poplin shirt, collar open; straight-leg chino, clean hem; flat leather loafer; a thin gold chain and small pearl stud earrings — no logos visible' },
  { gender: 'female', energy: 28, tags: ['old-money','classic','quiet'],
    niches: ['lifestyle','any'],
    text: 'Soft cashmere crewneck sweater, slightly oversize; straight-leg linen trousers; clean leather sneaker; a thin gold chain; a small leather tote held at the crook of the arm — no logos visible' },

  // ── CLEAN GIRL — dedicated entries (distinct from generic Minimalist) ─
  // Think Hailey Bieber, Sofia Richie: polished, effortless, gold jewelry, fitted ribbed pieces
  { gender: 'female', energy: 22, tags: ['clean','natural','quiet'],
    niches: ['lifestyle','fashion','any'],
    text: 'Fitted ribbed tank top tucked neatly into a high-waist tailored midi skirt in warm ecru or oat; flat leather sandal, thin strap; small gold huggie hoop earrings; no other jewelry — no logos visible' },
  { gender: 'female', energy: 38, tags: ['clean','natural','casual'],
    niches: ['lifestyle','fashion','any'],
    text: 'Matching ribbed set: fitted long-sleeve crop top and wide-leg ribbed lounge trousers in warm oat or cream; clean leather low sneaker or flat; small gold huggie hoops; a single thin delicate gold chain — no logos visible' },
  { gender: 'female', energy: 55, tags: ['clean','natural','casual'],
    niches: ['lifestyle','fashion','any'],
    text: 'Fitted white or cream ribbed tank tucked into wide-leg linen or satin-finish trousers in camel or warm oat; strappy leather flat sandal; small gold hoop earrings; a layered delicate gold chain necklace — no logos visible' },
  { gender: 'female', energy: 68, tags: ['clean','natural','polished'],
    niches: ['lifestyle','fashion','any'],
    text: 'Fitted satin-finish or ribbed cami midi dress in warm ecru or nude; strappy leather flat sandal; gold hoop earrings; stacked thin delicate gold chains and a simple gold bracelet — no logos visible' },

  // ── STREETWEAR — low & mid energy (was missing entirely below 62) ─
  { gender: 'female', energy: 22, tags: ['street','casual','clean'],
    niches: ['lifestyle','fashion','any'],
    text: 'Oversized washed heavyweight tee, crew neck, hem slightly cropped by tucking once at the front; high-waist straight-leg dark denim; clean white low-top canvas sneaker, slightly broken in — no logos visible' },
  { gender: 'female', energy: 38, tags: ['street','casual','urban'],
    niches: ['lifestyle','fashion','any'],
    text: 'Relaxed straight-leg dark denim; fitted ribbed tank, thin straps, half-tucked; clean low-profile leather sneaker; a small thin chain at the collarbone — no logos visible' },
  { gender: 'female', energy: 52, tags: ['street','urban','casual'],
    niches: ['lifestyle','fashion','entertainment','any'],
    text: 'Wide-leg dark denim, clean hem; fitted graphic tee tucked loosely at one side; clean chunky low-top trainer; a thin chain layered over the tee — no logos visible' },

  { gender: 'male', energy: 22, tags: ['street','casual','clean'],
    niches: ['lifestyle','fashion','any'],
    text: 'Straight-leg dark denim, clean hem; heavyweight cotton tee, crew neck, slightly oversized; clean white low-top canvas sneaker — no logos visible' },
  { gender: 'male', energy: 38, tags: ['street','urban','casual'],
    niches: ['lifestyle','fashion','entertainment'],
    text: 'Straight-leg dark denim; loose overshirt worn fully open over a fitted tee; clean low-profile leather sneaker — no logos visible' },
  { gender: 'male', energy: 52, tags: ['street','casual','urban'],
    niches: ['lifestyle','fashion','entertainment'],
    text: 'Wide-leg dark denim, clean hem; oversized washed crewneck, dropped shoulder; clean low-profile trainer; a thin cord bracelet — no logos visible' },

  // ── BOHEMIAN — male (was zero entries) ───────────────────────────
  { gender: 'male', energy: 28, tags: ['bohemian','earthy','natural'],
    niches: ['lifestyle','travel','any'],
    text: 'Loose linen shirt, collar open three buttons, slightly oversized, untucked; relaxed straight-leg linen trousers; flat leather sandal; a single thin cord or wooden-bead bracelet — no logos visible' },
  { gender: 'male', energy: 48, tags: ['bohemian','natural','earthy'],
    niches: ['lifestyle','travel'],
    text: 'Loose woven cotton shirt, slightly sun-faded, collar open; relaxed wide-leg linen trousers, cropped above the ankle; flat leather sandal; a layered cord and natural-bead necklace — no logos visible' },
  { gender: 'male', energy: 65, tags: ['bohemian','earthy','casual'],
    niches: ['lifestyle','travel','fashion'],
    text: 'Linen overshirt worn open, fabric slightly crumpled; wide-leg cotton drawstring trousers; leather sandal with a woven strap; layered thin cord necklaces, worn and natural — no logos visible' },

  // ── GLAM — male low & mid energy (was only 1 entry at energy 85) ─
  { gender: 'male', energy: 32, tags: ['glam','polished','structured'],
    niches: ['fashion','lifestyle','entertainment'],
    text: 'Tailored straight-leg trousers in a subtle satin-finish fabric; fitted fine-knit turtleneck; clean leather chelsea boot; a single thin gold chain — no logos visible' },
  { gender: 'male', energy: 55, tags: ['glam','evening','polished'],
    niches: ['fashion','entertainment','lifestyle'],
    text: 'Fitted ribbed turtleneck; slim tailored trousers with a faint sheen at the fabric; clean pointed-toe leather oxford; a thin gold bracelet — no logos visible' },
  { gender: 'male', energy: 68, tags: ['glam','bold','evening'],
    niches: ['fashion','entertainment'],
    text: 'Satin-finish button-up shirt, collar open two buttons, slightly relaxed; well-tailored slim trousers; clean pointed-toe leather boot; a gold signet ring and thin chain at the collarbone — no logos visible' },

  // ── Y2K — low & mid energy (was all 62+ for female, 72 for male) ─
  { gender: 'female', energy: 28, tags: ['y2k','playful','casual'],
    niches: ['lifestyle','fashion','entertainment'],
    text: 'Low-rise straight-leg denim, slightly flared at the hem; fitted ribbed baby tee, slightly cropped, scoop neck; flat strappy sandal; a thin chain bracelet — no logos visible' },
  { gender: 'female', energy: 48, tags: ['y2k','casual','clean'],
    niches: ['lifestyle','fashion','any'],
    text: 'Low-rise bootcut denim in a clean medium wash; cropped fitted polo, collar slightly open; clean white low-top sneaker; a delicate thin choker-style necklace — no logos visible' },

  { gender: 'male', energy: 32, tags: ['y2k','casual','urban'],
    niches: ['lifestyle','fashion','entertainment'],
    text: 'Wide-leg straight denim, clean medium wash; fitted tee with a subtle graphic, crew neck; clean low-top sneaker; a thin chain necklace — no logos visible' },
  { gender: 'male', energy: 52, tags: ['y2k','urban','casual'],
    niches: ['lifestyle','entertainment'],
    text: 'Baggy low-rise straight-leg denim, slightly faded at the knees; zip-up track jacket in a tonal colour, collar slightly popped, worn open over a fitted tee; clean low-top skate-style sneaker; a thin silver chain at the collarbone — no logos visible' },

  // ── EDITORIAL — male mid-range (was only 78, 82, 85) ─────────────
  { gender: 'male', energy: 42, tags: ['editorial','structured','clean'],
    niches: ['fashion','lifestyle'],
    text: 'Collarless structured cotton jacket, slightly boxy, worn fully buttoned as the only top layer — no shirt visible; clean straight-leg tailored trousers in a contrasting neutral; square-toe leather oxford; no accessories — no logos visible' },
  { gender: 'male', energy: 60, tags: ['editorial','structured','dark'],
    niches: ['fashion','entertainment'],
    text: 'Structured overshirt in heavy black fabric worn fully closed as a jacket, strong shoulder line; fitted black turtleneck underneath; slim tailored trousers in dark charcoal; clean black leather chelsea boot — no logos visible' },

  // ── DARK & MOODY — female low energy (was nothing below 60) ──────
  { gender: 'female', energy: 22, tags: ['dark','minimalist','quiet'],
    niches: ['fashion','lifestyle','entertainment'],
    text: 'Fine-knit fitted black turtleneck, long sleeve, slightly thin at the cuffs; slim straight-leg black trousers, clean hem; clean black leather flat; no jewelry — no logos visible' },
  { gender: 'female', energy: 38, tags: ['dark','moody','casual'],
    niches: ['fashion','lifestyle','entertainment'],
    text: 'Fitted ribbed long-sleeve crew-neck top in black or deep charcoal; slim straight dark denim or black trousers; clean leather ankle boot in black, low block heel; a single thin silver chain necklace — no logos visible' },

  // ── PREPPY — expanded (was 2F / 2M) ──────────────────────────────
  { gender: 'female', energy: 25, tags: ['preppy','classic','clean'],
    niches: ['lifestyle','fashion','any'],
    text: 'Fine-knit crewneck sweater in a clean neutral, slightly fitted; slim straight-leg chino; leather loafer; a simple thin gold bracelet — no logos visible' },
  { gender: 'female', energy: 55, tags: ['preppy','classic','polished'],
    niches: ['lifestyle','fashion'],
    text: 'Striped poplin shirt, collar open, tucked into high-waist straight-leg chino; leather loafer; small pearl stud earrings; a simple gold bracelet — no logos visible' },
  { gender: 'female', energy: 68, tags: ['preppy','editorial','polished'],
    niches: ['lifestyle','fashion'],
    text: 'Slim blazer in a classic check, single button, lapels neat; fitted crew-neck tee underneath; straight-leg chino; penny loafer; a thin gold chain — no logos visible' },

  { gender: 'male', energy: 22, tags: ['preppy','classic','quiet'],
    niches: ['lifestyle','fashion','any'],
    text: 'Soft cotton crewneck sweater, slightly relaxed, in a clean neutral; well-worn slim straight-leg chino; leather loafer, buffed slightly; a thin stainless watch — no logos visible' },
  { gender: 'male', energy: 55, tags: ['preppy','classic','clean'],
    niches: ['lifestyle','fashion'],
    text: 'Oxford button-down, collar open, slightly tucked at the front; straight-leg chino, clean break; leather loafer; a simple woven cord bracelet — no logos visible' },
  { gender: 'male', energy: 68, tags: ['preppy','polished','editorial'],
    niches: ['lifestyle','fashion'],
    text: 'Linen blazer with a natural rumple, worn open; fitted Oxford shirt underneath, collar two buttons open; slim chino; leather loafer; a gold signet ring — no logos visible' },
]

// Defining tag per vibe — used to hard-filter the wardrobe pool before scoring.
// This ensures a selected vibe always wins over energy proximity.
// Personality still controls HOW the outfit is worn (getStylingNote), not whether the vibe is respected.
const VIBE_PRIMARY_TAG = {
  'Minimalist':   'minimalist',
  'Editorial':    'editorial',
  'Streetwear':   'street',
  'Bohemian':     'bohemian',
  'Glam':         'glam',
  'Sporty':       'sport',
  'Y2K':          'y2k',
  'Dark & Moody': 'dark',
  'Clean Girl':   'clean',
  'Cottagecore':  'cottagecore',
  'Tech Bro':     'minimalist',
  'Preppy':       'preppy',
  'Old Money':    'old-money',
  'Coastal':      'coastal',
}

// Vibe words → tag arrays (not 1:1 → single outfit — they filter the library)
const VIBE_TAG_MAP = {
  'Minimalist':    ['minimalist', 'quiet', 'clean'],
  'Editorial':     ['editorial', 'structured', 'bold'],
  'Streetwear':    ['street', 'urban', 'casual'],
  'Bohemian':      ['bohemian', 'earthy', 'natural'],
  'Glam':          ['glam', 'evening', 'bold'],
  'Sporty':        ['sport', 'functional', 'casual'],
  'Y2K':           ['y2k', 'playful', 'casual'],
  'Dark & Moody':  ['dark', 'moody', 'structured'],
  'Clean Girl':    ['clean', 'natural', 'casual'],
  'Cottagecore':   ['cottagecore', 'natural', 'earthy'],
  'Tech Bro':      ['structured', 'quiet', 'minimalist'],
  'Preppy':        ['preppy', 'classic', 'polished'],
  'Old Money':     ['old-money', 'classic', 'polished', 'quiet'],
  'Coastal':       ['coastal', 'natural', 'casual'],
}

// Vibe → color palette hint injected into the Wardrobe section
const VIBE_PALETTE_MAP = {
  'Minimalist':    'Palette: muted neutrals — off-white, ecru, stone, warm grey, oat. No strong saturated colors.',
  'Editorial':     'Palette: bold monochrome or one statement color — all-black, deep charcoal, pure white, or a single saturated hue.',
  'Streetwear':    'Palette: washed-out neutrals — faded black, washed grey, dirty white, faded indigo denim.',
  'Bohemian':      'Palette: warm earthy tones — terracotta, rust, warm ochre, tobacco, deep olive, sun-faded warm neutrals.',
  'Glam':          'Palette: rich evening tones — deep burgundy, warm ivory, champagne, or a bold jewel-tone statement piece.',
  'Sporty':        'Palette: clean athletic colors — sage green, lavender, warm rust, classic black-and-white, or a pastel matching set.',
  'Y2K':           'Palette: 2000s nostalgia — baby blue, lilac, pale pink, warm denim wash, silver hardware, white.',
  'Dark & Moody':  'Palette: deep darks only — all-black, deep charcoal, dark forest, inky navy. No light or pastel tones.',
  'Clean Girl':    'Palette: clean warm neutrals — warm white, oat, ecru, nude blush. Nothing saturated or dark.',
  'Cottagecore':   'Palette: soft botanical — dusty rose, sage, warm cream, muted floral prints, soft lavender.',
  'Tech Bro':      'Palette: monochrome and minimal — all-black, deep charcoal, dark navy, all-grey. No bright or warm tones.',
  'Preppy':        'Palette: classic collegiate — navy and white, hunter green, camel and cream, burgundy.',
  'Old Money':     'Palette: quiet luxury — camel, cream, stone, pale blue, navy, warm tan. Nothing loud or trend-driven.',
  'Coastal':       'Palette: sun-bleached coastal — off-white linen, warm sand, ocean-washed denim, natural rope and shell tones.',
}

function getVibeTags(vibeWords) {
  return (vibeWords || []).flatMap(v => VIBE_TAG_MAP[v] || [])
}

// ── Backstory archetype engine ────────────────────────────────
// Each entry: test (regex), tags (wardrobe boost), sceneNiche (scene pool key),
// buildHint (inferred body type — used if user left build blank),
// physicalDetail (visible marker — glasses etc. — added to subject),
// lockedScene (specific scene for variation 3; null = pick from sceneNiche pool)
const BACKSTORY_ARCHETYPES = [
  // ── FITNESS ─────────────────────────────────────────────────
  { test: /yoga.?instructor|yoga.?teacher|yoga.?coach/,
    tags: ['sport','natural','earthy','bohemian'], sceneNiche: 'fitness',
    buildHint: 'lean, flexible, long-limbed',
    lockedScene: 'yoga studio, pale wood floor, floor-to-ceiling mirror wall, soft diffused morning light through large windows' },
  { test: /pilates.?instructor|pilates.?teacher|reformer/,
    tags: ['sport','clean','natural'], sceneNiche: 'fitness',
    buildHint: 'lean, toned, precise upright posture',
    lockedScene: 'pilates studio, reformer machines visible soft in background, clean bright space with natural light' },
  { test: /crossfit|hiit.?coach|functional.?fitness/,
    tags: ['sport','functional','casual'], sceneNiche: 'fitness',
    buildHint: 'muscular, functional build',
    lockedScene: 'crossfit box, pull-up rigs and bumper plates visible soft behind, industrial ceiling and rubber flooring' },
  { test: /personal.?trainer|fitness.?coach|strength.?coach|gym.?owner|gym.?instructor/,
    tags: ['sport','functional','casual'], sceneNiche: 'fitness',
    buildHint: 'athletic, visibly fit',
    lockedScene: 'minimalist gym interior, rubber floor, weight racks and barbells visible soft in background, large windows letting in hard morning side-light from camera-left' },
  { test: /nutritionist|dietitian|sports.?nutritionist/,
    tags: ['sport','earthy','natural'], sceneNiche: 'fitness' },
  { test: /marathon|ultra.?runner|long.?distance.?runner/,
    tags: ['sport','earthy','functional'], sceneNiche: 'fitness',
    buildHint: 'lean endurance build' },
  { test: /\brunner\b|running.?coach|track.?athlete/,
    tags: ['sport','functional','casual'], sceneNiche: 'fitness',
    buildHint: 'lean runner\'s build' },
  { test: /cyclist|road.?bike|mountain.?bik/,
    tags: ['sport','functional'], sceneNiche: 'fitness',
    buildHint: 'lean, powerful legs' },
  { test: /\bswimmer\b|swimming|open.?water/,
    tags: ['sport','coastal','natural'], sceneNiche: 'fitness',
    buildHint: 'broad-shouldered, lean swimmer\'s build' },
  { test: /\bsurfer\b|surfing|surf.?instructor/,
    tags: ['coastal','natural','casual','earthy'], sceneNiche: 'fitness',
    buildHint: 'lean, sun-bronzed' },
  { test: /dancer|dance.?teacher|choreographer|ballet|contemporary.?dance/,
    tags: ['editorial','bold','sport'], sceneNiche: 'entertainment',
    buildHint: 'lean, long-limbed, precise upright posture',
    lockedScene: 'dance studio, sprung wood floor, floor-to-ceiling mirror, barre visible in background' },
  { test: /martial.?art|mma|boxing|kickboxing|judo|jiu.?jitsu|muay.?thai/,
    tags: ['sport','dark','functional'], sceneNiche: 'fitness',
    buildHint: 'lean, compact, coiled' },
  { test: /gymnast|gymnastics/,
    tags: ['sport','functional','editorial'], sceneNiche: 'fitness',
    buildHint: 'compact, powerfully built' },
  { test: /meditation.?teacher|mindfulness.?coach|breathwork/,
    tags: ['earthy','natural','bohemian'], sceneNiche: 'fitness' },
  { test: /life.?coach|wellness.?coach|holistic.?health|health.?coach/,
    tags: ['natural','clean','earthy'], sceneNiche: 'lifestyle' },
  { test: /professional.?athlete|pro.?athlete|olympic|national.?team/,
    tags: ['sport','functional'], sceneNiche: 'fitness',
    buildHint: 'peak athletic build' },
  { test: /\bcoach\b|sports.?coach|athletic.?director/,
    tags: ['sport','casual','functional'], sceneNiche: 'fitness',
    buildHint: 'fit, athletic' },
  { test: /\bgym\b|weightlifting|powerlifting|bodybuilding/,
    tags: ['sport','functional','casual'], sceneNiche: 'fitness',
    buildHint: 'visibly muscular, powerful frame',
    lockedScene: 'gym interior, squat rack and plates visible soft behind, rubber floor, industrial ceiling with high strip lighting' },
  { test: /tennis|padel/,
    tags: ['preppy','sport','clean'], sceneNiche: 'fitness' },
  { test: /\bgolfer\b|\bgolf\b/,
    tags: ['old-money','preppy','sport'], sceneNiche: 'travel' },
  { test: /basketball|nba\b/,
    tags: ['street','sport','casual'], sceneNiche: 'fitness',
    buildHint: 'tall, athletic' },
  { test: /football|soccer|footballer|pitch/,
    tags: ['sport','casual','street'], sceneNiche: 'fitness',
    buildHint: 'lean, athletic' },
  { test: /\bskater\b|skateboarding/,
    tags: ['street','y2k','casual'], sceneNiche: 'entertainment' },
  { test: /snowboarder|snowboarding|skiing|\bskier\b/,
    tags: ['casual','earthy','sport'], sceneNiche: 'travel' },
  { test: /rock.?climber|climbing|bouldering/,
    tags: ['earthy','functional','casual'], sceneNiche: 'travel',
    buildHint: 'lean, wiry and strong' },
  { test: /\bhiker\b|hiking|trekker/,
    tags: ['earthy','functional','natural'], sceneNiche: 'travel' },

  // ── FOOD & HOSPITALITY ──────────────────────────────────────
  { test: /executive.?chef|head.?chef|michelin|fine.?dining/,
    tags: ['editorial','structured','polished'], sceneNiche: 'lifestyle',
    lockedScene: 'outside a restaurant entrance, warm kitchen light spilling through the open door behind, city street at dusk' },
  { test: /pastry.?chef|patisserie/,
    tags: ['cottagecore','earthy','natural'], sceneNiche: 'lifestyle',
    lockedScene: 'bakery counter or café window, warm morning light, pastries visible soft in background' },
  { test: /\bbaker\b|baking|sourdough/,
    tags: ['cottagecore','earthy','natural'], sceneNiche: 'lifestyle',
    lockedScene: 'bakery counter or café window, warm morning light, bread and pastries soft in background' },
  { test: /\bchef\b|culinary|kitchen|cook\b/,
    tags: ['casual','earthy'], sceneNiche: 'lifestyle',
    lockedScene: 'outside a restaurant or street-food stall, warm ambient evening light, kitchen noise implied behind' },
  { test: /barista|coffee.?roaster|café.?owner/,
    tags: ['casual','minimalist','clean'], sceneNiche: 'lifestyle',
    lockedScene: 'beside a café counter, espresso machine gleaming soft behind, warm amber overhead light' },
  { test: /bartender|mixologist|bar.?owner/,
    tags: ['dark','casual','glam'], sceneNiche: 'entertainment',
    lockedScene: 'bar or venue interior, warm practicals above, moody ambient light, bottles soft in background' },
  { test: /sommelier|\bwine\b|winery|vineyard/,
    tags: ['old-money','polished','earthy'], sceneNiche: 'travel' },
  { test: /food.?blogger|food.?photographer|food.?stylist/,
    tags: ['casual','earthy','lifestyle'], sceneNiche: 'lifestyle' },
  { test: /restaurant.?owner|restaurateur/,
    tags: ['polished','editorial','casual'], sceneNiche: 'lifestyle',
    lockedScene: 'inside or outside their restaurant, warm ambient lighting, tables soft in background' },

  // ── FASHION & BEAUTY ────────────────────────────────────────
  { test: /\bmodel\b|fashion.?model|runway|catwalk/,
    tags: ['editorial','structured','polished'], sceneNiche: 'fashion',
    buildHint: 'tall, lean, long-limbed' },
  { test: /fashion.?designer|clothing.?designer/,
    tags: ['editorial','bold','structured'], sceneNiche: 'fashion' },
  { test: /\bstylist\b|fashion.?stylist|wardrobe.?stylist|personal.?stylist/,
    tags: ['editorial','minimalist','structured'], sceneNiche: 'fashion' },
  { test: /fashion.?blogger|fashion.?influencer/,
    tags: ['editorial','bold'], sceneNiche: 'fashion' },
  { test: /makeup.?artist|mua\b|beauty.?artist/,
    tags: ['glam','editorial','clean'], sceneNiche: 'beauty' },
  { test: /hairdresser|hair.?stylist|hair.?colorist/,
    tags: ['casual','editorial','clean'], sceneNiche: 'beauty',
    lockedScene: 'salon interior, styling chairs visible soft in background, bright salon lighting' },
  { test: /nail.?artist|nail.?technician/,
    tags: ['playful','bold','clean'], sceneNiche: 'beauty' },
  { test: /beauty.?blogger|beauty.?influencer/,
    tags: ['glam','clean','natural'], sceneNiche: 'beauty' },
  { test: /esthetician|skincare.?specialist|facialist/,
    tags: ['clean','natural','minimalist'], sceneNiche: 'beauty' },
  { test: /creative.?director|art.?director/,
    tags: ['editorial','structured','bold'], sceneNiche: 'fashion' },

  // ── TECH & BUSINESS ─────────────────────────────────────────
  { test: /software.?engineer|developer|programmer|coder|full.?stack|backend|frontend/,
    tags: ['minimalist','quiet','clean'], sceneNiche: 'tech',
    lockedScene: 'minimal home desk or co-working space, large monitor soft in background, window light from one side' },
  { test: /startup.?founder|tech.?founder/,
    tags: ['minimalist','structured','editorial'], sceneNiche: 'tech',
    lockedScene: 'modern co-working space, city view through full-height glass behind' },
  { test: /\bceo\b|\bcoo\b|\bcto\b|c-suite/,
    tags: ['old-money','structured','polished'], sceneNiche: 'tech',
    lockedScene: 'city office, floor-to-ceiling glass windows, urban skyline visible soft behind' },
  { test: /entrepreneur|business.?owner|self.?employed|founder/,
    tags: ['minimalist','casual','structured'], sceneNiche: 'tech' },
  { test: /ux.?designer|product.?designer|ui.?designer/,
    tags: ['minimalist','clean','editorial'], sceneNiche: 'tech' },
  { test: /product.?manager|\bpm\b/,
    tags: ['minimalist','clean','preppy'], sceneNiche: 'tech' },
  { test: /crypto|blockchain|web3|\bnft\b|\bdefi\b/,
    tags: ['street','y2k','casual'], sceneNiche: 'tech' },
  { test: /real.?estate|property.?developer|realtor/,
    tags: ['polished','preppy','old-money'], sceneNiche: 'lifestyle' },
  { test: /financial.?advisor|wealth.?manager|portfolio.?manager/,
    tags: ['old-money','polished','preppy'], sceneNiche: 'tech' },
  { test: /\bbanker\b|investment.?bank|private.?equity|hedge.?fund/,
    tags: ['old-money','structured','polished'], sceneNiche: 'tech' },
  { test: /day.?trader|\btrader\b|stock.?market/,
    tags: ['minimalist','casual'], sceneNiche: 'tech' },
  { test: /\blawyer\b|attorney|solicitor|barrister/,
    tags: ['old-money','structured','editorial'], sceneNiche: 'lifestyle',
    lockedScene: 'steps of a courthouse or law office building exterior, clean stone steps, city behind' },

  // ── CREATIVE ────────────────────────────────────────────────
  { test: /\bphotographer\b|photography/,
    tags: ['editorial','minimalist','casual'], sceneNiche: 'travel' },
  { test: /videographer|cinematographer/,
    tags: ['editorial','casual','dark'], sceneNiche: 'entertainment' },
  { test: /filmmaker|film.?director|\bdirector\b/,
    tags: ['editorial','dark','structured'], sceneNiche: 'entertainment' },
  { test: /graphic.?designer|illustrator/,
    tags: ['editorial','minimalist','casual'], sceneNiche: 'lifestyle' },
  { test: /interior.?designer|interior.?decorator/,
    tags: ['minimalist','editorial','old-money'], sceneNiche: 'lifestyle' },
  { test: /\bartist\b|painter|sculptor|fine.?art/,
    tags: ['bohemian','editorial','earthy'], sceneNiche: 'lifestyle',
    lockedScene: 'artist\'s studio, canvases or artworks visible soft behind, north-facing window light' },
  { test: /\bmusician\b|\bsinger\b|vocalist|recording.?artist/,
    tags: ['dark','bohemian','editorial'], sceneNiche: 'entertainment',
    lockedScene: 'recording studio corner, microphone stand or mixing board soft behind, warm practical lighting' },
  { test: /\bdj\b|music.?producer|producer\b/,
    tags: ['street','dark','casual'], sceneNiche: 'entertainment',
    lockedScene: 'behind a DJ booth or in a studio, equipment visible soft behind, moody low ambient light' },
  { test: /\brapper\b|hip.?hop|\bmc\b/,
    tags: ['street','dark','bold'], sceneNiche: 'entertainment' },
  { test: /\bactor\b|\bactress\b|performer|theatre/,
    tags: ['editorial','glam','casual'], sceneNiche: 'entertainment' },
  { test: /\bcomedian\b|stand.?up|comedy.?writer/,
    tags: ['casual','street','y2k'], sceneNiche: 'entertainment' },
  { test: /\bwriter\b|\bauthor\b|novelist|screenwriter/,
    tags: ['quiet','minimalist','earthy'], sceneNiche: 'lifestyle',
    lockedScene: 'café corner, open notebook or laptop soft on table, afternoon window light' },
  { test: /podcaster|podcast.?host/,
    tags: ['casual','minimalist'], sceneNiche: 'tech',
    lockedScene: 'podcast desk setup, microphone visible in foreground or soft behind, acoustic panels or bookshelf in background' },
  { test: /journalist|reporter|correspondent/,
    tags: ['casual','minimalist','preppy'], sceneNiche: 'lifestyle' },
  { test: /youtuber|youtube.?creator|\bvlogg|\bvlog\b/,
    tags: ['casual','y2k','street'], sceneNiche: 'lifestyle' },
  { test: /tiktoker|tiktok.?creator/,
    tags: ['y2k','casual','playful'], sceneNiche: 'lifestyle' },
  { test: /streamer|twitch|gaming.?content/,
    tags: ['casual','street'], sceneNiche: 'gaming',
    lockedScene: 'gaming setup visible behind, RGB lighting as background ambient, one window as key light' },
  { test: /\bblogger\b|content.?creator/,
    tags: ['casual','lifestyle'], sceneNiche: 'lifestyle' },

  // ── HEALTH ──────────────────────────────────────────────────
  { test: /pharmacist|pharmacy/,
    tags: ['clean','minimalist','preppy'], sceneNiche: 'lifestyle',
    physicalDetail: 'thin wire-frame glasses',
    lockedScene: 'pharmacy counter or clinic corridor, clean institutional light, shelves soft in background' },
  { test: /\bdoctor\b|\bphysician\b|\bmd\b/,
    tags: ['clean','minimalist','preppy'], sceneNiche: 'lifestyle',
    physicalDetail: 'thin wire-frame glasses',
    lockedScene: 'clinic consultation room, clean desk and framed qualifications soft on the wall behind, diffused overhead light' },
  { test: /\bnurse\b|nursing|registered.?nurse/,
    tags: ['clean','casual','minimalist'], sceneNiche: 'lifestyle',
    lockedScene: 'hospital corridor, clean white walls, soft institutional overhead light' },
  { test: /therapist|psychologist|counsellor|mental.?health/,
    tags: ['quiet','minimalist','earthy'], sceneNiche: 'lifestyle',
    lockedScene: 'calm therapy office, a comfortable armchair and soft lamp visible in background, warm quiet light' },
  { test: /acupuncturist|chiropractor|physiotherapist|physical.?therapist/,
    tags: ['earthy','natural','clean'], sceneNiche: 'lifestyle' },

  // ── EDUCATION ───────────────────────────────────────────────
  { test: /\bstudent\b|college|university|grad.?student/,
    tags: ['casual','street','preppy'], sceneNiche: 'lifestyle' },
  { test: /\bprofessor\b|\blecturer\b|academic/,
    tags: ['preppy','old-money','minimalist'], sceneNiche: 'lifestyle',
    physicalDetail: 'wire-frame glasses',
    lockedScene: 'university library or faculty corridor, bookshelves soft in background, warm institutional light' },
  { test: /\bteacher\b|educator/,
    tags: ['casual','preppy','clean'], sceneNiche: 'lifestyle' },

  // ── TRAVEL & LIFESTYLE ──────────────────────────────────────
  { test: /travel.?blogger|travel.?influencer|travel.?creator|travel.?vlog|\btravell?ing\b/,
    tags: ['bohemian','casual','coastal'], sceneNiche: 'travel' },
  { test: /digital.?nomad/,
    tags: ['casual','bohemian','minimalist'], sceneNiche: 'travel' },
  { test: /\bexpat\b|living.?abroad/,
    tags: ['bohemian','casual','coastal'], sceneNiche: 'travel' },

  // ── VALUES & LIFESTYLE ──────────────────────────────────────
  { test: /dog.?owner|dog.?lover|pet.?parent|dog.?mom|dog.?dad/,
    tags: ['casual','earthy','natural'], sceneNiche: 'lifestyle' },
  { test: /new.?mom|\bnew mom\b|new.?parent|postpartum/,
    tags: ['casual','clean','natural'], sceneNiche: 'lifestyle' },
  { test: /sustainable|eco.?friendly|environmentalist/,
    tags: ['earthy','natural','bohemian'], sceneNiche: 'lifestyle' },
  { test: /spiritual|mindfulness|meditation|buddhist/,
    tags: ['earthy','bohemian','natural'], sceneNiche: 'lifestyle' },
  { test: /activist|advocate|social.?justice|community.?organizer/,
    tags: ['street','casual','earthy'], sceneNiche: 'lifestyle' },
  { test: /luxury|high.?end|yacht|penthouse/,
    tags: ['old-money','glam','polished'], sceneNiche: 'travel' },
  { test: /\bfreelance\b|freelancer/,
    tags: ['casual','minimalist'], sceneNiche: 'lifestyle' },

  // ── AESTHETICS (catch-all style signals) ────────────────────
  { test: /old.?money|heritage|generational|ivy.?league|equestrian|boarding.?school|country.?club|prep.?school/,
    tags: ['old-money','classic','polished','quiet'], sceneNiche: null },
  { test: /designer|couture|high.?fashion|fashion.?week|rick owens|the row|bottega|celine|loewe/,
    tags: ['polished','editorial','structured','old-money'], sceneNiche: 'fashion' },
  { test: /street|urban|downtown|brooklyn|graffiti/,
    tags: ['street','urban','casual'], sceneNiche: null },
  { test: /\bminimalist\b|\bminimal\b|understated|quiet.?aesthetic|\bquiet\b|\breserved\b|\bintroverted\b/,
    tags: ['minimalist','quiet','clean'], sceneNiche: null },
  { test: /boho|bohemian|free.?spirit|wanderer|earthy/,
    tags: ['bohemian','earthy','natural'], sceneNiche: null },
  { test: /dark.?aesthetic|gothic|moody|alternative|grunge/,
    tags: ['dark','moody','urban'], sceneNiche: null },
  { test: /glam|glamour|sequin|evening.?wear|gala|black.?tie|cocktail/,
    tags: ['glam','evening','bold'], sceneNiche: null },
]

// Returns wardrobe tags + scene context from backstory keywords.
// Used as the tier-3 fallback — runs for all users with zero cost or latency.
export function getBackstoryContext(physicalDesc, backstory) {
  const text = ((physicalDesc || '') + ' ' + (backstory || '')).toLowerCase()
  const tags = []
  let sceneNiche = null
  let buildHint = null
  let physicalDetail = null
  let lockedScene = null

  for (const archetype of BACKSTORY_ARCHETYPES) {
    if (archetype.test.test(text)) {
      for (const tag of archetype.tags) {
        if (!tags.includes(tag)) tags.push(tag)
      }
      if (!sceneNiche && archetype.sceneNiche) sceneNiche = archetype.sceneNiche
      if (!buildHint && archetype.buildHint) buildHint = archetype.buildHint
      if (!physicalDetail && archetype.physicalDetail) physicalDetail = archetype.physicalDetail
      if (!lockedScene && archetype.lockedScene) lockedScene = archetype.lockedScene
    }
  }

  return { tags, sceneNiche, buildHint, physicalDetail, lockedScene }
}

// Personality energy → wardrobe energy window
// Introvert = quieter clothes, extrovert = bolder clothes
// Window has overlap so selection isn't too rigid
function getEnergyWindow(personality) {
  const center = personality // 0–100 maps directly
  const half = 28            // ±28 tolerance around the center
  return { min: Math.max(0, center - half), max: Math.min(100, center + half) }
}

// Personality styling note — appended to wardrobe to describe HOW it's worn
function getStylingNote(personality) {
  if (personality < 25) return 'Worn without deliberateness — clothes exist, not styled.'
  if (personality < 45) return 'Put together but not overthought — one considered choice, the rest just fits.'
  if (personality < 60) return 'Casually considered — looks good without looking like effort.'
  if (personality < 78) return 'Visibly intentional — pulling the look together on purpose, naturally.'
  return 'Fully committed — every piece deliberate, confident in the choices.'
}

// Score and select wardrobe from the library
// forceProfessionTags: when backstory-locked, hard-filter pool to profession tags (bypasses vibe)
function selectWardrobe(gender, vibeWords, personality, physicalDesc, backstory, forceProfessionTags = null) {
  const isMale = gender?.toLowerCase() === 'male'
  const vibeTags = [...getVibeTags(vibeWords), ...getBackstoryContext(physicalDesc, backstory).tags]

  // When a vibe is selected, derive its primary/defining tag and hard-filter first.
  // If profession tags are forced (backstory-locked variation), use those instead.
  const primaryVibeTags = forceProfessionTags || (vibeWords || []).map(v => VIBE_PRIMARY_TAG[v]).filter(Boolean)

  // Filter by gender
  const genderPool = WARDROBE.filter(e =>
    isMale ? e.gender === 'male' : e.gender === 'female'
  )

  // Hard-filter to vibe pool if a vibe is selected; fall back if too few entries
  const pool = primaryVibeTags.length > 0
    ? (() => {
        const filtered = genderPool.filter(e => e.tags.some(t => primaryVibeTags.includes(t)))
        return filtered.length >= 3 ? filtered : genderPool
      })()
    : genderPool

  // Score each entry
  const scored = pool.map(e => {
    let score = 0

    // Energy proximity — entries closer to personality center score higher
    const energyDist = Math.abs(e.energy - personality)
    if (energyDist <= 15) score += 40        // very close match
    else if (energyDist <= 28) score += 20   // within tolerance
    else score -= 20                          // outside window — penalize but don't fully exclude

    // Vibe tag overlap — each matching tag scores
    if (vibeTags.length > 0) {
      const tagMatches = e.tags.filter(t => vibeTags.includes(t)).length
      score += tagMatches * 18
    }

    // Controlled randomness — keeps variety across generations
    score += Math.random() * 14

    return { ...e, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // Pick randomly from top candidates so it's never deterministic
  const topN = Math.min(6, scored.length)
  const chosen = scored.slice(0, topN)
  const entry = R(chosen)

  return `${entry.text}. ${getStylingNote(personality)}`
}

// ── Scene pools by niche ──────────────────────────────────────
const SCENE_POOLS = {
  fashion: [
    'sun-drenched SoHo loft, whitewashed exposed brick, tall factory windows, morning light pooling on oak floors',
    'Paris Le Marais narrow side street, charcoal limestone facades, cobblestones faintly damp, warm afternoon shade with a bright lane-end opening behind',
    'minimal Copenhagen café interior, raw concrete wall, warm oak counter surface catching window light',
    'Tokyo backstreet alley, clean concrete with layers of soft-focus weathered signage, warm evening ambient',
    'Milanese internal courtyard, faded terracotta plaster walls, afternoon sun cutting a diagonal stripe across the floor',
  ],
  beauty: [
    'sun-flooded modern bathroom, small window at 9 o\'clock, white subway tiles, faint steam in the air, morning',
    'clean neutral hotel room, floor-to-ceiling window, soft afternoon city skyline behind',
    'bedroom with large east-facing window, morning light angled low, white walls',
    'minimalist vanity corner, large mirror catching daylight from a nearby window',
  ],
  fitness: [
    'minimalist gym, natural oak floors, white walls, high windows with golden side-light from camera-left',
    'outdoor park trail, city skyline softened beyond treeline, morning ground mist',
    'concrete rooftop workout space, city spread below, blue-hour transition light',
    'empty beach at low tide, wet packed sand, low warm morning light catching the surface',
    'urban outdoor running path, tree canopy overhead, soft dappled morning light through leaves',
  ],
  travel: [
    'terracotta European alleyway, afternoon shade, warm stone walls both sides, bright sunlit opening far behind',
    'elevated viewpoint, city in golden hour atmospheric haze below',
    'harbor wall of a small coastal town, boats soft in background, overcast morning',
    'narrow Kyoto side street, wooden facades, soft diffused late-afternoon light',
    'rooftop above Mediterranean rooflines, warm evening, terracotta and white receding behind',
  ],
  lifestyle: [
    'warm neighborhood café corner, marble counter, condensation on the window, mid-afternoon light',
    'sun-bleached urban rooftop terrace, city rooflines behind, golden hour',
    'city pavement under a canopy of plane trees, mottled shade-and-sun, late morning',
    'hotel room window ledge, soft city panorama through glass, afternoon',
    'sun-filled apartment kitchen, white tiles, indoor plants catching window light, morning',
  ],
  tech: [
    'minimal open-plan office, floor-to-ceiling window, cool diffused cloud daylight, industrial ceiling soft behind',
    'coffee shop corner, laptop implied just off-frame, morning window light from 9 o\'clock',
    'clean home studio setup, soft north-facing window, minimal desk behind',
    'modern co-working space, city view through full-height glass, afternoon',
  ],
  gaming: [
    'clean battlestation visible behind, RGB soft-glow as background, one window at 90° as key light',
    'modern space, neon accent soft in background, late evening one-window key',
  ],
  entertainment: [
    'rooftop at golden hour, city below, warm haze',
    'urban mural wall, bold color out of focus, late afternoon',
    'backstage corridor, warm strip practicals above, evening',
  ],
  default: [
    'clean urban street corner, warm afternoon, city architecture as soft atmospheric background',
    'bright minimal interior, natural daylight from large windows, white walls receding',
    'rooftop with city skyline behind, golden hour haze, warm atmospheric depth',
    'café window seat, street softened behind glass, afternoon light from the left',
  ],
}

// Outdoor-only scenes for the candid variation — always outside, alive, real
const OUTDOOR_CANDID_SCENES = [
  'tree-lined city sidewalk, mid-morning, soft dappled light filtering through the canopy overhead',
  'outdoor café terrace, small round table nearby, city street softened behind, mid-afternoon sun',
  'sunny boutique shopping street, warm afternoon light on the storefronts, no other people',
  'urban park path, greenery on both sides, natural soft mid-morning light through the trees',
  'corner outside a coffee shop, city intersection behind, warm mid-morning light from the side',
  'sun-warmed city steps or a low ledge at the edge of an open plaza, afternoon light from the front',
  'wide sun-drenched pavement outside a row of boutiques, warm late afternoon',
  'rooftop terrace with a few potted plants, city rooflines visible behind, golden hour light',
  'narrow sunny side street, warm afternoon light cutting diagonally across the pavement',
  'small outdoor market square, light warm and directional, the square otherwise empty',
]

const ALL_SCENES = Object.values(SCENE_POOLS).flat()

const NICHE_TO_SCENE_KEY = {
  'fashion':      'fashion',
  'beauty':       'beauty',
  'lifestyle':    'lifestyle',
  'fitness':      'fitness',
  'travel':       'travel',
  'food & dining':'lifestyle',
  'food':         'lifestyle',
  'tech':         'tech',
  'gaming':       'gaming',
  'finance':      'tech',
  'entertainment':'entertainment',
  'wellness':     'fitness',
  'sports':       'fitness',
  'sport':        'fitness',
}

function getScenePool(niches) {
  if (!niches || niches.length === 0) return ALL_SCENES
  const keys = [...new Set(niches.map(n => NICHE_TO_SCENE_KEY[n.toLowerCase()]).filter(Boolean))]
  if (keys.length === 0) return ALL_SCENES
  const pool = keys.flatMap(k => SCENE_POOLS[k] || [])
  return pool.length > 0 ? pool : ALL_SCENES
}

// ── Prop — niche-appropriate, ~30% chance ────────────────────
const DRINK_PROP_PATTERN = /latte|matcha|coffee|tea|smoothie|cup|straw|thermos|bubble/

function isDrinkProp(prop) {
  return !!prop && DRINK_PROP_PATTERN.test(prop)
}

const UNIVERSAL_PROPS = [
  'iced matcha latte in a clear to-go cup, bright green, paper straw, slight condensation',
  'iced coffee in a clear coffee shop cup with a dome lid, paper straw',
  'iced latte in a clear cup, light brown, ice visible through the sides, paper straw',
  'stainless steel wide-mouth water bottle, no logo, condensation on the outside',
  'small paper shopping bag held loosely at the side by the handles',
  'small pebbled leather tote held at the crook of the arm',
  'pair of clean sunglasses held loosely in one hand at the side',
  'worn-in paperback, held loosely by the spine',
  'small bouquet of dried or fresh flowers, stems in one hand',
  'small wired earbuds just removed, held loosely in one hand',
  'thin notebook held loosely under one arm',
  'phone held loosely at the side, screen off',
  null, null, null,
]

function getProp(noDrink = false) {
  if (Math.random() > 0.7) return null
  const options = noDrink ? UNIVERSAL_PROPS.filter(o => !isDrinkProp(o)) : UNIVERSAL_PROPS
  return R(options)
}

// ── Camera selection ──────────────────────────────────────────
// Always iPhone 16 Pro — the entire app identity is iPhone realism, never a professional camera
function getCamera() {
  return 'iPhone 16 Pro 24mm main lens f/1.78, held at arm\'s length or by a nearby friend, automatic exposure, natural sensor noise in shadow areas, slight lens barrel distortion at edges, 9:16 vertical, chest-up framing, face at the upper-third line, subject fills the center of the frame'
}

// ── Skin realism block ────────────────────────────────────────
function buildSkinBlock(timeLabel, gender, physicalDesc) {
  const pronoun = gender?.toLowerCase() === 'male' ? 'his' : 'her'
  const p = (physicalDesc || '').toLowerCase()
  const hasFair = p.includes('fair') || p.includes('pale') || p.includes('light skin')
  const hasDark = p.includes('dark skin') || p.includes('deep') || p.includes('ebony') || p.includes('melanin')

  const envReactions = {
    'golden hour late afternoon': hasFair
      ? 'warm golden flush across the forehead and cheekbone tops — more visible on fair skin, the lit side noticeably warm'
      : hasDark
      ? 'rich deep skin tones dimensional in the golden light, the high points — forehead, cheekbone — catching warmth'
      : 'faint sun-warmth across the forehead and tops of the cheekbones from afternoon outdoor exposure',
    'overcast soft daylight': 'even, cool-environment skin with a natural healthy flush — no sun warmth, no windburn',
    'bright sunny mid-morning': 'slight sun-warmth flush on the forehead and nose bridge, micro-fine sweat at the temples catching the hard light',
    'blue-hour dusk': 'faint cold-air redness around the nostrils and upper cheeks from the cooling evening temperature',
    'soft indoor afternoon window': 'soft thermal indoor flush at the cheeks from the heated space, gentle warmth settling across the face',
    'morning indoor café': 'a light warmth-flush as the skin adjusts from outdoor cool to the heated interior, slight color at the cheeks',
  }

  return `— Visible individual pores across ${pronoun} T-zone, nose, and cheeks; pores on the lit side cast tiny directional micro-shadows from the key light
— ${envReactions[timeLabel] || envReactions['overcast soft daylight']}
— ${R(['a small healing blemish on the left jaw, slightly pinker than surrounding skin', 'faint asymmetric sun pigmentation near the right temple', 'two freckles placed asymmetrically across the nose and left cheek', 'a faint old thin scar below the right jawline — barely there, photographically real', 'slight horizontal pressure line across the forehead from a hat worn earlier'])}
— Left brow sits marginally higher than the right; one nostril slightly narrower; cupid\'s bow peaks uneven — natural asymmetry throughout
— Subtle digital sensor noise in the shadow areas consistent with iPhone auto-ISO`
}

// ── Character framing from personality ───────────────────────
function getCharacterFraming(personality) {
  if (personality < 30)
    return 'quiet, inward energy — someone with a rich internal world, not performing for the camera. Real person, real life, not a model on a shoot'
  if (personality > 70)
    return 'open, present energy — moves through the world with ease, comfortable being seen. Real person, real life, not a model on a shoot'
  return 'natural, unhurried energy — comfortable in the moment. Real person, real life, not a model on a shoot'
}

// ── Claude system prompt ──────────────────────────────────────
export const HIGGSFIELD_SYSTEM = `You are a specialized prompt engineer for AI Influencer Studio — an app that generates iPhone-realism influencer photos. Every image must look exactly like a real photo taken on an iPhone by a friend: handheld, natural found light, real location, zero professional photography setup, zero retouching. This is the core identity of the product.

You write prompts only — never generate images. Convert the influencer profile below into a single GPT Image 2 prompt using EXACTLY this section format, with a blank line between each section:

Scene: [named real-world location — specific country feel, time of day, weather, atmosphere. State: "The location is empty of other people. Background reads as recognizable context but recedes — subject is the focal point."]

Subject: [age, gender, ethnicity/heritage cues from physical description, build, hair with color/length/texture, face shape, eye shape and color, distinguishing marks. Frame the character using their personality and backstory — the energy they carry. Include at least one anti-attractiveness-attractor cue: "end-of-day energy," "real person, not a model on a shoot," "lived-in."]

Pose: [body angle in degrees, weight distribution, specific hand placement. Drive pose style from personality score — low = contemplative/plandid/off-axis; high = candid mid-action or soft-aware posed-cute. Expression as a specific moment, not a label.]

Wardrobe & details: [every garment with material, fit, color, condition — specific, not generic. CRITICAL: personality score drives the energy level of the wardrobe — low personality = quiet understated clothes worn without deliberateness; high personality = expressive pieces worn with full intention. Use vibe words to steer aesthetic direction within that energy level. Include a note on HOW the clothes are worn (deliberately styled vs. just put on). No visible brand logos on any item.]

Lighting: [primary source with Kelvin and clock direction; secondary; ambient. 2–3 color temperatures on the face if mixed. "The subject's face is the brightest element in the frame."]

Camera & capture: [always iPhone 16 Pro 24mm main lens f/1.78, handheld, automatic settings, natural sensor noise in shadows. 9:16. Framing. Never a professional camera.]

Skin (rendered as concrete photographic facts — never adjectives):
— Visible pores with location and micro-shadow direction from the key light
— Specific environmental skin reaction — adapt to skin tone if described in the physical description
— One pressure/contact-line detail
— Lip condition
— One honest imperfection with exact placement
— One micro-detail real photos always have
— Satin sheen at high points only — rest matte and lived-in
— Peach fuzz catching key light along jawline and upper lip
— Asymmetry call
— Sensor noise matching camera and light level

Use case: [candid plandid / cute-posed feed shot / contemplative editorial / mid-action lifestyle]

Constraints: no people anywhere in the background. No visible brand logos. The subject is the clear focal point. iPhone photo — no blur, no bokeh, no professional lighting setup, no beauty retouching. Real pore texture and skin imperfections must be visible. This image must be indistinguishable from a real photo a friend posted on Instagram.

Rules:
- Every image is an iPhone snapshot — natural found light, handheld, real moment, zero professional photography feel
- Personality score drives wardrobe energy AND pose energy — they must feel consistent
- Vibe words steer aesthetic direction, not a single locked outfit — vary freely within that aesthetic direction
- Physical description feeds the Subject section exactly and informs the skin block's environmental reaction
- Backstory informs the character's energy framing in Subject
- Never: stunning, ethereal, hyper-realistic, 8K, ultra-detailed, perfect, glowing, symmetrical, flawless, editorial, fashion shoot
- Positive skin framing only — describe what real skin looks like
- Output ONLY the prompt inside one code block — no explanation, no preamble`

// ── Brief for Claude ──────────────────────────────────────────
export function buildPromptInput(d) {
  const p = d.personality ?? 50
  const personalityDesc = p < 30
    ? 'deeply introverted — quiet, internal, does not perform for the camera. Wardrobe should be understated and worn without deliberateness.'
    : p < 50
    ? 'slightly introverted — considered, one intentional choice in the look, otherwise relaxed.'
    : p < 70
    ? 'balanced — casually considered, looks good without looking like effort.'
    : p < 85
    ? 'extroverted — personality pieces starting to appear, visibly intentional, pulls the look together on purpose.'
    : 'highly extroverted — fully expressive, bold and deliberate choices, fully committed to the look.'
  const vibes = d.vibeWords?.length ? d.vibeWords.join(', ') : 'not specified'

  return `Generate a GPT Image 2 prompt for this AI influencer. Every input below drives the output directly.

Name: ${d.name || 'unnamed'}
Gender: ${d.gender || 'unspecified'}
Age: ${d.age || 'mid-20s'}
Physical description: ${d.physicalDesc || 'not specified — invent something photogenic'}
Aesthetic vibe words: ${vibes}
Personality (0=introvert, 100=extrovert): ${p}/100 — ${personalityDesc}
Backstory: ${d.backstory?.trim() || 'not given'}

Key requirements:
- Personality score drives BOTH the wardrobe energy level AND the pose style — they must feel consistent
- Vibe words steer aesthetic direction within the personality's energy range — vary freely, don't lock to one outfit
- Physical description feeds the Subject section exactly and informs the skin block's environmental reaction
- Backstory informs the character energy framing in the Subject section
- 9:16 vertical, no people in background, no logos
- Full skin block with all 10 elements — granular and concrete`
}

// ── Direct prompt builder — all inputs drive output ───────────
export function buildDirectPrompt(d, forcePose = null, options = {}, aspectRatio = '9:16') {
  const gender = d.gender || 'woman'
  const age = d.age ? `${d.age} year old` : 'mid-20s'
  const physical = d.physicalDesc?.trim() || 'with dark hair, warm complexion, natural features'
  const vibes = d.vibeWords || []
  const personality = d.personality ?? 50
  const backstory = d.backstory?.trim() || ''
  const isEditorial = vibes.includes('Editorial')

  // Always run tier-3 — it owns buildHint, physicalDetail, lockedScene.
  // Claude (tier-2) contributes dailyContext and can override sceneNiche/tags for unusual professions.
  const tier3Ctx = getBackstoryContext(d.physicalDesc, backstory)
  const backstoryCtx = d.backstoryContext
    ? {
        buildHint:      tier3Ctx.buildHint,
        physicalDetail: tier3Ctx.physicalDetail,
        lockedScene:    tier3Ctx.lockedScene,
        tags:           d.backstoryContext.tags?.length ? d.backstoryContext.tags : tier3Ctx.tags,
        sceneNiche:     d.backstoryContext.sceneNiche || tier3Ctx.sceneNiche,
        dailyContext:   d.backstoryContext.dailyContext,
      }
    : tier3Ctx
  const { sceneNiche, buildHint, physicalDetail, lockedScene } = backstoryCtx

  const niches = d.niches || (d.niche ? d.niche.split(',').map(s => s.trim()).filter(Boolean) : [])

  // Scene: backstory-locked → use exact lockedScene or profession pool; otherwise standard logic
  let scene
  if (options.backstoryLocked) {
    if (lockedScene) {
      scene = lockedScene
    } else if (sceneNiche && SCENE_POOLS[sceneNiche]) {
      scene = R(SCENE_POOLS[sceneNiche])
    } else {
      scene = R(getScenePool(niches))
    }
  } else if (options.forceOutdoor) {
    scene = R(OUTDOOR_CANDID_SCENES)
  } else if (sceneNiche && SCENE_POOLS[sceneNiche]) {
    scene = R(SCENE_POOLS[sceneNiche])
  } else {
    scene = R(getScenePool(niches))
  }

  // Pick time config compatible with the scene — outdoor scenes must not get indoor lighting
  const OUTDOOR_SCENE_PATTERN = /\b(park|trail|beach|rooftop|street|pavement|outdoor|alley|plaza|market|terrace|harbor|path|square|city|urban|cobblestone|courtyard|sidewalk|promenade)\b/i
  const isOutdoor = OUTDOOR_SCENE_PATTERN.test(scene)
  const outdoorTimes = TIME_CONFIGS.filter(t => !t.label.includes('indoor') && !t.label.includes('café'))
  const timeConfig = R(isOutdoor ? outdoorTimes : TIME_CONFIGS)

  const poseFn = forcePose || getPoseFromPersonality(personality)
  // Use pre-generated prop from session manager if provided, otherwise generate one
  const prop = 'forceProp' in options ? options.forceProp : getProp()

  // Backstory-locked: force profession wardrobe tags when no vibe selected.
  // For lockedScenes (specific indoor profession settings), drop lifestyle tags like 'casual'
  // so athleisure/street entries don't compete with actual gym/clinical wardrobe.
  const forcedProfTags = (options.backstoryLocked && !vibes.length)
    ? (lockedScene ? backstoryCtx.tags.filter(t => t !== 'casual' && t !== 'urban' && t !== 'street') : backstoryCtx.tags)
    : null
  const wardrobeBase = selectWardrobe(gender, vibes, personality, d.physicalDesc, d.backstory, forcedProfTags)
  const paletteLine = options.model !== 'soul_2'
    ? vibes.map(v => VIBE_PALETTE_MAP[v]).filter(Boolean).join(' | ')
    : ''
  const wardrobe = paletteLine ? `${wardrobeBase}\n${paletteLine}` : wardrobeBase
  const camera = getCamera()
  const skinBlock = buildSkinBlock(timeConfig.label, gender, physical)
  const characterFraming = getCharacterFraming(personality)

  const propDesc = prop
    ? `${prop} held in one hand — no visible brand logo`
    : 'hands in a natural mid-gesture, nothing held'

  const dailyCtxLine = ''

  // Backstory-locked physical additions: build type (if user left build blank) + profession marker
  const buildDesc = (options.backstoryLocked && buildHint && !d.build?.trim()) ? `, ${buildHint}` : ''
  const physicalDetailStr = (options.backstoryLocked && physicalDetail) ? `, ${physicalDetail}` : ''

  const poseName = poseFn === POSES.frontfacing ? 'iPhone portrait — direct, relaxed, facing camera'
    : poseFn === POSES.contemplative ? 'iPhone portrait — quiet, present, facing camera'
    : poseFn === POSES.plandid ? 'iPhone candid — soft awareness, facing camera'
    : poseFn === POSES.posed_cute ? 'iPhone feed shot — soft pose, eyes at lens'
    : 'iPhone candid — mid-moment, eyes at the lens'

  return `Photograph style: iPhone 16 Pro snapshot. Taken by the subject or a nearby friend, handheld, automatic settings. No professional crew, no studio, no lighting setup, no direction given. Raw iPhone output — unedited. The subject is unaware this will be published — a personal photo, not intended for any shoot.

Scene: ${scene}${options.backstoryLocked && lockedScene ? '' : `, ${timeConfig.label}`}. Empty of other people. If the location is an interior, it shows real signs of habitation — not a styled showroom. Background is real, in-focus, and unmanipulated exactly as an iPhone captures it — no blur, no bokeh, no artificial depth of field. The subject is the hero through tight framing and natural lighting, not through background manipulation.

Subject: ${gender}, ${age}, ${physical}${buildDesc}${physicalDetailStr}. ${characterFraming}.${dailyCtxLine} Natural micro-asymmetries in the face — this is a real iPhone photograph of a real person, not a 3D render or CGI. Real visible pore texture on the nose, cheeks, and forehead — and on all exposed skin including arms, neck, and shoulders. Zero skin smoothing anywhere on the body, zero airbrushing, zero beauty filter applied.

Pose: ${poseFn(prop)} ${propDesc}.

Wardrobe & details: ${wardrobe}

Lighting: ${timeConfig.lighting} The subject's face is the brightest element in the frame. This is natural found light — not a lighting setup.

Camera & capture: ${camera}.

Skin (rendered as concrete photographic facts, not category words):
${skinBlock}

Use case: ${poseName}

Constraints: no people in the background. No visible brand logos on any item. ${aspectRatio === '16:9' ? 'Horizontal landscape frame — subject standing close to camera, filling at least half the frame height, environment visible on both sides. Not a distant wide shot — the subject must be close enough that face and outfit detail are fully legible. This is a wide candid, not a portrait crop rotated sideways.' : 'Subject fills 60–70% of the 9:16 frame — tight crop, not a wide environmental shot.'} No background blur or bokeh. Real pore texture and skin imperfections visible on the face and all exposed body skin — zero beauty retouching. No AI aesthetic markers: no unnaturally bright irises, no perfectly symmetrical face, no plastic-smooth skin, no uncanny glow. No phone screen, no social media UI, no app overlay, no notification bar, no status bar, no interface elements of any kind visible anywhere in the image. This is a raw photograph — no digital overlays, no framing devices, no UI chrome. ${isEditorial ? 'Editorial vibe applies to the styling only — the photo itself is a raw iPhone snapshot.' : ''}`
}

// ── Three distinct variation prompts — different poses per card ─
export function buildThreeVariationPrompts(d, aspectRatio = '9:16', model = 'gpt_image_2') {
  // Generate props for the session upfront:
  // — candid pose never gets a drink (mid-sip is too dominant)
  // — max 1 drink across all 3 variations
  let drinkUsed = false
  function sessionProp(noDrink = false) {
    const p = getProp(noDrink || drinkUsed)
    if (isDrinkProp(p)) drinkUsed = true
    return p
  }

  if (model === 'soul_2') {
    return [
      buildDirectPrompt(d, POSES_SOUL.facing,  { model: 'soul_2', forceProp: sessionProp() }, aspectRatio),
      buildDirectPrompt(d, POSES_SOUL.angled,  { model: 'soul_2', forceProp: sessionProp() }, aspectRatio),
      buildDirectPrompt(d, POSES_SOUL.candid,  { forceOutdoor: true, model: 'soul_2', forceProp: sessionProp(true) }, aspectRatio),
    ]
  }
  // Variation 3 is backstory-locked when a profession is detected.
  // Tier-3 always owns lockedScene; Claude can add sceneNiche for unusual professions.
  const tier3Ctx = getBackstoryContext(d.physicalDesc, d.backstory?.trim() || '')
  const hasBackstoryLock = !!(tier3Ctx.sceneNiche || tier3Ctx.lockedScene || d.backstoryContext?.sceneNiche)

  return [
    buildDirectPrompt(d, POSES.frontfacing, { forceProp: sessionProp() }, aspectRatio),
    buildDirectPrompt(d, POSES.posed_cute,  { forceProp: sessionProp() }, aspectRatio),
    hasBackstoryLock
      ? buildDirectPrompt(d, POSES.candid, { backstoryLocked: true, forceProp: null }, aspectRatio)
      : buildDirectPrompt(d, POSES.candid, { forceOutdoor: true, forceProp: sessionProp(true) }, aspectRatio),
  ]
}
