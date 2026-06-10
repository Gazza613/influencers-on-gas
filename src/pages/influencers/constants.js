// Data + style-token constants used across the Influencers page and its studios.
// Pure literals only — no imports, no JSX. Extracted from Influencers.jsx.

// Video models offered in the Video Studio. Seedance 2.0 is the verified one;
// the others are in testing — they now send model-specific parameters, and on
// failure the error reports the job status so we can refine each one.
export const VIDEO_MODELS = [
  { id: 'seedance_2_0', label: 'Seedance 2.0', note: '✓ Verified · best quality + uses your uploaded audio (lipsync)' },
  { id: 'kling3_0',     label: 'Kling 3.0',    note: '🧪 Testing · cheaper (5–10s, 1 ref) · audio experimental' },
  { id: 'kling2_6',     label: 'Kling 2.6',    note: '🧪 Testing · cheaper cinematic (5–10s) · audio experimental' },
  { id: 'veo3_1',       label: 'Veo 3.1',      note: '🧪 Testing · cheaper (8s, 1 ref) · audio experimental' },
]

// Dark sidebar palette
export const SD = {
  bg:      '#0d0d14',
  border:  'rgba(255,255,255,0.07)',
  text:    '#F4F4F5',
  dim:     'rgba(255,255,255,0.38)',
  active:  'rgba(255,255,255,0.1)',
  hover:   'rgba(255,255,255,0.055)',
  ring:    'rgba(255,255,255,0.12)',
}

// Niche lists
export const NICHES_F   = ['Fashion','Beauty','Lifestyle','Wellness','Fitness','Travel','Food & Dining','Home & Decor','Parenting','Entertainment','Other']
export const NICHES_M   = ['Fitness','Gaming','Tech','Sports','Finance','Cars & Motors','Travel','Outdoor & Adventure','Food & Dining','Entertainment','Other']
export const NICHES_ALL = ['Fashion','Fitness','Lifestyle','Beauty','Tech','Gaming','Travel','Food & Dining','Finance','Entertainment','Wellness','Sports','Other']

export const SHEET_RATIOS = [
  { id: '16:9', label: '16:9', sub: 'Recommended', rec: true  },
  { id: '4:3',  label: '4:3',  sub: 'Compact',     rec: false },
  { id: '3:2',  label: '3:2',  sub: 'Balanced',    rec: false },
]

export const GM = {
  Female: {icon:'♀',color:'#EC4899',bg:'rgba(236,72,153,0.08)',border:'#EC4899'},
  Male:   {icon:'♂',color:'#3B82F6',bg:'rgba(59,130,246,0.08)',border:'#3B82F6'},
}

export const DEFAULT_PALETTES = {
  Female:['#F9A8D4','#FBCFE8','#E879F9','#BE185D'],
  Male:['#93C5FD','#BFDBFE','#3B82F6','#1E3A8A'],
}

export const SCRIPT_STATUSES = ['Unposted','Posted']
export const SCRIPT_STATUS_STYLE = {
  Unposted: {bg:'rgba(174,174,178,0.15)',color:'#6E6E73'},
  Posted:   {bg:'rgba(52,199,89,0.12)',  color:'#34C759'},
  // legacy
  Planned:  {bg:'rgba(174,174,178,0.15)',color:'#6E6E73'},
  Shooting: {bg:'rgba(249,115,22,0.12)', color:'#F97316'},
  Done:     {bg:'rgba(52,199,89,0.12)',  color:'#34C759'},
}

export const WARDROBE_STYLES_F = [
  { id: 'old_money',    label: 'Old Money',    icon: '🏛', outfit: 'ivory cashmere turtleneck, tailored wide-leg cream trousers, tan leather loafers, minimal gold jewelry',                                   hair: 'sleek low chignon' },
  { id: 'clean_girl',   label: 'Clean Girl',   icon: '🫧', outfit: 'fitted white ribbed tank top, straight-leg light-wash jeans, simple gold hoops, clean white sneakers',                                    hair: 'slicked-back low bun' },
  { id: 'streetwear',   label: 'Streetwear',   icon: '🧢', outfit: 'oversized washed graphic hoodie, baggy wide-leg cargo pants, chunky platform sneakers',                                                   hair: 'messy space buns' },
  { id: 'glam',         label: 'Glam',         icon: '✨', outfit: 'strapless sequin bodycon mini dress, strappy barely-there heels, small diamond studs',                                                    hair: 'bouncy blowout with voluminous waves' },
  { id: 'cottagecore',  label: 'Cottagecore',  icon: '🌸', outfit: 'white floral prairie dress with puffed sleeves, brown Mary Jane flats, wicker bag',                                                       hair: 'loose romantic braids with small dried flowers' },
  { id: 'y2k',          label: 'Y2K',          icon: '💿', outfit: 'pink butterfly-print crop top, ultra low-rise denim mini skirt, chunky platform sneakers, tinted micro sunglasses',                       hair: 'half-up pigtails with butterfly clips' },
  { id: 'editorial',    label: 'Editorial',    icon: '🖤', outfit: 'oversized sharp black structured blazer worn as a dress belted at waist, knee-high patent leather boots',                                  hair: 'sleek straight blowout' },
  { id: 'bohemian',     label: 'Bohemian',     icon: '🌿', outfit: 'cream linen wide-sleeve blouse, rust-toned flowy maxi skirt, leather flat sandals, layered gold necklaces, stacked bracelets',            hair: 'loose undone beachy waves' },
  { id: 'sporty',       label: 'Sporty',       icon: '⚡', outfit: 'fitted cropped sports bra, high-waist seamless flare leggings, clean white training sneakers',                                             hair: 'sleek high ponytail' },
  { id: 'dark_moody',   label: 'Dark & Moody', icon: '🌙', outfit: 'sheer black long-sleeve fitted top, black leather midi skirt, black pointed ankle boots, silver rings',                                    hair: 'sleek center-part straight hair' },
  { id: 'coastal',      label: 'Coastal',      icon: '🌊', outfit: 'white linen button-down shirt loosely tied at waist, wide-leg cream linen trousers, tan leather flat sandals',                            hair: 'loose natural waves, sun-kissed' },
  { id: 'preppy',       label: 'Preppy',       icon: '🎓', outfit: 'fitted navy polo shirt, plaid pleated mini skirt, white knee-high socks, brown penny loafers',                                            hair: 'low twin braids with ribbon ties' },
]

export const WARDROBE_STYLES_M = [
  { id: 'old_money',    label: 'Old Money',    icon: '🏛', outfit: 'navy single-breasted blazer, crisp white oxford shirt, tailored beige chinos, tan leather loafers — no tie',                             hair: 'classic side-parted, neat and polished' },
  { id: 'streetwear',  label: 'Streetwear',   icon: '🧢', outfit: 'oversized washed black graphic tee, baggy distressed denim jeans, clean white low-top sneakers',                                          hair: 'low skin fade, loose top' },
  { id: 'tech_bro',    label: 'Tech Bro',     icon: '💻', outfit: 'heather grey quarter-zip fleece pullover, dark slim-fit chinos, minimalist clean white sneakers',                                          hair: 'neat, slightly tousled' },
  { id: 'preppy',      label: 'Preppy',       icon: '🎓', outfit: 'pink Oxford button-down polo shirt, flat-front khaki chinos, brown penny loafers, leather belt',                                           hair: 'classic side part, well-groomed' },
  { id: 'sporty',      label: 'Sporty',       icon: '⚡', outfit: 'fitted performance athletic training top, tapered jogger pants, premium running sneakers',                                                  hair: 'fresh skin fade, clean edges' },
  { id: 'business',    label: 'Business',     icon: '👔', outfit: 'slate blue slim-fit button-down shirt, dark tailored slim trousers, brown leather oxford shoes',                                           hair: 'neat, professional, combed' },
  { id: 'coastal',     label: 'Coastal',      icon: '🌊', outfit: 'relaxed linen white shirt slightly unbuttoned at collar, navy linen shorts, tan boat shoes, no socks',                                    hair: 'natural, lightly wind-tousled' },
  { id: 'editorial',   label: 'Editorial',    icon: '🖤', outfit: 'oversized black structured wool coat, slim black ribbed turtleneck, straight-leg black trousers, black leather Chelsea boots',              hair: 'slicked back, very sleek' },
  { id: 'dark_moody',  label: 'Dark & Moody', icon: '🌙', outfit: 'washed black denim jacket over black band tee, black slim-fit jeans, black creeper boots, silver chain necklace',                         hair: 'undone, messy, slightly overgrown' },
  { id: 'bohemian',    label: 'Bohemian',     icon: '🌿', outfit: 'loose cream linen shirt open at chest, wide-leg natural linen trousers, leather sandals, stacked wooden and silver bracelets',             hair: 'loose natural curls or waves' },
  { id: 'y2k',         label: 'Y2K',          icon: '💿', outfit: 'baggy vintage colour-block windbreaker, wide-leg track pants, chunky dad sneakers, fitted cap',                                            hair: 'buzz cut or tight cornrows' },
  { id: 'party',       label: 'Party Night',  icon: '🪩', outfit: 'black satin shirt open two buttons, slim-fit black tailored trousers, sleek black loafers, silver watch',                                  hair: 'slicked back, polished' },
]

export const HAIR_PRESETS_F = ['Sleek bun', 'High ponytail', 'Beach waves', 'Blowout', 'Space buns', 'Braids', 'Half-up', 'Curtain bangs', 'Slicked back', 'Natural curls', 'Pixie cut', 'Bob']
export const HAIR_PRESETS_M = ['Low fade', 'Side part', 'Buzz cut', 'Slicked back', 'Textured crop', 'Tousled', 'Undercut', 'Man bun', 'Cornrows', 'Afro', 'Shaved sides', 'French crop']

export const GEN_DURATION_MS = 150000 // ~2m30s estimated total

export const CS_ENVIRONMENTS = [
  { key: 'Bedroom',     label: 'In a bedroom' },
  { key: 'Bathroom',    label: 'In a bathroom' },
  { key: 'Kitchen',     label: 'In the kitchen' },
  { key: 'Coffee Shop', label: 'Coffee shop' },
  { key: 'Mall / Store',label: 'At the mall' },
  { key: 'Street',      label: 'On the street' },
  { key: 'Gym',         label: 'At the gym' },
  { key: 'Studio',      label: 'In a studio' },
]
export const CS_ENV_PRESETS = {
  'Bedroom':     'in the bedroom',
  'Bathroom':    'in the bathroom',
  'Kitchen':     'in the kitchen',
  'Coffee Shop': 'in a coffee shop',
  'Mall / Store':'in a mall or store',
  'Street':      'on the street outside',
  'Gym':         'in the gym',
  'Studio':      'in a studio',
}
export const AMBIENT_SOUND = {
  'Bedroom':     'Quiet room tone — soft, near-silent background.',
  'Bathroom':    'Subtle bathroom reverb — clean, minimal background.',
  'Kitchen':     'Light kitchen ambience — faint appliance hum, natural room tone.',
  'Coffee Shop': 'Ambient coffee shop — low chatter, espresso machine, soft background bustle.',
  'Mall / Store':'Ambient mall — light crowd murmur, distant music.',
  'Street':      'Outdoor city ambience — light traffic, natural wind, distant urban activity.',
  'Gym':         'Ambient gym — distant weights, low activity, faint background music.',
  'Studio':      'Clean studio silence — minimal room tone, no background noise.',
}

export const CS_CAMERAS = [
  'Handheld','Tripod','Talking Head',
]
export const CS_VIBES = [
  'Natural','Energetic','Luxury','Playful','Tutorial','Dramatic','Cozy','Confident',
]

export const VOICE_PRESETS = {
  female: [
    { id: 'f-21-american-bright',  label: '21-year-old American',   sub: 'Bright · fast · TikTok-native',     voice: '21-year-old American woman accent, bright and energetic, fast-paced and upbeat.' },
    { id: 'f-28-american-warm',    label: '28-year-old American',   sub: 'Warm · confident · grounded',       voice: '28-year-old American woman accent, warm and confident, clear and grounded.' },
    { id: 'f-35-american-calm',    label: '35-year-old American',   sub: 'Calm · measured · trustworthy',     voice: '35-year-old American woman accent, calm and measured, slow and soothing.' },
    { id: 'f-british-polished',    label: 'British — polished',     sub: 'Refined · elegant · clear',         voice: 'Polished British woman accent, refined and elegant, clear and measured.' },
    { id: 'f-british-playful',     label: 'British — playful',      sub: 'Bright · warm · charming',          voice: 'Playful British woman accent, bright and warm, light and charming.' },
    { id: 'f-deep-japanese',       label: 'Japanese — soft',        sub: 'Soft · gentle · precise',           voice: 'Soft Japanese woman accent, gentle and precise, calm and measured.' },
  ],
  male: [
    { id: 'm-22-american-energy',  label: '22-year-old American',   sub: 'Energetic · direct · natural',      voice: '22-year-old American man accent, energetic and direct, upbeat and natural.' },
    { id: 'm-30-american-deep',    label: '30-year-old American',   sub: 'Deep · confident · authoritative',  voice: '30-year-old American man accent, deep and confident, authoritative and measured.' },
    { id: 'm-38-american-warm',    label: '38-year-old American',   sub: 'Warm · relaxed · approachable',     voice: '38-year-old American man accent, warm and relaxed, approachable and conversational.' },
    { id: 'm-british-sharp',       label: 'British — sharp',        sub: 'Refined · precise · authoritative', voice: 'Sharp British man accent, refined and precise, clear and authoritative.' },
    { id: 'm-british-story',       label: 'British — storyteller',  sub: 'Warm · engaging · unhurried',       voice: 'Warm British man storytelling accent, engaging and unhurried, naturally charismatic.' },
  ],
}

export const VIDEO_TEMPLATES = [
  {
    id: 'talking-head',
    label: 'Talking Head',
    icon: '🎤',
    sub: 'Direct to camera, personal & engaging',
    dialogue: "I need to tell you about something that completely changed my routine.",
    envKey: 'Bedroom', environment: '',
    camera: 'Handheld', vibe: 'Natural', duration: 8, shotMode: 'oner',
  },
  {
    id: 'product-review',
    label: 'Product Review',
    icon: '⭐',
    sub: 'Hold, show, and talk about a product',
    dialogue: "Okay so I've been using this for two weeks and here's my honest take.",
    envKey: 'Studio', environment: '',
    camera: 'Close-up', vibe: 'Tutorial', duration: 12, shotMode: 'oner',
  },
  {
    id: 'grwm',
    label: 'GRWM',
    icon: '✨',
    sub: 'Get Ready With Me — casual beauty content',
    dialogue: "Get ready with me for tonight — I have a whole thing planned.",
    envKey: 'Bathroom', environment: '',
    camera: 'Handheld', vibe: 'Playful', duration: 10, shotMode: 'oner',
  },
  {
    id: 'brand-collab',
    label: 'Brand Collab',
    icon: '🤝',
    sub: 'Polished partnership announcement',
    dialogue: "I partnered with a brand that actually aligns with how I live.",
    envKey: 'Street', environment: '',
    camera: 'Slow push-in', vibe: 'Confident', duration: 12, shotMode: 'oner',
  },
]

export const DIALOGUE_STARTERS = [
  "I need to tell you about something—",
  "Okay so I've been obsessed with this—",
  "This is my honest review:",
  "Can we talk about this for a second?",
  "I wasn't going to post this but—",
  "Three things I noticed after one week:",
]

export const CAMERA_META = {
  'Handheld':     { label: 'Handheld' },
  'Tripod':       { label: 'Tripod' },
  'Talking Head': { label: 'Talking Head' },
  'Wide':         { label: 'Wide' },
  'Overhead':     { label: 'Overhead' },
}

export const VIBE_META = {
  'Natural':   'Real and unfiltered — like talking to a friend.',
  'Energetic': 'Fast, forward, high energy the whole way through.',
  'Luxury':    'Slow and deliberate — every word carries weight.',
  'Playful':   'Light and bouncy — makes people smile.',
  'Tutorial':  'Clear and confident — step-by-step, no fluff.',
  'Dramatic':  'Quiet at first, builds to a strong landing.',
  'Cozy':      'Soft and intimate — like a one-on-one chat.',
  'Confident': 'Grounded and sure — zero doubt, pure presence.',
}

export const VIDEO_MAX_WORDS = {4:14,5:17,6:21,7:24,8:28,9:32,10:35,11:38,12:42,13:45,14:48,15:52}

export const PHOTO_STUDIO_HISTORY_KEY = 'photo_studio_history'
