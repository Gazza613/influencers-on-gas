// CI TOKENS FOR THE PROPOSAL (design handoff: docs/proposal-template/). The 24-page proposal recolours entirely to
// the client's brand: the whole document is driven by ONE token set (5 gradients + an accent family + neutrals).
// deriveCiTokens() builds that set from the client's primary accent + a dark ground colour. With no client colour
// it returns the EXACT Chilla master palette, so a default render matches the approved template pixel-for-pixel.
//
// Gary's call (locked): auto-derive from the client's website colour (lib/brand-colours.ts), with a manual accent
// override before the final PDF cut. So this derivation is a strong default, never the last word.

export type CiTokens = {
  // Neutrals (kept close to constant; the design keeps structural greys/whites, only the hue of the shadow shifts).
  pageBg: string;        // light page background
  ink: string;           // headings on light
  body: string;          // body text on light
  muted: string;         // captions / labels on light
  // The five structural gradients that carry the CI.
  darkPage: string;      // dark full-page ground (cover, dark content pages)
  darkCard: string;      // dark card / divider / table header ground
  accentGrad: string;    // accent gradient: chips, gradient text on light
  coverTextGrad: string; // lighter gradient-text variant (cover + dividers)
  iconDisc: string;      // radial gradient for the icon discs
  // The accent solid family.
  accent: string;        // eyebrows, headlines, links, big stats
  accentDeep: string;    // deep accent (support role chips, deep detail)
  accentOnDark: string;  // eyebrows / accents on dark pages
  tint: string;          // soft note / footnote card fill on light
  // Derived incidentals.
  glow: string;          // cover/divider radial glow blob (rgba)
  arrow: string;         // journey / flow arrow strokes
  dotMid: string;        // channel-matrix "support" dot
  dotLight: string;      // channel-matrix "test" dot
  shadow: string;        // card shadow rgba (hue-tinted)
  ghostLight: string;    // pod ghost roman numeral on light pages (rgba)
  ghostDark: string;     // pod ghost roman numeral on dark pages (rgba)
  success: string;       // system green (WhatsApp / positive sparkline) - constant, never recoloured
};

// The exact Chilla master palette. This is the DEFAULT return (no client colour), so the template renders identical
// to the approved reference, and it doubles as the reference for what the derivation aims to reproduce.
export const CHILLA_CI: CiTokens = {
  pageBg: "#FAF8FC", ink: "#1A1030", body: "#372F45", muted: "#544A63",
  darkPage: "linear-gradient(135deg,#1C1140 0%,#2B1A55 55%,#4A2A7A 100%)",
  darkCard: "linear-gradient(160deg,#241650 0%,#33206B 45%,#4A2A7A 100%)",
  accentGrad: "linear-gradient(135deg,#B05BD6 0%,#6E2FA0 100%)",
  coverTextGrad: "linear-gradient(135deg,#C77DE8 0%,#8A3BBE 100%)",
  iconDisc: "radial-gradient(120% 120% at 30% 25%,#C77DE8 0%,#9B4FC9 38%,#5E2189 100%)",
  accent: "#7B2FA8", accentDeep: "#5E2189", accentOnDark: "#C77DE8", tint: "#F3EDF9",
  glow: "rgba(199,125,232,0.28)", arrow: "#B8A8D4", dotMid: "#C9B8DE", dotLight: "#EAE4F2",
  shadow: "rgba(46,26,74,0.08)", ghostLight: "rgba(94,33,137,0.06)", ghostDark: "rgba(255,255,255,0.05)",
  success: "#7CE38B",
};

// ── colour maths (small, dependency-free) ─────────────────────────────────────────────────────────────────────
type RGB = { r: number; g: number; b: number };
function hexToRgb(hex: string): RGB {
  let h = hex.replace(/^#/, "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function rgbToHex({ r, g, b }: RGB): string {
  return "#" + [r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const BLACK: RGB = { r: 0, g: 0, b: 0 }, WHITE: RGB = { r: 255, g: 255, b: 255 };
// mix a toward b by t (0..1).
function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}
const lighten = (c: RGB, t: number) => mix(c, WHITE, t);
const darken = (c: RGB, t: number) => mix(c, BLACK, t);
const H = (c: RGB) => rgbToHex(c);
const rgba = (c: RGB, a: number) => `rgba(${clamp(c.r)},${clamp(c.g)},${clamp(c.b)},${a})`;
// Is a colour valid 3/6-digit hex?
const isHex = (s?: string | null): s is string => !!s && /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(s.trim());

/**
 * Build the full CI token set from a client's primary accent + a dark ground colour.
 * - No accent given: returns the exact Chilla master palette (pixel-identical default).
 * - accent given: derives the whole gradient/accent family from it by mixing toward white/black, so a single brand
 *   colour recolours the entire document coherently. `dark` is the deep ground (a client's navy/secondary); it
 *   defaults to a very dark shade of the accent when not supplied.
 */
export function deriveCiTokens(accent?: string | null, dark?: string | null): CiTokens {
  if (!isHex(accent)) return CHILLA_CI;
  const A = hexToRgb(accent);
  // THE DARK GROUND IS ITS OWN FAMILY, not a tint of the accent. The reference pairs a navy ground with a crimson
  // accent (Boston) - the crimson lives ONLY in text, discs, chips and the corner glow, never in the ground. So the
  // dark page/card gradients derive from D alone. D is the client's dark colour if given, else a deep near-neutral
  // carrying just a whisper of the accent hue (so a mono-brand still reads on-brand without going garish).
  const D = isHex(dark) ? hexToRgb(dark) : mix({ r: 14, g: 16, b: 30 }, A, 0.16);
  const dp2 = mix(D, WHITE, 0.09), dp3 = mix(D, WHITE, 0.20);   // dark-page stops, staying in D's family
  const dc1 = mix(D, WHITE, 0.05), dc2 = mix(D, WHITE, 0.12), dc3 = mix(D, WHITE, 0.22);   // dark-card stops

  const accentDeep = darken(A, 0.28);
  const accentBright = lighten(A, 0.42);        // icon-disc start, on-dark accent
  const accentMid = lighten(A, 0.12);           // icon-disc mid
  const accentSoft = lighten(A, 0.22);          // accent gradient start (chips)
  const coverStart = lighten(A, 0.5);           // cover gradient-text start
  const coverEnd = mix(A, accentDeep, 0.4);     // cover gradient-text end

  return {
    pageBg: "#FAF8FC", ink: "#1A1030", body: "#372F45", muted: "#544A63",
    darkPage: `linear-gradient(135deg,${H(D)} 0%,${H(dp2)} 55%,${H(dp3)} 100%)`,
    darkCard: `linear-gradient(160deg,${H(dc1)} 0%,${H(dc2)} 45%,${H(dc3)} 100%)`,
    accentGrad: `linear-gradient(135deg,${H(accentSoft)} 0%,${H(accentDeep)} 100%)`,
    coverTextGrad: `linear-gradient(135deg,${H(coverStart)} 0%,${H(coverEnd)} 100%)`,
    iconDisc: `radial-gradient(120% 120% at 30% 25%,${H(accentBright)} 0%,${H(accentMid)} 38%,${H(accentDeep)} 100%)`,
    accent: H(A), accentDeep: H(accentDeep), accentOnDark: H(accentBright), tint: H(lighten(A, 0.9)),
    glow: rgba(accentBright, 0.28), arrow: H(lighten(A, 0.62)), dotMid: H(lighten(A, 0.55)), dotLight: H(lighten(A, 0.82)),
    shadow: rgba(darken(A, 0.4), 0.1), ghostLight: rgba(accentDeep, 0.06), ghostDark: "rgba(255,255,255,0.05)",
    success: "#7CE38B",
  };
}
