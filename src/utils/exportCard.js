import { gColor, pLabel } from './influencerUtils'

// ── helpers ──────────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  if (w <= 0 || h <= 0) return
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function wrapText(ctx, text, x, y, maxW, lineH, maxLines = 99) {
  if (!text) return y
  const words = text.split(' ')
  let line = '', cy = y, lc = 0
  for (const word of words) {
    if (lc >= maxLines) break
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy)
      line = word; cy += lineH; lc++
    } else line = test
  }
  if (line && lc < maxLines) { ctx.fillText(line, x, cy); cy += lineH }
  return cy
}

async function loadImg(src) {
  if (!src) return null
  return new Promise(res => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = () => res(null)
    i.src = src
  })
}

function drawImg(ctx, img, x, y, w, h, fit = 'cover') {
  if (!img) return
  ctx.save()
  rr(ctx, x, y, w, h, 0); ctx.clip()
  if (fit === 'cover') {
    const sc = Math.max(w / img.width, h / img.height)
    const sw = img.width * sc, sh = img.height * sc
    ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh)
  } else {
    const sc = Math.min(w / img.width, h / img.height)
    const sw = img.width * sc, sh = img.height * sc
    ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh)
  }
  ctx.restore()
}

function sectionLabel(ctx, text, x, y, color = '#9CA3AF') {
  ctx.fillStyle = color
  ctx.font = 'bold 9px -apple-system, Arial, sans-serif'
  ctx.letterSpacing = '0.8px'
  ctx.fillText(text.toUpperCase(), x, y)
  ctx.letterSpacing = '0px'
}

function drawPill(ctx, text, x, y, accentColor) {
  ctx.font = '10px -apple-system, Arial, sans-serif'
  const tw = ctx.measureText(text).width
  const pw = tw + 18, ph = 20
  rr(ctx, x, y - 14, pw, ph, 10)
  ctx.fillStyle = accentColor + '18'
  ctx.fill()
  ctx.strokeStyle = accentColor + '44'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = accentColor
  ctx.fillText(text, x + 9, y)
  return pw + 6
}

// ── main export ──────────────────────────────────────────────────────
export async function exportInfluencerCard(inf) {
  const W = 1240, H = 860
  const SCALE = 2

  const IMG_W = 380
  const CX = IMG_W + 1  // content area x
  const PAD = 28        // inner padding in content area
  const CW = W - CX - PAD  // usable content width

  const gc   = gColor(inf.gender)
  const acc  = inf.palette?.[0] || gc

  // Load images in parallel
  const [mainImg, charImg, closeImg, wardImg] = await Promise.all([
    loadImg(inf.mainImage),
    loadImg(inf.characterSheetImage),
    loadImg(inf.closeUpImage1),
    loadImg(inf.wardrobeSlots?.find(s => s.image)?.image || null),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE; canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

  // ── BACKGROUND ──────────────────────────────────────────────────
  // Content bg
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // Very subtle tinted bg on content side
  const bgGrad = ctx.createLinearGradient(CX, 0, W, H)
  bgGrad.addColorStop(0, '#FAFAFA')
  bgGrad.addColorStop(1, '#F4F4F8')
  ctx.fillStyle = bgGrad
  ctx.fillRect(CX, 0, W - CX, H)

  // ── IMAGE COLUMN ─────────────────────────────────────────────────
  ctx.fillStyle = '#1A1A2E'
  ctx.fillRect(0, 0, IMG_W, H)

  if (mainImg) {
    drawImg(ctx, mainImg, 0, 0, IMG_W, H, 'cover')
  }

  // Deep gradient overlay (bottom 55% of image)
  const imgGrad = ctx.createLinearGradient(0, H * 0.38, 0, H)
  imgGrad.addColorStop(0, 'rgba(0,0,0,0)')
  imgGrad.addColorStop(0.6, 'rgba(0,0,0,0.55)')
  imgGrad.addColorStop(1, 'rgba(0,0,0,0.88)')
  ctx.fillStyle = imgGrad
  ctx.fillRect(0, 0, IMG_W, H)

  // Top accent stripe on image
  const topGrad = ctx.createLinearGradient(0, 0, IMG_W, 0)
  topGrad.addColorStop(0, acc)
  topGrad.addColorStop(1, acc + '66')
  ctx.fillStyle = topGrad
  ctx.fillRect(0, 0, IMG_W, 5)

  // Name on image
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold 30px -apple-system, Arial, sans-serif`
  ctx.fillText(inf.name || 'Untitled', 20, H - 100)

  // Image bottom tags
  const imgTags = [
    inf.gender,
    inf.niche && inf.niche !== 'Other' ? inf.niche : inf.nicheCustom,
    inf.age ? `Age ${inf.age}` : null,
    inf.location || null,
  ].filter(Boolean)

  let itx = 20
  ctx.font = '10px -apple-system, Arial, sans-serif'
  for (const tag of imgTags) {
    const tw = ctx.measureText(tag).width + 16
    if (itx + tw > IMG_W - 16) break
    rr(ctx, itx, H - 84, tw, 20, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.fillText(tag, itx + 8, H - 70)
    itx += tw + 6
  }

  // Physical desc on image
  if (inf.physicalDesc?.trim()) {
    ctx.fillStyle = 'rgba(255,255,255,0.44)'
    ctx.font = '10px -apple-system, Arial, sans-serif'
    wrapText(ctx, inf.physicalDesc, 20, H - 46, IMG_W - 36, 15, 2)
  }

  // Thumbnail strip (char sheet + close-up) bottom of image
  const thumbH = 72, thumbW = 54
  if (charImg) {
    ctx.save()
    rr(ctx, 20, H - 170, thumbW, thumbH, 6); ctx.clip()
    drawImg(ctx, charImg, 20, H - 170, thumbW, thumbH, 'cover')
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5
    rr(ctx, 20, H - 170, thumbW, thumbH, 6); ctx.stroke()
  }
  if (closeImg) {
    const tx2 = charImg ? 82 : 20
    ctx.save()
    rr(ctx, tx2, H - 170, thumbW, thumbH, 6); ctx.clip()
    drawImg(ctx, closeImg, tx2, H - 170, thumbW, thumbH, 'cover')
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5
    rr(ctx, tx2, H - 170, thumbW, thumbH, 6); ctx.stroke()
  }

  // ── CONTENT AREA ─────────────────────────────────────────────────
  const cx = CX + PAD

  // Thin accent bar at very left of content
  const acBar = ctx.createLinearGradient(0, 0, 0, H * 0.6)
  acBar.addColorStop(0, acc)
  acBar.addColorStop(1, acc + '00')
  ctx.fillStyle = acBar
  ctx.fillRect(CX, 0, 3, H * 0.6)

  // ── TOP: name + niche ──────────────────────────────────────────
  let cy = 30

  // Niche label above name
  const nicheText = inf.niche && inf.niche !== 'Other' ? inf.niche.toUpperCase() : (inf.nicheCustom || '').toUpperCase()
  if (nicheText) {
    ctx.fillStyle = acc
    ctx.font = `bold 10px -apple-system, Arial, sans-serif`
    ctx.letterSpacing = '1.5px'
    ctx.fillText(nicheText, cx, cy + 2)
    ctx.letterSpacing = '0px'
    cy += 18
  }

  // Name
  ctx.fillStyle = '#111111'
  ctx.font = `bold 36px -apple-system, Arial, sans-serif`
  ctx.fillText(inf.name || 'Influencer', cx, cy + 2)
  cy += 14

  // Meta chips inline
  const chips = [
    inf.gender,
    inf.age ? `${inf.age} yrs` : null,
    inf.location || null,
  ].filter(Boolean)
  let chipX = cx
  ctx.font = '11px -apple-system, Arial, sans-serif'
  for (const chip of chips) {
    const cw2 = ctx.measureText(chip).width + 18
    rr(ctx, chipX, cy + 4, cw2, 20, 10)
    ctx.fillStyle = '#F0F0F5'
    ctx.fill()
    ctx.fillStyle = '#555566'
    ctx.fillText(chip, chipX + 9, cy + 18)
    chipX += cw2 + 7
  }
  cy += 36

  // Divider
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(W - PAD, cy); ctx.stroke()
  cy += 18

  // ── TWO-COLUMN GRID ──────────────────────────────────────────────
  const half = Math.floor(CW / 2) - 14
  const col2x = cx + half + 28

  // ── LEFT: ABOUT ────────────────────────────────────────────────
  let lcy = cy
  sectionLabel(ctx, 'About', cx, lcy)
  lcy += 14
  ctx.fillStyle = '#2D2D35'
  ctx.font = '12.5px -apple-system, Arial, sans-serif'
  lcy = wrapText(ctx, inf.backstory?.trim() || 'No backstory added yet.', cx, lcy, half, 18, 5)
  lcy += 16

  // Vibe / Aesthetic
  if (inf.vibeWords?.length) {
    sectionLabel(ctx, 'Aesthetic', cx, lcy)
    lcy += 14
    let vx = cx
    for (const v of inf.vibeWords.slice(0, 6)) {
      ctx.font = '10px -apple-system, Arial, sans-serif'
      const vw = ctx.measureText(v).width
      if (vx + vw + 18 > cx + half) { vx = cx; lcy += 23 }
      const pw = drawPill(ctx, v, vx, lcy, acc)
      vx += pw
    }
    lcy += 24
  }

  // Audience
  if (inf.audience?.trim()) {
    sectionLabel(ctx, 'Target Audience', cx, lcy)
    lcy += 14
    ctx.fillStyle = '#2D2D35'
    ctx.font = '12px -apple-system, Arial, sans-serif'
    lcy = wrapText(ctx, inf.audience, cx, lcy, half, 17, 3)
    lcy += 12
  }

  // Clothing style
  if (inf.clothingStyle?.trim() && inf.clothingStyle !== inf.vibeWords?.join(', ')) {
    sectionLabel(ctx, 'Style', cx, lcy)
    lcy += 14
    ctx.fillStyle = '#2D2D35'
    ctx.font = '12px -apple-system, Arial, sans-serif'
    lcy = wrapText(ctx, inf.clothingStyle, cx, lcy, half, 17, 2)
    lcy += 12
  }

  // ── RIGHT: PALETTE + VOICE + BRANDS + PILLARS ──────────────────
  let rcy = cy

  // Color palette
  if (inf.palette?.length) {
    sectionLabel(ctx, 'Brand Palette', col2x, rcy)
    rcy += 14
    const SW = 38
    inf.palette.slice(0, 4).forEach((c, i) => {
      rr(ctx, col2x + i * (SW + 6), rcy, SW, SW, 9)
      ctx.fillStyle = c; ctx.fill()
      // subtle shadow ring
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1.5
      ctx.stroke()
    })
    rcy += SW + 12
  }

  // Voice & Tone
  if (inf.voice?.trim()) {
    sectionLabel(ctx, 'Voice & Tone', col2x, rcy)
    rcy += 14
    ctx.fillStyle = '#2D2D35'
    ctx.font = '12px -apple-system, Arial, sans-serif'
    rcy = wrapText(ctx, inf.voice, col2x, rcy, half, 17, 3)
    rcy += 12
  }

  // Dream Brands
  if (inf.dreamBrands?.trim()) {
    sectionLabel(ctx, 'Dream Brands', col2x, rcy)
    rcy += 14
    ctx.fillStyle = '#2D2D35'
    ctx.font = '12px -apple-system, Arial, sans-serif'
    rcy = wrapText(ctx, inf.dreamBrands, col2x, rcy, half, 17, 2)
    rcy += 12
  }

  // Content Pillars
  if (inf.contentPillars?.length) {
    sectionLabel(ctx, 'Content Pillars', col2x, rcy)
    rcy += 14
    let px = col2x
    for (const p of inf.contentPillars.slice(0, 6)) {
      ctx.font = '10px -apple-system, Arial, sans-serif'
      const pw = ctx.measureText(p).width
      if (px + pw + 18 > col2x + half) { px = col2x; rcy += 23 }
      const w2 = drawPill(ctx, p, px, rcy, '#6366F1')
      px += w2
    }
    rcy += 24
  }

  // Hobbies
  if (inf.hobbies?.trim()) {
    sectionLabel(ctx, 'Hobbies & Interests', col2x, rcy)
    rcy += 14
    ctx.fillStyle = '#2D2D35'
    ctx.font = '12px -apple-system, Arial, sans-serif'
    rcy = wrapText(ctx, inf.hobbies, col2x, rcy, half, 17, 2)
  }

  // ── BOTTOM DIVIDER + STATS BAR ──────────────────────────────────
  const BOTTOM = H - 110

  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx, BOTTOM); ctx.lineTo(W - PAD, BOTTOM); ctx.stroke()

  let bx = cx
  const bcy = BOTTOM + 20

  // Personality bar
  const pv = inf.introExtrovert ?? 50
  const BW = 200
  sectionLabel(ctx, 'Personality', bx, bcy)
  ctx.fillStyle = '#E8E8EE'
  rr(ctx, bx, bcy + 8, BW, 8, 4); ctx.fill()
  const barGrad = ctx.createLinearGradient(bx, 0, bx + BW, 0)
  barGrad.addColorStop(0, '#6366F1')
  barGrad.addColorStop(1, '#EC4899')
  ctx.fillStyle = barGrad
  rr(ctx, bx, bcy + 8, BW * pv / 100, 8, 4); ctx.fill()

  ctx.fillStyle = '#9CA3AF'; ctx.font = '9px -apple-system, Arial, sans-serif'
  ctx.fillText('Introvert', bx, bcy + 28)
  ctx.textAlign = 'right'; ctx.fillText('Extrovert', bx + BW, bcy + 28); ctx.textAlign = 'left'

  ctx.fillStyle = acc; ctx.font = 'bold 13px -apple-system, Arial, sans-serif'
  ctx.fillText(pLabel(pv), bx, bcy + 46)
  bx += BW + 32

  // Divider between stats
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(bx, BOTTOM + 10); ctx.lineTo(bx, H - 42); ctx.stroke()
  bx += 20

  // Script count
  const scriptCount = (inf.scripts || []).length
  const doneCount = (inf.scripts || []).filter(s => s.status === 'Done').length
  sectionLabel(ctx, 'Content', bx, bcy)
  ctx.fillStyle = '#111'; ctx.font = `bold 26px -apple-system, Arial, sans-serif`
  ctx.fillText(String(scriptCount), bx, bcy + 30)
  ctx.fillStyle = '#9CA3AF'; ctx.font = '10px -apple-system, Arial, sans-serif'
  ctx.fillText('scripts', bx, bcy + 45)
  if (doneCount > 0) {
    ctx.fillStyle = '#34C759'; ctx.font = '10px -apple-system, Arial, sans-serif'
    ctx.fillText(`${doneCount} done`, bx + 44, bcy + 30)
  }
  bx += 100

  ctx.beginPath(); ctx.moveTo(bx, BOTTOM + 10); ctx.lineTo(bx, H - 42); ctx.stroke()
  bx += 20

  // Wardrobe count
  const wardCount = (inf.wardrobeSlots || []).filter(s => s.image).length
  sectionLabel(ctx, 'Wardrobe', bx, bcy)
  ctx.fillStyle = '#111'; ctx.font = `bold 26px -apple-system, Arial, sans-serif`
  ctx.fillText(String(wardCount), bx, bcy + 30)
  ctx.fillStyle = '#9CA3AF'; ctx.font = '10px -apple-system, Arial, sans-serif'
  ctx.fillText('looks', bx, bcy + 45)
  bx += 90

  // Wardrobe image strip
  if (wardImg) {
    ctx.save()
    rr(ctx, bx, bcy - 4, 40, 52, 6); ctx.clip()
    drawImg(ctx, wardImg, bx, bcy - 4, 40, 52, 'cover')
    ctx.restore()
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1
    rr(ctx, bx, bcy - 4, 40, 52, 6); ctx.stroke()
  }

  // ── FOOTER ──────────────────────────────────────────────────────
  const FY = H - 30
  const footGrad = ctx.createLinearGradient(CX, 0, W, 0)
  footGrad.addColorStop(0, acc + '22')
  footGrad.addColorStop(1, '#F0F0F5')
  ctx.fillStyle = footGrad
  ctx.fillRect(CX, FY, W - CX, 30)

  ctx.fillStyle = '#9CA3AF'; ctx.font = '9px -apple-system, Arial, sans-serif'
  ctx.fillText('AI Influencer Studio', cx, FY + 19)

  const dateStr = inf.createdAt ? new Date(inf.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
  ctx.textAlign = 'right'
  ctx.fillText(`Created ${dateStr}`, W - PAD, FY + 19)
  ctx.textAlign = 'left'

  // ── DOWNLOAD ─────────────────────────────────────────────────────
  try {
    const link = document.createElement('a')
    link.download = `${(inf.name || 'influencer').toLowerCase().replace(/\s+/g, '-')}-media-kit.png`
    link.href = canvas.toDataURL('image/png', 0.95)
    link.click()
  } catch {
    alert('Export failed — browser security blocked it. Try uploading the main image locally instead of using a generated one.')
  }
}
