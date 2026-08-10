# GAS — Response Marketing · Design System

> **Data → Strategy → Response.**
> *The system that turns fleeting interest into last-mile conversions.*

GAS is a **response marketing agency**: it builds AI-assisted systems that compel
prospects to take action — "engaging, captivating and converting, one chat at a
time." The brand voice is confident, kinetic and conversion-obsessed; the visual
language is a collision of **flame** (energy / CTAs), **deep space** (navy→purple
grounds) and a **magenta pop**.

This design system encodes that language so any GAS touchpoint — site, deck, app
screen, ad — is unmistakably GAS.

## Source material

- `uploads/GAS Design July 2026.pdf` — the master **Brand & Design System v1.0
  (2026)** poster. Every colour, gradient, type spec, button, form pattern and
  signature component in this system was lifted from that document. Page-render
  reference screenshots live in `scraps/`.

No codebase or Figma file was provided. Where the poster left detail ambiguous
(a few muted neutral tints, hover/press behaviour) sensible brand-consistent
values were chosen — see **Caveats** at the bottom and flag corrections.

---

## CONTENT FUNDAMENTALS — how GAS writes

**Tone.** Punchy, action-first, slightly swaggering but warm. Every line points at
a conversion. Sentences are short and verb-led. The agency talks like a closer who
genuinely likes people.

**Casing.** Headlines are **UPPERCASE and heavy** (Poppins 800). Within a headline,
*one* key phrase is set in the **flame gradient** — e.g. THE SYSTEM THAT TURNS
FLEETING INTEREST INTO **LAST-MILE CONVERSIONS.** Eyebrows are uppercase, wide-
tracked, flame-coloured (`DATA · STRATEGY · RESPONSE`). Body is sentence case.

**Person.** Mostly **"we" + "you/your"** — "We are a Response Marketing Agency
focusing on compelling **your** prospects to take action." Direct address; the
reader is always the prospect's owner.

**Signature phrases & motifs.**
- "Data → Strategy → Response" (the process, also used as a segmented control).
- "one chat at a time", "last-mile conversions", "compel prospects to take action".
- Product names are coined and trademarked: **APPITUDE™, ROC™, INGAGE™, PSI**.
- Transformation framing: "From App Installs to Active Users", "From LinkedIn to
  Sales-Ready Leads", "From Conversations to Conversions".
- An AI persona, **SAMI**, is a first-class CTA ("Call SAMI"); "Conversational AI".
- Value-word coins (single nouns) like **GRATITUDE**; an "AI Division" of named
  architects (e.g. **RUMI — AI Playbook Architect**).

**Punctuation.** Em-dashes for the transformation hook. Mid-dots in eyebrows. A
trademark ™ on product names. Reading-time pills ("5 MINUTE READ").

**Emoji.** None. The flame circle-arrow and gradient highlights carry the energy;
emoji would cheapen it.

---

## VISUAL FOUNDATIONS

**Colour.** Three signature gradients do the heavy lifting:
- **Flame** `#FF9A2E → #ED1C24` — CTAs & energy. Orange→red, diagonal.
- **Deep Space** `#02385C → #5A1B9A` — backgrounds. Navy grounds, purple lifts.
- **Punch** `#ED219A → #5A1B9A` — forms & panels. Magenta→purple.

Solids: Orange `#FF9A2E`, Red `#ED1C24`, Magenta `#ED219A`, Purple `#5A1B9A`,
Royal Blue `#1B1C94`, Deep Navy `#02385C`. A muted ramp (Cream `#FFF8F0`, Mist,
Slate `#565470`, Indigo, Plum `#74107F`, Ink `#1A1230`) is **for type and fine
detail only** — never large flat fields. Light sections sit on **Cream**, hero /
feature sections on **Deep Space**.

**Type.** **Poppins** does everything, 300–800. Display 82/800 uppercase; section
H2 30/500 uppercase; H3 21/700; body 16/1.65/400; eyebrow 12/600 tracked 0.28em;
label/pill 12/600 uppercase. Key headline words get the flame gradient via
`background-clip: text`.

**Backgrounds.** No photography-led layouts in the system; grounds are **gradient
fields** (deep-space on dark sections, cream on light) plus gradient cards. Image
slots are explicit placeholders ("PRODUCT VISUAL", "PHOTO") — real imagery drops
into them. No textures, no noise, no patterns. Imagery, where present, reads
**vivid and saturated** to sit with the gradients, never washed-out or b&w.

**The pill is everything.** Buttons, labels, toggles, segmented controls, reading-
time tags — all fully-rounded (`--radius-pill`). Cards use `--radius-lg` (20px).

**The flame circle-arrow** is the single most recognisable component: a small
**orange-gradient circle holding a white `→`**, sitting inside white pills
("Let's Chat", "Get Started", "Find Out More") and at the end of CTAs. Treat it as
the brand's verb.

**Cards.** Two families: (1) white cards on cream with soft `--shadow-md`, 20px
radius; (2) **gradient cards** (purple `--grad-card` or punch) for products, value
coins, avatars and articles — no border, subtle inner lift, white text. Product
cards carry a darker image slot on top with a "PRODUCT VISUAL" label and a product
name whose first letters flame-highlight (e.g. **APP**ITUDE™).

**Borders.** Sparse. Ghost buttons use a 1.5px outline (`--border-on-dark` /
`--border-on-light`). Avatar photo slots use a 2px **magenta** ring.

**Elevation & glow.** On light: soft purple-tinted shadows. On dark: **glow** —
flame elements cast `--glow-flame`, magenta casts `--glow-magenta`.

**Motion.** Restrained and confident. Fades + short rises on entrance
(`--ease-out`, ~240ms). No bounce, no infinite loops on content. Progress / toggle
fills animate the flame.

**Hover.** Solid flame pills brighten slightly (`--grad-flame-soft`) and lift 1px;
white pills tint their label toward flame; ghost pills fill faintly. **Press:**
scale to ~0.97, drop the lift. Focus: 2px magenta ring (`--focus-ring`).

**Transparency / blur.** Used lightly — translucent white chips on dark
(`rgba(255,255,255,.08–.16)`), muted white text at 62%. No heavy glassmorphism.

---

## ICONOGRAPHY

The poster is **icon-light**. The one proprietary glyph is the **flame circle-
arrow** (white `→` in a flame-gradient disc) — rebuilt as a styled element
(`ArrowChip` / inside `Button`), **not** an image, so it always renders crisp and
on-palette. The GAS logo mark (flame disc holding `GAS`) is likewise a component
(`Logo`), because the source is an embedded raster, not a vector — recreate, don't
screenshot.

For everything else (UI affordances in kits/slides) GAS uses **Lucide** (CDN,
`https://unpkg.com/lucide-static`) — a clean 2px-stroke set that matches the
brand's confident, unfussy line. This is a **substitution of convenience**: the
poster shows no general icon set, so Lucide is the documented house default until
GAS specifies otherwise. Keep strokes ~2px, rounded caps. **No emoji. No unicode
dingbats** — use the arrow chip or Lucide.

---

## INDEX — what's in this folder

- `styles.css` — global entry (import-only). Link this one file.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `base.css`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `components/core/` — reusable primitives:
  - `Logo` · `Button` · `ArrowChip` · `Pill` (label/tag) · `Card` ·
    `ProductCard` · `Toggle` · `Segmented` · `Field` (underline input) ·
    `Avatar` · `ProgressBar`
  - `components.card.html` is the Design-System-tab thumbnail.
- `ui_kits/website/` — GAS marketing site recreation (hero, products, article,
  contact). `index.html` is an interactive click-through.
- `slides/` — branded slide templates (title, section, comparison, big-quote,
  product, closing).
- `SKILL.md` — Agent-Skill manifest for downloading into Claude Code.

---

## Caveats

- **Poppins** is loaded from Google Fonts (the genuine brand face). If GAS has
  licensed/hosted webfont files, drop them into `tokens/` and swap `fonts.css`.
- A few **muted neutral tints** (Mist, Indigo) and all **hover/press** behaviour
  are inferred — the poster only labels primaries. Adjust if GAS has exact specs.
- The **logo** and **flame arrow** are recreated from the raster poster; if a
  vector logo exists, drop it in `assets/` and point `Logo` at it.
- No codebase/Figma was supplied, so UI kits are built from the brand poster's
  components rather than live product screens.
