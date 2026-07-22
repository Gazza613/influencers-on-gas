import sharp from "sharp";

// KEEP THE MASTHEAD TRANSPARENT. Gary: "the background remains empty and in PNG format as per the reference -
// we embed this into the masthead as a transparent image in a 2-column layout."
//
// The person-swap holds the furniture (disc, bubbles, callout) in place but fills the empty surround with a
// scene, because nano_banana always outputs an opaque frame. We do not fight that. Instead we use the fact
// that THE REFERENCE IS ALREADY A TRANSPARENT PNG: its alpha channel is the exact shape the design occupies -
// opaque over the disc/furniture/person, transparent everywhere else. Since the swap keeps every furniture
// element in the same position, that same alpha applies to the result. Stamp it on, and the invented scene in
// the transparent zone simply disappears, leaving disc + furniture + new person on transparency.
//
// The one edge case: if the new person's silhouette pushes OUTSIDE the old opaque area (very different hair,
// wider shoulders), the mask would clip it. But the subject sits on the disc, which is opaque, so in practice
// they stay inside the mask.
export async function applyReferenceAlpha(resultBuf: Buffer, referenceBuf: Buffer): Promise<Buffer> {
  const meta = await sharp(referenceBuf).metadata();
  const W = meta.width || 1080;
  const H = meta.height || 811;

  // THE EDGE MUST BE TIGHT. The reference alpha is anti-aliased, so its soft edge pixels (alpha 1-254) blend
  // whatever colour the SWAP put there - which at the design boundary is the grey studio background, showing
  // as a halo around the hair and along the disc. Gary flagged exactly this.
  //
  // So we ERODE the alpha: blur then threshold HIGH, which pulls the opaque region in by ~1px and drops the
  // half-transparent fringe to fully transparent; a light re-blur restores a clean anti-aliased edge without
  // the halo. It trims a hair of the design edge, which is invisible, in exchange for killing the bleed.
  const alphaRaw = await sharp(referenceBuf).ensureAlpha().extractChannel(3).resize(W, H, { fit: "fill" })
    .blur(1.4).threshold(210).blur(0.6)
    .raw().toBuffer();
  // The result's colour, stripped of its own (opaque) alpha, at the same size.
  const rgbRaw = await sharp(resultBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();

  return sharp(rgbRaw, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(alphaRaw, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

// FORENSIC FURNITURE. Gary: on the masthead the icons and the pill "are not a forensic match" - the swap
// redraws them. The fix: keep the swap's new PERSON, but stamp the reference's ACTUAL furniture pixels
// (bubbles, pill, disc edges, swish) back on top, so they are pixel-identical instead of an AI approximation.
//
// We do not need to isolate each bubble. The person lives in a central column; the furniture lives around and
// in front of it. So we take the WHOLE reference (its own alpha already excludes the empty surround) and
// composite it over the swap EVERYWHERE EXCEPT a soft central ellipse where the person is - there, the swap's
// new person shows through. Outside that ellipse the reference's real furniture wins.
//
// The ellipse is deliberately tall-and-narrow over the head+torso and stops ABOVE the pill, so the pill (bottom
// centre) and the bubbles (sides) are always reference pixels. Feathered so there is no hard seam.
// THE PERSON'S SILHOUETTE, from the difference between the reference and the person-stripped "empty set".
// Where the two differ = where the person was. That is a real silhouette (hair, shoulders, arms and all),
// which a rough ellipse can never be - the ellipse leaked the old person's hair. Returned as a feathered
// single-channel mask: 255 = person, 0 = furniture/surround.
export async function personMaskFromStrip(referenceBuf: Buffer, emptySetBuf: Buffer): Promise<Buffer> {
  const meta = await sharp(referenceBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 811;
  const ref = await sharp(referenceBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const emp = await sharp(emptySetBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const refA = await sharp(referenceBuf).ensureAlpha().extractChannel(3).resize(W, H, { fit: "fill" }).raw().toBuffer();

  const mask = Buffer.alloc(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 3) {
    // Only inside the design (opaque reference); measure colour distance between reference and empty set.
    if (refA[p] < 128) { mask[p] = 0; continue; }
    const d = Math.abs(ref[i] - emp[i]) + Math.abs(ref[i + 1] - emp[i + 1]) + Math.abs(ref[i + 2] - emp[i + 2]);
    mask[p] = d > 60 ? 255 : 0; // changed enough => the person was here
  }
  // Feather + close small holes so the window is a clean silhouette, not speckle.
  return sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(Math.round(W * 0.01)).png().toBuffer();
}

// Keep the swap's PERSON, stamp the reference's real FURNITURE over everything else. `personMask` (255 = person)
// is the window where the swap shows through; outside it the reference's pixel-perfect furniture wins.
export async function compositeForensicFurniture(swapBuf: Buffer, referenceBuf: Buffer, personMask: Buffer): Promise<Buffer> {
  const meta = await sharp(referenceBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 811;

  const keep = await sharp(personMask).resize(W, H, { fit: "fill" }).extractChannel(0).raw().toBuffer(); // 255 person
  const refAlpha = await sharp(referenceBuf).ensureAlpha().extractChannel(3).resize(W, H, { fit: "fill" }).raw().toBuffer();
  // furniture alpha = reference alpha AND NOT person: refAlpha * (255 - keep) / 255
  const furnAlpha = Buffer.alloc(W * H);
  for (let i = 0; i < furnAlpha.length; i++) furnAlpha[i] = Math.round((refAlpha[i] * (255 - keep[i])) / 255);

  const refRgb = await sharp(referenceBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const furniture = await sharp(refRgb, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(furnAlpha, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();

  const base = await sharp(swapBuf).resize(W, H, { fit: "fill" }).removeAlpha().png().toBuffer();
  const composited = await sharp(base).composite([{ input: furniture }]).png().toBuffer();
  return applyReferenceAlpha(composited, referenceBuf); // empty surround -> transparent
}

// A quick preview: drop the transparent PNG onto a flat colour.
export async function onBackground(pngBuf: Buffer, hex: string): Promise<Buffer> {
  const meta = await sharp(pngBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 811;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const bg = sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } });
  return bg.composite([{ input: pngBuf }]).png().toBuffer();
}

// THE FUNNEL-MATCHED BACKGROUND. Gary's fix for the fragile transparent cut-out: instead of shipping a
// transparent PNG whose ragged edge fights us, we flatten the design onto the EXACT colour of the Webflow
// section it embeds into, so it reads as seamlessly placed and the edge halo simply disappears into the match.
//
// Colours read straight from the live funnel:
//   masthead -> the hero section, FLAT #083a52 (Gary supplied the exact swatch; the section is now a solid
//               fill, not the old #0b425d->#02293d gradient, so the creative must be that one flat colour edge
//               to edge or the seam shows against the Webflow band).
//   section1 -> the white sections: #ffffff
// FORCE THE SECTION-1 BACKGROUND TO PURE WHITE (Gary: "smudges top right and top left... it happens with almost
// all outputs for section 1 - fix it and lock it in").
//
// The model keeps painting a faint room/vignette onto what must be #ffffff, and no prompt wording has held. So
// we stop asking: this is deterministic. We flood-fill INWARD FROM THE EDGES, whitening any pixel that is
// "background-like" (light and near-neutral) and connected to the border.
//
// Why the flood fill rather than a global threshold: a global rule would also blow out light areas INSIDE the
// design - a white shirt, a highlight on the disc. Only edge-connected pixels are background, so the fill stops
// dead at the yellow disc, the blue bubbles and the person (all saturated or dark), and can never reach an
// interior highlight.
//
// The thresholds are deliberately conservative: LIGHT smudges go, but the soft drop shadows under the bubbles
// (darker than the cutoff) survive, so the design keeps its depth.
// A soft drop shadow and a painted-on smudge are the SAME brightness - luminance alone cannot separate them,
// and a naive fill flattens the bubbles' shadows (verified: it lifted a 226-grey shadow straight to white).
// What DOES separate them is distance: shadows hug the design, smudges sit out in the open. So we protect a
// halo around the design and only clean beyond it.
const BG_MIN_LUM = 185;    // lighter than this to count as background
const BG_MAX_SAT = 40;     // and near-neutral (max-min channel spread)
// THE WEBFLOW MASTHEAD SECTION COLOUR. The dark navy the funnel PAGE is painted in, behind the whole masthead -
// NOT the bright field inside the hero graphic (#005080), and NOT the nav bar or callout box (lighter navies
// Gary told us to ignore). SAMPLED from Gary's own live masthead screenshot (uploaded to CI intake): the
// background fills 37% of the frame and every pure-background point reads exactly #083a52 (rgb 8,58,82). This
// validates the matched Webflow swatch (#083a52) - the earlier drop-in seam was a stale creative, not a wrong colour. The
// deterministic flatten locks the creative's field to this for a seamless drop.
export const MASTHEAD_NAVY: [number, number, number] = [8, 58, 82];
const rgbHex = (c: [number, number, number]) => "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

// CUT A PERSON OUT OF A CLEAN STUDIO SHOT to a transparent PNG. Used for the CEO creative: his real photo on a
// white studio background becomes a floating cut-out we composite onto a MoMo field - forensically his face,
// never generated.
//
// Same edge-flood-fill as flattenSection1ToWhite, but the background becomes TRANSPARENT instead of white, and
// the threshold is looser (a studio backdrop runs 230-255). The person is a wall the fill cannot cross, so his
// dark suit, his skin and even a bright white shirt survive - the shirt because it is interior, never
// edge-connected. A soft 1px feather on the resulting alpha keeps the edge from looking cut with scissors.
export async function cutoutToTransparent(buf: Buffer): Promise<Buffer> {
  const flat = await sharp(buf).flatten({ background: "#ffffff" }).png().toBuffer(); // drop any existing alpha first
  const { data, info } = await sharp(flat).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  const isBg = (i: number): boolean => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 205) return false;                          // looser than the white-flatten: studio white is bright
    return Math.max(r, g, b) - Math.min(r, g, b) <= 26;   // and near-neutral
  };

  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let sp = 0;
  const push = (x: number, y: number) => { const p = y * W + x; if (!seen[p]) { seen[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

  while (sp > 0) {
    const p = stack[--sp];
    const i = p * C;
    if (!isBg(i)) continue;
    data[i + 3] = 0;                                       // background pixel -> transparent
    const x = p % W, y = (p / W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  const cut = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

  // FEATHER THE MATTE. A raw flood-fill leaves a hard, slightly ragged edge with a 1-2px pale halo of leftover
  // background (Gary: "feathering"). Fix the alpha channel on its own: blur then threshold high to ERODE the
  // edge inward (killing the halo), then a soft blur so it reads as a real photographed edge, not scissors.
  const alpha = await sharp(cut)
    .extractChannel(3)
    .blur(2)                 // spread the edge
    .threshold(205)          // keep only the solid interior -> pulls the edge in ~1-2px, removes the halo
    .blur(0.8)               // soft anti-aliased feather
    .toColourspace("b-w")
    .toBuffer();
  const rgb = await sharp(cut).removeAlpha().toBuffer();
  const feathered = await sharp(rgb).joinChannel(alpha).png().toBuffer();

  // Trim the now-transparent margins so the subject fills the asset.
  return sharp(feathered).trim().png().toBuffer();
}

export async function flattenSection1ToWhite(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  // SAMPLE THE ACTUAL BACKGROUND from the four corners - on a section-1 the corners are always background, so
  // this reads whatever the model painted there (white, or the cream/tan studio it sometimes slips in) and lets
  // us flood-fill THAT colour to white, not just near-white pixels. This is the fix for the cream backgrounds
  // that beat the old "light + neutral" test: a warm tan sits at luminance ~174, below the 185 floor, so it
  // survived. Median-of-four guards against one corner that happens to clip the design.
  const cornerAvg = (x0: number, y0: number): [number, number, number] => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < Math.min(y0 + 24, H); y++) for (let x = x0; x < Math.min(x0 + 24, W); x++) {
      const i = (y * W + x) * C; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    return n ? [r / n, g / n, b / n] : [255, 255, 255];
  };
  const corners = [cornerAvg(0, 0), cornerAvg(W - 24, 0), cornerAvg(0, H - 24), cornerAvg(W - 24, H - 24)];
  const med = (k: number) => { const s = corners.map((c) => c[k]).sort((a, b) => a - b); return (s[1] + s[2]) / 2; };
  const bg: [number, number, number] = [med(0), med(1), med(2)];
  const bgLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
  // Is the background a COLOURED studio (cream/tan) rather than plain white? A warm cast shows as channel spread,
  // and a mid-tone shows as a lower luminance. This decides two things below: on a coloured bg the sampled-colour
  // test alone finds the background and its darker shadow is spared automatically, so we skip the light-neutral
  // fallback (which would grab light clothing) and use only a hairline halo. On white we keep the original,
  // generous behaviour so the design's soft drop-shadows survive.
  const bgSpread = Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]);
  const coloredBg = bgSpread > 12 || bgLum < 215;

  const isBgPixel = (i: number): boolean => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Near the sampled background colour (a cream/tan studio is caught as readily as white). Tolerance is tight
    // enough that skin (warmer, more saturated) and a darker drop-shadow (lower luminance) are left alone.
    if (bgLum > 140 && Math.abs(r - bg[0]) <= 30 && Math.abs(g - bg[1]) <= 30 && Math.abs(b - bg[2]) <= 30) return true;
    // On a coloured studio the sampled colour IS the whole background - do not also sweep light neutrals, or a
    // light-grey cardigan or a white shirt gets whitened. Only white backgrounds fall through to the safety net.
    if (coloredBg) return false;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum >= BG_MIN_LUM && Math.max(r, g, b) - Math.min(r, g, b) <= BG_MAX_SAT;
  };

  // Whiten the background.
  if (coloredBg) {
    // GLOBAL, NO HALO on a coloured studio: the sampled tan/cream is a distinct colour from every design element
    // (the yellow disc, the navy bubbles, skin, clothing), so we whiten it wherever it appears - edge-connected
    // OR trapped in a pocket between the disc and the subject, which an edge-only flood cannot reach (that was
    // the leftover tan wedge). No halo is needed: a darker drop-shadow and the saturated design are not near the
    // sampled colour, so the colour test spares them by itself.
    for (let p = 0; p < W * H; p++) {
      const i = p * C;
      if (isBgPixel(i)) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; }
    }
  } else {
    // CONNECTIVITY on white, with a halo protecting the design's soft drop-shadows: a light near-white area is
    // whitened ONLY if it truly connects to the border, so the design's own depth survives. (An over-wide
    // protected patch is harmless here - it just stays white.)
    const design = Buffer.alloc(W * H);
    for (let p = 0; p < W * H; p++) design[p] = isBgPixel(p * C) ? 0 : 255;
    const radius = Math.max(4, Math.round(W * 0.05));
    const haloRaw = await sharp(design, { raw: { width: W, height: H, channels: 1 } }).blur(radius).raw().toBuffer();
    const halo = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) halo[p] = haloRaw[p] > 36 ? 1 : 0;

    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    let sp = 0;
    const push = (x: number, y: number) => {
      const p = y * W + x;
      if (!seen[p]) { seen[p] = 1; stack[sp++] = p; }
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

    while (sp > 0) {
      const p = stack[--sp];
      if (halo[p]) continue;             // protected: the design or its shadow - leave it alone
      const i = p * C;
      if (!isBgPixel(i)) continue;       // a non-background pixel is a wall: do not spread through it
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) push(x - 1, y);
      if (x < W - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < H - 1) push(x, y + 1);
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
}

// FORCE THE MASTHEAD FIELD TO EXACTLY #083a52 (the mirror of flattenSection1ToWhite, for the dark band). The
// retheme is an AI regeneration, so even with a flat #083a52 base it can drift the field a shade or leave a
// faint gradient - and a shade off is a visible seam when the image drops into the Webflow masthead section.
// So we do not rely on the model: we flood-fill the NAVY BACKGROUND inward from the edges to the exact colour,
// stopping dead at the yellow disc, the light streak and the subject (none of which are dark-blue), and
// protecting a halo so the subject's own contact shadow survives. The result: every edge pixel is #083a52.
export async function flattenMastheadToNavy(buf: Buffer, target: [number, number, number] = MASTHEAD_NAVY): Promise<Buffer> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  // A masthead-background pixel is one ALREADY CLOSE to the target field colour. The tolerance is wide enough to
  // swallow the range the AI might drift the flat field to, but tight enough that the subject's clothing, skin
  // and hair - and any darker contact shadow beneath them - fall outside it and are left untouched. No halo, no
  // blur: the colour test itself preserves the shadow, and flood-filling only from the EDGES means an interior
  // region that happens to match the field is never reached unless the field connects to it.
  const near = (i: number): boolean =>
    Math.abs(data[i] - target[0]) <= 26 && Math.abs(data[i + 1] - target[1]) <= 30 && Math.abs(data[i + 2] - target[2]) <= 34;

  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let sp = 0;
  const push = (x: number, y: number) => { const p = y * W + x; if (!seen[p]) { seen[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

  while (sp > 0) {
    const p = stack[--sp];
    const i = p * C;
    if (!near(i)) continue;               // a non-field pixel is a wall: the subject and its shadow stop the fill
    data[i] = target[0]; data[i + 1] = target[1]; data[i + 2] = target[2];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  return sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
}

// THE CLEAN BLUE HALO behind the section-1 disc (Gary: "the blue design behind the circle is not clean"). The
// AI draws the blue light motif raggedly and no prompt makes it crisp, so we take the element out of its hands:
// the model is told to leave clean white behind the disc, and we composite a SMOOTH blue glow-ring ourselves,
// centred on the disc and MASKED to the white background - so it reads as a clean halo BEHIND the disc and the
// subject (both of which are non-white, so the mask leaves them untouched), identical on every render.
export async function cleanBlueGlowBehindDisc(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  // 1. FIND THE YELLOW DISC. The subject stands in front of it, so only an arc of yellow shows - but its
  //    left/right/top extent still gives the disc's bounding box, and from that its centre and radius.
  let minX = W, maxX = 0, minY = H, maxY = 0, n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 170 && g > 130 && b < 115 && r - b > 100 && g - b > 45) {
        n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  // No convincing disc found: leave the image alone rather than dropping a halo in the wrong place.
  if (n < (W * H) * 0.01) return sharp(buf).png().toBuffer();
  const cx = Math.round((minX + maxX) / 2), cy = Math.round((minY + maxY) / 2);
  const R = Math.round(((maxX - minX) + (maxY - minY)) / 4);

  // 2. A SMOOTH RADIAL ALPHA for the glow: a TIGHT halo hugging the disc - nothing at the centre (the disc
  //    covers it), brightest just outside the disc edge, gone by ~1.5R so it never washes the whole frame.
  const rr = 1.5 * R;
  const stop = (mult: number) => Math.min(1, mult * R / rr).toFixed(4);
  const alphaSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<radialGradient id="a" cx="${cx}" cy="${cy}" r="${rr}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#000"/>` +
    `<stop offset="${stop(0.86)}" stop-color="#1a1a1a"/>` +
    `<stop offset="${stop(1.02)}" stop-color="#fff"/>` +
    `<stop offset="${stop(1.24)}" stop-color="#7a7a7a"/>` +
    `<stop offset="1" stop-color="#000"/>` +
    `</radialGradient></defs><rect width="100%" height="100%" fill="url(#a)"/></svg>`;
  const alpha = await sharp(Buffer.from(alphaSvg)).greyscale().raw().toBuffer();

  // 3. COMPOSITE brand-blue over the image, only where the background is white, scaled by the radial alpha. A
  //    two-tone blue (bright azure near the disc, deeper MoMo blue outward) gives the halo depth without arcs.
  //    An EDGE RAMP forces the glow to nothing within the outer margin, so the section-1 border stays pure
  //    white and the Webflow seam is never re-broken, whatever the disc's size or position.
  // SUBTLE, and in MOMO BLUE so it matches the pills and icon bubbles (Gary), not a bright azure. Both tones sit
  // in the #004F71 family; the low peak keeps it a whisper of a halo rather than a burst.
  const PEAK = 0.32;                       // top opacity of the glow at its brightest ring
  const inner = [0, 79, 113], outer = [0, 58, 85];  // exact MoMo blue #004F71 -> deeper, to match the bubbles/pill
  const margin = Math.round(W * 0.06);
  for (let p = 0; p < W * H; p++) {
    const i = p * C, r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // white-background test: bright and near-neutral. Disc (yellow), subject, cards, bottom bar all fail it.
    if (lum < 236 || Math.max(r, g, b) - Math.min(r, g, b) > 18) continue;
    const x = p % W, y = (p / W) | 0;
    const ef = Math.min(1, Math.min(x, W - 1 - x, y, H - 1 - y) / margin);   // 0 at the border -> 1 inside
    const a = (alpha[p] / 255) * PEAK * ef;
    if (a <= 0.003) continue;
    const t = alpha[p] / 255;                // brighter = nearer the disc -> bluer azure
    const br = Math.round(outer[0] + (inner[0] - outer[0]) * t);
    const bg = Math.round(outer[1] + (inner[1] - outer[1]) * t);
    const bb = Math.round(outer[2] + (inner[2] - outer[2]) * t);
    data[i] = Math.round(r * (1 - a) + br * a);
    data[i + 1] = Math.round(g * (1 - a) + bg * a);
    data[i + 2] = Math.round(b * (1 - a) + bb * a);
  }
  return sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
}

export async function onFunnelBackground(pngBuf: Buffer, kind: "masthead" | "section1", navy: [number, number, number] = MASTHEAD_NAVY): Promise<Buffer> {
  const meta = await sharp(pngBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 811;

  if (kind === "section1") {
    return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
      .composite([{ input: pngBuf }]).png().toBuffer();
  }
  // Masthead: the hero band as a FLAT fill of the funnel blue - sampled from the reference, or the measured
  // #005080 default - so the base already matches the section it drops into. flattenMastheadToNavy re-asserts
  // the exact colour deterministically after the retheme.
  return sharp({ create: { width: W, height: H, channels: 3, background: rgbHex(navy) } })
    .composite([{ input: pngBuf }]).png().toBuffer();
}
