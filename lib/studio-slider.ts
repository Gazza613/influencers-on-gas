import sharp from "sharp";
import { renderPng, fontFaceCss } from "./studio-render";
import { dealCardCss, dealCardHtml } from "./templates/momo-deal-card";
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

export async function typesetSliderHeadline(
  baseBuf: Buffer,
  line1: string,
  line2: string,
  fonts: { family: string; url: string }[],
  legal?: string | null,
): Promise<Buffer> {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  const size = Math.round(H * 0.082); // ~88px on a 1080 canvas

  const esc = (t: string) => String(t).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const legalLine = (legal || "").trim();
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
/* The dark foot of the slider. It carries the headline and the legal line. Anchored to the very bottom so both
   have a solid navy backing, but kept short (top ~36%) so it does not creep up the photo (Gary: "too high"). */
.scrim{position:absolute;left:0;right:0;bottom:0;height:36%;
  background:linear-gradient(to top, ${MOMO_BLUE} 0%, ${MOMO_BLUE} 42%, ${MOMO_BLUE}AA 70%, transparent 100%)}
.head{position:absolute;left:0;right:0;bottom:${legalLine ? "12%" : "9%"};text-align:center;padding:0 7%;
  font-family:'MTNBrighterSans',sans-serif;font-weight:800;line-height:1.04;-webkit-font-smoothing:antialiased}
.head .l1,.head .l2{font-size:${size}px;letter-spacing:-1px;text-shadow:0 3px 16px rgba(0,0,0,.55);white-space:nowrap}
.head .l1{color:#fff}
.head .l2{color:${MOMO_YELLOW}}
.legal{position:absolute;left:0;right:0;bottom:2.6%;text-align:center;padding:0 9%;
  font-family:'MTNBrighterSans',sans-serif;font-weight:500;line-height:1.25;color:rgba(255,255,255,.82);
  font-size:${Math.round(H * 0.0165)}px}
</style></head><body>
<div class="scrim"></div>
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

export async function finishSlider(clientId: string, _referenceUrl: string, swapUrl: string, callout: string, deal?: Deal | null): Promise<string> {
  const kit = await getBrandKit(clientId).catch(() => null);
  const fonts = (kit?.fonts || []) as { family: string; url: string }[];
  let out: Buffer = Buffer.from(new Uint8Array(await (await fetch(swapUrl)).arrayBuffer()));
  // The swap now returns a CLEAN photograph with NO baked furniture, so we no longer need to detect and cover
  // the reference's logo/deal - we place OURS at fixed, reliable slider positions and they are the only ones
  // in the frame. Nothing can garble because the AI never drew any of it.

  // Headline + legal: split "line 1 / line 2" (the Producer's campaign headline) and typeset it over the dark
  // foot scrim, with the brand kit's bank-free creative legal line beneath it (the plate is clean, so the
  // reference's baked legal strip is gone - we composite the compliant one back).
  const legal = (kit?.creative_legal_text || "").trim() || null;
  if (callout.trim() || legal) {
    const [l1, l2] = callout.split("/").map((x) => x.trim());
    try {
      out = (await _typeset(out, l1 || callout, l2 || "", fonts, legal)) as Buffer;
    } catch (e) {
      console.error("[finishSlider] headline typeset FAILED:", e);
    }
  }
  // Deal: stamp OUR real deal card (the campaign's chosen deal) top-right. Fixed position - clean plate.
  if (deal && deal.label && deal.price) {
    try { out = (await overlayDeal(out, deal, fonts, null)) as Buffer; }
    catch (e) { console.error("[finishSlider] deal overlay failed:", e); }
  }
  // Logo: stamp the real brand lockup top-left. Fixed position - this is the ONLY logo in the frame now.
  const logo = pickLogo((kit?.logos || []) as { name: string | null; url: string }[]);
  if (logo) {
    try {
      const logoBuf = Buffer.from(await (await fetch(logo.url)).arrayBuffer());
      out = (await compositeLogo(out, logoBuf, { xPct: 3, yPct: 3, wPct: 24 })) as Buffer;
    } catch (e) { console.error("[finishSlider] logo composite failed:", e); }
  }
  return putBytes(out, `studio/${clientId}/slider`, "png", "image/png");
}
