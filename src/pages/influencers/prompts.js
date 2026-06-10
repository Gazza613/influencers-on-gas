// Prompt builders + dialogue annotation. Pure string functions extracted from
// Influencers.jsx — behavior unchanged.

export function buildFeatureSheetPrompt(inf) {
  const phys = inf.physicalDesc ? `The subject: ${inf.physicalDesc}. ` : ''
  return `Beauty model feature reference sheet. ${phys}Pure white background throughout. Clinical reference card layout — like a casting or makeup artist reference sheet printed on white paper. Bold black uppercase sans-serif labels above each panel. Clear white gutters between every panel and white margins around the outside.

Layout — 4 rows stacked top to bottom:
Row 1 (full width): one wide panel labelled "EYE" — extreme macro close-up centered tightly on both irises. The irises fill the majority of the frame. Shows exact iris color, pattern, and detail. Lashes visible at edges but irises are the dominant subject.
Row 2 (full width): one wide panel labelled "BROW" — close-up from hairline to mid-nose showing exact brow shape, arch, thickness, hair direction, forehead skin.
Row 3 (two equal side-by-side panels):
  Left — labelled "LIP": close-up from nose base to chin showing exact lip shape, cupid's bow, natural lip color.
  Right — labelled "SKIN TEXTURE": macro close-up of cheek skin showing pores, freckles, natural skin detail, zero retouching.
Row 4 (two equal side-by-side panels):
  Left — labelled "HAIR TEXTURE": close-up of hair strands showing exact color, shine, texture, wave or curl pattern.
  Right — labelled "HANDS": close-up of hand showing nail shape, length, nail color or nail art, knuckle skin detail.

Replicate the reference person's exact features in every panel: precise skin tone, freckle placement, hair color, lip shape, brow arch. Zero beauty retouching — raw photographic detail. White space clearly visible between all panels.

Photorealistic RAW photograph quality, ultra-sharp macro detail in each panel. Shot on Hasselblad 100mm macro lens.`
}

export function buildCloseUpPrompt(inf) {
  const phys = inf.physicalDesc ? `The subject: ${inf.physicalDesc}. ` : ''
  return `Professional studio headshot. Subject facing directly forward, eyes looking straight into the camera lens. Framed from shoulders up — head, neck, and upper chest visible. Clean seamless pure white backdrop, soft gradient toward very light grey at edges, no texture, no cast shadows on background.

${phys}Soft diffused studio lighting: two large softboxes at 45-degree angles producing soft, even, shadow-free illumination across the face. Subtle catchlights visible in both eyes. No harsh under-nose or chin shadows. Skin tone reproduced accurately — natural pore texture, subtle imperfections visible, zero retouching.

Replicate every physical detail from the reference image exactly: facial bone structure, unique facial features and natural asymmetries, precise skin tone, freckles, moles, iris color and detail, eyebrow shape, lip shape, hair color, texture and natural fall. The subject must be unmistakably the same individual.

Subject standing straight, head completely level, facing dead-on into the camera — no tilt, no turn, no pose. Eyes looking directly into the lens. Neutral expression, mouth relaxed and closed. No modelling, no attitude, no special pose whatsoever. Identical to a casting reference or identity card photo.

Shot on Phase One IQ4 150MP, 85mm portrait lens, f/2.8, studio strobe. Photorealistic, ultra-sharp facial detail, RAW photograph quality. Studio identity reference portrait.`
}

export function buildCharacterSheetPrompt(inf) {
  const phys = inf.physicalDesc ? `The character: ${inf.physicalDesc}. ` : ''
  const style = inf.clothingStyle ? `Outfit: ${inf.clothingStyle}. ` : ''
  return `Professional full-body character turnaround sheet. Pure white background, no background elements whatsoever. Soft neutral studio lighting, perfectly flat and even across all four panels — no shadows, no color cast, no vignette.

${phys}${style}

Single row of four equally sized full-body shots from head to toe, each with a small label in clean sans-serif capitals printed above the figure:
Panel 1 — "FRONT VIEW": character facing directly forward, arms relaxed at sides, feet together.
Panel 2 — "SIDE VIEW": character in perfect left profile, arms at sides.
Panel 3 — "BACK VIEW": character facing directly away, arms relaxed.
Panel 4 — "THREE-QUARTER VIEW": character at 45-degree angle facing forward-right.

Replicate every single physical detail identically across all four panels: exact facial structure and bone structure, unique facial features and natural asymmetries, precise skin tone, real pore texture, natural blemishes, freckles, moles, birthmarks, natural moisture and skin sheen, realistic catchlights in the eyes, exact iris color and detail, exact hair color and texture and styling. Zero beauty retouching — raw skin imperfections must be visible. Same outfit, same proportions, same scale in every panel.

Shot on Hasselblad X2D 100C, photorealistic, ultra-sharp micro detail, RAW photograph quality. Character design sheet, model sheet, orthographic turnaround reference.`
}

export function buildWardrobePrompt(influencer, { outfit, hair, customText }) {
  const phys = influencer.physicalDesc ? `The subject: ${influencer.physicalDesc}. ` : ''
  const identity = `IDENTITY LOCK — replicate exactly from reference: facial bone structure, face shape, jaw, nose bridge and tip, lip shape, eye shape and color, eyebrow arch and thickness, skin tone, skin texture and pores, all freckles, moles, marks, scars, natural asymmetries. Zero facial drift — this must be unmistakably the same person.`
  const layout = `Output must be the exact same 4-panel character turnaround sheet as the reference image. Single row of four equally sized full-body panels with these labels in clean sans-serif capitals above each: "FRONT VIEW" | "SIDE VIEW" | "BACK VIEW" | "THREE-QUARTER VIEW". Keep identical body poses, stance, arm positions, proportions, and panel layout from the reference. Do NOT change poses, labels, panel structure, background (pure white seamless), or lighting.`

  const changeParts = [
    outfit && `outfit — ${outfit}`,
    hair && `hairstyle — ${hair}`,
    customText?.trim() || '',
  ].filter(Boolean)
  const changes = `Change only: ${changeParts.join('; ') || 'casual stylish outfit, natural hairstyle'}.`

  return `Professional full-body character turnaround sheet. ${phys}Pure white seamless background throughout. Soft neutral studio lighting, perfectly flat and even across all four panels — no shadows, no color cast.

${layout}

${identity}

${changes}

Photorealistic RAW photograph quality, ultra-sharp micro detail. Shot on Hasselblad X2D 100C.`
}

export function parseAdditionalNotes(notes, durationSecs) {
  if (!notes.trim()) return { actionBeats: [], directionNotes: '' }

  const sentences = notes.trim()
    .split(/(?<=[.!?])\s+|[\n]+/)
    .map(s => s.trim())
    .filter(Boolean)

  const actionBeats = []
  const directionLines = []

  const ACTION_VERBS = /\b(pick|picks up|hold|holds|turn|turns|spin|spins|lean|leans|look|looks at|walk|walks|sit|sits|stand|stands|laugh|laughs|smile|smiles|nod|nods|wave|waves|point|points|reach|reaches|touch|touches|grab|grabs|show|shows|open|opens|close|closes|tilt|tilts|adjust|adjusts|pull|pulls|lift|lifts|flip|flips|drop|drops|step|steps|crouch|crouches|glance|glances|wink|winks|pause|pauses|freeze|freezes|stop|stops)\b/i

  for (const s of sentences) {
    const isActionBeat = ACTION_VERBS.test(s) || /\b(she|he|they)\s+\w+/i.test(s) || /\bpause\b/i.test(s)

    if (isActionBeat) {
      // Determine position as a fraction 0–1 of the video/dialogue
      let fraction = 0.5 // default: middle of dialogue
      let ts = `0:${String(Math.round(durationSecs * 0.5)).padStart(2, '0')}`

      if (/\bat (the )?start\b|from the start|at the beginning|^first\b/i.test(s)) {
        fraction = 0; ts = '0:01'
      } else if (/\bat (the )?end\b|last|final|before (it )?cuts/i.test(s)) {
        fraction = 1; ts = `0:${String(Math.max(durationSecs - 2, 1)).padStart(2, '0')}`
      } else {
        const m = s.match(/at\s+(\d+)\s*s(?:ec(?:ond)?s?)?/i)
        if (m) {
          const sec = parseInt(m[1])
          fraction = Math.min(sec / durationSecs, 1)
          ts = `0:${String(sec).padStart(2, '0')}`
        }
      }

      let text = s
        .replace(/at (the )?(start|end|beginning)\b[,]?/gi, '')
        .replace(/from the start\b[,]?/gi, '')
        .replace(/at \d+\s*s(ec(ond)?s?)?\b[,]?/gi, '')
        .replace(/^(make sure|ensure|have her|have him|i want|please|note[:]?)\s+/i, '')
        .trim()
        .replace(/[.!?]+$/, '')

      if (!/^(she|he|they)\b/i.test(text)) text = `She ${text.charAt(0).toLowerCase()}${text.slice(1)}`
      text = text.charAt(0).toUpperCase() + text.slice(1)

      actionBeats.push({ text, timestamp: ts, fraction, fired: false })
    } else {
      directionLines.push(s.replace(/[.!?]+$/, '').trim())
    }
  }

  // Sort beats by fraction so they fire in chronological order
  actionBeats.sort((a, b) => a.fraction - b.fraction)

  return { actionBeats, directionNotes: directionLines.join('. ').trim() }
}

// ─────────────────────────────────────────────
// Dialogue annotation — reads the raw script and wraps it with performance notation
// following the MD guide: emotion before line, [beat]/[breath] pauses, product tilts,
// micro-expressions (max 2), CTA lands like a friend's tip not a pitch.
// productTag = the @image_N string for the product (e.g. '@image_5'), or null
// isHandheld = true when the subject is self-filming while walking
export function annotateDialogue(rawText, productTag, durationSecs, isHandheld = false, wearMode = false, actionBeats = [], she = 'she', her = 'her', his = 'her') { // his = possessive ('her'/'his')
  if (!rawText.trim()) return ''

  // Split into clauses:
  // 1. On sentence endings (.  !  ?) followed by a space
  // 2. Then on comma-pivot breaks: ", but " / ", however " / ", though " / ", yet "
  const sentences = rawText.trim()
    .split(/(?<=[.!?])\s+/)
    .flatMap(s => s.split(/,\s+(?=(?:but|however|though|yet)\s)/i))
    .map(s => s.trim())
    .filter(Boolean)

  let microLeft = durationSecs <= 6 ? 1 : 2
  const useMicro = expr => { if (!microLeft) return ''; microLeft--; return expr }

  const prod = productTag || null
  const out = []

  // Worn-mode: rotate through natural interaction gestures so every 2nd sentence
  // has a physical beat with the product — keeps it visible without feeling staged.
  // All gestures are body-position-agnostic so they work for any wearable
  // (cap, bracelet, necklace, shirt, shoes, earrings, sunglasses, etc.)
  const She = she.charAt(0).toUpperCase() + she.slice(1)
  const Her = her.charAt(0).toUpperCase() + her.slice(1)
  const WORN_GESTURES = prod ? [
    `${She} touches ${prod} briefly — natural, not staged.`,
    `${Her} hand goes to ${prod} for a beat, then back to natural position.`,
    `${She} glances toward ${prod}, then back to lens — draws attention to it without words.`,
    `${She} adjusts ${prod} slightly — natural reflex, eyes stay on camera.`,
    `${She} angles ${his} body so ${prod} is clearly visible, then settles back.`,
  ] : []
  let wornGestureIdx = 0
  let wornGestureCounter = 0
  let wornGesturesUsed = 0
  const wornGestureMax = durationSecs <= 6 ? 1 : 2
  function maybeWornGesture() {
    if (!wearMode || !prod) return null
    if (wornGesturesUsed >= wornGestureMax) return null
    wornGestureCounter++
    if (wornGestureCounter % 3 !== 0) return null
    const g = WORN_GESTURES[wornGestureIdx % WORN_GESTURES.length]
    wornGestureIdx++
    wornGesturesUsed++
    return g
  }

  // Opening body state — already in pose, product worn or in hand as applicable
  if (isHandheld) {
    out.push(prod
      ? wearMode
        ? `@image_1 is self-filming — arm extended toward camera, ${prod} worn. ${she.charAt(0).toUpperCase()+she.slice(1)} is already walking. Camera bobs with ${his} steps from 0:00. One breath before ${she} speaks.`
        : `@image_1 is self-filming — arm extended toward camera, ${prod} in the other hand. ${she.charAt(0).toUpperCase()+she.slice(1)} is already walking. Camera bobs with ${his} steps from 0:00. One breath before ${she} speaks.`
      : `@image_1 is self-filming — arm extended toward camera, already walking. Camera bobs with ${his} steps from 0:00. One breath before ${she} speaks.`
    )
  } else {
    out.push(prod
      ? wearMode
        ? `@image_1 faces camera, ${prod} worn from 0:00. ${she.charAt(0).toUpperCase()+she.slice(1)} touches or adjusts ${prod} once early — natural reflex that draws attention to it. One breath before ${she} starts.`
        : `@image_1 faces camera, ${prod} in hand from 0:00. One breath before ${she} starts.`
      : `@image_1 faces camera. Eyes on lens. One breath.`
    )
  }

  // Fire "at start" beats before the first sentence
  for (const beat of actionBeats) {
    if (!beat.fired && beat.fraction === 0) {
      beat.fired = true
      out.push(`At ${beat.timestamp} — ${beat.text}.`)
    }
  }

  sentences.forEach((raw, i) => {
    const s = raw.trim()
    const l = s.toLowerCase()
    const isLast = i === sentences.length - 1
    const hasPivot = /^(but|however|though|yet)\s/i.test(l)
    const hasActually = /\bactually\b/.test(l)
    const hasEllipsis = s.includes('...')
    const endsExclaim = s.endsWith('!')
    const isCTA = isLast && /^(so if|if you|grab|go get|buy|check out|order|pick up|get yours)\b/i.test(l)
    const isNegative = /\b(not a fan|taste like|tastes like|99%|don'?t like|dislike|awful|terrible|cough syrup|worst|gross)\b/.test(l)

    // CTA — always last, lands light
    if (isCTA) {
      out.push(`"${s}" Lands easy — like a tip from a friend, not a pitch.`)
      return
    }

    // Pivot + ellipsis
    if (hasPivot && hasEllipsis) {
      wornGestureCounter++
      if (prod) out.push(wearMode ? `She touches ${prod} and angles so it's clearly visible to camera.` : `She tilts ${prod} toward camera.`)
      out.push(endsExclaim ? `"${s}" Energy up — genuine.` : `"${s}" [beat.]`)
      return
    }

    // Pure pivot ("but...", "however...", "actually...") without ellipsis
    if (hasPivot || (hasActually && !isNegative)) {
      wornGestureCounter++ // keep counter in sync
      if (prod) out.push(wearMode ? `She touches ${prod}, angles so it's visible. "${s}" [beat.]` : `She tilts ${prod} toward camera. "${s}" [beat.]`)
      else out.push(`She leans forward slightly. "${s}" [beat.]`)
      return
    }

    // Mid-sentence ellipsis without pivot: "this thing is... incredible"
    if (hasEllipsis) {
      const [before, after] = s.split(/\.\.\./)
      const g = maybeWornGesture()
      if (g) out.push(g)
      out.push(`"${before.trim()}..."`)
      out.push(`[micro-pause.]`)
      const afterTrimmed = after?.trim()
      if (afterTrimmed) out.push(/[!]$/.test(afterTrimmed) ? `"${afterTrimmed}" Energy up — genuine.` : `"${afterTrimmed}" [beat.]`)
      return
    }

    // First line — hook opener
    if (i === 0) {
      const m = useMicro(` Corners of ${his} mouth pull back — genuine, not performed.`)
      out.push(`"${s}" [beat.]${m}`)
      return
    }

    // Negative / dismissal line — slight honest reaction
    if (isNegative) {
      const m = useMicro(' Slight face — honest, not dramatic.')
      const g = maybeWornGesture()
      if (g) out.push(g)
      out.push(`"${s}"${m} [beat.]`)
      return
    }

    // Exclamation — energy up, genuine
    if (endsExclaim) {
      const g = maybeWornGesture()
      if (g) out.push(g)
      out.push(`"${s}" Energy up — genuine, not performed.`)
      return
    }

    // Default — statement with conversational beat
    const g = maybeWornGesture()
    if (g) out.push(g)
    out.push(`"${s}" [beat.]`)

    // Inject any action beats that fall at or before this sentence's position
    if (actionBeats.length) {
      const sentenceFraction = (i + 1) / sentences.length
      for (const beat of actionBeats) {
        if (!beat.fired && beat.fraction <= sentenceFraction) {
          beat.fired = true
          out.push(`At ${beat.timestamp} — ${beat.text}.`)
        }
      }
    }
  })

  // Fire any remaining beats (e.g. atEnd beats or no-dialogue case)
  for (const beat of actionBeats) {
    if (!beat.fired) {
      beat.fired = true
      out.push(`At ${beat.timestamp} — ${beat.text}.`)
    }
  }

  // Conversation ends naturally — no [beat.] hanging after the last spoken word
  if (out.length && out[out.length - 1].endsWith('[beat.]')) {
    out[out.length - 1] = out[out.length - 1].slice(0, -7).trimEnd()
  }

  return out.join(' ')
}
