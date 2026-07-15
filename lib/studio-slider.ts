import sharp from "sharp";
import { renderPng, fontFaceCss } from "./studio-render";
import { dealCardCss, dealCardHtml } from "./templates/momo-deal-card";
import { momoPillCss, momoPillHtml } from "./templates/momo-pill";
import type { Deal } from "./studio-producer";

// TYPESET THE SLIDER HEADLINE. The slider comes back carrying the reference's OWN baked headline. To make it
// the campaign's - and to tell a story across the three sliders with three DIFFERENT hooks (Gary) - we cover
// the old baked headline with a scrim that matches the slider's own dark foot, and typeset the Producer's
// headline over it in the MTN font: line 1 white, line 2 MoMo yellow. The AI never draws the letters, so they
// never garble.
//
// The scrim sits in the headline band only, above the legal strip and clear of the top-right deal card.

const MOMO_YELLOW = "#F9CB0F";
const MOMO_BLUE = "#004F71";

// Split a headline into two BALANCED lines. If the copy already carries a "/", honour it. Otherwise break it
// at the word boundary nearest the middle, so a long single phrase ("Share in the joy this mothers day") becomes
// two lines instead of one that runs off the edge (Gary: "cut off").
export function balanceHeadline(callout: string): [string, string] {
  const raw = String(callout || "").trim();
  if (raw.includes("/")) {
    const [a, ...rest] = raw.split("/");
    return [a.trim(), rest.join("/").trim()];
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [raw, ""];
  const total = raw.length;
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ").length;
    const diff = Math.abs(left - (total - left));
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export async function typesetSliderHeadline(
  baseBuf: Buffer,
  line1: string,
  line2: string,
  fonts: { family: string; url: string }[],
  legal?: string | null,
): Promise<Buffer> {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  // Auto-fit: size the headline so the LONGEST line fits inside ~86% of the width, capped to a sane band. A
  // heavy italic glyph averages ~0.54*fontSize wide, so this keeps even a long line on-canvas (no clipping).
  const longest = Math.max(line1.length, line2.length, 1);
  const fitW = W * 0.86;
  const size = Math.max(Math.round(H * 0.045), Math.min(Math.round(H * 0.09), Math.floor(fitW / (longest * 0.54))));

  const esc = (t: string) => String(t).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const legalLine = (legal || "").trim();
  // Match the gold-standard slider: NOT a heavy blue bar. A SOFT gradient for headline legibility over the
  // photo, plus a THIN solid navy footer at the very bottom that carries the two-line legal disclaimer.
  const footH = legalLine ? 9 : 0;            // % height of the navy legal footer
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
/* Soft gradient for the headline - the photo shows through, no hard bar (Gary: "blue shading too high"). */
.grad{position:absolute;left:0;right:0;bottom:${footH}%;height:26%;
  background:linear-gradient(to top, ${MOMO_BLUE}D9 0%, ${MOMO_BLUE}7A 44%, transparent 100%)}
/* The thin solid navy footer, only as tall as the legal needs. */
.foot{position:absolute;left:0;right:0;bottom:0;height:${footH}%;background:${MOMO_BLUE}}
.head{position:absolute;left:0;right:0;bottom:${footH + 3}%;text-align:center;padding:0 7%;
  font-family:'MTNBrighterSans',sans-serif;font-weight:800;line-height:1.04;-webkit-font-smoothing:antialiased}
.head .l1,.head .l2{font-size:${size}px;letter-spacing:-1px;text-shadow:0 3px 16px rgba(0,0,0,.55);white-space:normal;overflow-wrap:break-word}
.head .l1{color:#fff}
.head .l2{color:${MOMO_YELLOW}}
.legal{position:absolute;left:0;right:0;bottom:${(footH / 2)}%;transform:translateY(50%);text-align:center;padding:0 7%;
  font-family:'MTNBrighterSans',sans-serif;font-weight:500;line-height:1.3;color:rgba(255,255,255,.9);
  font-size:${Math.round(H * 0.0155)}px}
</style></head><body>
<div class="grad"></div>
${legalLine ? `<div class="foot"></div>` : ""}
<div class="head"><div class="l1">${esc(line1)}</div><div class="l2">${esc(line2)}</div></div>
${legalLine ? `<div class="legal">${esc(legalLine)}</div>` : ""}
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
  const b = box || { xPct: 4, yPct: 4, wPct: 28 };
  // Normalise: the detector returns 0-100; a fallback may pass fractions of 100 already.
  const wFrac = (b.wPct > 1 ? b.wPct / 100 : b.wPct);
  const xFrac = (b.xPct > 1 ? b.xPct / 100 : b.xPct);
  const yFrac = (b.yPct > 1 ? b.yPct / 100 : b.yPct);

  // FORENSIC placement: honour the reference's own logo box (position + size), only clamped to sane bounds. The
  // gold-standard slider logo is large (~28-32% wide), so allow up to 38%. Trim the logo's transparent padding
  // first so it fills the box instead of floating small inside it (Gary: "logo too small").
  const trimmed = await sharp(logoBuf).trim().png().toBuffer().catch(() => logoBuf);
  const clampedW = Math.min(0.38, Math.max(0.18, wFrac));
  const targetW = Math.round(W * clampedW);
  const logo = await sharp(trimmed).resize({ width: targetW }).png().toBuffer();
  const lm = await sharp(logo).metadata();
  const left = Math.max(0, Math.min(Math.round(W * xFrac), W - (lm.width || targetW)));
  const top = Math.max(0, Math.min(Math.round(H * yFrac), H - (lm.height || 0)));
  return sharp(baseBuf).composite([{ input: logo, left, top }]).png().toBuffer();
}

// Average luminance (0-255) of a region of the image, so we can pick the logo colour that will READ there.
async function regionLuminance(buf: Buffer, box: { xPct: number; yPct: number; wPct: number }): Promise<number> {
  try {
    const meta = await sharp(buf).metadata();
    const W = meta.width || 1080, H = meta.height || 1080;
    const xF = box.xPct > 1 ? box.xPct / 100 : box.xPct;
    const yF = box.yPct > 1 ? box.yPct / 100 : box.yPct;
    const wF = box.wPct > 1 ? box.wPct / 100 : box.wPct;
    const left = Math.max(0, Math.round(W * xF));
    const top = Math.max(0, Math.round(H * yF));
    const width = Math.max(8, Math.min(Math.round(W * Math.max(wF, 0.1)), W - left));
    const height = Math.max(8, Math.min(Math.round(H * 0.12), H - top));
    const { channels } = await sharp(buf).extract({ left, top, width, height }).stats();
    const [r, g, b] = channels.map((c) => c.mean);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  } catch { return 128; }
}

// FINISH A SLIDER: typeset the campaign headline over the baked one, and stamp the REAL logo over whatever the
// model drew. One place, used by the wizard and the full-set flow, so both get the same brand-safe finish.
import { typesetSliderHeadline as _typeset } from "./studio-slider";
import { getBrandKit } from "./studio";
import { detectLayout } from "./studio-layout";
import { putBytes } from "./blob";

// Pick the logo lockup that will READ on this background. Gary: "you use blue and yellow logos - choose the
// best for visibility." A DARK background wants the light-reading variant (yellow/white lockup); a LIGHT
// background wants the navy/colour variant. Falls back to the strongest horizontal/colour lockup by name.
function pickLogoForBg(logos: { name: string | null; url: string }[], bgLum: number): { url: string } | null {
  if (!logos?.length) return null;
  const dark = bgLum < 130; // background luminance 0-255
  const score = (n: string) => {
    const s = (n || "").toLowerCase();
    let v = 0;
    if (/momo/.test(s)) v += 1;
    if (/horiz|primary|full/.test(s)) v += 2;
    if (/stack|vert|icon|mark/.test(s)) v -= 2;
    if (dark) { // want a light-reading logo
      if (/white|reverse|reversed|yellow|light|on.?dark|dark.?bg/.test(s)) v += 5;
      if (/navy|blue|black|on.?light|light.?bg/.test(s)) v -= 4;
    } else { // want a dark/colour logo
      if (/navy|blue|colou?r|dark|primary|on.?light/.test(s)) v += 5;
      if (/white|reverse|reversed|mono.?white|on.?dark/.test(s)) v -= 4;
    }
    return v;
  };
  return [...logos].sort((a, b) => score(b.name || "") - score(a.name || ""))[0];
}

// Render OUR real deal card (vertical) as a transparent PNG, then composite it TOP-RIGHT over the slider's
// deal-card position - so the deal is the campaign's chosen one, pixel-clean, never the reference's baked card.
async function overlayDeal(baseBuf: Buffer, deal: Deal, fonts: { family: string; url: string }[], box?: { xPct: number; yPct: number; wPct: number } | null): Promise<Buffer> {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  // Render the vertical card big, trim to it, then resize to an exact width - guarantees the whole card (down
  // to the validity line) is present and correctly sized.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss(fonts)}
    *{margin:0;box-sizing:border-box}body{background:transparent;padding:20px}${dealCardCss(0.5)}</style></head>
    <body>${dealCardHtml(deal, "vertical")}</body></html>`;
  const { png } = await renderPng({ html, width: 1400, height: 1800, scale: 1, transparent: true });
  // Size to the reference deal-card box (a touch bigger, to fully COVER the baked one), else default top-right.
  const wFrac = box ? Math.min(0.32, Math.max(0.18, (box.wPct > 1 ? box.wPct / 100 : box.wPct) * 1.08)) : 0.24;
  const cardW = Math.round(W * wFrac);
  const card = await sharp(png).trim({ threshold: 10 }).resize({ width: cardW }).png().toBuffer();
  const cm = await sharp(card).metadata();
  const left = box ? Math.round(W * (box.xPct > 1 ? box.xPct / 100 : box.xPct) - cardW * 0.04) : W - (cm.width || cardW) - Math.round(W * 0.035);
  const top = box ? Math.round(H * (box.yPct > 1 ? box.yPct / 100 : box.yPct) - H * 0.01) : Math.round(H * 0.035);
  return sharp(baseBuf).composite([{ input: card, left: Math.max(0, Math.min(left, W - (cm.width || cardW))), top: Math.max(0, top) }]).png().toBuffer();
}

// COMPOSITE THE THEMED 3D PILL over a disc creative (masthead / section 1) - the campaign's words in MoMo's own
// lozenge, never AI-drawn. `callout` is "line 1 / line 2" from the Producer.
//
// The swap does NOT reliably remove the reference's baked pill (Gary saw the old pill sitting behind the new
// one), so we do not depend on it. Instead, when we know where the reference's pill sits (the detected callout
// box), we size OUR pill to fully COVER it - a touch wider than the box and centred on it - so the old copy is
// hidden regardless. With no box we fall back to a sensible bottom-centre placement.
export async function overlayPill(
  baseBuf: Buffer,
  callout: string,
  fonts: { family: string; url: string }[],
  opts: { box?: { xPct: number; yPct: number; wPct: number } | null; widthFrac?: number } = {},
): Promise<Buffer> {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  const [l1, l2] = callout.split("/").map((x) => x.trim());
  if (!l1) return baseBuf;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss(fonts)}
    *{margin:0;box-sizing:border-box}body{background:transparent;padding:60px}${momoPillCss(0.5)}</style></head>
    <body>${momoPillHtml(l1, l2)}</body></html>`;
  const { png } = await renderPng({ html, width: 2600, height: 900, scale: 1, transparent: true });
  const trimmed = await sharp(png).trim({ threshold: 8 }).png().toBuffer();

  const box = opts.box || null;
  const boxWFrac = box ? (box.wPct > 1 ? box.wPct / 100 : box.wPct) : 0;
  // Cover the reference pill: at least 12% wider than its box, clamped sane. Else the caller's default width.
  const widthFrac = box
    ? Math.min(0.92, Math.max(0.5, boxWFrac * 1.12))
    : (opts.widthFrac || 0.66);
  const pillW = Math.round(W * widthFrac);
  const pill = await sharp(trimmed).resize({ width: pillW }).png().toBuffer();
  const pm = await sharp(pill).metadata();
  const pw = pm.width || pillW, ph = pm.height || 0;

  let left: number, top: number;
  if (box) {
    // Centre our pill on the reference pill's box centre, so it blankets the old one.
    const boxXFrac = box.xPct > 1 ? box.xPct / 100 : box.xPct;
    const boxYFrac = box.yPct > 1 ? box.yPct / 100 : box.yPct;
    const cx = (boxXFrac + boxWFrac / 2) * W;
    // The detector gives the box TOP; the reference pills are short, so centre a little below the top edge.
    const cy = boxYFrac * H + ph * 0.5;
    left = Math.round(cx - pw / 2);
    top = Math.round(cy - ph / 2);
  } else {
    left = Math.round((W - pw) / 2);
    top = Math.round(H - ph - H * 0.045);
  }
  left = Math.max(0, Math.min(left, W - pw));
  top = Math.max(0, Math.min(top, H - ph));
  return sharp(baseBuf).composite([{ input: pill, left, top }]).png().toBuffer();
}

export async function finishSlider(clientId: string, referenceUrl: string, swapUrl: string, callout: string, deal?: Deal | null): Promise<string> {
  const kit = await getBrandKit(clientId).catch(() => null);
  const fonts = (kit?.fonts || []) as { family: string; url: string }[];
  let out: Buffer = Buffer.from(new Uint8Array(await (await fetch(swapUrl)).arrayBuffer()));

  // FORENSIC placement (Gary): "change only the people and the callouts, keep everything else as the reference."
  // The swap returns a clean photograph, so we lay OUR real logo, deal and legal at the REFERENCE'S own
  // positions (no doubling risk, because the plate is clean). One layout read gives us those boxes.
  const layout = await detectLayout(referenceUrl).catch(() => null);

  // Headline + legal: the Producer's campaign headline over a soft gradient, and the exact reference disclaimer
  // in the thin navy footer.
  const legal = (kit?.creative_legal_text || "").trim() || null;
  if (callout.trim() || legal) {
    const [l1, l2] = balanceHeadline(callout);
    try {
      out = (await _typeset(out, l1 || callout, l2 || "", fonts, legal)) as Buffer;
    } catch (e) {
      console.error("[finishSlider] headline typeset FAILED:", e);
    }
  }
  // Deal: stamp the campaign's chosen deal card at the reference's own deal-card box (top-right).
  if (deal && deal.label && deal.price) {
    try { out = (await overlayDeal(out, deal, fonts, layout?.callout)) as Buffer; }
    catch (e) { console.error("[finishSlider] deal overlay failed:", e); }
  }
  // Logo: place the real lockup at the reference's own logo box, and choose the colour variant that reads on the
  // background there (yellow/white on a dark photo, navy/colour on a light one).
  const logoBox = layout?.logo || { xPct: 4, yPct: 4, wPct: 28 };
  const bgLum = await regionLuminance(out, logoBox);
  const logo = pickLogoForBg((kit?.logos || []) as { name: string | null; url: string }[], bgLum);
  if (logo) {
    try {
      const logoBuf = Buffer.from(await (await fetch(logo.url)).arrayBuffer());
      out = (await compositeLogo(out, logoBuf, logoBox)) as Buffer;
    } catch (e) { console.error("[finishSlider] logo composite failed:", e); }
  }
  return putBytes(out, `studio/${clientId}/slider`, "png", "image/png");
}
