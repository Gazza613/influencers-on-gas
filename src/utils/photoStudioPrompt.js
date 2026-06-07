// GPT Image 2 Photo Studio prompt engine
// Based on the photo-studio-influencer-guide.md realism spec

export const LOCATIONS = [
  { id: 'coffee-shop',   label: 'Coffee Shop',    icon: '☕' },
  { id: 'city-street',   label: 'City Street',    icon: '🏙' },
  { id: 'beach',         label: 'Beach',          icon: '🌊' },
  { id: 'rooftop',       label: 'Rooftop',        icon: '🌆' },
  { id: 'bedroom',       label: 'Bedroom',        icon: '🛏' },
  { id: 'bathroom',      label: 'Mirror Selfie',  icon: '🪞' },
  { id: 'mall',          label: 'Mall',           icon: '🛍' },
  { id: 'gym',           label: 'Gym',            icon: '💪' },
  { id: 'park',          label: 'Park',           icon: '🌿' },
  { id: 'restaurant',    label: 'Restaurant',     icon: '🍽' },
  { id: 'hotel',         label: 'Hotel Room',     icon: '🏨' },
  { id: 'studio',        label: 'Studio',         icon: '🎨' },
]

export const TIMES = [
  { id: 'morning',      label: 'Morning'      },
  { id: 'afternoon',    label: 'Afternoon'    },
  { id: 'golden-hour',  label: 'Golden Hour'  },
  { id: 'night',        label: 'Night'        },
]

// ── Pose arrays by gender + stance ───────────────────────────────────────────

export const POSES_FEMALE_STANDING = [
  { id: 'front',          label: 'Front-Facing'    },
  { id: 'handheld',       label: 'Handheld'        },
  { id: 'candid',         label: 'Candid'          },
  { id: 'cute-posed',     label: 'Hair Touch'      },
  { id: 'hip-pop',        label: 'Hip Pop'         },
  { id: 'over-shoulder',  label: 'Over Shoulder'   },
  { id: 'facing-away',    label: 'Facing Away'     },
  { id: 'walking',        label: 'Walking'         },
  { id: 'mid-turn',       label: 'Mid Turn'        },
  { id: 'long-line',      label: 'Step Out'        },
  { id: 'lean',           label: 'Wall Lean'       },
]

export const POSES_MALE_STANDING = [
  { id: 'front',          label: 'Confident Front'  },
  { id: 'handheld',       label: 'Handheld'         },
  { id: 'hands-pockets',  label: 'Hands In Pockets' },
  { id: 'crossed-arms',   label: 'Crossed Arms'     },
  { id: 'lean',           label: 'Environment Lean' },
  { id: 'walking',        label: 'Walking'          },
  { id: 'over-shoulder',  label: 'Over Shoulder'    },
  { id: 'facing-away',    label: 'Facing Away'      },
]

// Backward compat for any existing import of POSES
export const POSES = POSES_FEMALE_STANDING

// Pose list is the same regardless of stance — sitting just adapts the framing and position
export function getPoses(gender) {
  return gender === 'Male' ? POSES_MALE_STANDING : POSES_FEMALE_STANDING
}

export const VIBES = [
  { id: 'candid',    label: 'Candid'    },
  { id: 'editorial', label: 'Editorial' },
  { id: 'luxury',    label: 'Luxury'    },
  { id: 'street',    label: 'Street'    },
  { id: 'cozy',      label: 'Cozy'      },
]

// ── Expressions ───────────────────────────────────────────────────────────────

export const EXPRESSIONS = [
  { id: 'natural',  label: 'Natural'   },
  { id: 'smiling',  label: 'Smiling'   },
  { id: 'laughing', label: 'Mid-Laugh' },
  { id: 'serious',  label: 'Serious'   },
]

const EXPRESSION_MAP = {
  'natural':      '',
  'smiling':      'Expression: a genuine soft smile — lips parted slightly, upper teeth just visible, the smile reaching the outer corners of the eyes with warmth.',
  'laughing':     'Expression: caught mid-laugh at the apex — head tilted slightly back, eyes fully crinkled with genuine amusement, mouth open, the laugh spontaneous and unposed.',
  'serious':      'Expression: direct and serious — neutral mouth at rest, steady gaze into the lens, no smile. Composed and self-assured.',
  'looking-away': '', // legacy — gaze toggle handles this now
}

// Location-aware prop suggestions shown as placeholder text
export const PROP_SUGGESTIONS = {
  'coffee-shop': 'e.g. holding a coffee cup',
  'restaurant':  'e.g. holding a wine glass',
  'beach':       'e.g. holding sunglasses or a hat',
  'gym':         'e.g. holding a water bottle',
  'mall':        'e.g. carrying shopping bags',
  'city-street': 'e.g. adjusting a bag strap',
  'bedroom':     'e.g. holding a phone or book',
  'bathroom':    'e.g. holding a phone (mirror selfie)',
  'hotel':       'e.g. holding a clutch or room key',
  'rooftop':     'e.g. holding a drink or phone',
  'park':        'e.g. holding a takeaway coffee',
  'studio':      'e.g. no prop',
}

export const ASPECTS = ['9:16', '16:9']

export const OUTFIT_PRESETS_FEMALE = [
  { id: 'Casual',      label: 'Casual' },
  { id: 'Streetwear',  label: 'Streetwear' },
  { id: 'Chic',        label: 'Chic' },
  { id: 'Athleisure',  label: 'Athleisure' },
  { id: 'Minimal',     label: 'Minimal' },
  { id: 'Glam',        label: 'Glam' },
  { id: 'Party',       label: 'Party' },
  { id: 'Cozy',        label: 'Cozy' },
]

export const OUTFIT_PRESETS_MALE = [
  { id: 'Casual',         label: 'Casual' },
  { id: 'Streetwear',     label: 'Streetwear' },
  { id: 'Smart Casual',   label: 'Smart Casual' },
  { id: 'Athleisure',     label: 'Athleisure' },
  { id: 'Minimal',        label: 'Minimal' },
  { id: 'Business',       label: 'Business' },
  { id: 'Party',          label: 'Party' },
  { id: 'Cozy',           label: 'Cozy' },
]

// Keep old export for any code that still references it
export const OUTFIT_PRESETS = OUTFIT_PRESETS_FEMALE.map(o => o.id)

const OUTFIT_PRESET_MAP_FEMALE = {
  Casual:     'High-waist straight-leg jeans, a fitted white tee or ribbed tank tucked at the front, white leather sneakers or ballet flats. Effortless and put-together.',
  Streetwear: 'Baggy cargo pants or wide-leg denim, an oversized graphic tee or cropped hoodie, chunky sneakers, a fitted cap or bucket hat. Bold and urban.',
  Chic:       'Tailored wide-leg trousers or a midi wrap skirt, a fitted silk or satin blouse, pointed-toe kitten heels or mules, delicate gold jewellery. Polished and intentional.',
  Athleisure: 'High-waist leggings or biker shorts, a cropped sports bra or fitted zip-up hoodie, clean white trainers. Gym-to-street energy.',
  Minimal:    'Neutral tones only — cream, beige, stone, white. A clean ribbed tank or fitted turtleneck, straight-leg trousers or a long linen skirt, simple leather sneakers or mules. Nothing extra.',
  Glam:       'A slinky satin slip dress or a fitted co-ord set in a jewel tone or champagne, strappy stilettos, statement drop earrings, a small evening clutch. Dressed up.',
  Party:      'A bodycon mini dress or a spaghetti-strap top with low-rise straight jeans, heeled ankle boots or platform sandals, a small chain-strap bag. Night-out confident.',
  Cozy:       'An oversized chunky knit cardigan or hoodie over a longline tee, soft wide-leg sweatpants or joggers, fluffy socks, slide sandals. Stay-home comfortable.',
}

const OUTFIT_PRESET_MAP_MALE = {
  Casual:        'Well-fitted straight-leg jeans or chinos in a neutral tone, a clean crew-neck tee or lightweight chambray shirt, white leather sneakers. Everyday sharp.',
  Streetwear:    'Baggy cargo pants or wide-leg denim, an oversized graphic tee or heavyweight hoodie, chunky sneakers, a fitted cap or beanie. Urban and confident.',
  'Smart Casual': 'Slim dark jeans or tapered chinos, an untucked linen or Oxford button-down with sleeves rolled up, clean suede loafers or leather trainers. Effortlessly put-together.',
  Athleisure:    'Tapered joggers or training shorts, a fitted moisture-wicking tee or quarter-zip pullover, clean running shoes. Ready to move.',
  Minimal:       'Neutral palette — black, white, grey, stone. A fitted crewneck or Henley, slim straight trousers, simple clean sneakers or Chelsea boots. No logos, nothing extra.',
  Business:      'Slim-fit chinos or tailored trousers, a tucked Oxford shirt with the collar open, a sharp unstructured blazer in navy or camel, leather loafers or clean dress shoes.',
  Party:         'Dark slim jeans or tailored trousers, a fitted satin or textured button-up left partially open, leather Chelsea boots or clean dress shoes, a simple watch.',
  Cozy:          'An oversized knit sweater or zip-up hoodie, relaxed wide-leg sweatpants or joggers, thick crew socks, slide sandals or low-profile sneakers.',
}

export function getOutfitPresets(gender) {
  return gender === 'Male' ? OUTFIT_PRESETS_MALE : OUTFIT_PRESETS_FEMALE
}

export function getOutfitPrompt(presetId, gender) {
  const map = gender === 'Male' ? OUTFIT_PRESET_MAP_MALE : OUTFIT_PRESET_MAP_FEMALE
  return map[presetId] || null
}

// ── Scene variants — 4 meaningfully distinct spots per location ───────────────
// variationIdx selects which; lighting and time-of-day come from SHORT_LIGHTING separately.

const SCENE_VARIANTS = {
  'coffee-shop': [
    'Near the front window, street traffic soft and blurred outside the glass, a flat white on the small table beside her.',
    'Standing at the café counter, the espresso machine just behind, ceramic cups stacked on the shelf, the barista area softly out of focus.',
    'In a cosy corner of the café, a trailing plant catching the light, a low shelf with books visible to one side.',
    'In the open café floor, chairs and tables surrounding her, a chalkboard menu visible on the far wall.',
  ],
  'city-street': [
    'A wide pedestrian pavement, shopfronts with awnings receding behind her, a couple of parked cars at the kerb.',
    'A narrow side street, worn brick walls on either side, a tiled doorway or iron gate partially visible behind her.',
    'At a busy intersection corner, a pedestrian crossing ahead, taxis and delivery bikes soft and distant behind.',
    'Standing outside a boutique entrance, the lit shop window display visible to one side, the street stretching ahead of her.',
  ],
  'beach': [
    'At the waterline, the ocean stretching flat to the horizon directly behind her, wet sand at her feet.',
    'Higher up the dry beach near the dunes, beach grass or low scrub visible in the far background.',
    'Near a weathered lifeguard tower or beach bar structure, the timber frame partially in frame, the beach spreading beyond.',
    'On a beach boardwalk, wooden planks underfoot, the beach and ocean visible below and behind.',
  ],
  'rooftop': [
    'At the rooftop ledge, hands near the concrete parapet, the city grid stretching to the horizon behind her.',
    'Near a water tower structure on the roof, the tower framing one side of the background.',
    'In a rooftop garden area, terracotta pots and low trailing greenery around her, the skyline behind.',
    'Under a timber pergola with string lights threaded overhead, the city glowing behind her in the distance.',
  ],
  'bedroom': [
    'Standing by the window, curtains half-drawn, natural light falling across from one side, the bed and nightstand soft behind.',
    'In front of the full-length mirror or dresser, the room reflected behind her, jewellery and a perfume bottle on the surface.',
    'Near the bed, the rumpled duvet and stacked pillows in the background, a bedside lamp just visible to one side.',
    'By the open wardrobe or bedroom door, clothes loosely visible inside, a floor lamp casting warm light in the corner.',
  ],
  'bathroom': [
    'Directly facing the bathroom mirror, the room reflected behind her, products lined along the counter.',
    'Side-on near the sink, the tap and basin just visible, a shelf of skincare products in the background.',
    'Against the tiled wall beside the shower screen, steam or condensation present, a towel on the rail behind.',
    'At a vanity with lit mirror surrounds, the mirror frame catching the light, products and a small candle arranged beside.',
  ],
  'mall': [
    'In the centre of a wide mall corridor, storefronts on both sides receding symmetrically behind her.',
    'Just outside a store entrance, the shop window display softly glowing to one side of the frame.',
    'On an upper floor landing near an escalator, the levels of the mall visible below.',
    'In a quiet mall atrium, a large overhead skylight above, marble floors reflecting the ambient light below.',
  ],
  'gym': [
    'In the free weights area, a dumbbell rack and weight plates partially visible in the soft background.',
    'In front of the floor-to-ceiling mirrored gym wall, her reflection and the equipment receding behind her.',
    'Near a cable machine or a flat bench, other equipment visible and blurred in the background.',
    'By the gym entrance or water station, a reception counter or locker bank softly visible behind her.',
  ],
  'park': [
    'On a paved park path, mature trees lining both sides and the path curving away behind her.',
    'On the open grass beside a large tree, the trunk partially at the edge of frame, the lawn and sky beyond.',
    'Near a park bench, the wooden bench just visible behind her, a flower bed or low hedge in the distance.',
    'On a stone bridge over a small pond or near a fountain, the water and surrounding greenery soft behind.',
  ],
  'restaurant': [
    'At a window table, the street or garden just visible through the glass behind her, linen on the table.',
    'In the centre of the dining room, dressed tables and chairs stretching away in the warm background.',
    'At the bar end of the restaurant, bottles and the bar-back shelving softly visible behind her.',
    'In a corner booth, slightly dimmer and more intimate, a candle on the table, the main dining room beyond.',
  ],
  'hotel': [
    'At the floor-to-ceiling window, the city skyline or landscape soft and luminous behind her.',
    'Near the bed, the upholstered headboard and crisp white pillows composing the background.',
    'At the hotel room desk or dressing table, the large wall mirror reflecting the room behind her.',
    'In the carpeted hotel corridor just outside the room, the hallway receding with wall sconces behind her.',
  ],
  'studio': [
    'Against a white seamless paper backdrop, nothing but clean negative space behind and below.',
    'In front of a large north-facing window, soft daylight from one side, plain white walls all around.',
    'Near a bare metal clothing rail, a few garments loosely hanging just to one side of the frame.',
    'In an open studio loft, exposed brick or industrial ceiling details soft in the background behind her.',
  ],
}

// ── Background people — cycles with variationIdx for natural variety ──────────
// Even indexes = empty environment; odd indexes = soft background figures

const BACKGROUND_PEOPLE = [
  'No other people in frame.',
  'One or two blurred figures in the far background, naturally present in the environment, completely out of focus.',
  'No other people in frame.',
  'A few soft figures visible in the background going about their day, entirely out of focus and incidental.',
]

// ── Time of day — explicit atmosphere stated before the lighting note ─────────

const TIME_ATMO = {
  'morning':     'Time of day: early morning — the sun has just risen, low on the horizon, the world is quiet and calm, air is cool and still.',
  'afternoon':   'Time of day: midday afternoon — the sun is high overhead, full bright daylight, warm temperatures, the day at its most active.',
  'golden-hour': 'Time of day: golden hour — the sun is sitting just at the horizon, warm amber and orange tones flood the entire scene, long soft shadows stretching across everything.',
  'night':       'Time of day: night — it is fully dark outside, the sky is black or deep navy, zero natural light, all illumination comes from artificial sources in the environment.',
}

// ── Location label — explicit setting stated before the scene description ─────

const LOCATION_LABEL = {
  'coffee-shop': 'The location is a coffee shop interior.',
  'city-street': 'The location is an outdoor city street.',
  'beach':       'The location is a beach outdoors.',
  'rooftop':     'The location is a rooftop terrace.',
  'bedroom':     'The location is a private bedroom interior.',
  'bathroom':    'The location is a bathroom — this is a mirror selfie.',
  'mall':        'The location is inside a shopping mall.',
  'gym':         'The location is inside a gym.',
  'park':        'The location is an outdoor park.',
  'restaurant':  'The location is inside a restaurant.',
  'hotel':       'The location is a hotel room interior.',
  'studio':      'The location is a photography studio.',
}

// ── Short lighting (1 sentence per slot) ─────────────────────────────────────

const SHORT_LIGHTING = {
  'coffee-shop': {
    morning:       'Soft morning window light from one side, cool and directional.',
    afternoon:     'Warm filtered window light, slight tungsten from overhead pendants.',
    'golden-hour': 'Low warm golden-hour sun through the window, amber and tungsten mixing.',
    night:         'Warm tungsten pendant overhead as key, intimate and dim.',
  },
  'city-street': {
    morning:       'Cool early skylight, thin strip of low sun catching one shoulder.',
    afternoon:     'Hard direct sun from front-left, sharp clean shadows.',
    'golden-hour': 'Low warm backlight rimming the hair, cool sky-bounce fill on the face.',
    night:         'Warm sodium streetlamp overhead, cool blue twilight, neon accents in background.',
  },
  'beach': {
    morning:       'Cool soft overcast skylight, even and shadowless.',
    afternoon:     'Strong direct sun from above, sand-bounce fill on the shadow side.',
    'golden-hour': 'Golden rim light from the horizon, warm reflected light from wet sand below.',
    night:         'Warm market string lights overhead, contained and intimate.',
  },
  'rooftop': {
    morning:       'Cool blue morning sky as ambient fill, thin first sun from one side.',
    afternoon:     'Full direct sun, hard shadows, open sky as fill.',
    'golden-hour': 'Low sun backlighting from the city horizon, cool sky-bounce on the face.',
    night:         'City glow as soft ambient, string lights or LED overhead as warm key.',
  },
  'bedroom': {
    morning:       'Soft directional window light, single source, clean and warm.',
    afternoon:     'Window daylight from one side, cool and clean.',
    'golden-hour': 'Narrow amber light slanting through the window, high contrast.',
    night:         'Bedside lamp as warm tungsten key, intimate falloff.',
  },
  'bathroom': {
    morning:       'Overhead bathroom light plus soft side window daylight, two temperatures.',
    afternoon:     'Frosted window as soft side key, overhead light supplementing.',
    'golden-hour': 'Overhead bathroom light primary, small warm window accent.',
    night:         'Bright overhead bathroom light, contained and even.',
  },
  'mall': {
    morning:       'Soft cool skylight overhead, warm storefront spill from the sides.',
    afternoon:     'Bright skylight from above, warm store lighting from the sides.',
    'golden-hour': 'Artificial pendants taking over as skylight fades, warm transitional.',
    night:         'Warm mall pendants overhead, cool-neutral LED from store entries.',
  },
  'gym': {
    morning:       'Cool fluorescent overhead, first daylight from a side window.',
    afternoon:     'Overhead fluorescent, bright and flat, mirror bounce.',
    'golden-hour': 'Warm window flood from one side, cool fluorescent overhead.',
    night:         'Overhead fluorescent, even and institutional, no natural fill.',
  },
  'park': {
    morning:       'Cool dappled light through leaf canopy, soft and slightly green-tinted.',
    afternoon:     'Dappled sun patches through canopy, warm and cool mixing.',
    'golden-hour': 'Low warm backlight through leaves, sky-bounce fill on the face.',
    night:         'Warm lamp posts creating pools, cool dark gaps between.',
  },
  'restaurant': {
    morning:       'Bright garden-facing window, clean natural key light.',
    afternoon:     'Warm pendant interior, window daylight from one side.',
    'golden-hour': 'Golden-hour window table, warm outdoor light mixing with warm interior.',
    night:         'Candlelight key from below, warm restaurant pendants overhead.',
  },
  'hotel': {
    morning:       'Strip of morning daylight through the curtains, warm bedside lamp as fill.',
    afternoon:     'Floor-to-ceiling window, bright clean directional daylight.',
    'golden-hour': 'Golden-hour flooding floor-to-ceiling glass, warm and rich.',
    night:         'Floor lamp as warm key, city glow through window as ambient.',
  },
  'studio': {
    morning:       'Large north-facing window, soft cool diffuse daylight from one side.',
    afternoon:     'West window directional daylight, studio walls bouncing a soft fill.',
    'golden-hour': 'Golden-hour flooding from the west window, warm and directional.',
    night:         'Two softboxes — primary right at 3 o\'clock, fill left at 9 o\'clock.',
  },
}


// ── Pose descriptions ─────────────────────────────────────────────────────────
// All poses — keyed by pose ID, used in buildPhotoStudioPrompt

const POSE_MAP = {
  // ── Female standing ─────────────────────────────────────────
  plandid:
    'Natural plandid moment — caught in a real activity, not posing. Interacting with the environment, not looking at the camera.',
  candid: null, // resolved dynamically in buildPhotoStudioPrompt — do not use directly
  handheld:
    'Handheld selfie — one arm extended straight toward the camera, phone gripped in that hand with fingers curling around it, pointing directly at the lens. Shot from the phone\'s perspective: the subject fills most of the frame, arm foreshortened toward the viewer. Looking straight into the front-facing lens. Other arm relaxed at the side or resting naturally. Natural slight-below-eye-level selfie angle. Candid and personal.',
  'cute-posed':
    'Cute posed stance — one hand lightly touching the hair or face, soft and natural.',
  walking:
    'Mid-stride, walking naturally, completely off the camera.',
  'mid-turn':
    'Caught mid-turn, as if just hearing their name called — body still turning, head looking back.',
  front:
    'Facing the camera directly, confident and composed.',
  'hip-pop':
    'Hip pop pose — natural S-curve with one hip shifted out to the side.',
  triangle:
    'One hand on hip, natural triangle shape with the arm, relaxed fashion pose.',
  'over-shoulder':
    'Body turned away from camera, looking back over the shoulder.',
  'facing-away':
    'Fully facing away from the camera — back to the lens, both hands clasped together behind the back, standing with a subtle relaxed forward tilt, head looking forward or slightly down. Shot from behind. Completely unaware of being photographed.',
  'long-line':
    'Tall elegant fashion pose, one leg extended forward, long clean line through the body.',
  lean:
    'Leaning casually against a wall or surface, relaxed and at ease.',

  // ── Male standing ────────────────────────────────────────────
  'hands-pockets':
    'Hands in pockets, relaxed and natural, not performing.',
  'crossed-arms':
    'Arms crossed, confident and settled.',

  // ── Sitting — female ─────────────────────────────────────────
  'seated-casual':
    'Seated casually, relaxed and natural.',
  'seated-extended':
    'Seated with legs extended out in front, relaxed and elongated.',
  'seated-crossed':
    'Seated cross-legged, comfortable and grounded.',
  'seated-lean':
    'Seated and leaning slightly forward, relaxed and engaged.',
}


// Specific candid actions — one is picked deterministically per image slot.
// "laughing" is excluded here; it's reserved for the laughing expression preset.
const CANDID_ACTIONS = [
  'caught mid-sip, raising a drink to their lips',
  'caught mid-step, walking naturally',
  'caught mid-reach, grabbing something nearby',
  'looking down at their phone',
  'caught adjusting their hair',
]

// ── Main builder ──────────────────────────────────────────────────────────────
// Photo Studio always passes reference images — this is an edit, not a generation.
// @image1 = identity (influencer main photo), @image2 = outfit (character sheet / wardrobe card).
// Prompt is short and directive: placement + action only. Do not re-describe the refs.

export function buildPhotoStudioPrompt({ influencer, location, timeOfDay, pose, vibe, wardrobeText, hairstyleText, outfitPreset, stance, aspectRatio, expression, gaze = 'at-camera', propText, propRefs = [], faceTag = null, wardrobeTag = null, closeUp1Tag = null, closeUp2Tag = null, variationIdx = null }) {
  const loc       = location    || 'coffee-shop'
  const tod       = timeOfDay   || 'afternoon'
  const poseId    = pose        || 'front'
  const ratio     = aspectRatio || '9:16'
  const isSitting = stance === 'sitting'

  // ── Shot type opener ──────────────────────────────────────────────
  const shotType = vibe === 'editorial' ? 'Editorial photo'
    : vibe === 'luxury'    ? 'Luxury lifestyle photo'
    : vibe === 'street'    ? 'Street style photo'
    : 'Candid iPhone photo'

  // ── Subject — ref tag if available, minimal text fallback ─────────
  const subject = faceTag || (() => {
    const physDesc = influencer?.physicalDesc || ''
    const age      = influencer?.age ? `${influencer.age}-year-old` : 'young'
    const gender   = influencer?.gender === 'Male' ? 'man' : 'woman'
    return physDesc ? `a ${age} ${gender}, ${physDesc}` : `a ${age} ${gender}`
  })()

  // ── Wardrobe — ref tag if available, text description otherwise ───
  const gender = influencer?.gender || 'Female'
  const outfitMap = gender === 'Male' ? OUTFIT_PRESET_MAP_MALE : OUTFIT_PRESET_MAP_FEMALE
  const hasHairstyleOverride = !!hairstyleText?.trim()
  const wardrobe = wardrobeTag
    ? `the complete outfit from ${wardrobeTag} — reproduce every item exactly as shown: all clothing, headwear, and accessories must match the reference. If headwear is present in the reference, it must be worn on the head${hasHairstyleOverride ? '' : '. Match the hairstyle from this reference exactly'}`
    : wardrobeText?.trim()
      || (outfitPreset && outfitPreset !== 'current' && outfitMap[outfitPreset])
      || 'their current outfit'

  // ── Close-up detail line (skin texture + face detail) ────────────
  const closeUpLine = closeUp1Tag && closeUp2Tag
    ? `Match skin texture and facial detail from ${closeUp1Tag} and ${closeUp2Tag}.`
    : closeUp1Tag
    ? `Match skin texture and facial detail from ${closeUp1Tag}.`
    : ''

  // ── Pose — kept detailed, this is the primary direction ───────────
  let basePose
  if (poseId === 'candid') {
    // Pick one specific action — never give the model a list of options.
    // Use variationIdx so each slot in a batch gets a different action.
    const idx = variationIdx !== null ? variationIdx : Math.floor(Math.random() * CANDID_ACTIONS.length)
    const action = CANDID_ACTIONS[idx % CANDID_ACTIONS.length]
    basePose = `Candid pose — ${action}. Unaware of the camera.`
  } else if (POSE_MAP[poseId]) {
    basePose = POSE_MAP[poseId]
  } else {
    // Custom pose text typed by the user
    basePose = poseId.trim() || POSE_MAP['front']
  }
  const stancePrefix = isSitting
    ? 'Subject is clearly seated. '
    : 'Subject is standing upright on both feet — not sitting, not crouching. '
  const poseDesc = stancePrefix + basePose

  // ── Expression (omit if natural; use custom text if not a known preset) ─
  const expressionDesc = EXPRESSION_MAP[expression] !== undefined
    ? (EXPRESSION_MAP[expression] || '')
    : (expression?.trim() ? `Expression: ${expression.trim()}.` : '')

  // ── Gaze direction — suppressed when back is fully to camera ────────
  const faceAwayPose = poseId === 'facing-away'
  const gazeDesc = (!faceAwayPose && gaze === 'looking-away')
    ? 'Eyes directed off-axis — looking to the side or slightly above the camera, as if unaware of being photographed.'
    : ''

  // ── Props ─────────────────────────────────────────────────────────
  const propDesc = (() => {
    if (!propRefs.length && !propText?.trim()) return ''
    const gPron = influencer?.gender === 'Male' ? 'his' : influencer?.gender === 'Female' ? 'her' : 'their'
    const hand  = `${gPron} hand`
    const lines = []

    // All "holding" refs are grouped into ONE instruction — they reference the same product from
    // different angles (original + character sheet). Two separate lines would make the model fill both hands.
    const holdingRefs = propRefs.filter(r => r.mode === 'holding')
    const wearingRefs = propRefs.filter(r => r.mode === 'wearing')

    if (holdingRefs.length) {
      const tags = holdingRefs.map(r => r.tag).join(' and ')
      lines.push(`Holding the single product shown in ${tags} in ${hand} — one item, gripped naturally and clearly visible. It is held in hand only, not worn or placed anywhere on the body. Match every product detail, colour, and branding exactly to the reference${holdingRefs.length > 1 ? 's' : ''}.`)
      lines.push(`${gPron.charAt(0).toUpperCase() + gPron.slice(1)} other hand is completely empty and relaxed at ${gPron} side — absolutely nothing else held, carried, or placed in either hand.`)
      if (wardrobeTag) {
        lines.push(`IMPORTANT — this held product is a completely separate item from the outfit in ${wardrobeTag}. Any headwear, cap, hat, or accessory that appears in the outfit reference is part of the outfit and must still be worn on the body exactly as shown. The held product in ${tags} is an additional prop in the hand — do not conflate it with outfit items, and do not remove or omit any part of the outfit because of this prop.`)
      }
    }

    // Each wearing ref is its own instruction (could be distinct items)
    wearingRefs.forEach(({ tag }) => {
      lines.push(`Wearing the item from ${tag} on the body — it is worn, not held in hand, not carried. Match every product detail, colour, and branding exactly as shown in the reference.`)
    })

    if (propRefs.length) lines.push('Product consistency is critical — the item must be identical to the reference.')
    if (propText?.trim()) lines.push(propRefs.length ? propText.trim() : `Hands: ${propText.trim()}.`)
    return lines.join(' ')
  })()

  // ── Scene — distinct spot per variation ──────────────────────────
  const variants = SCENE_VARIANTS[loc]
  const scene = variants
    ? variants[variationIdx !== null ? variationIdx % variants.length : Math.floor(Math.random() * variants.length)]
    : ''

  // ── Background people — mirror selfie locations are always empty; others cycle ───
  const peopleLine = (loc === 'bathroom' || loc === 'bedroom' || loc === 'hotel')
    ? 'No other people in frame.'
    : BACKGROUND_PEOPLE[variationIdx !== null ? variationIdx % BACKGROUND_PEOPLE.length : 0]

  // ── Location label + time atmosphere + lighting ───────────────────
  const locationLabel = LOCATION_LABEL[loc] || (loc?.trim() ? `The location is ${loc.trim()}.` : '')
  const timeAtmo      = TIME_ATMO[tod]      || ''
  const light         = SHORT_LIGHTING[loc]?.[tod] || ''

  // ── Camera + framing ──────────────────────────────────────────────
  const cameraFeel = vibe === 'editorial' ? 'Eye-level, 50mm lens feel.'
    : vibe === 'luxury' ? 'Eye-level, 28mm, clinical sharpness.'
    : 'Eye-level, 24mm, handheld.'

  const framing = isSitting
    ? (ratio === '16:9' ? '16:9, waist-up.' : '9:16, 3/4 framing head to mid-thigh.')
    : (ratio === '16:9' ? '16:9, waist-up framing.' : '9:16, chest-up framing.')

  // ── Hairstyle override — beats any reference image ───────────────
  const hairstyleDesc = hasHairstyleOverride
    ? `Hairstyle: ${hairstyleText.trim()} — apply this hairstyle exactly, overriding the hairstyle shown in any reference image.`
    : ''

  // ── Assemble into tight paragraph ────────────────────────────────
  return [
    `${shotType} of ${subject}, wearing ${wardrobe}.`,
    hairstyleDesc,
    closeUpLine,
    poseDesc,
    expressionDesc,
    gazeDesc,
    propDesc,
    [locationLabel, scene, timeAtmo, light].filter(Boolean).join(' '),
    `${cameraFeel} ${framing}`,
    `Deep focus, no bokeh, photorealistic. ${peopleLine}`,
  ].filter(Boolean).join(' ')
}

export function randomParams() {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]
  const stance = pick(['standing', 'sitting'])
  return {
    location:     pick(LOCATIONS).id,
    timeOfDay:    pick(TIMES).id,
    pose:         pick(getPoses('Female', stance)).id,
    vibe:         pick(VIBES).id,
    outfitPreset: pick(OUTFIT_PRESETS_FEMALE.map(o => o.id)),
    stance,
    expression:   pick(EXPRESSIONS).id,
  }
}
