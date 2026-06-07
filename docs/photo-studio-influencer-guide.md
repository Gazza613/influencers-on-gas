---
name: photo-studio-influencer-guide
description: Prompt strategy for Photo Studio — reference-driven editing with GPT Image 2. Always has @image1 (identity) and usually @image2 (outfit). Prompt is short and directive: placement and action only, no re-description of what's in the refs.
---

# Photo Studio — Prompt Engine Guide

## Core Principle: This Is an Edit, Not a Generation

Photo Studio always passes reference images. The model already knows what the person looks like. The text prompt's only job is to tell the model **what to do with that person** — where to put them, how they're posed, what mood they're in.

Do not re-describe what the reference images already show. That is wasted tokens that dilute the directive instructions.

**Target length: 60–140 words.** Single cohesive paragraph. Reads like a director briefing a cinematographer, not a tag list.

---

## Reference Image Structure

| Slot | Role | Tag | When present |
|---|---|---|---|
| Slot 1 | Identity — face, hair, skin, body | `@image1` | Always (influencer main photo) |
| Slot 2 | Outfit — clothing to reproduce | `@image2` | When character sheet or wardrobe card is active |

**Tags go inline in the prompt — not appended at the end.**

- Subject line: `"of @image1"`
- Wardrobe line: `"wearing the outfit from @image2"`

If a slot is not uploaded, drop that tag from the prompt.

---

## Prompt Structure

```
[Shot type] of @image1, wearing [outfit ref or brief description].
[Pose — 2-4 sentences, the most specific direction in the prompt].
[Expression — 1 sentence, omit if natural/neutral].
[Props if any].
[Scene — 1 sentence]. [Lighting — 1 sentence].
[Camera + framing — 1 sentence].
Deep focus, no bokeh, photorealistic. No other people in frame.
```

### Shot Type by Vibe

| Vibe | Shot opener |
|---|---|
| Candid | `Candid iPhone photo` |
| Editorial | `Editorial photo` |
| Luxury | `Luxury lifestyle photo` |
| Street | `Street style photo` |
| Cozy | `Candid iPhone photo` |

### Camera Feel by Vibe

| Vibe | Camera line |
|---|---|
| Candid / Cozy / Street | `Eye-level, 24mm, handheld.` |
| Editorial | `Eye-level, 50mm lens feel.` |
| Luxury | `Eye-level, 28mm, clinical sharpness.` |

---

## Sitting Override

GPT Image 2 tends to copy the standing pose from reference images. When `stance = sitting`, you must explicitly override this early in the pose section:

> `SEATED — ignore any standing pose in the reference images. Subject is clearly sitting, legs bent, seat visible in frame.`

Then continue with the pose description adapted to sitting.

**Framing for sitting:** `9:16, 3/4 framing head to mid-thigh, seat clearly visible.` (not chest-up)

---

## Framing by Aspect Ratio + Stance

| Ratio | Stance | Framing note |
|---|---|---|
| 9:16 | Standing | `9:16, chest-up framing.` |
| 9:16 | Sitting | `9:16, 3/4 framing head to mid-thigh, seat clearly visible.` |
| 16:9 | Standing | `16:9, waist-up framing.` |
| 16:9 | Sitting | `16:9, waist-up, seat clearly visible.` |

---

## What to Drop (vs Old Engine)

| Old element | Why dropped |
|---|---|
| Full `physDesc` text of the person | @image1 shows this — text adds noise |
| `antiAttract` lines ("no makeup," "end of day energy") | @image1 shows the actual face — these fight the ref |
| `buildSkinBlock` (9-bullet skin detail block) | @image1 shows the skin — text description irrelevant |
| `USE_CASE_MAP` paragraph | Redundant with shot type opener |
| Long constraints paragraph | Replaced by single line at end |
| Image tags appended at end | Tags go inline — end-appended tags are less effective |

---

## GPT Image 2 — Key Behaviours

- **Reference adherence:** Strong. If @image1 is a clear photo of a person, the model preserves their face well.
- **Standing override:** The model copies body pose from the reference. Sitting must be explicitly stated and repeated.
- **Conciseness wins:** 80-word prompts with clear direction outperform 400-word prompts with redundant detail.
- **Deep focus is correct:** For the iPhone/candid aesthetic, state `"deep focus, no bokeh"` explicitly. Without it, the model may add artificial separation.
- **Scene integration:** 1-sentence scene description is enough. The model is good at placing people in environments.
- **Kelvin temperatures:** Do not include. The model doesn't respond to `~5500K` — use natural lighting language instead.
- **Filter:** Aggressive filter on real-person + bathroom + young woman + certain language combos. Keep location descriptions neutral.

---

## Example Output

**Inputs:** Camila (@image1) + character sheet (@image2) · Coffee Shop · Afternoon · Front-Facing · Standing · Natural expression · 9:16

```
Candid iPhone photo of @image1, wearing the outfit from @image2. Body and head both squared directly to lens, weight on one leg to avoid stiffness, the other knee slightly bent. One hand on the hip with fingers forward and elbow pointing back, eyes on lens with neutral direct confidence, chin slightly forward and down. A quiet neighbourhood café, warm filtered light through linen curtains. Warm filtered window light, soft tungsten from pendant overhead. Eye-level, 24mm, handheld. 9:16, chest-up framing. Deep focus, no bokeh, photorealistic. No other people in frame.
```

**Word count: 108.** Clean and directive.

---

## Pose Previews (Different Context)

Pose preview generation (`generatePosePreviews`) operates under different rules — no wardrobeTag, white studio backdrop, no scene. Those prompts are built directly in `higgsfieldGenerate.js` and are not affected by this guide.
