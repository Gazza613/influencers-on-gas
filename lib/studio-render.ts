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
