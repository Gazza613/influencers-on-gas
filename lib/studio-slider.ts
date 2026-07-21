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

// SLIDER CALLOUT PUNCTUATION - Gary's lock-in rule: "if we have full stops we need to end the sentence with a
// full stop. if not, commas - which is preferred - then no full stop."
//
// The rule is CONSISTENCY, and we never invent punctuation:
//   - if the copy uses a full stop anywhere, the sentence is finished with one;
//   - IF IT USES A COMMA, it is a sentence, so it is finished with a full stop (Gary, locked in: "if we use
//     commas make sure we add a full stop at the end of that sentence"). "Verify the channel, not just the
//     number" becomes "...the number.";
//   - otherwise it is a bare phrase and carries no full stop at all.
// We never ADD a comma - that is a writing choice for the Producer, not a transform. A first pass that
// force-added them produced "Miss your mom?," and broke "Everyday Value / for Every Woman", which is one
// continuous phrase, not two clauses. A ? or ! already ends the sentence, so it is left alone.
export function tidyCallout(callout: string): string {
  const raw = String(callout || "").trim();
  if (!raw) return raw;
  const parts = raw.includes("/") ? raw.split("/").map((s) => s.trim()) : [raw];
  const usesFullStops = parts.some((p) => /\.\s*$/.test(p));
  const usesCommas = parts.some((p) => p.includes(","));
  const needsFullStop = usesFullStops || usesCommas;
  const fixed = parts.map((p, i) => {
    let s = p.trim();
    const isLast = i === parts.length - 1;
    if (needsFullStop) {
      if (isLast) {
        // Finish the sentence with ONE terminal mark. A headline that already ends in a comma
        // (the Producer sometimes writes "...no buffering out,") must not become "out,." - strip the
        // trailing comma first, THEN add the full stop. Only .?! count as "already finished".
        s = s.replace(/[,\s]+$/, "");
        if (!/[.?!]$/.test(s)) s += ".";
      }
    } else {
      s = s.replace(/\s*\.+\s*$/, "");                     // a bare phrase: drop any stray full stop
    }
    return s;
  });
  return fixed.join(" / ");
}

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
  // LIFT THE WHOLE FOOT off the bottom edge, as a % of height. Zero for a funnel slider, which is shown whole.
  // A LinkedIn 4:5 post is CROPPED towards square on desktop, so anything hard against the bottom edge is the
  // first thing to be cut - and the headline is the one element that must survive (Gary).
  liftPct = 0,
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
  const lift = Math.max(0, Math.min(30, liftPct));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
/* Soft gradient for the headline - the photo shows through, no hard bar (Gary: "blue shading too high"). */
.grad{position:absolute;left:0;right:0;bottom:${footH + lift}%;height:26%;
  background:linear-gradient(to top, ${MOMO_BLUE}D9 0%, ${MOMO_BLUE}7A 44%, transparent 100%)}
/* The thin solid navy footer, only as tall as the legal needs. */
.foot{position:absolute;left:0;right:0;bottom:${lift}%;height:${footH}%;background:${MOMO_BLUE}}
.head{position:absolute;left:0;right:0;bottom:${footH + lift + 3}%;text-align:center;padding:0 7%;
  font-family:'MTNBrighterSans',sans-serif;font-weight:800;line-height:1.04;-webkit-font-smoothing:antialiased}
.head .l1,.head .l2{font-size:${size}px;letter-spacing:-1px;text-shadow:0 3px 16px rgba(0,0,0,.55);white-space:normal;overflow-wrap:break-word}
.head .l1{color:#fff}
.head .l2{color:${MOMO_YELLOW}}
.legal{position:absolute;left:0;right:0;bottom:${lift + footH / 2}%;transform:translateY(50%);text-align:center;padding:0 7%;
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
export async function compositeLogo(baseBuf: Buffer, logoBuf: Buffer, box?: { xPct: number; yPct: number; wPct: number }, opts?: { halo?: boolean }): Promise<Buffer> {
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
  const lw = lm.width || targetW, lh = lm.height || 0;
  const left = Math.max(0, Math.min(Math.round(W * xFrac), W - lw));
  const top = Math.max(0, Math.min(Math.round(H * yFrac), H - lh));

  // THE LEGIBILITY HALO (sliders). One logo colour is used across the whole carousel so the set stays
  // consistent, and this soft dark halo - drawn from the logo's OWN shape, blurred and spread - is what keeps
  // it readable on any background. On the dark, warm-graded slides it is invisible (dark on dark); on a lighter
  // patch it quietly outlines the logo so the copy is never lost. It travels with the logo, so there is no box
  // or scrim to look out of place. Off by default, so the CEO creative's own logo is untouched.
  if (opts?.halo) {
    const pad = Math.max(6, Math.round(targetW * 0.05));
    const padded = await sharp(logo).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const bigW = lw + 2 * pad, bigH = lh + 2 * pad;
    // A blurred, strengthened copy of the logo's alpha becomes a soft dark glow that reaches just past its edge.
    const haloAlpha = await sharp(padded).ensureAlpha().extractChannel(3).blur(pad * 0.7).linear(1.7, 0).toColourspace("b-w").toBuffer();
    const haloRgb = await sharp({ create: { width: bigW, height: bigH, channels: 3, background: "#0a1622" } }).png().toBuffer();
    const halo = await sharp(haloRgb).joinChannel(haloAlpha).png().toBuffer();
    const combined = await sharp(halo).composite([{ input: logo, left: pad, top: pad }]).png().toBuffer();
    const cl = Math.max(0, Math.min(left - pad, W - bigW)), ct = Math.max(0, Math.min(top - pad, H - bigH));
    return sharp(baseBuf).composite([{ input: combined, left: cl, top: ct }]).png().toBuffer();
  }
  return sharp(baseBuf).composite([{ input: logo, left, top }]).png().toBuffer();
}

// FINISH A SLIDER: typeset the campaign headline over the baked one, and stamp the REAL logo over whatever the
// model drew. One place, used by the wizard and the full-set flow, so both get the same brand-safe finish.
import { typesetSliderHeadline as _typeset } from "./studio-slider";
import { getBrandKit } from "./studio";
import { detectLayout } from "./studio-layout";
import { putBytes } from "./blob";

// ONE LOGO FOR THE WHOLE CAROUSEL (Gary). The three sliders sit together, so a per-slide colour pick could hand
// you yellow, yellow, blue - which reads as a mismatched set. So the carousel does NOT switch colour by
// background: it always uses the light-reading lockup (the sliders carry a warm, dark grade), and the halo in
// compositeLogo is what keeps that one lockup legible even where a slide runs light. Consistent AND readable,
// instead of consistent-OR-readable.
function pickCarouselLogo(logos: { name: string | null; url: string }[]): { url: string } | null {
  if (!logos?.length) return null;
  const score = (n: string) => {
    const s = (n || "").toLowerCase();
    let v = 0;
    if (/momo/.test(s)) v += 1;
    if (/horiz|primary|full/.test(s)) v += 2;
    if (/stack|vert|icon|mark/.test(s)) v -= 2;
    // Always prefer the light-reading variant - the carousel standard.
    if (/white|reverse|reversed|yellow|light|on.?dark|dark.?bg/.test(s)) v += 5;
    if (/navy|blue|black|on.?light|light.?bg/.test(s)) v -= 4;
    return v;
  };
  return [...logos].sort((a, b) => score(b.name || "") - score(a.name || ""))[0];
}

// Render OUR real deal card (vertical) as a transparent PNG, then composite it TOP-RIGHT over the slider's
// deal-card position - so the deal is the campaign's chosen one, pixel-clean, never the reference's baked card.
async function overlayDeal(baseBuf: Buffer, deal: Deal, fonts: { family: string; url: string }[], box?: { xPct: number; yPct: number; wPct: number } | null, orientation: "vertical" | "horizontal" = "vertical"): Promise<Buffer> {
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  // Render the card big, trim to it, then resize to an exact width - guarantees the whole card (down to the
  // validity line) is present and correctly sized.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss(fonts)}
    *{margin:0;box-sizing:border-box}body{background:transparent;padding:20px}${dealCardCss(0.5)}</style></head>
    <body>${dealCardHtml(deal, orientation)}</body></html>`;
  const { png } = await renderPng({ html, width: 2600, height: 1800, scale: 1, transparent: true });
  // Size to the reference deal-card box (a touch bigger, to fully COVER the baked one), else default top-right.
  // Landscape needs more width to read, so it gets a wider footprint than the vertical badge.
  const wFrac = box ? Math.min(orientation === "horizontal" ? 0.5 : 0.32, Math.max(0.18, (box.wPct > 1 ? box.wPct / 100 : box.wPct) * 1.08)) : (orientation === "horizontal" ? 0.42 : 0.24);
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
  // Logo: place the ONE carousel lockup at the reference's own logo box, kept legible by its halo - the same
  // consistent logo on every slider, never a per-slide colour switch that would mismatch the set.
  const logoBox = layout?.logo || { xPct: 4, yPct: 4, wPct: 28 };
  const logo = pickCarouselLogo((kit?.logos || []) as { name: string | null; url: string }[]);
  if (logo) {
    try {
      const logoBuf = Buffer.from(await (await fetch(logo.url)).arrayBuffer());
      out = (await compositeLogo(out, logoBuf, logoBox, { halo: true })) as Buffer;
    } catch (e) { console.error("[finishSlider] logo composite failed:", e); }
  }
  return putBytes(out, `studio/${clientId}/slider`, "png", "image/png");
}

// TYPESET A CUSTOM DEAL onto a creative. Gary: "deals are dynamic from the client - if it says 1GB for R2 and I
// want 5GB for R49, can I change it?"
//
// The answer is yes, and WITHOUT handing the price to an AI: the client's deal card is already rebuilt as code
// (templates/momo-deal-card.ts, measured off their real artwork), so any deal the team types is RENDERED in that
// design - every character exact, because we set the type ourselves. Dynamic deals, zero garble risk.
export async function stampTypesetDeal(
  clientId: string,
  imageUrl: string,
  deal: Deal,
  referenceUrl?: string,
  orientation: "vertical" | "horizontal" = "vertical",
): Promise<string> {
  try {
    const kit = await getBrandKit(clientId).catch(() => null);
    const fonts = (kit?.fonts || []) as { family: string; url: string }[];
    const buf: Buffer = Buffer.from(new Uint8Array(await (await fetch(imageUrl)).arrayBuffer()));
    const layout = referenceUrl ? await detectLayout(referenceUrl).catch(() => null) : null;
    const out = await overlayDeal(buf, deal, fonts, layout?.callout, orientation);
    return await putBytes(out, `studio/${clientId}/deal-typeset`, "png", "image/png");
  } catch (e) {
    console.error("[stampTypesetDeal] failed, returning image without the deal:", e);
    return imageUrl;
  }
}

// Render JUST the deal card as a standalone transparent PNG - so the builder can PREVIEW exactly what will land
// on the creative before spending a generate (Gary: "I need a preview image on the deal selector").
export async function renderDealCardPreview(clientId: string, deal: Deal, orientation: "vertical" | "horizontal" = "vertical"): Promise<string> {
  const kit = await getBrandKit(clientId).catch(() => null);
  const fonts = (kit?.fonts || []) as { family: string; url: string }[];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss(fonts)}
    *{margin:0;box-sizing:border-box}body{background:transparent;padding:24px}${dealCardCss(0.5)}</style></head>
    <body>${dealCardHtml(deal, orientation)}</body></html>`;
  const { png } = await renderPng({ html, width: 1600, height: 2000, scale: 1, transparent: true });
  const trimmed = await sharp(png).trim({ threshold: 10 }).png().toBuffer();
  return putBytes(trimmed, `studio/${clientId}/deal-preview`, "png", "image/png");
}

// STAMP A REAL DEAL CARD / PILL from the intake library (Gary's team). Asking the model to draw a deal is what
// produced the garbled "Unlimited R20" and off-theme data cards. The client has 68 real deal-card assets, so
// when one is chosen we composite THAT image - pixel-perfect, correct price, on brand - and the retheme is told
// to leave the area clean so ours is the only card in the frame.
//
// Placed TOP-RIGHT by default (the position Gary's team asked for), or on the reference's own deal-card box
// when we can read it, so it lands where that design normally carries its offer.
export async function stampDealCard(
  clientId: string,
  imageUrl: string,
  dealCardUrl: string,
  referenceUrl?: string,
): Promise<string> {
  try {
    let out: Buffer = Buffer.from(new Uint8Array(await (await fetch(imageUrl)).arrayBuffer()));
    const meta = await sharp(out).metadata();
    const W = meta.width || 1080, H = meta.height || 1080;

    // Prefer the reference's own deal box; else a sensible top-right placement.
    const layout = referenceUrl ? await detectLayout(referenceUrl).catch(() => null) : null;
    const box = layout?.callout || null;
    const wFrac = box
      ? Math.min(0.34, Math.max(0.16, (box.wPct > 1 ? box.wPct / 100 : box.wPct)))
      : 0.24;

    const card = await sharp(Buffer.from(new Uint8Array(await (await fetch(dealCardUrl)).arrayBuffer())))
      .trim()
      .resize({ width: Math.round(W * wFrac) })
      .png()
      .toBuffer();
    const cm = await sharp(card).metadata();
    const cw = cm.width || Math.round(W * wFrac), ch = cm.height || 0;

    const left = box
      ? Math.round(W * (box.xPct > 1 ? box.xPct / 100 : box.xPct))
      : W - cw - Math.round(W * 0.035);
    const top = box
      ? Math.round(H * (box.yPct > 1 ? box.yPct / 100 : box.yPct))
      : Math.round(H * 0.035);

    out = await sharp(out)
      .composite([{ input: card, left: Math.max(0, Math.min(left, W - cw)), top: Math.max(0, Math.min(top, H - ch)) }])
      .png()
      .toBuffer();
    return await putBytes(out, `studio/${clientId}/deal-stamped`, "png", "image/png");
  } catch (e) {
    console.error("[stampDealCard] failed, returning image without the deal card:", e);
    return imageUrl;
  }
}

// THE LOGO HARD LOCK (Gary). The retheme keeps the design beautifully, but nano_banana re-draws the MoMo
// lockup and garbles the wordmark - "MoMo from HTN" instead of "from MTN". That is unshippable brand damage,
// and no prompt wording fixes it reliably, so we stop asking: after every retheme we stamp the REAL lockup from
// the brand kit over the logo's own position, at the reference's own size, in the colour variant that reads on
// the background there. The AI's version is covered. The logo can NEVER be wrong again.
//
// Returns the original url unchanged if the client has no logo on file or anything fails - a hard lock must
// never be the reason a creative fails to come back.
export async function stampRealLogo(clientId: string, referenceUrl: string, imageUrl: string): Promise<string> {
  try {
    const kit = await getBrandKit(clientId).catch(() => null);
    const logos = (kit?.logos || []) as { name: string | null; url: string }[];
    if (!logos.length) return imageUrl;

    let out: Buffer = Buffer.from(new Uint8Array(await (await fetch(imageUrl)).arrayBuffer()));
    // The reference tells us where ITS logo sits; the retheme keeps the logo in that same spot, so stamping at
    // the same box lands right on top of the garbled one.
    const layout = await detectLayout(referenceUrl).catch(() => null);
    const logoBox = layout?.logo || { xPct: 4, yPct: 4, wPct: 28 };
    // ONE consistent lockup for every slider in the carousel, kept legible by the halo - not a per-slide colour
    // pick that could leave the set mismatched.
    const logo = pickCarouselLogo(logos);
    if (!logo) return imageUrl;

    const logoBuf = Buffer.from(new Uint8Array(await (await fetch(logo.url)).arrayBuffer()));
    out = (await compositeLogo(out, logoBuf, logoBox, { halo: true })) as Buffer;
    return await putBytes(out, `studio/${clientId}/logo-locked`, "png", "image/png");
  } catch (e) {
    console.error("[stampRealLogo] logo hard lock failed, returning un-stamped image:", e);
    return imageUrl;
  }
}

// THE PHONE SCREEN, composited - never AI-invented (Gary: "use a real screenshot"). The model is told to render
// the handset with a SOLID BRIGHT GREEN screen (a chroma key); here we find that green, key it out to a black
// bezel, and drop the client's real screenshot onto it - aligned to the phone's tilt, so a hand-held angle
// looks natural. Green is used because it is trivial to detect and distinct from skin, the scene and the brand
// yellow/navy. If no green screen is found (the model did not comply) we return the image unchanged; if a green
// screen IS found but no screenshot was chosen, we still key it to black so raw chroma never ships.
export async function stampPhoneScreen(clientId: string, imageUrl: string, screenUrl: string | null): Promise<string> {
  try {
    const buf = Buffer.from(new Uint8Array(await (await fetch(imageUrl)).arrayBuffer()));
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels;

    // 1. Find the bright chroma-green pixels.
    let n = 0, sx = 0, sy = 0; const gi: number[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > 140 && g - r > 70 && g - b > 70) { n++; sx += x; sy += y; gi.push(y * W + x); }
    }
    if (n < W * H * 0.0015) return imageUrl;   // no convincing green screen - leave the render as it is
    const cx = sx / n, cy = sy / n;

    // 2. The phone's tilt, from the green region's principal (long) axis.
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of gi) { const x = p % W, y = (p / W) | 0, dx = x - cx, dy = y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);        // long-axis angle from +x (~90deg = upright)
    const cos = Math.cos(theta), sin = Math.sin(theta);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of gi) { const x = p % W, y = (p / W) | 0, dx = x - cx, dy = y - cy; const u = dx * cos + dy * sin, v = -dx * sin + dy * cos; if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
    const longLen = uMax - uMin, shortLen = vMax - vMin;

    // 3. Key the green out to a black bezel, so no chroma survives even at the screen's edge.
    for (const p of gi) { const i = p * C; data[i] = 10; data[i + 1] = 10; data[i + 2] = 12; }
    const base = await sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
    if (!screenUrl) {   // green found but nothing chosen: a clean black (off) screen beats raw green
      return await putBytes(base, `studio/${clientId}/phone-screen`, "png", "image/png");
    }

    // 4. Drop the real screenshot on, sized to the screen and rotated to the phone's tilt.
    const screenSrc = Buffer.from(new Uint8Array(await (await fetch(screenUrl)).arrayBuffer()));
    // The principal axis has a 180deg AMBIGUITY (an axis has no up/down), which flipped the screenshot upside
    // down. Phones in these ads are held roughly upright, so normalise the rotation into (-90, 90] - the
    // orientation closest to upright - and it can never come out inverted.
    let rotDeg = (theta * 180) / Math.PI - 90;
    while (rotDeg > 90) rotDeg -= 180;
    while (rotDeg <= -90) rotDeg += 180;
    // The green region can be a hair wider than the glass (spill past the bezel), so size to it exactly, no
    // oversize, and inset slightly so the screenshot sits INSIDE the bezel rather than pasted over its edge.
    const sw = Math.max(4, Math.round(shortLen * 0.97)), sh = Math.max(4, Math.round(longLen * 0.97));
    // A soft diagonal gloss baked onto the screenshot so it reads as glass under the scene's light, not a flat
    // paste. It rotates with the screen, so it always falls the right way.
    const gloss = `<svg width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg"><defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0.85" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="0.20"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.04"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="0.10"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    const screen = await sharp(screenSrc).resize(sw, sh, { fit: "fill" })
      .composite([{ input: Buffer.from(gloss), blend: "over" }])
      .rotate(rotDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const sm = await sharp(screen).metadata();
    const out = await sharp(base).composite([{ input: screen, left: Math.round(cx - (sm.width || sw) / 2), top: Math.round(cy - (sm.height || sh) / 2) }]).png().toBuffer();
    return await putBytes(out, `studio/${clientId}/phone-screen`, "png", "image/png");
  } catch (e) {
    console.error("[stampPhoneScreen] composite failed, returning image unchanged:", e);
    return imageUrl;
  }
}
