# AI Influencer Seedance 2.0 — Ultimate Prompt Guide
### Built for realism. Talking, movement, pauses, presence. Written by Dan Kieft.

**© Dan Kieft. All rights reserved.**

Every rule in this guide came from something that broke in a real Seedance generation. Nothing theoretical.

---

## THE LAWS

Break any of these and the output will show it.

**1. The reference image carries the visuals. Trust it.**
`SUBJECT: @image_1.` is enough when the reference is clear. Over-describing the face fights the reference. Don't describe what's already shown.

**2. The dialogue is the creator's. You don't rewrite it.**
If they wrote "yo guys so basically I think this is crazy," that's the line. Wrap the performance around it — don't fix it.

**3. Pick one specific choice. Never give Seedance options.**
"A console table or side table" is two answers. "A walnut side table" is one. Indecisiveness in the prompt becomes ambiguity in the output. Pick. Always pick.

**4. Oners use prose flow. Multi-cut uses beat blocks.**
Internal timestamps inside a single continuous shot trick Seedance into cutting. One time bracket, then prose. For multi-cut, multiple time brackets is the mechanism — it's a feature, not a bug.

**5. The action header is camera position only.**
`0:00 to 0:08 — MCU, locked.` Period. What happens goes in the action prose. Never mix.

**6. Aesthetic in STYLE ANCHOR. Choreography in ACTION. Rules in LOGIC RULE.**
Don't bleed across fields. The model reads them separately.

**7. No music. No captions. Always. No exceptions.**
Every generation defaults to: `No music. No captions. No text overlays.` in LOGIC RULE. Seedance adds royalty-free music by default — this kills it. Captions are handled in post, never in generation. Don't leave this out of any prompt.

Stacking additional negatives beyond these three causes inverse priming — "no plastic skin" can pull toward plastic skin. Add one surgical negative for a known bug in this specific scene. Stop there.

**8. The pre-line beat and the post-line hold are what sell talking heads.**
A breath before. A held look after. Anyone can prompt the dialogue. Realism lives in the silence around it.

**9. "Cinematic" is a camera-movement word.**
"Cinematic" pulls toward dolly, tracking, gentle drift. Great when you want movement. A trap when you need a static lock. For locked shots: "static," "documentary," "observational."

**10. Detail budget is finite. Match framing to what matters.**
Wide shots spread resolution thin — faces go plasticky at distance. Close shots concentrate detail — faces look real. For AI influencer face fidelity: medium close-up minimum.

**11. Lighting needs redundancy.**
One mention in ENVIRONMENT can lose to the model's default for that setting. To force non-default lighting, state it in FORMAT, ENVIRONMENT, STYLE ANCHOR, and LOGIC RULE.

**12. Simple beats detailed. Every time.**
One clear action per shot beats three layered ones. When in doubt, cut. Seedance renders what it can hold.

---

## THE TWO SHOT FAMILIES

Everything you'll prompt is one of these. The rules are different. Use the wrong family's rules and the output breaks.

### FAMILY A — Single Continuous Shot (Oner)

For: talking heads, vlog selfies, walking shots, product moments, anything that should feel uncut.

**Action header:**
```
0:00 to 0:[end] — [camera angle / position]. One continuous take.
```

**Action body:** flowing prose. No internal timestamps. Dialogue inline with the physical beat it lands on.

**LOGIC RULE includes:**
> *"Single continuous shot. No cuts, no jumps, no zoom."*

**Also add:**
> *"@image_1 moves continuously for the full duration — never freezes, never cuts."*

### FAMILY B — Multi-Cut

For: montages, B-roll sequences, mirror cuts, anything with deliberate angle changes.

**Action format:** one time-bracketed beat per cut, each with its own camera angle in the header.

```
0:00 to 0:02 — [camera angle for cut 1].
[Action prose for cut 1]

0:02 to 0:05 — [camera angle for cut 2].
[Action prose for cut 2]
```

**LOGIC RULE includes:**
> *"[N]-cut structure — hard cuts at [timestamps]. All shots locked tripod, no zoom, no pan."*

**Same-angle jump cuts** (packing montage style): add to LOGIC RULE:
> *"All shots are jump cuts from the SAME locked camera angle — the camera does not move, only time progresses between cuts."*

---

## THE MASTER TEMPLATE

Plain text only. No markdown in the output.

```
FORMAT: [duration]s / [single continuous shot OR N-cut] / [one-line concept]

SUBJECT: @image_1.

WARDROBE: [If Wall Drop selected: "@image_2 is the wardrobe reference — match outfit silhouette, fabric, color, styling exactly. @image_2 controls outfit ONLY — face, hair, skin come exclusively from @image_1, not @image_2." | If no Wall Drop: "As shown in @image_1, consistent throughout."]

PROPS: [Only specific named props — product, object, etc.]

ENVIRONMENT: [Setting + lighting source + one sensory detail]

STYLE ANCHOR: [Aesthetic — lens, camera identity, color grade, lighting feel, realism cues. NOT choreography.]

DELIVERY: [Dialogue: "Lip-sync driven by @audio_1." Non-dialogue: "No dialogue."]

LOGIC RULE: [Continuity rules — shot count, camera behavior, identity lock, anti-bug cues]

ADDITIONAL REQUIREMENTS: [Hard constraints from the creator — logo visibility, product orientation, framing specifics, any non-negotiable rules for this specific shot]

NEGATIVE PROMPT: No music, no captions[, plus 1–2 surgical additions]

---

ACTION:

[Time bracket — camera angle. One continuous take / or per-cut blocks.]

[Action prose]
```

---

## THE TAGS

Use `@` not brackets. `@image_1`, `@audio_1`. Never `<<<image_1>>>`. Brackets confuse the tag parser.

### Tag assignments

**With Wall Drop selected (wardrobe look pinned):**
- `@image_1` → identity ONLY — face, bone structure, skin tone, hair. Never wardrobe.
- `@image_2` → wardrobe reference ONLY — outfit silhouette, fabric, color, styling. Never face.
- `@image_3` → close-up facial detail (eye color, skin texture, pores)
- `@image_4` → feature-level accuracy (lip shape, brow arch, skin tone)
- `@image_5+` → product or prop references

**Without Wall Drop (character sheet at @image_2):**
- `@image_1` → identity / face / body / wardrobe lock (always)
- `@image_2` → character sheet — full-body outfit + identity reference
- `@image_3` → close-up facial detail
- `@image_4` → feature-level accuracy
- `@image_5+` → product or prop references

### Scope-lock every tagged reference

State explicitly what each reference controls — and what it does NOT.

**Wall Drop wardrobe lock (always include when @image_2 is a wardrobe look):**

> *"Match outfit from @image_2 exactly — silhouette, fabric, color, styling, zero variation. Outfit comes from @image_2 only, not @image_1."*

Repeat in both WARDROBE and LOGIC RULE. The model defaults to pulling outfit from @image_1 — you must explicitly redirect it to @image_2.

**Product scope-lock:**

> *"@image_2 contributes ONLY the product shape and label — its background, lighting, color grade, and any person in it do NOT carry over."*

For stubborn bleed, name the specific element in the exclusion list:

> *"@image_2 informs ONLY the product — never the face, identity, wardrobe, composition, or color palette."*

Repeat the scope statement in both STYLE ANCHOR and LOGIC RULE for maximum lock.

### Inspiration-only references (do not tag)

When a reference is shown for vibe/mood only — describe its qualities directly, don't tag it.

> Creator shows a warm editorial photo: "just for the color grade."
> ✅ Bake into STYLE ANCHOR: *"Warm sun-bleached vintage film palette — soft golden tones, slightly desaturated, subtle grain."*
> ❌ Don't write: *"Color grade matches @image_4."*

### Audio

`DELIVERY: Lip-sync driven by @audio_1.`

That's it. Never describe the audio's character — no "device mic," no "off-axis," no "ambient bleed." Trust the upload. Describing it causes Seedance to process the audio toward that vibe, which muffles clean source files.

If the audio has natural pauses, match them with `...` in the dialogue. The audio drives timing — the ellipses signal pacing.

---

## DIALOGUE — PERFORMANCE NOTATION

This is the most important section for influencer content.

### The rule: inline, not listed

Every line of dialogue is woven into the action prose with the physical beat it lands on. Never a separate transcript. Never a list.

**The format:**
```
[body state / what they're doing]. "Line." [pause or beat cue.] [expression note.]
```

**Example — product moment:**
```
@image_1 sits cross-legged, both hands cradling the product in her lap.
"Okay so I've been using this for two weeks." [beat — eyes drop to the product,
then lift back to camera.] "And something actually changed." Voice drops slightly
on "actually." Corners of her mouth pull back — genuine, not performed.
```

**Example — talking head opener:**
```
@image_1 faces camera, relaxed, one shoulder leaning against the wall. She takes
a breath before speaking. "I wasn't going to post this." [micro-pause, half-smile
that doesn't fully land.] "But here we are." Eyebrow lifts on "here."
```

### Emotion tag goes BEFORE the line

> ✅ *she says quietly, "I knew you'd come back"*
> ❌ *"I knew you'd come back" — said quietly*

The first is performance direction the model reads. The second is metadata it ignores.

### Pauses and silence

Use `[beat]` for a conversational pause (0.5–1s). Use `...` inside dialogue for mid-sentence pauses that match audio. Use `[breath]` for a visible inhale that restores intimacy. The silence around the line is what makes it feel real.

**Never place `[beat]` after the final line of dialogue.** The conversation ends on the last spoken word — no trailing pause, no action beat, no notation. The model reads silence after the final word naturally; annotating it kills the spontaneous feel.

### Gesture-during-speech, not gesture-before

> ✅ *"While she says the line, her hand lifts and she points toward the product."*
> ❌ *"She opens already pointing, then says the line."*

Humans gesture while speaking, not before. Already-in-pose reads staged.

### Trust the model on micro-detail

For a 15s shot: two micro-expressions max — one at the open, one at the close. Don't choreograph blinks, breaths, and eye flicks through every line. The model handles ambient micro-behavior if you give it the broader emotional direction.

For gestures during speech:
> ✅ *"There are natural conversational gestures as she speaks."*
> ❌ *"On 'every,' her right hand enters frame in a sweeping open-palm gesture; on 'single,' she counts on her fingers; on 'day,' her hand drops..."*

Over-direction creates frantic, over-staged output.

### Physical cue vocabulary

Use one or two per shot — not all of them.

**Pauses:**
- `[beat]` — conversational pause, 0.5–1s
- `[breath]` — visible inhale, restores intimacy
- `[looks down]` — processing pause
- `[holds the moment]` — extends a beat for emotional weight

**Hand gestures (specific):**
- her thumb traces the product edge
- one hand lifts — palm-up, a soft half-shrug
- both hands wrap around the product
- she tilts the product toward camera slightly
- fingertips rest on her cheek, elbow propped

**Micro-expressions (one per shot):**
- corners of her mouth pull back — genuine, not performed
- quick brow furrow, gone in a half-second
- one eyebrow lift, not both — irony or surprise
- she presses her lips together — suppressing a bigger reaction
- a real exhale through the nose — amusement, not a laugh

**Pitch / tone shifts:**
- Voice drops on "[word]"
- She slows down on the last three words
- The last word is almost under her breath
- A slight breathiness enters mid-sentence

---

## DURATION & WORD COUNT

### Word count from duration

| Duration | Max spoken words | What fits |
|---|---|---|
| 4s | 10–14 | One short line + one beat |
| 6s | 16–22 | One line + gesture + expression |
| 8s | 22–28 | Two short lines with a beat between |
| 10s | 28–38 | Two lines + beat + gesture each |
| 12s | 38–46 | Two or three lines, one beat each |
| 15s | 46–60 | Three lines max, a beat after each |

One spoken line ≈ 2–3 seconds. One `[beat]` ≈ 0.5–1s.

If the dialogue math exceeds the duration, cut words first, then cut lines.

### Duration from audio

When there's an audio file, the audio's length determines the shot's length. Match Seedance's generation duration to the audio file's actual duration.

If the audio ends before the visual does, write a closing beat for the silence — held look, half-smile lingering, eyes on lens. Don't leave dead air.

### Closing tail — always end on stillness

Seedance has a known temporal boundary artifact: without a clear end state, the final frames briefly revert to an earlier pose (usually mid-speech). Prevent it by explicitly closing every prompt with:

> *"End cleanly with the character holding a final pose, no talking or lip movement."*

This gives the model a defined still frame to render toward instead of cycling back. Always include it as the last sentence of the ACTION block.

---

## THE HOOK — FIRST TWO SECONDS

The hook is mandatory in every influencer prompt. It must stop the scroll on its own. Shot 1 ends at 0:02. It is complete. It does not set up what follows — it stands alone.

**Hook types:**

**Direct address.** Eyes find the lens at 0:00. No setup. Just her, looking straight at you, about to say something.

**Object reveal.** The product is centered in frame before the face appears. Creates instant curiosity.

**Motion into frame.** She walks into frame mid-stride — the first thing that moves is what draws the eye.

**Visual surprise.** She opens already mid-expression, mid-laugh, mid-reaction — not building to it.

**One line, no context.** She speaks a single line with no introduction. The line implies a story the viewer has to stay for.

**Hook rules:**
- No slow build. Energy is present at 0:00.
- Must work muted. Most viewers have sound off.
- State the hook type in the FORMAT line concept.

---

## INFLUENCER CONTENT RECIPES

Five ready formats. Fill in the subject, environment, and dialogue.

---

### 1. UGC TALKING HEAD

Speaks directly to camera. Feels like a voice note, not an ad. Product optional.

```
FORMAT: [dur]s / single continuous shot / direct address — [topic or product]

SUBJECT: @image_1.

WARDROBE: Match outfit from @image_2 exactly — silhouette, fabric, color, styling, zero variation. Outfit comes from @image_2 only, not @image_1.

ENVIRONMENT: [Specific room], [time of day], [one sensory detail].

STYLE ANCHOR: iPhone 16 Pro front camera, 28mm, locked, full DOF — everything in
focus front to back, NO shallow DOF, natural phone-cam color. Subject fills top
60% of 9:16 frame. Photorealistic — natural human skin of @image_1 with visible
pores, real eye moisture, subtle natural micro-movements.

DELIVERY: Lip-sync driven by @audio_1.

LOGIC RULE: Single continuous shot. No cuts, no jumps, no zoom. Natural head
movement and hand gestures evolve organically with the speech — no static
movement, no looping.

NEGATIVE PROMPT: No music, no captions.

---

ACTION:

0:00 to 0:[end] — iPhone front camera, MCU, locked. One continuous take.

@image_1 faces camera, already present, eyes on lens at 0:00. [Hook line — one
sentence, no setup.] [Beat or breath.] [Main message in performance notation.
One gesture, one beat.]
```

---

### 2. PRODUCT REVEAL

The product is the co-star. It enters frame deliberately. Her reaction does the selling.

```
FORMAT: [dur]s / single continuous shot / object reveal — [product type]

PROPS: @image_2 — [product description]. Same object throughout, same color,
label, size. Never substituted.

STYLE ANCHOR: iPhone 16 Pro, 50mm, locked or slow push-in. Slight shallow DOF on
background only — face and product fully sharp. Warm key light. Photorealistic.

LOGIC RULE: Single continuous shot. No cuts. @image_2 is always the same object —
same color, label position, size throughout. @image_1 face consistent. No looping.

---

ACTION:

0:00 to 0:02 — MCU, 50mm, locked.
Opens tight — @image_2 held in both hands of @image_1, face visible but product
is the lead. Eyes drop to the product, then lift to camera. [Hook — one reaction,
no line yet.]

0:02 to 0:[end] — MCU, 50mm, locked or slow push-in.
@image_1 holds @image_2 toward camera slightly. [Dialogue in performance notation.
One gesture with the product. One expression that sells without selling.]
```

---

### 3. LIFESTYLE PLANDID

"Accidentally caught in a beautiful moment." No dialogue. Entirely physical. The feeling is the content.

```
FORMAT: [dur]s / single continuous shot / motion into frame — [scene]

STYLE ANCHOR: iPhone 16 Pro, 24mm, natural handheld sway — subtle, never shaky,
steadicam-assisted feel. Natural found light only. Full DOF — everything sharp.
Photorealistic.

LOGIC RULE: Single continuous shot. @image_1 moves continuously for the full
duration — never stops, never pauses mid-action. No cuts. No looping gestures.

NEGATIVE PROMPT: No music, no captions.

---

ACTION:

0:00 to 0:[end] — MS to MCU, 24mm, handheld.
@image_1 [specific continuous action — walking into light, pouring something,
adjusting her clothing]. She glances toward camera for less than a second —
mid-action, not for the camera. Continues. No full eye contact.
```

---

### 4. GRWM / MIRROR

Bathroom or vanity. Intimate. She's doing something real while occasionally talking. Works with or without dialogue.

```
FORMAT: [dur]s / single continuous shot / direct address — GRWM [topic]

ENVIRONMENT: Clean bathroom, overhead light ~4000K with daylight from a side
window. Mirror visible. Real bathroom feel — not a flattering studio.

STYLE ANCHOR: iPhone front camera, 28mm, locked. Full DOF. Natural phone-cam
color. Slight mirror texture — never crystal clean.

LOGIC RULE: Single continuous shot. Mirror does not show the camera setup.
@image_1 reflection matches @image_1 — no drift. Device not visible in frame.
No looping.

---

ACTION:

0:00 to 0:02 — MCU via mirror reflection, locked.
@image_1 makes eye contact with her reflection, then glances directly at lens.
[Hook — one line or just presence.]

0:02 to 0:[end] — MS, locked.
[Physical action — applying product, reaching for something.]
[Dialogue optional: one line, casual, like talking to a friend.]
```

---

### 5. BRAND INTEGRATION

The product lives in the scene naturally. She doesn't sell it — she just exists near it. The sell is the lifestyle.

```
FORMAT: [dur]s / single continuous shot / lifestyle reveal — [brand category] integration

PROPS: @image_2 — [product]. Visible in frame but never the sole focus. Same
object throughout. No logos unless specified.

LOGIC RULE: Single continuous shot. @image_2 visible but not presented — it
shares the shot with @image_1. Same object, same orientation, across the shot.
No looping.

---

ACTION:

0:00 to 0:[end] — MS, 35mm, locked or slow push-in.
@image_1 is mid-activity in the environment. @image_2 visible in the foreground
or held naturally — not presented, just present. [If dialogue: she mentions the
product exactly once, naturally, in passing. One touch or glance — not a hold-up.]
```

---

## STYLE ANCHORS

Use one of these verbatim in the STYLE ANCHOR field. Customize if needed.

### iPhone UGC Authentic (talking head, self-filmed)
```
iPhone 16 Pro front camera, 28mm, everything in focus front to back, NO shallow
DOF, natural phone-cam color science, no lens flare, no cinematic grain. Subject
fills top 60% of 9:16 frame. Looks like she pressed record mid-thought.
Photorealistic — natural human skin of @image_1 with visible pores, real eye
moisture, subtle natural micro-movements.
```

### Vlog Selfie / She's Holding the Frame (found-footage)
```
Vlog selfie aesthetic, found-footage logic. The frame the viewer sees through IS
the iPhone she is holding pointed at her face — not a separate object. iPhone
front camera look, no fisheye. Selfie framing — head and shoulders. Full DOF,
phone-cam color science. Photorealistic — natural human skin of @image_1 with
visible pores, real eye moisture, subtle natural micro-movements.
```
> **LOGIC RULE must add:** *"The frame IS the phone she is holding — there is no separate, second, or duplicate camera visible at any point. The phone is never visible in frame, only the natural sway of her arm holding it."*

### Platform Reels Native (handheld observer)
```
iPhone 16 Pro, 28mm, slight handheld breathing — subtle, steadicam-assisted
feel, never shaky. Natural found light, warm social media color palette. Face in
top 60% of 9:16 frame. Full DOF. Photorealistic — natural human skin of @image_1
with visible pores, real eye moisture, subtle natural micro-movements.
```

### Brand Content Polished (mirrorless feel)
```
Mirrorless camera feel, 50–85mm, subtle shallow DOF on background only — face
and product fully sharp. Clean studio or natural window light, slightly warmer
grade than reality. Still feels real, not produced. Photorealistic — natural skin
of @image_1 with visible pores, real eye moisture.
```

### Locked Studio Talking Head (podcast/YouTube)
```
Locked studio talking head, podcast/YouTube creator aesthetic. Cinematic prosumer
camera (Sony A7S3-style), locked tripod, no camera movement. MCU framing — head
and shoulders. Slight shallow DOF on background only — face fully sharp,
background warmly blurred. Warm key light from camera-front. Photorealistic —
natural human skin of @image_1 with visible pores, real eye moisture, subtle
natural micro-movements.
```
> **LOGIC RULE must add:** *"Natural head movement and hand gestures evolve organically with the speech, no static movement, no looping."*

### Static Observational (locked tripod, no movement)
```
Static locked tripod shot, documentary observation aesthetic. The camera is
rigidly fixed and does not move, pan, zoom, dolly, or track at any point.
[Specific framing]. Frame composition is fixed throughout. Photorealistic —
natural skin of @image_1 with visible pores, real eye moisture. Full DOF.
```
> **NEGATIVE PROMPT must add:** `no camera movement`

### Lo-Fi Candid
```
iPhone front camera, flat color, slight digital noise, no correction. Looks like
she pressed record mid-thought. Full DOF — nothing blurred, no cinematic grain.
```

---

## LIGHTING

### The principle: redundancy overrides the default

A single lighting mention in ENVIRONMENT loses to the model's prior for that setting (bedroom = neutral daylight, coffee shop = warm ambient, studio = standard three-point). To force non-default lighting, stack it.

**The redundancy stack:**
1. **FORMAT line** — name the lighting state: `FORMAT: ... — GOLDEN HOUR bedroom`
2. **ENVIRONMENT** — describe the physical light source precisely
3. **STYLE ANCHOR** — name the palette and color temperature
4. **LOGIC RULE** — lock it across cuts: `"Lighting is strongly warm/golden throughout — never cool, never neutral."`
5. **NEGATIVE PROMPT** — if still breaking: `no cool lighting, no neutral daylight`

### Lighting presets

**Window morning light (bedroom, kitchen, café)**
Soft diffused daylight ~5500K from a large window at 9 or 3 o'clock. Wraps the near cheek, gentle falloff on shadow side. Face is the brightest element.

**Golden hour outdoor / indoor**
Low warm sun ~3500K from behind at 4 o'clock. Visible angled patches of amber-orange light on surfaces. Deep amber glow saturating the scene. Name it in every field.

**Bathroom overhead (GRWM)**
Overhead bathroom light ~4000K with possible daylight from a side window. Real bathroom look — not flattering studio lighting.

**Mixed indoor evening**
Warm practical lamp ~2800K as key from one side. Cool ambient fill ~5500K from a window. Two color temperatures on the face. Intimate, lived-in.

**Outdoor overcast**
Omnidirectional skylight ~6500K, no hard shadows. Clean, slightly cool palette.

### Describing light physically, not poetically

When a reference image shows specific lighting, describe what's actually in it:
> ✅ *"Visible window-shaped light patches on the wall. Strong directional sun from camera-left. Deep amber rather than soft yellow."*
> ❌ *"Warm vibes."*

The model needs the what of the light, not the feel.

---

## CAMERA LANGUAGE

### Framing

| Term | Meaning | Best for influencer content |
|---|---|---|
| ECU | Extreme Close-Up | Product texture, eye detail, skin |
| CU | Close-Up | Reaction, emotion, product reveal |
| MCU | Medium Close-Up | Talking head workhorse — head and shoulders |
| MS | Medium Shot | Waist up — action and dialogue |
| WS | Wide Shot | Full body in environment — lifestyle, OOTD |
| POV | Point of View | GRWM, vlog, self-filming |

### Lenses

| Lens | Feel | Best for |
|---|---|---|
| 24–28mm | Wide, native phone | iPhone vlog, selfie, UGC |
| 35mm | Documentary natural | Street, candid, handheld |
| 50mm | Neutral, true | Most talking heads, product shots |
| 85mm | Intimate, soft background | Close emotion, portrait mode feel |

### Camera movement

| Term | Meaning | When |
|---|---|---|
| Locked | Static tripod | Talking head, stable environment |
| Slow push-in | Builds closeness | Emotional moment, reveal landing |
| Slow pull-back | Opens up space | Establishing, plandid reveal |
| Handheld | Organic, alive | UGC, GRWM, vlog — always add restraint cues |
| Tracking | Follows subject | Walking, active lifestyle |
| Diegetic pan | Subject moves the camera | Found-footage only — put it in ACTION, not STYLE ANCHOR |

**Handheld trap:** "handheld" alone pulls toward vlog-cam shake. Always pair it with restraint cues: "subtle," "gentle," "barely perceptible," "steadicam-assisted feel."

**Operator vs diegetic motion:** if she physically turns the phone/camera during the shot, that's diegetic — put it in the action prose: *"she physically pans the frame off herself toward the window."* This sidesteps the lock rule because the subject is moving the camera, not the operator.

---

## MOOD VOCABULARY

Write a mood that has an arc — where it starts and where it lands.

| Tone | How to write it |
|---|---|
| Relatable bestie | "Opens casual and self-aware — lands on genuine warmth." |
| Aspirational-but-accessible | "Effortless from the first frame — not trying, just living." |
| Excited but real | "Genuine unboxing energy — not performed excitement, actual surprise." |
| Confessional vlog | "Intimate from the first second — feels like she's talking to one person." |
| Deadpan wit | "Dry delivery, no wink. The humor comes from the gap between her face and the line." |
| Soft authority | "She knows the answer. She doesn't announce it — she just shows it." |
| Morning ritual calm | "Slow, unhurried. The pace itself communicates ease." |

---

## DETAIL ALLOCATION & FRAMING

Seedance's detail budget is finite and distributed across the frame.

**Wide shots → plasticky faces.** With full body + environment, the model can't allocate enough resolution to the face. The AI influencer face starts looking waxy.

**Close shots → real faces.** MCU minimum for any shot where the face must look human.

**The fix:** match framing to what matters most.
- Face must look real → MCU or closer (chest-up minimum)
- Environment matters → wider is fine, accept face tradeoff
- Face fidelity is the entire point → add: *"Ultra-detailed skin texture — visible pores, real eye moisture. The realism IS the content."*

Use a slow zoom-in mid-shot as a rescue: wide establishing that pushes in to MCU gives you both environmental context and a face-detail landing.

---

## COMPOSITION FOR TEXT OVERLAYS

When text will be added in post, **don't mention the text** — Seedance renders gibberish. Describe the composition that creates the empty space instead.

**Left-third / right-third:**
> *"@image_1 is positioned in the left third of the frame — the right two thirds are open negative space (wall, sky, background)."*

**Lower-third / upper-third:**
> *"@image_1 occupies the lower third of the frame — the upper two thirds are open sky/background for compositional negative space."*

Lock in both STYLE ANCHOR and LOGIC RULE. If Seedance recenters anyway, get geometric:
> *"@image_1's body is fully contained within the leftmost third of the frame width — her right edge does not cross the one-third vertical line."*

---

## DECISIVENESS

This is the rule that gets broken most. Pick one. State it as if there's no other option.

| Indecisive | Decisive |
|---|---|
| "a console table or side table" | "a walnut side table at chest height" |
| "her left or right hand" | "her right hand" |
| "evening or night" | "9pm, fully dark outside" |
| "a few people" | "three people" |
| "warm or golden tones" | "deep amber tones" |
| "natural daylight" | "morning light through a west-facing window" |
| "walks across the frame" | "enters from the left, exits on the right" |
| "some product nearby" | "@image_2 on the shelf to her left" |

---

## STARTING STATE

Be decisive about whether the subject opens already in the position, or enters it during the shot.

**Already-in-pose:** opens settled. Use for short shots (3–6s) where there's no time for transition. No ambiguity about what she's doing at frame zero.

> *"@image_1 begins already seated at the vanity — no transition from standing. She picks up the product and..."*

**Entering-pose:** the transition is part of the shot. Use when the movement has visual interest (walking into frame, sitting down, standing up).

> *"@image_1 walks into frame and lowers into the chair, settling in."*

**If already-in-pose keeps animating the transition anyway**, harden LOGIC RULE:
> *"She is FROZEN in the seated pose at frame zero — no standing, no lowering, no transition. The shot opens with her already settled."*

---

## IDENTITY LOCK — ALWAYS INCLUDE

Every prompt must include this in LOGIC RULE:

```
Face of @image_1 is fixed and consistent throughout — same bone structure,
eye color, skin tone, jawline, nose. Zero drift. Only one @image_1 in frame
at any time. Wardrobe identical across all shots.
```

**When Wall Drop is selected (@image_2 = wardrobe look), add:**

```
Outfit matches @image_2 throughout — do not take outfit from @image_1.
```

For a continuous oner, add:
```
@image_1 moves continuously for the full duration — never freezes, never cuts.
```

For a product:
```
@image_2 is always the same object — same color, label position, and size.
Never substituted.
```

---

## BUG INVENTORY

Bugs cluster by scene type. Apply the relevant stack proactively, not reactively.

### The duplicate-camera / phone trap bug

**What breaks:** when she "places the camera down" or "holds the phone," Seedance spawns a visible camera or phone object as a separate prop.

**Why:** "places the camera" + vlog aesthetic pulls training data of vloggers handling visible devices. "iPhone she holds in her right hand" spawns an iPhone object.

**The fix:**
1. Use "perspective" or "frame" instead of "camera" or "phone" in placement language: *"the perspective itself lowers onto the surface"*
2. Never name the device as a held physical object — iPhone-as-style-descriptor (`iPhone front camera look`, `phone-cam color science`) is fine; iPhone-as-object is the trap
3. State the surface is empty in ENVIRONMENT, LOGIC RULE, and ACTION
4. Do NOT add "no duplicate camera" to negatives — inverse priming

### The frozen-subject bug

**What breaks:** locked tripod shots produce a statue. The camera locks and so does the subject.

**The fix:** add to LOGIC RULE:
> *"Natural head movement and hand gestures evolve organically with the speech — no static movement, no looping."*

### The looping-gesture bug

**What breaks:** the same hand wave or head tilt repeats across the shot.

**The fix:** add to LOGIC RULE:
> *"Hand gestures evolve organically — no looping."*

### The cinematic-priming bug (camera won't lock)

**What breaks:** you've written "locked tripod" but Seedance still tracks or drifts.

**Why:** "cinematic" is the culprit — it pulls toward camera movement.

**The fix:**
1. Drop "cinematic" — replace with "static," "documentary," "observational"
2. Put "STATIC LOCKED" in the FORMAT line in caps
3. STYLE ANCHOR: *"The camera is rigidly fixed and does not move, pan, zoom, dolly, or track at any point."*
4. LOGIC RULE: *"Subject enters from [side], walks past the static camera, exits on [other side] — the camera does NOT follow her."*
5. NEGATIVE PROMPT: add `no camera movement` (justified third item)

### The cool-lighting-default bug

**What breaks:** you described golden hour, got neutral daylight.

**The fix:** apply the full lighting redundancy stack — FORMAT line, ENVIRONMENT, STYLE ANCHOR, LOGIC RULE. Negatives if still breaking.

### The muffled-audio bug

**What breaks:** lip-sync audio comes out muffled or with weird ambience.

**Why:** describing audio character in DELIVERY ("device mic, off-axis") makes Seedance process the audio toward that vibe.

**The fix:** strip DELIVERY to just `Lip-sync driven by @audio_1.` Trust the upload.

### The uncanny-walk bug

**What breaks:** walking looks floaty, arms swing wrong, weight distribution is off.

**Why:** "natural walk" is too vague. The model averages training data and produces something slightly off.

**The fix:** name the physical mechanics explicitly in LOGIC RULE:
> *"Her walk is natural and grounded — relaxed gait, normal arm swing, weight shifting realistically foot to foot, continuous forward motion."*

### The plasticky-face-at-distance bug

**What breaks:** face looks waxy or generic in wide shots.

**Why:** detail budget spread too thin across a wide composition.

**The fix:**
1. Pull framing in — MCU minimum for face-priority shots
2. Add to STYLE ANCHOR: *"Ultra-detailed skin texture — visible pores, real eye moisture, subtle natural micro-movements. The realism IS the content."*
3. If wide is necessary, add a zoom-in that rescues the landing

### The product-changes-shape bug

**What breaks:** @image_2 product looks different between shots — label shifts, shape changes, color drifts.

**The fix:** state in LOGIC RULE:
> *"@image_2 is always the same object — same color, label position, label text, size. It does not change between shots. Never substituted."*

### The logo-not-visible bug

**The rule: if a product reference is uploaded, the brand logo must be fully visible in frame at all times. No exceptions.**

This applies to every product category — skincare, drinks, bags, supplements, phones, apparel. Seedance does not know the logo matters unless you tell it explicitly and redundantly.

**What breaks:** the product appears tucked in a corner, the logo faces away from camera, the product rotates out of legibility, or it shrinks to postage-stamp size in a wide shot.

**Why:** without explicit placement instructions, Seedance treats the product as ambient — defaulting to held-low or partially visible positions. It has no concept of brand visibility as a goal.

**The fix — apply all four:**

1. **PROPS** — state the logo constraint upfront:
   > *"@image_2 — brand logo must be fully facing camera and legible at all times. Never turned, never obscured, never in the corner of the frame."*

2. **ACTION prose** — name the exact hold position:
   > Not: *"she holds the product"*
   > Yes: *"she holds @image_2 at chest height, label facing directly at camera, centered in the lower third of the frame"*

3. **LOGIC RULE** — lock it across the full duration:
   > *"@image_2 brand logo is fully visible and facing camera throughout — never rotated, never obscured, never drops below waist level or into the corner of the frame."*

4. **ADDITIONAL REQUIREMENTS** — hard-state it as a non-negotiable:
   > *"The brand logo on @image_2 must remain fully legible and facing camera for every frame of the shot."*

**The framing rule:** a product at waist height in a wide shot reads as a postage stamp — logo illegible. Use MS or MCU framing and place the product at chest-to-shoulder height so it fills enough of the frame to be legible at thumbnail size.

---

### The visible-podium bug

**What breaks:** "talking to a small crowd" generates a podium in front of her every time.

**Why:** "crowd listening to a speaker" pulls public-speech training data which has podiums.

**The fix:**
1. Reframe "small crowd" → "casual meetup / informal circle / friends close to her"
2. LOGIC RULE: *"Nothing in front of her — hands free for gestures."*
3. NEGATIVE PROMPT: add `no podium`

### The reference-bleed bug (multi-reference)

**What breaks:** @image_2 or @image_3 bleeds in unwanted color, lighting, or style.

**The fix:** scope-lock with inclusive AND exclusive language:
> *"@image_2 contributes ONLY the product shape — its composition, lighting, color, and any person in it do NOT carry over."*

### The stuffed-shot bug

**What breaks:** a 5s shot with 6 scripted beats feels rushed and glitchy.

**The fix:** 5–6 beats max for a 15s oner. Fewer for shorter shots. Cut beats. Trust the model on the rest.

### The background-people-multiply bug

**What breaks:** with 4–6 people in frame, faces flicker, swap, distort.

**The fix:**
1. Reduce to 2–3 named extras if possible
2. Push others to middle ground or background: *"a few people in the distance, in soft focus"*
3. Partial visibility for second subjects: *"body and lower jaw visible, face cut off above the chin"*

---

## ANTI-OVERLOAD RULES

These kill otherwise good outputs.

**Cut any shot with more than 2 distinct actions.** She can't open a door, grab a product, look surprised, and speak in 3 seconds. Pick one.

**Cut any line that takes longer than the shot allows.** Count it. One natural sentence ≈ 2–3 seconds. A short punchy line ≈ 1–1.5 seconds.

**Cut adjectives from action lines.** "She smiles warmly and gently places" = slow, vague. "She places the product on the shelf and looks at camera" = clear, renders correctly.

**One gesture, one expression, one beat per shot.** That's the ceiling.

**Don't describe the grade twice.** If STYLE ANCHOR says "warm golden tones," don't repeat it in every shot. State it once. Trust it.

---

## PRE-DELIVERY CHECKLIST

- [ ] FORMAT line: duration / shot family / hook type / concept
- [ ] SUBJECT is just `@image_1.` — no face description
- [ ] WARDROBE explicit — match reference, plus anything not visible
- [ ] ENVIRONMENT has sensory detail and 9:16 framing note if applicable
- [ ] STYLE ANCHOR is aesthetic only — no choreography in this field
- [ ] DELIVERY is just `Lip-sync driven by @audio_1.` or `No dialogue.`
- [ ] LOGIC RULE includes identity lock for @image_1
- [ ] LOGIC RULE includes shot family rule (continuous / N-cut / same-angle jump cuts)
- [ ] LOGIC RULE includes `no looping` and `no static movement` for talking heads
- [ ] If any product reference is uploaded: brand logo visibility locked in PROPS, ACTION prose, LOGIC RULE, and ADDITIONAL REQUIREMENTS
- [ ] ADDITIONAL REQUIREMENTS captures any creator-specific hard constraints
- [ ] NEGATIVE PROMPT is two items max (plus surgical additions only)
- [ ] Shot family rule is correct — prose flow for oners, beat blocks for multi-cut
- [ ] Hook lands in the first two seconds
- [ ] Dialogue math is within duration limits
- [ ] Each shot has one clear action — not two or three
- [ ] Physical cues: max one gesture + one expression per shot
- [ ] Shot durations add up to total stated duration
- [ ] No shot under 1.5 seconds
- [ ] Bug stack applied for this scene type
- [ ] Every tagged reference has a scope statement
- [ ] Framing matches face fidelity needs (MCU minimum for face-priority)
- [ ] If audio attached: @audio_1 tagged, DELIVERY is one line, no audio description

---

## ITERATION — WHEN THE OUTPUT BREAKS

Diagnose first. Fix the one broken thing. Don't rewrite untouched sections.

| Creator says | Diagnosis | Fix |
|---|---|---|
| "Looks frozen / statue" | Frozen-subject bug | Add organic-movement clause to LOGIC RULE |
| "Same gesture on repeat" | Looping-gesture bug | Add anti-loop clause to LOGIC RULE |
| "Camera is still moving" | Cinematic-priming bug | Drop "cinematic," use "static," add `no camera movement` to negatives |
| "Sounds muffled" | Muffled-audio bug | Strip DELIVERY to just `Lip-sync driven by @audio_1.` |
| "Lighting is wrong" | Lighting-default bug | Apply the full redundancy stack, name the time of day physically |
| "Extra camera / extra phone in frame" | Duplicate-camera bug | Replace "camera/phone" with "frame/perspective" in placement language |
| "Walk looks weird" | Uncanny-walk bug | Name gait, arm swing, weight shift explicitly in LOGIC RULE |
| "Face looks plastic" | Plasticky-face bug | Pull framing in, add detail showcase cue to STYLE ANCHOR |
| "Face changed mid-shot" | Identity drift | Strengthen LOGIC RULE identity lock; add "as shown in @image_1" in WARDROBE |
| "Product changed shape" | Product-consistency bug | Add product consistency rule to LOGIC RULE |
| "Logo is tiny / facing away" | Logo-not-visible bug | Lock in PROPS + ACTION prose + LOGIC RULE + ADDITIONAL REQUIREMENTS — all four |
| "Product is in the corner" | Logo-not-visible bug | Use MS/MCU framing, place product at chest height in the ACTION prose |
| "Why is there a podium" | Visible-podium bug | Reframe crowd language, add `no podium` to negatives |
| "Other reference is bleeding in" | Reference-bleed bug | Apply scope-locked pattern with inclusive AND exclusive language |
| "Too many things happening" | Stuffed-shot bug | Cut beats — 5–6 max for 15s |
| "Too fast" | Over-cut | Reduce shot count, extend shot durations, cut dialogue |
| "She stops walking" | Continuity break | Add: "@image_1 walks forward continuously for the full duration — never stops." |
| "Handheld too shaky" | Handheld trap | Add restraint cues: "subtle," "gentle," "barely perceptible," "steadicam-assisted feel" |
| "She's transitioning when I need her already in pose" | Starting-state issue | Apply already-in-pose pattern with FROZEN-at-frame-zero language in LOGIC RULE |
| "Too dramatic / over the top" | Over-direction | Remove one action per shot. Soften expression cues. Remove push-ins. |
| "More real" | Performance feels scripted | Add one physical beat. Remove one adjective. Add a breath or pause around the line. |

---

## FINAL PRINCIPLES

**The creator's words are sacred. The creator's face is sacred.** Your job is to direct the performance around both — not invent either.

**Trust the reference. Trust the audio. Trust the model on micro-detail.** Reserve explicit direction for the things that genuinely break without it.

**Simple is the highest skill.** Any writer can stuff a prompt. The discipline is knowing what to leave out.

**The body tells the story.** A micro-expression and a pause carry more emotion than three lines of dialogue.

**Seedance renders physics, not poetry.** Tell it what to see, not how to feel. "Eyes glisten" is poetry. "Her lower lash line catches the key light" is physics.

**Bugs cluster by scene type.** Apply the stack before you generate, not after.

**Decisiveness wins.** Pick one. State it as if there's no other option.

**Realism lives in the silence.** A breath before the line. A held look after. That's the gap between AI video and human video.

---

*Built for AI influencer content on Seedance 2.0 / Higgsfield.*
*Cross-referenced and merged from field iteration data across multiple full production cycles.*
*© Dan Kieft. All rights reserved.*
