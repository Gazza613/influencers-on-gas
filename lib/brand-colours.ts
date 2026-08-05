import { isSafePublicUrl } from "./safe-url";

// EXTRACT A CLIENT'S BRAND COLOUR from their website, so the proposal wears their look (Gary: keep the client's
// colours, co-brand as Agency of NOW). Best-effort and SSRF-safe: we read the homepage + a couple of its
// stylesheets, tally the colours actually used, and pick the most prominent SATURATED one as the accent (greys,
// near-white and near-black are chrome, not brand). A meta theme-color, when present, is a strong signal and wins.
// Always returns a usable palette; the team can override the accent before rendering (Human Command).

type Palette = { primary: string; dark: string };
const FALLBACK: Palette = { primary: "#3A5BD9", dark: "#0E1016" };   // a tasteful neutral, never GAS orange (that is our mark)

function hexNorm(h: string): string | null {
  let s = h.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s.slice(1).split("").map((c) => c + c).join("");
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function toHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}

async function fetchText(url: string, ms = 8000): Promise<string> {
  if (!isSafePublicUrl(url)) return "";
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 GASBrand/1.0" } });
    if (!r.ok) return "";
    const ct = r.headers.get("content-type") || "";
    if (!/text|css|html/i.test(ct)) return "";
    return (await r.text()).slice(0, 500_000);
  } catch { return ""; } finally { clearTimeout(t); }
}

function collectColours(text: string, tally: Map<string, number>, weight = 1) {
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) { const h = hexNorm(m[0]); if (h) tally.set(h, (tally.get(h) || 0) + weight); }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) { const h = rgbToHex(+m[1], +m[2], +m[3]); tally.set(h, (tally.get(h) || 0) + weight); }
}

export async function extractBrandColour(website: string | null | undefined): Promise<Palette> {
  const base = String(website || "").trim();
  if (!base || !isSafePublicUrl(base)) return FALLBACK;
  const html = await fetchText(base);
  if (!html) return FALLBACK;

  const tally = new Map<string, number>();
  collectColours(html, tally, 1);

  // A meta theme-color is a deliberate brand signal - weight it heavily.
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i)?.[1];
  if (theme) { const h = hexNorm(theme); if (h) tally.set(h, (tally.get(h) || 0) + 25); }

  // Read up to 2 same-origin stylesheets (that is where brand tokens usually live).
  const origin = base.match(/^https?:\/\/[^/]+/)?.[0] || base;
  const sheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((m) => m[1])
    .map((h) => (h.startsWith("http") ? h : h.startsWith("//") ? "https:" + h : origin + (h.startsWith("/") ? "" : "/") + h))
    .filter((h) => h.startsWith(origin)).slice(0, 2);
  for (const s of sheets) collectColours(await fetchText(s), tally, 1);

  // Rank saturated, mid-lightness colours (the brand), ignoring chrome (greys, near-white, near-black).
  const ranked = [...tally.entries()]
    .map(([hex, n]) => ({ hex, n, ...toHsl(hex) }))
    .filter((c) => c.s >= 0.25 && c.l >= 0.15 && c.l <= 0.72)
    .sort((a, b) => b.n - a.n);
  const primary = ranked[0]?.hex || FALLBACK.primary;

  // Cover panel: the darkest frequent colour, else a near-black tinted toward the primary.
  const darks = [...tally.entries()].map(([hex]) => ({ hex, ...toHsl(hex) })).filter((c) => c.l <= 0.16).sort((a, b) => a.l - b.l);
  const dark = darks[0]?.hex || FALLBACK.dark;
  return { primary, dark };
}
