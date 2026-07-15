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

  // The reference's alpha, as a single-channel raw mask at the reference's size.
  const alphaRaw = await sharp(referenceBuf).ensureAlpha().extractChannel(3).resize(W, H, { fit: "fill" }).raw().toBuffer();
  // The result's colour, stripped of its own (opaque) alpha, at the same size.
  const rgbRaw = await sharp(resultBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();

  return sharp(rgbRaw, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(alphaRaw, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

// A quick preview: drop the transparent PNG onto the funnel navy so it is seen the way it will actually be
// embedded, plus a checkerboard so the transparency itself is unambiguous.
export async function onBackground(pngBuf: Buffer, hex: string): Promise<Buffer> {
  const meta = await sharp(pngBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 811;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const bg = sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } });
  return bg.composite([{ input: pngBuf }]).png().toBuffer();
}
