import sharp from "sharp";
import chromium from "@sparticuz/chromium";
import { chromium as playwright, type Browser } from "playwright-core";

// THE STATIC RENDERER. HTML/CSS in, a pixel-exact PNG out.
//
// WHY PLAYWRIGHT AND NOT A SAAS TEMPLATE TOOL: the design lock IS the product. A locked React/CSS template
// versioned in git can be diffed, reviewed and proven pixel-equivalent to the client's own reference. A
// per-render SaaS API cannot, and it charges per asset for the privilege.
//
// WHY @sparticuz/chromium: full Chromium (~280MB) exceeds Vercel's 250MB function limit. This is the slimmed
// build made for exactly this. It MUST stay isolated from the ffmpeg lane (77MB, traced only into
// /api/inngest) or the two together blow the budget - see next.config.ts.
//
// FONTS ARE THE WHOLE GAME. Risk #1 on the spec's own register: if the render container does not have MTN
// Brighter Sans, server-rendered text cannot match the design and no CSS fixes it. We hold all seven weights
// as woff2 in blob storage, so the page loads them by @font-face and we WAIT for them to be ready before the
// screenshot - otherwise Chromium silently falls back to a system sans and the render is quietly wrong.

let _browser: Browser | null = null;

async function browser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  const local = process.env.CHROME_PATH; // set locally to use a system Chrome
  _browser = await playwright.launch({
    args: local ? [] : chromium.args,
    executablePath: local || (await chromium.executablePath()),
    headless: true,
  });
  return _browser;
}

export type RenderOpts = {
  html: string;
  width: number;
  height: number;
  /** deviceScaleFactor 2 then downscale keeps text crisp on high-density screens (spec section 4.4). */
  scale?: number;
  /** Hard budget. A 5MB page costs a prepaid customer ~R0.40 of their OWN airtime to load (ICASA: R0.08/MB). */
  maxBytes?: number;
};

export async function renderPng(o: RenderOpts): Promise<{ png: Buffer; bytes: number; overBudget: boolean }> {
  const b = await browser();
  const page = await b.newPage({
    viewport: { width: o.width, height: o.height },
    deviceScaleFactor: o.scale ?? 2,
  });
  try {
    await page.setContent(o.html, { waitUntil: "networkidle" });

    // WAIT FOR THE REAL FONTS. Without this Chromium screenshots whatever is ready - which on a cold container
    // is the fallback sans, and the render is wrong in a way that looks almost right. That is the worst kind.
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    await page.waitForTimeout(120); // let the last paint settle

    const png = (await page.screenshot({ type: "png" })) as Buffer;
    const maxBytes = o.maxBytes ?? 1_000_000;
    return { png, bytes: png.length, overBudget: png.length > maxBytes };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeRenderer(): Promise<void> {
  await _browser?.close().catch(() => {});
  _browser = null;
}

// The @font-face block for a brand kit's licensed fonts. Weights are read off the FILE NAMES the client
// uploaded (MTNBrighterSans-ExtraBoldItalic -> 800 italic), so a new weight works the moment it is uploaded.
export function fontFaceCss(fonts: { family: string; url: string }[]): string {
  const WEIGHT: Record<string, number> = {
    thin: 100, extralight: 200, light: 300, regular: 400, normal: 400,
    medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
  };
  return fonts.map((f) => {
    const raw = String(f.family || "");
    const [family, suffix = "Regular"] = raw.split("-");
    const italic = /italic/i.test(suffix);
    const weightKey = suffix.replace(/italic/i, "").toLowerCase() || "regular";
    const weight = WEIGHT[weightKey] ?? 400;
    return `@font-face{font-family:'${family}';src:url('${f.url}') format('woff2');font-weight:${weight};font-style:${italic ? "italic" : "normal"};font-display:block;}`;
  }).join("\n");
}

// ── DELIVERY ENCODING ────────────────────────────────────────────────────────────────────────────────────
//
// The renderer emits PNG. What we DELIVER depends on where it is going, and the difference is real money.
//
// MEASURED on the MoMo slider (1080x1080, photo + text):
//   source PNG                1030KB   costs the user R0.082 of their own airtime
//   PNG "max effort" lossless 1628KB   BIGGER. Chromium's encoder already beats sharp's - compressing harder
//                                      actively backfires. A genuine trap.
//   WebP LOSSLESS              735KB   byte-for-byte identical pixels, and under the 1MB budget
//   WebP q95                   188KB   visually indistinguishable, 4x smaller
//   AVIF q80                   108KB   visually indistinguishable
//
// At ICASA's R0.08/MB (MTN prepaid, 2025), lossless costs the customer R0.057 per load and q95 costs R0.015.
// That gap is real money from someone whose entire monthly telecoms spend is R55-R77. Visually identical, four
// times cheaper for them: q95 is the right default, and "lossless" here is vanity, not quality.
//
// FUNNEL vs SOCIAL matters:
//   FUNNEL - Webflow re-encodes everything to AVIF on upload (every image on the live funnel is .avif). So we
//            hand it a high-quality master and let Webflow optimise. Shipping a pre-crushed file just means it
//            gets crushed twice.
//   SOCIAL - we upload directly, so what we ship IS what the user downloads. Encode for delivery here.

export type Delivery = "master" | "web" | "smallest";

export async function encodeForDelivery(png: Buffer, mode: Delivery = "web"): Promise<{ buf: Buffer; ext: string; mime: string; bytes: number }> {
  if (mode === "master") {
    // Byte-for-byte identical pixels. For Webflow, which will re-encode anyway, and for the archive/design contract.
    const buf = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
    return { buf, ext: "webp", mime: "image/webp", bytes: buf.length };
  }
  if (mode === "smallest") {
    const buf = await sharp(png).avif({ quality: 80, effort: 6 }).toBuffer();
    return { buf, ext: "avif", mime: "image/avif", bytes: buf.length };
  }
  // Default. Visually indistinguishable from lossless, ~4x smaller, and it does not cost the customer money
  // they do not have.
  const buf = await sharp(png).webp({ quality: 95, effort: 6 }).toBuffer();
  return { buf, ext: "webp", mime: "image/webp", bytes: buf.length };
}
