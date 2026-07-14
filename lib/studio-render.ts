import sharp from "sharp";
import type { Browser } from "playwright-core";

// Chromium and Playwright are loaded LAZILY, inside browser(). Imported at module scope, a failure to load
// them kills the whole route at cold start and Vercel serves an HTML error page - which surfaces to the user
// as "Unexpected token '<'" and tells nobody anything. Deferred, the same failure is a catchable exception
// that we can return as readable JSON.

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

// @sparticuz/chromium's default args are tuned for PUPPETEER. Playwright drives the browser over a pipe to a
// separate process, so --single-process (and its companions) are at best pointless here and are widely
// reported to hang Playwright on Lambda. PRECAUTIONARY, not a diagnosed fix: I tested launching with these
// args present and Playwright started fine, so they were NOT the cause of the production crash - that was a
// missing playwright-core/browsers.json (see next.config.ts). Dropping them costs nothing and removes a
// known-hostile variable from a lane that is expensive to debug in the cloud.
const PUPPETEER_ONLY = /^--(single-process|no-zygote|in-process-gpu)$/;

async function browser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  const { chromium: playwright } = await import("playwright-core");
  const local = process.env.CHROME_PATH; // set locally to use a system Chrome

  let args: string[] = [];
  let executablePath = local || "";
  if (!local) {
    const chromium = (await import("@sparticuz/chromium")).default;
    args = chromium.args.filter((a) => !PUPPETEER_ONLY.test(a));
    executablePath = await chromium.executablePath();
  }

  _browser = await playwright.launch({ args, executablePath, headless: true });
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
// I HAD THIS BACKWARDS AND GARY CAUGHT IT. My first pass said "on social, what we ship IS what the user
// downloads, so encode small". That is FALSE. Meta, Instagram and TikTok RE-ENCODE every upload to their own
// formats and sizes - what the viewer sees is THEIR compression of our file, not our file. Webflow does the
// same, converting to AVIF (every image on the live MoMo funnel is already .avif).
//
// So pre-compressing before upload is actively HARMFUL: our compression, then theirs, is double compression -
// visible artefacts, for no benefit, because they were going to re-encode regardless. Handing a platform a
// degraded input can only make its output worse.
//
// THE RULE: give the platform the best source it will accept and let IT compress. That is nearly everywhere -
// Webflow, Meta, Instagram, TikTok.
//
// The R0.08/MB data cost (ICASA 2025, MTN prepaid) is still real - a heavy page genuinely costs a prepaid
// customer their own money. But that cost lands on what the PLATFORM serves, which is downstream of us and
// optimised by them. The only place raw weight is ours to control is where WE serve the file with no
// intermediary: a direct download, an email attachment, an asset we host.
//
// MEASURED on the MoMo slider (1080x1080, photo + baked text), for the record:
//   source PNG                1030KB
//   PNG "max effort" lossless 1628KB   BIGGER. Chromium's encoder already beats sharp's, so compressing
//                                      harder actively backfires. A genuine trap.
//   WebP LOSSLESS              735KB   byte-for-byte identical pixels
//   WebP q95                   188KB   visually indistinguishable
//   AVIF q80                   108KB   visually indistinguishable

export type Delivery = "master" | "hosted";

export async function encodeForDelivery(png: Buffer, mode: Delivery = "master"): Promise<{ buf: Buffer; ext: string; mime: string; bytes: number }> {
  if (mode === "hosted") {
    // ONLY for files WE serve directly, with no platform re-encode in front of them. Visually indistinguishable
    // from lossless and ~4x smaller, so it does not cost a prepaid customer money they do not have.
    const buf = await sharp(png).webp({ quality: 95, effort: 6 }).toBuffer();
    return { buf, ext: "webp", mime: "image/webp", bytes: buf.length };
  }
  // DEFAULT: the master. Lossless, byte-for-byte identical to what we rendered. This is what goes to Webflow,
  // Meta, Instagram and TikTok - all of which re-encode - and what is archived as the design contract.
  const buf = await sharp(png).png({ compressionLevel: 9 }).toBuffer();
  return { buf: buf.length < png.length ? buf : png, ext: "png", mime: "image/png", bytes: Math.min(buf.length, png.length) };
}
