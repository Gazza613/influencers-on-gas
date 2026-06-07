export function buildInfluencerSheetPrompt(inf) {
  const phys = inf.physicalDesc ? `The character: ${inf.physicalDesc}. ` : ''
  const style = inf.clothingStyle ? `Outfit: ${inf.clothingStyle}. ` : ''
  const backstory = inf.backstory?.trim()
  const ctx = backstory ? `Character background: ${backstory.slice(0, 300)}. Let this inform their physique, presence, and energy — e.g. a personal trainer should look visibly athletic and fit, a gamer may look relaxed and casual, a CEO projects confidence. ` : ''
  return `Professional full-body character turnaround sheet. Pure white background, no background elements whatsoever. Soft neutral studio lighting, perfectly flat and even across all four panels — no shadows, no color cast, no vignette.

${phys}${style}${ctx}

Single row of four equally sized full-body shots from head to toe, each with a small label in clean sans-serif capitals printed above the figure:
Panel 1 — "FRONT VIEW": character facing directly forward, arms relaxed at sides, feet together.
Panel 2 — "SIDE VIEW": character in perfect left profile, arms at sides.
Panel 3 — "BACK VIEW": character facing directly away, arms relaxed.
Panel 4 — "THREE-QUARTER VIEW": character at 45-degree angle facing forward-right.

Replicate every single physical detail identically across all four panels: exact facial structure and bone structure, unique facial features and natural asymmetries, precise skin tone, real pore texture, natural blemishes, freckles, moles, birthmarks, natural moisture and skin sheen, realistic catchlights in the eyes, exact iris color and detail, exact hair color and texture and styling. Zero beauty retouching — raw skin imperfections must be visible. Same outfit, same proportions, same scale in every panel.

Shot on Hasselblad X2D 100C, photorealistic, ultra-sharp micro detail, RAW photograph quality. Character design sheet, model sheet, orthographic turnaround reference.`
}

export function buildCharSheetPrompt(brand, category, productDesc = null, angles = null) {
  const subject = productDesc || (category ? `${brand} ${category}` : `${brand} product`)
  const angleSpec = angles
    ? `The 6 panels show: ${angles}.`
    : `Choose the 6 most informative and commercially relevant angles for this specific product — select the angles that would appear on a real product character sheet, such as front, back, sides, top, bottom, and key detail closeups, based on what is most useful for this product type.`

  return `Professional product character sheet on a pure white (#FFFFFF) background. The subject is a ${subject}. ${angleSpec} Create a single composite image with exactly 6 panels in a strict uniform 3-column by 2-row grid. All 6 panels are perfectly equal in size — no panel larger or smaller than another, no gaps, no overlapping, strict grid alignment. The product is visually identical across all panels — same exact colors, materials, textures, logos, design details, and proportions throughout. For any angle or surface not explicitly described, match exactly the colors, materials, and finish shown in the reference image — do not invent or assume any detail. All branding, logos, and text physically on the product are preserved and clearly visible. No annotation labels, no "Front" / "Back" / "Side" captions, no text overlays of any kind. Studio product photography: soft even lighting, sharp focus throughout, perfectly clean white background, professional commercial quality. 16:9 landscape format.`
}

export async function buildCharSheetPromptWithClaude(images, brand, category, apiKey) {
  // images is an array of data URLs
  const imageBlocks = (Array.isArray(images) ? images : [images]).map(dataUrl => {
    const [header, base64] = dataUrl.split(',')
    const mediaType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
  })

  const imageCount = imageBlocks.length
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are a luxury product expert and photography director. You have deep knowledge of designer brands, product lines, and how they look from every angle. You study product images and use your training knowledge to produce detailed, accurate descriptions. Output JSON only — nothing else.`,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: `Brand: ${brand}${category ? `\nCategory: ${category}` : ''}

You have been given ${imageCount} image${imageCount > 1 ? 's' : ''} of this product from different angles. Study all of them and identify exactly what product this is. Use what you can see across all images AND your training knowledge to describe it accurately from every angle.

Output a JSON object with exactly two fields:

"productDesc" — a precise, complete description covering the entire product: exact colors on every surface, materials, all logos and text (front, back, sides, interior), construction details, hardware. Use your knowledge of this product line to fill in surfaces not visible in the image. Be specific and confident — no hedging words like "likely" or "typically". Write it as definitive fact.

"angles" — exactly 6 panel descriptions for a professional character sheet, each with specific visual details for that angle. Use your product knowledge to describe what is actually on each surface — the real back closure, real side panels, real sole or lining — not generic guesses. Example for a cap: "front view showing embroidered H logo on structured crown, left profile showing side panel seam and brim edge, right profile showing matching side panel, rear view showing metal Hermès clasp and tonal strap, top-down view showing crown stitching pattern, underside of brim showing contrast lining color and stitching"

Output only valid JSON. No explanation, no markdown.` },
        ],
      }],
    }),
  })

  if (!res.ok) throw new Error(`Claude analysis failed (${res.status})`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  const text = data.content?.[0]?.text?.trim()
  if (!text) throw new Error('Claude returned empty response')

  // Try to extract JSON from anywhere in the response
  let json = null
  const attempts = [
    () => JSON.parse(text),
    () => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()),
    () => { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('no JSON object found') },
  ]
  for (const attempt of attempts) {
    try { json = attempt(); break } catch {}
  }

  if (!json) throw new Error('Claude response could not be parsed as JSON. Raw: ' + text.slice(0, 200))
  if (!json.productDesc) throw new Error('Claude JSON missing productDesc field')

  return buildCharSheetPrompt(brand, category, json.productDesc, json.angles || null)
}
