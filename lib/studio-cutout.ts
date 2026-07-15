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
// Colours read straight from the live funnel CSS (mtn-momo.webflow.shared.css):
//   masthead -> the hero section .section-1---hero: linear-gradient(167deg, #0b425d, #02293d)
//   section1 -> the white sections: #ffffff
export async function onFunnelBackground(pngBuf: Buffer, kind: "masthead" | "section1"): Promise<Buffer> {
  const meta = await sharp(pngBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 811;

  if (kind === "section1") {
    return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
      .composite([{ input: pngBuf }]).png().toBuffer();
  }
  // Masthead: the hero navy gradient, top #0b425d to bottom #02293d (167deg ~ near-vertical, slight left).
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="g" x1="0.1" y1="0" x2="-0.1" y2="1">` +
    `<stop offset="0" stop-color="#0b425d"/><stop offset="1" stop-color="#02293d"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  const bg = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(bg).composite([{ input: pngBuf }]).png().toBuffer();
}
