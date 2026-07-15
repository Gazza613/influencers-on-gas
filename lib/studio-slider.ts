import sharp from "sharp";
import { renderPng, fontFaceCss } from "./studio-render";

// TYPESET THE SLIDER HEADLINE. The slider comes back carrying the reference's OWN baked headline. To make it
// the campaign's - and to tell a story across the three sliders with three DIFFERENT hooks (Gary) - we cover
// the old baked headline with a scrim that matches the slider's own dark foot, and typeset the Producer's
// headline over it in the MTN font: line 1 white, line 2 MoMo yellow. The AI never draws the letters, so they
// never garble.
//
// The scrim sits in the headline band only, above the legal strip and clear of the top-right deal card.

const MOMO_YELLOW = "#F9CB0F";
const MOMO_BLUE = "#004F71";

export async function typesetSliderHeadline(
  baseBuf: Buffer,
  line1: string,
  line2: string,
  fonts: { family: string; url: string }[],
): Promise<Buffer> {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  const size = Math.round(H * 0.082); // ~88px on a 1080 canvas

  const esc = (t: string) => String(t).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
/* Cover the OLD headline: a dark scrim rising from ~12% up to ~52% of the height, matching the slider's own
   navy foot. Leaves the legal strip (bottom ~12%) and the deal card (top-right) untouched. */
/* Solid navy across the whole old-headline band (fully hides the baked headline), then a soft fade at the top
   so the scrim reads as the slider's own dark foot, not a pasted bar. */
.scrim{position:absolute;left:0;right:0;bottom:10%;height:46%;
  background:linear-gradient(to top, ${MOMO_BLUE} 0%, ${MOMO_BLUE} 52%, ${MOMO_BLUE}CC 68%, ${MOMO_BLUE}66 84%, transparent 100%)}
.head{position:absolute;left:0;right:0;bottom:14%;text-align:center;padding:0 7%;
  font-family:'MTNBrighterSans',sans-serif;font-weight:800;line-height:1.04;-webkit-font-smoothing:antialiased}
.head .l1,.head .l2{font-size:${size}px;letter-spacing:-1px;text-shadow:0 3px 16px rgba(0,0,0,.55);white-space:nowrap}
.head .l1{color:#fff}
.head .l2{color:${MOMO_YELLOW}}
</style></head><body>
<div class="scrim"></div>
<div class="head"><div class="l1">${esc(line1)}</div><div class="l2">${esc(line2)}</div></div>
</body></html>`;

  const { png } = await renderPng({ html, width: W, height: H, scale: 1, transparent: true });
  return sharp(baseBuf).composite([{ input: png }]).png().toBuffer();
}

// COMPOSITE THE REAL LOGO to cover a detected box. img2img redrew the MoMo logo and garbled it ("from HTN"
// instead of "from MTN") - a serious client issue. The logo must NEVER be AI-drawn. We stamp the brand kit's
// real logo exactly where the reference's logo sits (from the layout detector), sized to fully COVER whatever
// the model drew there. Pixel-perfect brand, every time.
//
// `box` is the detected logo position as fractions of the canvas (xPct/yPct top-left, wPct width). We place the
// real logo to match its width and add a small margin so no garbled edge peeks out.
export async function compositeLogo(baseBuf: Buffer, logoBuf: Buffer, box?: { xPct: number; yPct: number; wPct: number }): Promise<Buffer> {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  const b = box || { xPct: 3.5, yPct: 3, wPct: 22 };
  // Normalise: the detector returns 0-100; a fallback may pass fractions of 100 already.
  const wFrac = (b.wPct > 1 ? b.wPct / 100 : b.wPct);
  const xFrac = (b.xPct > 1 ? b.xPct / 100 : b.xPct);
  const yFrac = (b.yPct > 1 ? b.yPct / 100 : b.yPct);

  const clampedW = Math.min(0.30, Math.max(0.20, wFrac)); // sensible logo size; generous to fully cover the garble
  const targetW = Math.round(W * clampedW);
  const logo = await sharp(logoBuf).resize({ width: targetW }).png().toBuffer();
  const left = Math.max(0, Math.round(W * Math.min(xFrac, 0.03)));  // cover from the top-left corner, never inset
  const top = Math.max(0, Math.round(H * Math.min(yFrac, 0.03)));
  return sharp(baseBuf).composite([{ input: logo, left, top }]).png().toBuffer();
}

// FINISH A SLIDER: typeset the campaign headline over the baked one, and stamp the REAL logo over whatever the
// model drew. One place, used by the wizard and the full-set flow, so both get the same brand-safe finish.
import { typesetSliderHeadline as _typeset } from "./studio-slider";
import { getBrandKit } from "./studio";
import { putBytes } from "./blob";

function pickLogo(logos: { name: string | null; url: string }[]): { url: string } | null {
  if (!logos?.length) return null;
  const score = (n: string) => { const s = n.toLowerCase(); let v = 0; if (/mono|black|white|grey|gray/.test(s)) v -= 5; if (/stack|vert/.test(s)) v -= 3; if (/horiz|primary|full|colou?r/.test(s)) v += 3; if (/momo/.test(s)) v += 2; return v; };
  return [...logos].sort((a, b) => score(b.name || "") - score(a.name || ""))[0];
}

export async function finishSlider(clientId: string, referenceUrl: string, swapUrl: string, callout: string): Promise<string> {
  const kit = await getBrandKit(clientId).catch(() => null);
  const fonts = (kit?.fonts || []) as { family: string; url: string }[];
  let out: Buffer = Buffer.from(new Uint8Array(await (await fetch(swapUrl)).arrayBuffer()));

  // Headline: split "line 1 / line 2" (the Producer's campaign headline), typeset it. Do NOT swallow a failure
  // silently - that is exactly how the reference's baked headline was slipping through un-themed.
  if (callout.trim()) {
    const [l1, l2] = callout.split("/").map((x) => x.trim());
    try {
      out = (await _typeset(out, l1 || callout, l2 || "", fonts)) as Buffer;
    } catch (e) {
      console.error("[finishSlider] headline typeset FAILED (headline will be the reference's):", e);
    }
  }
  // Logo: cover the (garbled) logo with the real brand lockup, from the top-left corner (fixed, reliable -
  // detection was landing off and doubling the logo).
  const logo = pickLogo((kit?.logos || []) as { name: string | null; url: string }[]);
  if (logo) {
    try {
      const logoBuf = Buffer.from(await (await fetch(logo.url)).arrayBuffer());
      out = (await compositeLogo(out, logoBuf, { xPct: 3, yPct: 3, wPct: 26 })) as Buffer;
    } catch (e) { console.error("[finishSlider] logo composite failed:", e); }
  }
  return putBytes(out, `studio/${clientId}/slider`, "png", "image/png");
}
