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
//   masthead -> the hero section, FLAT #083a51 (Gary supplied the exact swatch; the section is now a solid
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
// THE EXACT WEBFLOW MASTHEAD COLOUR. Gary supplied the swatch: #083a51 (rgb 8,58,81). The masthead creative's
// field must be this to the byte or the seam against the Webflow band is visible. One constant, one source.
export const MASTHEAD_NAVY = "#083a51";
// Tuned on a test rig, not guessed: at 0.035 the fill breached a drop shadow at an unprotected point and then
// ate the whole thing (shadow pixels are background-like, so once inside it spreads through). 0.06 keeps the
// shadow (226 stays 226) while still cleaning corner smudges to pure white. 0.09 gains nothing.
const HALO_FRAC = 0.06;    // protected shadow zone around the design, as a fraction of the width

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

  const isBgPixel = (i: number): boolean => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < BG_MIN_LUM) return false;
    return Math.max(r, g, b) - Math.min(r, g, b) <= BG_MAX_SAT;
  };

  // 1. The DESIGN mask: everything that is not background-like (the disc, the bubbles, the person, the pill).
  const design = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) design[p] = isBgPixel(p * C) ? 0 : 255;

  // 2. Dilate it into a halo, so the design's own soft shadows sit INSIDE the protected zone and survive.
  const radius = Math.max(4, Math.round(W * HALO_FRAC));
  const halo = await sharp(design, { raw: { width: W, height: H, channels: 1 } })
    .blur(radius)          // spreads the mask outward
    .threshold(8)          // anything the blur touched at all becomes protected
    .raw()
    .toBuffer();

  // 3. Flood-fill background-like pixels inward from the edges, never entering the halo.
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
  return sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
}

// FORCE THE MASTHEAD FIELD TO EXACTLY #083a51 (the mirror of flattenSection1ToWhite, for the dark band). The
// retheme is an AI regeneration, so even with a flat #083a51 base it can drift the field a shade or leave a
// faint gradient - and a shade off is a visible seam when the image drops into the Webflow masthead section.
// So we do not rely on the model: we flood-fill the NAVY BACKGROUND inward from the edges to the exact colour,
// stopping dead at the yellow disc, the light streak and the subject (none of which are dark-blue), and
// protecting a halo so the subject's own contact shadow survives. The result: every edge pixel is #083a51.
export async function flattenMastheadToNavy(buf: Buffer): Promise<Buffer> {
  const target = [8, 58, 81];   // #083a51
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;

  // A masthead-background pixel is one that is ALREADY CLOSE to the field colour #083a51. The tolerance is wide
  // enough to swallow the whole range the AI might drift the flat field to (it comfortably covers the old
  // #0b425d -> #02293d gradient), but tight enough that the subject's clothing, skin and hair - and any darker
  // contact shadow beneath them - fall outside it and are left untouched. No halo, no blur: the colour test
  // itself preserves the shadow, and flood-filling only from the EDGES means an interior region that happens to
  // match the field is never reached unless the field connects to it.
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

export async function onFunnelBackground(pngBuf: Buffer, kind: "masthead" | "section1"): Promise<Buffer> {
  const meta = await sharp(pngBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 811;

  if (kind === "section1") {
    return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
      .composite([{ input: pngBuf }]).png().toBuffer();
  }
  // Masthead: the hero band, FLAT #083a51 (MASTHEAD_NAVY) - the exact Webflow colour, so the base already
  // matches the section it drops into. flattenMastheadToNavy re-asserts it deterministically after the retheme.
  return sharp({ create: { width: W, height: H, channels: 3, background: MASTHEAD_NAVY } })
    .composite([{ input: pngBuf }]).png().toBuffer();
}
