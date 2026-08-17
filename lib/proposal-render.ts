// THE 24-PAGE PROPOSAL RENDERER (design handoff: docs/proposal-template/). Each page is one A4 <section>, ported
// verbatim from the approved master template with two things parameterised: the hardcoded hexes become CI tokens
// (lib/proposal-ci.ts) and the Chilla copy becomes content slots (ProposalDoc). Reusing the exact layout markup is
// what guarantees pixel fidelity; only colour + words vary per client.
//
// STAGE 1 (this file, growing): the document shell, shared primitives and the first pages, proven against a Chilla
// fixture. STAGE 2 wires the model output (lib/proposal.ts) into ProposalDoc. Fixed boilerplate (the journey, the
// GAS lockup, agency terms, sign-off block) is hardcoded here, not model-generated (Gary's locked call).

import type { CiTokens } from "./proposal-ci";
import { deriveCiTokens } from "./proposal-ci";

// A4 at 96dpi = 794x1123 CSS px (doc-page.js geometry). One <section class="page"> per sheet, overflow hidden.
const A4_W = 794, A4_H = 1123;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── shared content types (grows as pages are added) ───────────────────────────────────────────────────────────
export type Headline = { lead: string; gradient: string };   // only the gradient phrase gets background-clip:text
export type IconCard = { icon: string; title: string; body: string };          // svg inner markup + copy
export type StatCard = { icon: string; stat: string; body: string; source: string };

export type ProposalDoc = {
  brand_short: string;                 // footer right ("Chilla")
  client_name: string;
  client_logo?: { src: string; w: number; h: number } | null;   // top-right on cover; may be null (name fallback)
  date_label: string;                  // "6 August 2026"
  validity_label: string;              // "Valid 14 days"
  cover: { headline: Headline; summary: string; audience_chip: string };
  exec: { headline: Headline; intro: string; cards: IconCard[] };   // 4 cards
  opportunity: { headline: Headline; paras: string[]; stat_cards: StatCard[]; success_body: string };  // 6 stat cards
  strategy: {
    headline: Headline; wedge_body: string; argument: string;
    proof_cards: { title: string; body: string }[];              // 6
    flow: { believe: string; buy: string; outcome: string };      // the 3 flow subs (labels are fixed)
  };
  market: {
    headline: Headline; intro: string;
    split: { left_label: string; left_pct: string; left_width: string; right_label: string; right_pct: string; right_width: string; caption: string };
    quotes: { body: string; source: string }[];                  // 4
    actions: { title: string; body: string }[];                  // 6
  };
  ecosystem_intro: string;   // 1 client-specific line on the ecosystem page (pods/layers are fixed)
  divider_line: string;      // 1 client-specific line on the VIII divider ("...the {campaign} specifically")
  pods12: {
    headline: Headline; researcher_para: string; researcher_chip: string; strategist_para: string; strategist_chip: string;
    map: {
      title: string; y_top: string; y_bottom: string; x_left: string; x_right: string;
      competitors: { name: string; note: string; left: string; top: string }[];   // muted dots
      client: { name: string; note: string; left: string; top: string };            // glowing dot
      set: string[];                                                                // the full named competitor set, for the summary
    };
  };
  audience: {
    headline: Headline; intro: string;
    personas: { icon: string; name: string; geo: string; quote: string }[];         // 4
    discipline_note: string; blueprint_note: string;
    geo_label: string; geo_chips: { label: string; accent: boolean }[];
    budget: { label: string; body: string; flex: number }[];                        // 3 (primary/tighter/gated)
  };
  targeting: {
    headline: Headline;
    rows: { name: string; platforms: string; segments: { label: string; text: string }[] }[];   // 4
    matrix: { channels: string[]; rows: { persona: string; cells: ("lead" | "support" | "test")[] }[] };
  };
  creative: {
    intro: string; for_client: string;
    asset_formats: { ratio: string; icon: string; title: string; caption: string }[];            // 4
  };
  channels5: {
    intro: string;
    rows: { icon: string; name: string; role: string; kind: "lead" | "support" | "test"; what: string; why: string; reach?: string }[];  // up to 5
  };
  psi: {
    intro: string; for_client: string;
    tiles: { level: string; caption: string; kind: "high" | "medium" | "low" }[];   // 3
    chat: { assistant: string; bubbles: { role: "in" | "out"; text: string }[]; closing: string };
    side_cards: { title: string; body: string }[];                                  // 3
    benefit_client: string; benefit_forward: string;
  };
  pods78: {
    headline: Headline;
    dashboard_para: string; dashboard_chip: string; media_para: string; media_chip: string;
    tiles: { label: string; spark: "line-down" | "bars" | "line-up" | "gauge"; caption: string }[];   // 4
  };
  closedloop: { intro: string; compounding: string; step5_sub?: string };
  rollout: {
    headline: Headline; intro: string;
    rail: { badge: string; label: string }[];
    weeks: { icon: string; title: string; pods: string; bullets: string[]; gate: string }[];
  };
  funnel: {
    disclaimer: string;
    bars: string[];                                              // stage labels (widths fixed by index)
    kpis: { metric: string; why: string; baseline: string }[];
  };
  governance: { intro: string; commitments: { title: string; body: string }[] };   // 8
  deal_divider: string;                                          // 1 line on the "No Fine Print" divider
  investment: {
    intro: string; tier_name: string; tagline: string; poc_chip: string; price: string; price_unit: string; body: string;
    inclusions: { title: string; pod_tag: string }[];           // up to 8
    footnotes: { label: string; body: string }[];               // 3
    honest_para: string;
  };
  terms: { validity: string; engagement: string; media: string; ownership: string; poc_proves: string };
  agreement: { intro: string; clauses: { title: string; body: string }[] };   // 6
  signoff: { intro: string; client: { name: string; signatory_label: string; contacts: string[]; tagline: string } };
};

// ── primitives ────────────────────────────────────────────────────────────────────────────────────────────────

// The GAS lockup: gradient disc "GAS" + two-line wordmark. Built, never an image. onDark switches text colour.
function gasLockup(ci: CiTokens, onDark: boolean): string {
  const sub = onDark ? ci.accentOnDark : ci.accent;
  const word = onDark ? "#FFFFFF" : ci.ink;
  return `<div style="display:flex;align-items:center;gap:14px;">`
    + `<div style="width:52px;height:52px;min-width:52px;min-height:52px;flex-shrink:0;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#FFFFFF;box-shadow:0 2px 10px rgba(0,0,0,0.28);">GAS</div>`
    + `<div><div style="font-weight:700;font-size:14px;letter-spacing:0.06em;color:${word};">GAS MARKETING AUTOMATION</div>`
    + `<div style="font-size:10px;letter-spacing:0.28em;color:${sub};font-weight:600;">THE AGENCY OF NOW</div></div></div>`;
}

// An icon disc (radial gradient) holding a 2px-stroke white lucide SVG. `inner` is the svg's inner markup.
function disc(ci: CiTokens, size: number, inner: string): string {
  const ic = Math.round(size * 0.5);
  // A clean, solid accent circle with the icon centred crisply. The box is HARD-LOCKED to a square on every axis
  // (width = min = max = height, aspect-ratio:1, flex-shrink:0) so the print engine can never render it a hair oval
  // (Gary, twice). No overflow:hidden (it clipped the radial fill's anti-aliased edge unevenly, which read as
  // "not a precise circle"); line-height:0 + svg display:block keep the icon centred without it.
  const box = `width:${size}px;height:${size}px;min-width:${size}px;min-height:${size}px;max-width:${size}px;max-height:${size}px;aspect-ratio:1;box-sizing:border-box;flex-shrink:0`;
  return `<div style="${box};border-radius:50%;background:${ci.iconDisc};box-shadow:0 1px 3px rgba(0,0,0,0.14);display:flex;align-items:center;justify-content:center;line-height:0;">`
    + `<svg width="${ic}" height="${ic}" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${inner}</svg></div>`;
}

const eyebrow = (ci: CiTokens, t: string) =>
  `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accent};">${esc(t)}</div>`;

// Section headline: dark lead + one phrase in SOLID accent. size defaults to the 30px content-page headline. We do
// NOT use background-clip:text: Chromium paints a stray vertical gradient sliver at the clipped-text edge in the PDF
// (Gary's recurring "weird line"), and box-decoration-break did not cure it, so a solid accent colour is the fix.
function headline(ci: CiTokens, h: Headline, size = 30): string {
  return `<div style="font-size:${size}px;font-weight:800;text-transform:uppercase;line-height:1.02;margin-top:10px;">${esc(h.lead)} `
    + `<span style="color:${ci.accent};">${esc(h.gradient)}</span></div>`;
}

// The light-page footer rule: constant left, "Client · NN" right (NN zero-padded, regenerated on add/remove).
const footerLight = (ci: CiTokens, brandShort: string, n: number) =>
  `<div style="margin-top:auto;padding-top:14px;border-top:1px solid rgba(26,16,48,0.12);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${ci.muted};">`
  + `<span>GAS Marketing Automation · The Agency of NOW</span><span>${esc(brandShort)} · ${String(n).padStart(2, "0")}</span></div>`;

// The dark-page footer rule (white on the CI dark ground). n omitted => no page number (dividers).
const footerDark = (brandShort: string, n: number | null, mt = "14px") =>
  `<div style="margin-top:${mt};padding-top:14px;border-top:1px solid rgba(255,255,255,0.22);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.55);position:relative;">`
  + `<span>GAS Marketing Automation · The Agency of NOW</span><span>${esc(brandShort)}${n ? ` · ${String(n).padStart(2, "0")}` : ""}</span></div>`;

const pageLight = (padding: string, extra = "") =>
  `background:#FAF8FC;color:#1A1030;font-family:Poppins,sans-serif;display:flex;flex-direction:column;padding:${padding};${extra}`;
const pageDark = (ci: CiTokens, padding: string, extra = "") =>
  `background:${ci.darkPage};color:#FFFFFF;font-family:Poppins,sans-serif;display:flex;flex-direction:column;padding:${padding};${extra}`;

// A white content card with the standard radius + shadow.
const card = (ci: CiTokens, pad: string, inner: string) =>
  `<div style="background:#FFFFFF;border-radius:16px;padding:${pad};box-shadow:0 6px 18px ${ci.shadow};">${inner}</div>`;

const section = (style: string, inner: string) => `<section class="page" style="${style}">${inner}</section>`;

// Fixed lucide icon paths reused across pages.
const CHECK = `<path d="M20 6 9 17l-5-5"></path>`;
const MIC = `<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line>`;
const CIRCLE_DOLLAR = `<circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 18V6"></path>`;
const BOOK = `<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path>`;

// A small tracked accent eyebrow used mid-page ("Why this wedge wins", "What we do about it").
const miniEyebrow = (ci: CiTokens, t: string, mt = "14px") =>
  `<div style="font-size:9px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-top:${mt};">${esc(t)}</div>`;

// A dark ground box (the "single-minded wedge", "definition of success" style): CI dark card + accent eyebrow + body.
const darkBox = (ci: CiTokens, eb: string, body: string, mt = "14px") =>
  `<div style="margin-top:${mt};background:${ci.darkCard};border-radius:16px;padding:18px 24px;color:#FFFFFF;">`
  + `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(eb)}</div>`
  + `<div style="font-size:12px;font-weight:400;line-height:1.65;margin-top:6px;color:rgba(255,255,255,0.9);">${esc(body)}</div></div>`;

// A small white "proof / action" card: a 20px check-disc, a bold title and a body. Reused on Strategy + Market.
const proofCard = (ci: CiTokens, title: string, body: string) =>
  `<div style="background:#FFFFFF;border-radius:14px;padding:13px 17px;box-shadow:0 6px 18px ${ci.shadow};">`
  + `<div style="display:flex;align-items:flex-start;gap:8px;">${disc(ci, 20, CHECK)}<div style="flex:1;min-width:0;font-size:11px;font-weight:700;line-height:1.35;">${esc(title)}</div></div>`
  + `<div style="font-size:10px;line-height:1.55;color:${ci.muted};margin-top:3px;">${esc(body)}</div></div>`;

// The small forward arrow (flow / journey strips), stroked in the CI's lavender-grey.
const flowArrow = (ci: CiTokens, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${ci.arrow}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;

// A white "strip" card: an accent eyebrow above a single flex row of nodes (the journey + argument-flow strips).
const stripCard = (ci: CiTokens, eb: string, row: string, mt = "14px") =>
  `<div style="margin-top:${mt};background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
  + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:9px;">${esc(eb)}</div>`
  + `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:nowrap;">${row}</div></div>`;

// A dark sourced quote card (Market page): body + a book-icon source line, on the CI dark card ground.
const quoteCard = (ci: CiTokens, body: string, source: string) =>
  `<div style="background:${ci.darkCard};border-radius:13px;padding:12px 16px;color:#FFFFFF;">`
  + `<div style="font-size:10px;line-height:1.55;color:rgba(255,255,255,0.85);">${esc(body)}</div>`
  + `<div style="display:flex;align-items:center;gap:6px;font-size:8px;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentOnDark};margin-top:6px;">`
  + `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${BOOK}</svg>${esc(source)}</div></div>`;

// ── pages ─────────────────────────────────────────────────────────────────────────────────────────────────────

// 01 COVER (dark). GAS lockup + client logo, eyebrow, wedge headline (46px, gradient phrase), summary, two chips.
function coverPage(d: ProposalDoc, ci: CiTokens): string {
  // The client mark on the cover is ALWAYS a clean white wordmark, never their raster logo: a boxed logo on the dark
  // ground reads poorly (Gary). The real logo is used only in the sign-off circle (page 24), on a white disc.
  const logo = `<div style="margin-left:auto;font-weight:800;font-size:19px;letter-spacing:0.08em;text-transform:uppercase;color:#FFFFFF;">${esc(d.client_name)}</div>`;
  return `<section class="page" style="${pageDark(ci, "56px 64px 44px", "position:relative;overflow:hidden;")}">`
    + `<div style="position:absolute;right:-180px;top:-180px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,rgba(199,125,232,0) 70%);"></div>`
    + `<div style="display:flex;align-items:center;gap:14px;position:relative;">${gasLockup(ci, true)}${logo}</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;">`
    +   `<div style="font-size:11px;font-weight:600;letter-spacing:0.28em;color:${ci.accentOnDark};text-transform:uppercase;margin-bottom:18px;">Growth Proposal · Strictly Confidential</div>`
    +   `<div style="font-size:46px;font-weight:800;line-height:1.0;text-transform:uppercase;letter-spacing:-0.01em;max-width:660px;">${esc(d.cover.headline.lead)} `
    +     `<span style="color:${ci.accentOnDark};">${esc(d.cover.headline.gradient)}</span></div>`
    +   `<p style="margin:22px 0 0;font-size:15px;line-height:1.65;color:rgba(255,255,255,0.72);max-width:560px;">${esc(d.cover.summary)}</p>`
    + `</div>`
    // The pills must always fit the page with complete text (Gary: never run off the edge, never truncate). The date
    // pill keeps its full phrase on one line (flex-shrink:0, nowrap); the longer "prepared for" pill yields space and
    // wraps to two lines if a client name is long; the row wraps as a last resort so nothing can overflow.
    + `<div style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;position:relative;">`
    +   `<div style="box-sizing:border-box;flex:0 1 auto;min-width:0;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.20);border-radius:16px;padding:8px 16px;font-size:10.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;line-height:1.4;">${esc(d.cover.audience_chip)}</div>`
    +   `<div style="box-sizing:border-box;flex-shrink:0;background:${ci.accentGrad};border-radius:999px;padding:8px 16px;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;">${esc(d.date_label)} · ${esc(d.validity_label)}</div>`
    + `</div>`
    + `<div style="margin-top:32px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.22);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.55);"><span>GAS Marketing Automation · The Agency of Now</span><span>Human Command. AI Execution.</span></div>`
    + `</section>`;
}

// 02 EXECUTIVE SUMMARY (light). intro + 4 icon cards (2x2) + the fixed "journey" strip.
function execPage(d: ProposalDoc, ci: CiTokens): string {
  const cards = d.exec.cards.slice(0, 4).map((c) => card(ci, "16px 20px",
    `<div style="display:flex;align-items:center;gap:11px;">${disc(ci, 36, c.icon)}<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${esc(c.title)}</div></div>`
    + `<p style="font-size:11px;line-height:1.65;color:${ci.muted};margin:6px 0 0;">${esc(c.body)}</p>`)).join("");
  return `<section class="page" style="${pageLight("52px 60px 40px")}">`
    + eyebrow(ci, "01 · Executive Summary") + headline(ci, d.exec.headline)
    + `<p style="font-size:11.5px;line-height:1.7;color:${ci.body};margin:12px 0 0;">${esc(d.exec.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;flex:1;">${cards}</div>`
    + journeyStrip(ci)
    + footerLight(ci, d.brand_short, 2) + `</section>`;
}

// The fixed journey strip (doctrine: paid ad -> OUR PSI WhatsApp -> PSI intent score -> high-intent lead to sales).
// Client/objective-agnostic: NEVER a landing-page/form, and NEVER a client-specific outcome (a leftover "Tasting
// booked" from the Chilla fixture shipped on a bed retailer). The WhatsApp step is OUR PSI system, never theirs.
const JOURNEY: { icon: string; label: string; sub: string }[] = [
  { icon: `<path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>`, label: "Paid ad", sub: "Meta, Google, more" },
  { icon: `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>`, label: "PSI WhatsApp", sub: "One conversation, no forms" },
  { icon: `<path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path>`, label: "PSI intent score", sub: "Qualified by intent" },
  { icon: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="m16 11 2 2 4-4"></path>`, label: "High-intent lead", sub: "Routed to your sales team" },
];
function journeyStrip(ci: CiTokens): string {
  const arrow = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${ci.arrow}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;
  // Every node shares one grid: icon top-aligned, headline in a fixed two-line box, sub-label starting on the same
  // line across all four, so a one-line headline (Paid ad) and a two-line one (PSI intent score) still align cleanly
  // for the eye (Gary). flex:1 gives the four nodes equal width.
  const nodes = JOURNEY.map((s) =>
    `<div style="display:flex;align-items:flex-start;gap:9px;flex:1;min-width:0;">${disc(ci, 32, s.icon)}<div style="min-width:0;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;line-height:1.15;min-height:23px;">${esc(s.label)}</div><div style="font-size:8.5px;color:${ci.muted};line-height:1.35;margin-top:2px;">${esc(s.sub)}</div></div></div>`
  ).join(arrow);
  return `<div style="margin-top:14px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:9px;">The journey, deliberately short</div>`
    + `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:nowrap;">${nodes}</div></div>`;
}

// 03 THE OPPORTUNITY (light). two paras + 6 stat cards (3x2) + dark "definition of success" box.
function opportunityPage(d: ProposalDoc, ci: CiTokens): string {
  const paras = d.opportunity.paras.map((p, i) =>
    `<p style="font-size:11.5px;line-height:1.7;color:${ci.body};margin:${i === 0 ? "12px" : "10px"} 0 0;">${esc(p)}</p>`).join("");
  // Equal-height cards (the grid stretches them), the icon top-aligned with the punchy headline, and the source
  // pinned to the BOTTOM of every card (margin-top:auto) so all sources sit on the same line (Gary).
  const stats = d.opportunity.stat_cards.slice(0, 6).map((s) =>
    `<div style="background:#FFFFFF;border-radius:16px;padding:14px 18px;box-shadow:0 6px 18px ${ci.shadow};height:100%;display:flex;flex-direction:column;">`
    + `<div style="display:flex;align-items:flex-start;gap:9px;">${disc(ci, 26, s.icon)}<div style="font-size:19px;font-weight:800;line-height:1.05;color:${ci.accent};">${esc(s.stat)}</div></div>`
    + `<div style="font-size:10px;line-height:1.5;color:${ci.muted};margin-top:7px;">${esc(s.body)}</div>`
    + `<div style="margin-top:auto;padding-top:9px;font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};">${esc(s.source)}</div></div>`).join("");
  return `<section class="page" style="${pageLight("52px 60px 40px")}">`
    + eyebrow(ci, "02 · The Opportunity") + headline(ci, d.opportunity.headline) + paras
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px;align-items:stretch;">${stats}</div>`
    + `<div style="margin-top:auto;margin-bottom:14px;background:${ci.darkCard};border-radius:16px;padding:18px 24px;color:#FFFFFF;">`
    +   `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">The definition of success</div>`
    +   `<div style="font-size:12px;font-weight:400;line-height:1.65;margin-top:6px;color:rgba(255,255,255,0.9);">${esc(d.opportunity.success_body)}</div></div>`
    + footerLight(ci, d.brand_short, 3) + `</section>`;
}

// 04 STRATEGIC RECOMMENDATION (light). wedge box + argument + 6 proof cards (2x3) + "how the argument lands" flow.
function strategyPage(d: ProposalDoc, ci: CiTokens): string {
  const proofs = d.strategy.proof_cards.slice(0, 6).map((c) => proofCard(ci, c.title, c.body)).join("");
  const node = (icon: string, label: string, sub: string) =>
    `<div style="display:flex;align-items:center;gap:9px;">${disc(ci, 30, icon)}<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${esc(label)}</div><div style="font-size:8.5px;color:${ci.muted};line-height:1.4;">${esc(sub)}</div></div></div>`;
  const flow = stripCard(ci, "How the argument lands",
    node(MIC, "Reason to believe", d.strategy.flow.believe) + flowArrow(ci, 15)
    + node(CHECK, "Reason to buy", d.strategy.flow.buy) + flowArrow(ci, 15)
    + node(CIRCLE_DOLLAR, "Commercial outcome", d.strategy.flow.outcome), "12px");
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "03 · Strategic Recommendation") + headline(ci, d.strategy.headline)
    + darkBox(ci, "The single-minded wedge", d.strategy.wedge_body)
    + `<p style="font-size:11px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(d.strategy.argument)}</p>`
    + miniEyebrow(ci, "Why this wedge wins")
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">${proofs}</div>`
    + flow + footerLight(ci, d.brand_short, 4));
}

// 05 MARKET INTELLIGENCE (light). intro + the "what we do about it" recommendation cards. The sourced stat cards
// live on page 3 (the Opportunity), so they are NOT repeated here (that duplication, plus a meaningless empty
// shrinking/growth split bar, is what overloaded and clipped this page). This page is now the recommendations.
function marketPage(d: ProposalDoc, ci: CiTokens): string {
  const actions = d.market.actions.slice(0, 6).map((a) => proofCard(ci, a.title, a.body)).join("");
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "04 · Market Intelligence") + headline(ci, d.market.headline)
    + `<p style="font-size:11px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(d.market.intro)}</p>`
    + miniEyebrow(ci, "What we do about it", "16px")
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">${actions}</div>`
    + footerLight(ci, d.brand_short, 5));
}

// 06 CORE PHILOSOPHY (dark). Fixed agency doctrine (Gary: fixed template). AI does / Humans do / Together + chips.
const PHIL_INTRO = "We pair AI and people on purpose, and the way we combine the two is our moat. AI does the heavy lifting. It clears the repetitive work, replies in seconds and qualifies leads at scale. That frees your team for the work only people do well, the judgement, the relationships and the close. One side without the other is average. Together they beat either alone.";
const PHIL_AI = "Data processing, research at scale, creative volume, real-time intent scoring, WhatsApp qualification, retargeting workflows and continuous budget optimisation.";
const PHIL_HUMAN = "Strategy, empathy, StorySelling nuance, judgement, compliance sensitivity, the final decision and the client relationship. Your team stays at the heart of every relationship.";
const PHIL_TOGETHER = "Deeper partnerships, built on transparency, accountability and shared results, at a speed and scale neither side reaches alone. This is how we build a lasting advantage for your brand.";
function philosophyPage(d: ProposalDoc, ci: CiTokens): string {
  // Chips in the BRAND accent so they stand out and read as ours (Gary), not a faint translucent grey.
  const chip = (t: string) => `<div style="flex:1;text-align:center;background:${ci.accent};color:#FFFFFF;border-radius:999px;padding:9px 16px;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.28);">${t}</div>`;
  const CPU = `<rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M15 2v2"></path><path d="M15 20v2"></path><path d="M2 15h2"></path><path d="M2 9h2"></path><path d="M20 15h2"></path><path d="M20 9h2"></path><path d="M9 2v2"></path><path d="M9 20v2"></path>`;
  const HEART = `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>`;
  const glassCard = (pill: string, body: string) =>
    `<div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:18px;padding:20px 22px;">${pill}<p style="font-size:12px;line-height:1.7;color:rgba(255,255,255,0.8);margin:12px 0 0;">${esc(body)}</p></div>`;
  const aiPill = `<div style="background:${ci.accentGrad};border-radius:999px;padding:5px 14px;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;display:inline-flex;align-items:center;gap:7px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CPU}</svg>AI does</div>`;
  const humanPill = `<div style="background:#FFFFFF;color:#1A1030;border-radius:999px;padding:5px 14px;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;display:inline-flex;align-items:center;gap:7px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1A1030" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${HEART}</svg>Humans do</div>`;
  // The collaboration visual (fills the dead space, Gary): AI executes and Humans command, wired into a loop where
  // every result feeds the next. A single clean "cycle" glyph reads instantly as a loop (the old two-arc drawing
  // rendered as a muddy lens, Gary). The two orbs sit on a hairline rail with the cycle glyph centred on it.
  const orbCPU = `<div style="width:52px;height:52px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;line-height:0;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${CPU}</svg></div>`;
  const orbHeart = `<div style="width:52px;height:52px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;line-height:0;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1A1030" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${HEART}</svg></div>`;
  const cycleGlyph = `<div style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;line-height:0;flex-shrink:0;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M3 21v-5h5"></path></svg></div>`;
  const orb = (o: string, label: string, color: string) => `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;flex-shrink:0;">${o}<div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${color};font-weight:700;">${label}</div></div>`;
  const rail = `<div style="flex:1;height:1px;background:rgba(255,255,255,0.22);max-width:70px;"></div>`;
  const collab = `<div style="margin-top:22px;">`
    + `<div style="display:flex;align-items:center;justify-content:center;gap:12px;">`
    +   orb(orbCPU, "AI executes", ci.accentOnDark) + rail + cycleGlyph + rail + orb(orbHeart, "Humans command", "#FFFFFF")
    + `</div>`
    + `<div style="text-align:center;font-size:8px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-top:10px;">Every result feeds the next</div></div>`;
  return section(pageDark(ci, "52px 60px 40px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">05 · Core Philosophy</div>`
    + `<div style="font-size:34px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:10px;">Human Command. <span style="color:${ci.accentOnDark};">AI Execution.</span></div>`
    + `<p style="font-size:12.5px;line-height:1.7;color:rgba(255,255,255,0.75);margin:14px 0 0;">${esc(PHIL_INTRO)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;">${glassCard(aiPill, PHIL_AI)}${glassCard(humanPill, PHIL_HUMAN)}</div>`
    + collab
    + `<div style="margin-top:22px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:18px;padding:20px 24px;"><div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">Together</div><p style="font-size:13px;font-weight:600;line-height:1.6;margin:8px 0 0;color:rgba(255,255,255,0.9);">${esc(PHIL_TOGETHER)}</p></div>`
    + `<div style="display:flex;gap:10px;margin-top:auto;padding-top:20px;flex-wrap:nowrap;">${chip("Accountability over activity")}${chip("Truth over comfort")}${chip("Speed with judgement")}</div>`
    + footerDark(d.brand_short, 6));
}

// 07 THE ECOSYSTEM (light). Fixed 8 pods in 3 layers + fixed flow strip + fixed feedback pill; only the intro varies.
const ecoDark = (ci: CiTokens, n: string, name: string, tag: string) =>
  `<div style="background:${ci.darkCard};border-radius:14px;padding:13px 16px;color:#FFFFFF;"><div style="font-size:10px;font-weight:600;letter-spacing:0.18em;color:${ci.accentOnDark};">${n}</div><div style="font-size:13px;font-weight:700;margin-top:3px;">${esc(name)}</div><div style="font-size:10.5px;color:rgba(255,255,255,0.72);margin-top:3px;line-height:1.5;">${esc(tag)}</div></div>`;
const ecoLight = (ci: CiTokens, n: string, name: string, tag: string) =>
  `<div style="background:#FFFFFF;border-radius:14px;padding:13px 16px;box-shadow:0 6px 18px ${ci.shadow};"><div style="font-size:10px;font-weight:600;letter-spacing:0.18em;color:${ci.accent};">${n}</div><div style="font-size:13px;font-weight:700;margin-top:3px;">${esc(name)}</div><div style="font-size:10.5px;color:${ci.muted};margin-top:3px;line-height:1.5;">${esc(tag)}</div></div>`;
const FLOW: { accent: boolean; icon: string; label: string }[] = [
  { accent: false, icon: `<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>`, label: "Research" },
  { accent: false, icon: `<circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>`, label: "Strategy" },
  { accent: true, icon: `<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>`, label: "Audience" },
  { accent: true, icon: `<path d="m12 19 7-7 3 3-7 7-3-3z"></path><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="m2 2 7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle>`, label: "Creative" },
  { accent: true, icon: `<path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>`, label: "Channels" },
  { accent: false, icon: `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>`, label: "PSI Qualify" },
  { accent: false, icon: `<rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M12 11h4"></path><path d="M12 16h4"></path><path d="M8 11h.01"></path><path d="M8 16h.01"></path>`, label: "Lead Mgmt" },
  { accent: false, icon: `<path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path>`, label: "Optimise" },
];
function ecosystemPage(d: ProposalDoc, ci: CiTokens): string {
  const layerLabel = (t: string) => `<div style="font-size:9px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};margin-bottom:8px;">${t}</div>`;
  const node = (f: (typeof FLOW)[number]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;"><div style="width:30px;height:30px;border-radius:50%;background:${f.accent ? ci.accentGrad : ci.darkCard};display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${f.icon}</svg></div><div style="font-size:7.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${ci.muted};text-align:center;">${f.label}</div></div>`;
  const arrow = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${ci.arrow}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:9px;"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;
  const flow = FLOW.map(node).join(arrow);
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "06 · The Ecosystem") + headline(ci, { lead: "Eight integrated pods", gradient: "one system" })
    + `<p style="font-size:12.5px;line-height:1.7;color:${ci.body};margin:14px 0 0;">${esc(d.ecosystem_intro)}</p>`
    + `<div style="margin-top:20px;">${layerLabel("Intelligence Layer")}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${ecoDark(ci, "POD I", "The Researcher", "Your business brain: market, competitors, customer sentiment")}${ecoDark(ci, "POD II", "The Strategist", "Intelligence converted into a commercial plan and KPIs")}</div></div>`
    + `<div style="margin-top:16px;">${layerLabel("Execution Layer")}<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">${ecoLight(ci, "POD III", "Audience Intelligence", "The right people, not the most people")}${ecoLight(ci, "POD IV", "Creative Studio", "Emotive StorySelling, tested at volume")}${ecoLight(ci, "POD V", "Channel Management", "Omnichannel media, tuned daily")}</div></div>`
    + `<div style="margin-top:16px;">${layerLabel("Conversion and Learning Layers")}<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">${ecoDark(ci, "POD VI", "PSI · Pre-Sales Intelligence", "Every enquiry scored for intent, in real time")}${ecoDark(ci, "POD VII", "PSI Conversion Dashboard", "The bridge from marketing to your team")}${ecoDark(ci, "POD VIII", "Media on GAS", "Identifies the metrics that matter. Learns and scales winners.")}</div></div>`
    // The flow AND the feedback loop as ONE block (the loop was a separate pill that floated in the page): the eight
    // stages in sequence, then the loop-back that closes the system, so the closed loop reads at a glance. margin-top:
    // auto drops this box to the foot of the page so it closes on the footer (Gary: the lone tagline below it read as
    // lost) with no floating single line beneath it.
    + `<div style="margin-top:auto;background:#FFFFFF;border-radius:16px;padding:16px 20px 14px;box-shadow:0 6px 18px ${ci.shadow};">`
    +   `<div style="font-size:9px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};text-align:center;">How intelligence flows, then loops back to compound</div>`
    +   `<div style="display:flex;align-items:flex-start;justify-content:center;gap:5px;margin-top:12px;">${flow}</div>`
    +   `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #EEE8F5;display:flex;align-items:center;justify-content:center;gap:10px;"><span style="width:22px;height:22px;border-radius:50%;background:${ci.accentGrad};display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;font-size:13px;">&#8635;</span><span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ci.accentDeep};">Every outcome feeds back to sharpen the whole system</span></div></div>`
    + footerLight(ci, d.brand_short, 7));
}

// 08 POD DIVIDER (dark). Fixed giant "VIII" + headline + 8 pod chips; one client-specific intro line.
function dividerPage(d: ProposalDoc, ci: CiTokens): string {
  // The pod chips in the BRAND accent with white copy so they stand out on the dark page (Gary: they were lost).
  const chips = ["I · Researcher", "II · Strategist", "III · Audience", "IV · Creative", "V · Channels", "VI · Pre-Sales Intelligence", "VII · Conversion Dashboard", "VIII · Media on GAS"]
    .map((t) => `<div style="background:${ci.accent};color:#FFFFFF;border-radius:999px;padding:7px 16px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;box-shadow:0 3px 10px rgba(0,0,0,0.28);">${t}</div>`).join("");
  return section(pageDark(ci, "56px 64px 44px", "position:relative;overflow:hidden;background:" + ci.darkCard + ";"),
    `<div style="position:absolute;left:-140px;bottom:-140px;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,rgba(199,125,232,0) 70%);"></div>`
    + `<div style="font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};position:relative;">The Ecosystem, Pod by Pod</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;">`
    +   `<div style="align-self:flex-start;font-size:170px;font-weight:800;line-height:0.9;letter-spacing:-0.02em;color:${ci.accentOnDark};">VIII</div>`
    +   `<div style="font-size:36px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:18px;max-width:660px;">Eight AI Marketing Pods.<br>One accountable partner.</div>`
    +   `<p style="font-size:14px;line-height:1.7;color:rgba(255,255,255,0.68);margin:16px 0 0;max-width:480px;">${esc(d.divider_line)}</p>`
    + `</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:8px;position:relative;">${chips}</div>`
    + footerDark(d.brand_short, 8, "28px"));
}

// A 28px headline variant (the pod pages use a slightly smaller headline than the 30px content pages).
const headline28 = (ci: CiTokens, h: Headline) => headline(ci, h, 28);
// A soft tint outcome chip (F3EDF9 family), used on pod pages.
const tintChip = (ci: CiTokens, body: string, mt = "10px") =>
  `<div style="margin-top:${mt};background:${ci.tint};border-radius:10px;padding:9px 13px;font-size:10px;line-height:1.55;color:${ci.accentDeep};font-weight:600;">${esc(body)}</div>`;
// A numbered pod disc (roman numeral in the CI icon-disc).
const podDisc = (ci: CiTokens, roman: string, size = 34) =>
  `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${ci.iconDisc};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;">${roman}</div>`;

// 09 PODS I-II (light). Two pod blocks (disc + name + subtitle + para + tint chip) + the competitive positioning map.
function pods12Page(d: ProposalDoc, ci: CiTokens): string {
  const m = d.pods12.map;
  // Themed pod icons (a scope for the Researcher, a compass for the Strategist), not a plain numeral (Gary: the
  // icons were not creative enough). The pod number rides along as a small tag next to the name.
  const RESEARCHER_ICON = `<circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path><path d="M11 8v6"></path><path d="M8 11h6"></path>`;
  const STRATEGIST_ICON = `<circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>`;
  const podBlock = (icon: string, roman: string, name: string, subtitle: string, para: string, chip: string) =>
    `<div style="background:#FFFFFF;border-radius:16px;padding:16px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:11px;">${disc(ci, 40, icon)}<div><div style="display:flex;align-items:baseline;gap:8px;"><span style="font-size:14px;font-weight:800;text-transform:uppercase;">${esc(name)}</span><span style="font-size:8px;font-weight:700;letter-spacing:0.16em;color:${ci.accent};">POD ${roman}</span></div><div style="font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${ci.muted};">${esc(subtitle)}</div></div></div>`
    + `<p style="font-size:10.5px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(para)}</p>${tintChip(ci, chip)}</div>`;
  const dot = (c: { name: string; note: string; left: string; top: string }) =>
    `<div style="position:absolute;left:${c.left};top:${c.top};display:flex;align-items:center;gap:5px;"><div style="width:11px;height:11px;border-radius:50%;background:#B7AECB;"></div><div style="font-size:9px;font-weight:700;color:${ci.muted};">${esc(c.name)} <span style="font-weight:400;">· ${esc(c.note)}</span></div></div>`;
  const clientDot = `<div style="position:absolute;left:${m.client.left};top:${m.client.top};display:flex;align-items:center;gap:6px;"><div style="width:15px;height:15px;border-radius:50%;background:${ci.iconDisc};box-shadow:0 0 12px rgba(155,79,201,0.5);"></div><div style="font-size:10px;font-weight:800;color:${ci.accentDeep};">${esc(m.client.name)} <span style="font-weight:400;color:${ci.muted};">· ${esc(m.client.note)}</span></div></div>`;
  const axisLbl = (pos: string, t: string) => `<div style="position:absolute;${pos};font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:#8A8496;">${esc(t)}</div>`;
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "The System · Intelligence Layer") + headline28(ci, d.pods12.headline)
    + `<div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">`
    +   podBlock(RESEARCHER_ICON, "I", "The Researcher", "The business brain: market, competitors, customer", d.pods12.researcher_para, d.pods12.researcher_chip)
    +   podBlock(STRATEGIST_ICON, "II", "The Strategist", "Intelligence converted into a commercial plan and KPIs", d.pods12.strategist_para, d.pods12.strategist_chip)
    + `</div>`
    + `<div style="margin-top:12px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    +   `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:20px;">${esc(m.title)}</div>`
    +   `<div style="position:relative;height:158px;border-left:2px solid #E4DEEF;border-bottom:2px solid #E4DEEF;margin:0 12px 20px 12px;">`
    +     axisLbl("left:-10px;top:-15px", m.y_top) + axisLbl("left:-10px;bottom:-16px", m.y_bottom)
    +     axisLbl("right:0;bottom:-16px", m.x_right) + axisLbl("left:16%;bottom:-16px", m.x_left)
    +     m.competitors.map(dot).join("") + clientDot
    +   `</div></div>`
    // A summary of the whole named competitor set under the graph (Gary: fills the dead space and adds value).
    + (m.set && m.set.length ? `<div style="margin-top:10px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
        + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:9px;">The named competitor set</div>`
        + `<div style="display:flex;flex-wrap:wrap;gap:6px;">${m.set.map((n) => `<span style="background:${ci.tint};border-radius:999px;padding:4px 12px;font-size:9.5px;font-weight:600;color:${ci.accentDeep};">${esc(n)}</span>`).join("")}</div>`
        + `<div style="font-size:10px;line-height:1.55;color:${ci.body};margin-top:10px;">The direct and adjacent rivals the Researcher tracks. Every targeting and message decision is checked against this set, so ${esc(d.client_name)} moves on evidence, not assumption.</div></div>` : "")
    + footerLight(ci, d.brand_short, 9));
}

// 10 POD III + PERSONAS (light). intro + 4 persona cards (+ discipline note) + blueprint chip + geo chips + budget bar.
function audiencePage(d: ProposalDoc, ci: CiTokens): string {
  const a = d.audience;
  // Colour icon disc for impact (Gary), via the shared disc() so it is a perfect circle. Names are kept to ONE line
  // (clamped in the map) so all four persona headlines sit uniform; the icon centres against a single-line name.
  const personaCard = (p: { icon: string; name: string; geo: string; quote: string }) =>
    `<div style="background:#FFFFFF;border-radius:12px;padding:13px 15px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:9px;">${disc(ci, 30, p.icon)}<div style="font-size:11px;font-weight:800;line-height:1.2;color:${ci.ink};">${esc(p.name)}</div></div>`
    + `<div style="font-size:9px;line-height:1.55;color:${ci.body};margin-top:8px;">${esc(p.geo)}</div>`
    + `<div style="font-size:9.5px;line-height:1.5;color:${ci.accentDeep};margin-top:7px;font-style:italic;">${esc(p.quote)}</div></div>`;
  // How we reach them: the trigger-moment model (Gary), replacing the weak "trade-only discipline" note.
  const disciplineCard = `<div style="background:${ci.darkCard};border-radius:12px;padding:13px 15px;color:#FFFFFF;"><div style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentOnDark};">How we reach them</div><div style="font-size:9.5px;line-height:1.55;color:rgba(255,255,255,0.85);margin-top:5px;">${esc(a.discipline_note)}</div></div>`;
  const geoChip = (c: { label: string; accent: boolean }) => c.accent
    ? `<div style="background:${ci.accentGrad};color:#FFFFFF;border-radius:999px;padding:5px 13px;font-size:8.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;">${esc(c.label)}</div>`
    : `<div style="background:#FFFFFF;border-radius:999px;padding:5px 13px;font-size:8.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;box-shadow:0 4px 12px ${ci.shadow};white-space:nowrap;">${esc(c.label)}</div>`;
  const seg = (b: { label: string; body: string; flex: number }, i: number) => {
    // First bar is the brand-accent pop; the other two are two neutral GREYS (Gary: the old lilac was an off-palette
    // Chilla leftover, keep to greys to match the rest of the deck).
    const bg = i === 0 ? `linear-gradient(90deg,${ci.accent} 0%,${ci.accentDeep} 100%)` : i === 1 ? "#E4E4E9" : "#F1F1F4";
    const col = i === 0 ? "#FFFFFF" : ci.ink;
    const sub = i === 0 ? "rgba(255,255,255,0.85)" : ci.muted;
    return `<div style="flex:${b.flex};background:${bg};border-radius:8px;padding:7px 12px;color:${col};"><div style="font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">${esc(b.label)}</div><div style="font-size:9px;color:${sub};margin-top:2px;">${esc(b.body)}</div></div>`;
  };
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "The System · Execution Layer") + headline28(ci, a.headline)
    + `<p style="font-size:10.5px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(a.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px;">${a.personas.slice(0, 4).map(personaCard).join("")}${disciplineCard}</div>`
    + tintChip(ci, a.blueprint_note)
    + `<div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accent};white-space:nowrap;">${esc(a.geo_label)}</div><div style="display:flex;gap:7px;flex-wrap:nowrap;">${a.geo_chips.map(geoChip).join("")}</div></div>`
    + `<div style="margin-top:10px;background:#FFFFFF;border-radius:14px;padding:12px 18px;box-shadow:0 6px 18px ${ci.shadow};"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:8px;">Where the money goes</div><div style="display:flex;gap:6px;align-items:stretch;">${a.budget.slice(0, 3).map(seg).join("")}</div></div>`
    + footerLight(ci, d.brand_short, 10));
}

// 11 PLATFORM-LEVEL TARGETING (light). 4 targeting-stack rows + the persona-to-channel dot matrix.
function targetingPage(d: ProposalDoc, ci: CiTokens): string {
  const t = d.targeting;
  const row = (r: { name: string; platforms: string; segments: { label: string; text: string }[] }) =>
    `<div style="background:#FFFFFF;border-radius:12px;padding:11px 14px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;"><span style="font-size:12px;font-weight:700;">${esc(r.name)}</span><span style="font-size:8.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};">${esc(r.platforms)}</span></div>`
    + `<div style="color:${ci.muted};margin-top:4px;">${r.segments.map((s) => s.label ? `<strong>${esc(s.label)}:</strong> ${esc(s.text)}` : esc(s.text)).join(" ")}</div></div>`;
  const dotFor = (lvl: "lead" | "support" | "test") => lvl === "lead"
    ? `<div style="width:13px;height:13px;border-radius:50%;background:${ci.iconDisc};box-shadow:0 0 8px rgba(155,79,201,0.4);"></div>`
    : lvl === "support" ? `<div style="width:10px;height:10px;border-radius:50%;background:${ci.dotMid};"></div>`
    : `<div style="width:6px;height:6px;border-radius:50%;background:${ci.dotLight};"></div>`;
  const legend = `<div style="display:flex;gap:12px;font-size:7.5px;letter-spacing:0.1em;text-transform:uppercase;color:#8A8496;"><span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:50%;background:${ci.iconDisc};display:inline-block;"></span>Lead</span><span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:${ci.dotMid};display:inline-block;"></span>Support</span><span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:${ci.dotLight};display:inline-block;"></span>Test / none</span></div>`;
  const headRow = `<div></div><div style="display:grid;grid-template-columns:repeat(${t.matrix.channels.length},1fr);font-size:8.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${ci.accentDeep};text-align:center;">${t.matrix.channels.map((c) => `<div>${esc(c)}</div>`).join("")}</div>`;
  const matrixRows = t.matrix.rows.map((mr) =>
    `<div style="padding:6px 12px;border-top:1px solid #EEE8F5;font-weight:700;color:${ci.body};font-size:10px;display:flex;align-items:center;">${esc(mr.persona)}</div>`
    + `<div style="border-top:1px solid #EEE8F5;display:grid;grid-template-columns:repeat(${t.matrix.channels.length},1fr);align-items:center;">${mr.cells.map((c) => `<div style="display:flex;align-items:center;justify-content:center;">${dotFor(c)}</div>`).join("")}</div>`).join("");
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "Pod III · Platform-level targeting") + headline28(ci, t.headline)
    + `<div style="display:flex;flex-direction:column;gap:9px;margin-top:12px;font-size:10.5px;line-height:1.55;">${t.rows.slice(0, 4).map(row).join("")}</div>`
    + `<div style="margin-top:10px;background:#FFFFFF;border-radius:14px;padding:12px 16px 10px;box-shadow:0 6px 18px ${ci.shadow};">`
    +   `<div style="display:flex;justify-content:space-between;align-items:baseline;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">Persona to channel map</div>${legend}</div>`
    +   `<div style="display:grid;grid-template-columns:1.3fr 2fr;margin-top:7px;">${headRow}${matrixRows}</div>`
    + `</div>`
    + footerLight(ci, d.brand_short, 11));
}

// A pod-page header: 44px icon disc + eyebrow ("Pod IV of VIII · ...") + a two-line headline (2nd line gradient).
function podHeader(ci: CiTokens, icon: string, eb: string, line1: string, grad2: string, onDark: boolean): string {
  const ebColor = onDark ? ci.accentOnDark : ci.accentDeep;
  const gradTextColor = onDark ? ci.accentOnDark : ci.accent;
  const glow = onDark ? "box-shadow:0 0 20px rgba(155,79,201,0.4);" : "";
  // position:relative + z-index keeps the header ABOVE the absolute ghost numeral (an absolute sibling otherwise
  // paints over static text regardless of DOM order - that was the "IV/VI crosses the title" bug). max-width keeps
  // a long two-line title from running under the numeral.
  return `<div style="position:relative;z-index:1;display:flex;align-items:center;gap:14px;max-width:76%;"><div style="width:44px;height:44px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;color:#FFFFFF;flex-shrink:0;${glow}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>`
    + `<div><div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ebColor};">${esc(eb)}</div>`
    + `<div style="font-size:24px;font-weight:800;text-transform:uppercase;line-height:1.04;">${esc(line1)}<br><span style="color:${gradTextColor};">${esc(grad2)}</span></div></div></div>`;
}
// The oversized ghost roman numeral, top-right on pod pages. z-index:0 keeps it BEHIND the header/content (which
// carry z-index:1); it sits high in the corner so it reads as a watermark, never over the title.
const ghostNumeral = (ci: CiTokens, roman: string, onDark: boolean) =>
  `<div style="position:absolute;right:24px;top:-44px;z-index:0;font-size:170px;font-weight:800;line-height:1;letter-spacing:-0.02em;color:${onDark ? ci.ghostDark : ci.ghostLight};pointer-events:none;">${roman}</div>`;

// 12 POD IV CREATIVE (light, ghost IV). Header + intro + dark for-client box + 4 fixed capability cards + 2 benefit
// cards + the launch asset system (4 mini format frames). Capability cards are fixed doctrine; only copy varies.
const WAND = `<path d="m12 19 7-7 3 3-7 7-3-3z"></path><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="m2 2 7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle>`;
const CREATIVE_CAPS: { icon: string; title: string; body: string }[] = [
  { icon: `<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>`, title: "Dynamic formats", body: "High-impact statics, motion graphics, rapid-fire video and short-form, tested at volume." },
  { icon: `<circle cx="12" cy="7" r="4"></circle><path d="M5.5 21a6.5 6.5 0 0 1 13 0"></path><path d="m19 2 .9 1.8 1.8.9-1.8.9L19 7.4l-.9-1.8-1.8-.9 1.8-.9z"></path>`, title: "AI influencers and ambassadors", body: "Bespoke AI brand ambassadors that resonate with niche demographics." },
  { icon: `<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>`, title: "Performance copywriting", body: "Message engineered for the platform, the audience and the point in the journey." },
  { icon: `<path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path>`, title: "Test, measure, optimise", body: "Creative testing and measurement built into the workflow, not bolted on after." },
];
function creativePage(d: ProposalDoc, ci: CiTokens): string {
  const caps = CREATIVE_CAPS.map((c) => `<div style="background:#FFFFFF;border-radius:14px;padding:14px 18px;box-shadow:0 6px 18px ${ci.shadow};"><div style="display:flex;align-items:center;gap:9px;">${disc(ci, 30, c.icon)}<div style="font-size:11.5px;font-weight:700;">${esc(c.title)}</div></div><div style="font-size:10.5px;color:${ci.muted};line-height:1.55;margin-top:7px;">${esc(c.body)}</div></div>`).join("");
  // Frame previews in the BRAND accent so they pop, not flat grey (Gary: the creative page was the least creative).
  const frames = d.creative.asset_formats.slice(0, 4).map((f) =>
    `<div style="background:#FFFFFF;border-radius:12px;box-shadow:0 6px 18px ${ci.shadow};overflow:hidden;"><div style="height:56px;background:${ci.accentGrad};display:flex;align-items:center;justify-content:center;position:relative;"><div style="position:absolute;top:6px;left:8px;font-size:6.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.65);">${esc(f.ratio)}</div><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${f.icon}</svg></div><div style="padding:8px 11px;"><div style="font-size:9px;font-weight:700;line-height:1.3;">${esc(f.title)}</div><div style="font-size:8px;color:${ci.muted};line-height:1.4;margin-top:2px;">${esc(f.caption)}</div></div></div>`).join("");
  const benefit = (eb: string, body: string) => `<div style="flex:1;background:${ci.tint};border-radius:14px;padding:12px 16px;"><div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentDeep};">${esc(eb)}</div>${body}</div>`;
  const p = (t: string) => `<div style="font-size:11px;line-height:1.6;color:${ci.body};margin-top:4px;">${esc(t)}</div>`;
  return section(pageLight("52px 60px 40px", "position:relative;overflow:hidden;"),
    ghostNumeral(ci, "IV", false)
    + podHeader(ci, WAND, "Pod IV of VIII · The Execution Layer", "Performance Creative Studio", "Emotive StorySelling", false)
    + `<p style="font-size:12.5px;line-height:1.7;color:${ci.body};margin:16px 0 0;">${esc(d.creative.intro)}</p>`
    + `<div style="margin-top:16px;background:${ci.darkCard};border-radius:16px;padding:18px 22px;color:#FFFFFF;"><div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">For ${esc(d.client_name)}</div><p style="font-size:12px;line-height:1.7;margin:8px 0 0;color:rgba(255,255,255,0.85);">${esc(d.creative.for_client)}</p></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;">${caps}</div>`
    + `<div style="display:flex;gap:10px;margin-top:16px;">${benefit("Client benefit", p("More shots on goal, faster learning, and creative accountable to conversion rather than applause."))}${benefit("Connects forward", p("Supplies the assets Channel Management deploys to your defined audiences."))}</div>`
    + `<div style="margin-top:12px;background:${ci.tint};border:1px solid ${ci.tint};border-radius:14px;padding:12px 16px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};margin-bottom:9px;">The launch asset system, format by format</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:9px;">${frames}</div></div>`
    + footerLight(ci, d.brand_short, 12));
}

// 13 POD V CHANNELS (light). intro + up to 5 channel rows (icon + name + role chip + what + why-italic).
function channelsPage(d: ProposalDoc, ci: CiTokens): string {
  const roleBg = (k: "lead" | "support" | "test") => k === "lead" ? ci.accentGrad : k === "support" ? ci.accentDeep : ci.accent;
  // The reach hook sits on the right of each row (Gary: bring in social reach as hooks, and fill the page).
  const reachTag = (r: string) => r ? `<div style="margin-left:auto;text-align:right;flex-shrink:0;"><div style="font-size:13px;font-weight:800;color:${ci.accent};line-height:1;">${esc(r)}</div><div style="font-size:7px;letter-spacing:0.14em;text-transform:uppercase;color:${ci.muted};margin-top:2px;">reach in market</div></div>` : "";
  const row = (r: (typeof d.channels5.rows)[number]) =>
    `<div style="background:#FFFFFF;border-radius:12px;padding:12px 16px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:10px;">${disc(ci, 26, r.icon)}<div style="font-size:11.5px;font-weight:700;">${esc(r.name)}</div><div style="background:${roleBg(r.kind)};border-radius:999px;padding:3px 10px;font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FFFFFF;">${esc(r.role)}</div>${reachTag(r.reach || "")}</div>`
    + `<div style="font-size:9.8px;line-height:1.55;color:${ci.body};margin-top:5px;">${esc(r.what)}</div>`
    + `<div style="font-size:9.3px;line-height:1.5;color:${ci.muted};margin-top:4px;font-style:italic;">${esc(r.why)}</div></div>`;
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "The System · Execution Layer") + headline28(ci, { lead: "Pod V ·", gradient: "The channel plan" })
    + `<p style="font-size:10.5px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(d.channels5.intro)}</p>`
    + `<div style="display:flex;flex-direction:column;gap:9px;margin-top:12px;">${d.channels5.rows.slice(0, 5).map(row).join("")}</div>`
    + footerLight(ci, d.brand_short, 13));
}

// 14 POD VI PSI (dark, ghost VI). Header + intro + glass for-client box + HIGH/MEDIUM/LOW tiles + WhatsApp mock +
// 3 side cards + 2 benefit chips. The WhatsApp bubbles are data; the score scale is fixed.
const WHATSAPP = `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>`;
function psiPage(d: ProposalDoc, ci: CiTokens): string {
  const p = d.psi;
  const tileColor = (k: "high" | "medium" | "low") => k === "high" ? ci.accentOnDark : k === "medium" ? "#FFFFFF" : "rgba(255,255,255,0.6)";
  const tile = (t: { level: string; caption: string; kind: "high" | "medium" | "low" }) =>
    `<div style="background:rgba(255,255,255,0.10);border-radius:14px;padding:14px 16px;text-align:center;"><div style="font-size:20px;font-weight:800;color:${tileColor(t.kind)};">${esc(t.level)}</div><div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.75);margin-top:4px;">${esc(t.caption)}</div></div>`;
  const bubble = (b: { role: "in" | "out"; text: string }) => b.role === "in"
    ? `<div style="margin-top:8px;background:rgba(255,255,255,0.12);border-radius:12px 12px 12px 3px;padding:8px 12px;font-size:10px;line-height:1.55;max-width:85%;color:rgba(255,255,255,0.92);">${esc(b.text)}</div>`
    : `<div style="margin-top:8px;background:${ci.accentGrad};border-radius:12px 12px 3px 12px;padding:8px 12px;font-size:10px;line-height:1.55;max-width:72%;margin-left:auto;">${esc(b.text)}</div>`;
  const sideCard = (c: { title: string; body: string }) =>
    `<div style="background:rgba(255,255,255,0.08);border-radius:14px;padding:12px 16px;flex:1;"><div style="font-size:11px;font-weight:700;">${esc(c.title)}</div><div style="font-size:10.5px;color:rgba(255,255,255,0.72);line-height:1.55;margin-top:3px;">${esc(c.body)}</div></div>`;
  const benefit = (eb: string, body: string) => `<div style="flex:1;background:rgba(255,255,255,0.06);border-radius:14px;padding:12px 16px;"><div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(eb)}</div><div style="font-size:11px;line-height:1.6;color:rgba(255,255,255,0.8);margin-top:4px;">${esc(body)}</div></div>`;
  const chatHeader = `<div style="display:flex;align-items:center;gap:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.14);"><div style="width:24px;height:24px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${WHATSAPP}</svg></div><div><div style="font-size:10px;font-weight:700;">${esc(p.chat.assistant)}</div><div style="font-size:8px;font-weight:600;color:${ci.success};letter-spacing:0.12em;">ONLINE · WHATSAPP</div></div></div>`;
  return section(pageDark(ci, "52px 60px 40px", "position:relative;overflow:hidden;"),
    ghostNumeral(ci, "VI", true)
    + podHeader(ci, WHATSAPP, "Pod VI of VIII · The Conversion Layer · Proprietary", "PSI · Pre-Sales Intelligence", "Turning interest into intent", true)
    + `<p style="font-size:12.5px;line-height:1.7;color:rgba(255,255,255,0.8);margin:16px 0 0;">${esc(p.intro)}</p>`
    + `<div style="margin-top:16px;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.22);border-radius:16px;padding:18px 22px;"><div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">For ${esc(d.client_name)}</div><p style="font-size:12px;line-height:1.7;margin:8px 0 0;color:rgba(255,255,255,0.88);">${esc(p.for_client)}</p></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:16px;">${p.tiles.slice(0, 3).map(tile).join("")}</div>`
    + `<div style="display:grid;grid-template-columns:1.15fr 1fr;gap:10px;margin-top:14px;">`
    +   `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);border-radius:16px;padding:14px 16px;">${chatHeader}${p.chat.bubbles.map(bubble).join("")}<div style="margin-top:10px;display:flex;justify-content:flex-end;"><div style="background:rgba(124,227,139,0.15);border:1px solid rgba(124,227,139,0.4);color:${ci.success};border-radius:999px;padding:4px 12px;font-size:8.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${esc(p.chat.closing)}</div></div></div>`
    +   `<div style="display:flex;flex-direction:column;gap:10px;">${p.side_cards.slice(0, 3).map(sideCard).join("")}</div>`
    + `</div>`
    + `<div style="display:flex;gap:10px;margin-top:14px;">${benefit("Client benefit", p.benefit_client)}${benefit("Connects forward", p.benefit_forward)}</div>`
    + footerDark(d.brand_short, 14));
}

// 15 PODS VII-VIII (light). Two pod blocks + the illustrative dashboard: 2x2 dark KPI tiles with SVG sparklines.
function sparkline(ci: CiTokens, kind: "line-down" | "bars" | "line-up" | "gauge"): string {
  const open = `<svg width="100%" height="40" viewBox="0 0 100 26" preserveAspectRatio="none">`;
  if (kind === "line-down") return open + `<polyline points="0,5 20,8 40,7 60,13 80,17 100,21" fill="none" stroke="${ci.success}" stroke-width="2.5" stroke-linecap="round"></polyline></svg>`;
  if (kind === "line-up") return open + `<polyline points="0,21 20,18 40,19 60,12 80,9 100,4" fill="none" stroke="${ci.accentOnDark}" stroke-width="2.5" stroke-linecap="round"></polyline></svg>`;
  if (kind === "gauge") return open + `<path d="M10 24 A 40 40 0 0 1 90 24" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="5" stroke-linecap="round"></path><path d="M10 24 A 40 40 0 0 1 62 6" fill="none" stroke="${ci.success}" stroke-width="5" stroke-linecap="round"></path></svg>`;
  const bar = (x: number, y: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="10" height="${h}" rx="2" fill="${fill}"></rect>`;
  return open + bar(4, 14, 12, `${ci.accentOnDark}55`) + bar(20, 11, 15, `${ci.accentOnDark}88`) + bar(36, 13, 13, `${ci.accentOnDark}66`) + bar(52, 8, 18, `${ci.accentOnDark}bb`) + bar(68, 5, 21, ci.accentOnDark) + bar(84, 2, 24, `${ci.accentOnDark}dd`) + `</svg>`;
}
function pods78Page(d: ProposalDoc, ci: CiTokens): string {
  const p = d.pods78;
  const DASHBOARD_ICON = `<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M9 21V9"></path>`;
  const MEDIA_ICON = `<path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path>`;
  const podBlock = (icon: string, roman: string, name: string, subtitle: string, para: string, chip: string) =>
    `<div style="background:#FFFFFF;border-radius:16px;padding:14px 18px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:11px;">${disc(ci, 40, icon)}<div><div style="display:flex;align-items:baseline;gap:8px;"><span style="font-size:14px;font-weight:800;text-transform:uppercase;">${esc(name)}</span><span style="font-size:8px;font-weight:700;letter-spacing:0.16em;color:${ci.accent};">POD ${roman}</span></div><div style="font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${ci.muted};">${esc(subtitle)}</div></div></div>`
    + `<p style="font-size:10px;line-height:1.55;color:${ci.body};margin:8px 0 0;">${esc(para)}</p>${tintChip(ci, chip)}</div>`;
  // The fortnightly loop, to fill the page and land the compounding message (Gary: fuller page).
  const loopStep = (t: string, b: string) => `<div style="flex:1;background:${ci.tint};border-radius:12px;padding:11px 14px;"><div style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentDeep};">${t}</div><div style="font-size:9.5px;line-height:1.5;color:${ci.body};margin-top:4px;">${b}</div></div>`;
  const kpiTile = (t: { label: string; spark: "line-down" | "bars" | "line-up" | "gauge"; caption: string }) =>
    `<div style="background:${ci.darkCard};border-radius:14px;padding:14px 18px;color:#FFFFFF;"><div style="font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(t.label)}</div><div style="margin-top:6px;">${sparkline(ci, t.spark)}</div><div style="font-size:8.5px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-top:7px;">${esc(t.caption)}</div></div>`;
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "The System · Conversion and Learning Layers") + headline28(ci, p.headline)
    + `<div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">`
    +   podBlock(DASHBOARD_ICON, "VII", "PSI Conversion Dashboard", "The bridge from marketing to your team", p.dashboard_para, p.dashboard_chip)
    +   podBlock(MEDIA_ICON, "VIII", "Media on GAS", "Learns, reallocates and scales winners", p.media_para, p.media_chip)
    + `</div>`
    + `<div style="margin-top:12px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    +   `<div style="display:flex;justify-content:space-between;align-items:baseline;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">The one screen the bi-weekly review argues from</div><div style="font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:#8A8496;">Illustrative preview · real baselines from week one</div></div>`
    +   `<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:10px;">${p.tiles.slice(0, 4).map(kpiTile).join("")}</div>`
    + `</div>`
    + `<div style="margin-top:12px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};margin-bottom:8px;">The fortnightly loop that compounds</div><div style="display:flex;gap:10px;">${loopStep("Review", "Cost per qualified lead by persona and channel, on one screen.")}${loopStep("Reallocate", "Budget shifts to the winning personas, triggers and creative, on evidence.")}${loopStep("Compound", "Each fortnight is sharper and cheaper than the last, never a reset.")}</div></div>`
    + footerLight(ci, d.brand_short, 15));
}

// 16 CLOSED LOOP (dark). Fixed 6-step wheel (ring + 6 arrow discs + 6 step cards + centre GAS disc); intro +
// compounding callout vary. The step titles are fixed doctrine; step 5's sub can be tuned per client.
const LOOP_STEPS: { left: number; top: number; title: string; sub: string }[] = [
  { left: 310, top: 85, title: "Research and strategise", sub: "The business brain sets the plan" },
  { left: 505, top: 197, title: "Target the audience", sub: "Precision over reach" },
  { left: 505, top: 423, title: "Create and deploy", sub: "StorySelling at machine speed" },
  { left: 310, top: 535, title: "Qualify with PSI", sub: "Interest scored into intent" },
  { left: 115, top: 423, title: "Manage and convert", sub: "Your team works high-intent leads" },
  { left: 115, top: 197, title: "Optimise and learn", sub: "Every result sharpens the next" },
];
const LOOP_ARROWS: { left: number; top: number; rot: number }[] = [
  { left: 422, top: 115, rot: 30 }, { left: 535, top: 310, rot: 90 }, { left: 422, top: 505, rot: 150 },
  { left: 198, top: 505, rot: 210 }, { left: 85, top: 310, rot: 270 }, { left: 198, top: 115, rot: 330 },
];
function closedLoopPage(d: ProposalDoc, ci: CiTokens): string {
  const arrow = (a: { left: number; top: number; rot: number }) =>
    `<div style="position:absolute;left:${a.left}px;top:${a.top}px;transform:translate(-50%,-50%) rotate(${a.rot}deg);width:26px;height:26px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px ${ci.glow};"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></div>`;
  const stepCard = (s: { left: number; top: number; title: string; sub: string }, i: number) =>
    `<div style="position:absolute;left:${s.left}px;top:${s.top}px;transform:translate(-50%,-50%);width:172px;background:${ci.darkCard};border:1px solid ${ci.glow};border-radius:14px;padding:10px 12px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.35);"><div style="font-size:9px;font-weight:600;letter-spacing:0.18em;color:${ci.accentOnDark};">STEP ${i + 1}</div><div style="font-size:12px;font-weight:700;margin-top:2px;line-height:1.3;">${esc(s.title)}</div><div style="font-size:9.5px;color:rgba(255,255,255,0.65);line-height:1.4;margin-top:2px;">${esc(i === 4 && d.closedloop.step5_sub ? d.closedloop.step5_sub : s.sub)}</div></div>`;
  return section(pageDark(ci, "52px 60px 40px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">07 · Ecosystem Integration</div>`
    + `<div style="font-size:30px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:10px;">One closed-loop <span style="color:${ci.accentOnDark};">growth system</span></div>`
    + `<p style="font-size:12.5px;line-height:1.7;color:rgba(255,255,255,0.75);margin:14px 0 0;">${esc(d.closedloop.intro)}</p>`
    + `<div style="flex:1;display:flex;align-items:center;justify-content:center;margin-top:6px;"><div style="position:relative;width:620px;height:620px;">`
    +   `<svg width="620" height="620" viewBox="0 0 620 620" style="position:absolute;inset:0;"><circle cx="310" cy="310" r="225" fill="none" stroke="${ci.glow}" stroke-width="2" stroke-dasharray="3 7"></circle></svg>`
    +   LOOP_ARROWS.map(arrow).join("") + LOOP_STEPS.map(stepCard).join("")
    +   `<div style="position:absolute;left:310px;top:284px;transform:translate(-50%,-50%);width:236px;height:236px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,transparent 70%);"></div>`
    +   `<div style="position:absolute;left:310px;top:284px;transform:translate(-50%,-50%);width:89px;height:89px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:25px;color:#FFFFFF;box-shadow:0 0 44px ${ci.glow},0 0 0 6px rgba(255,255,255,0.08);">GAS</div>`
    +   `<div style="position:absolute;left:310px;top:346px;transform:translateX(-50%);width:220px;text-align:center;"><div style="font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">The Agency of NOW</div><div style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;color:${ci.accentOnDark};">From Interest to Intent</div></div>`
    + `</div></div>`
    + `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:16px;padding:14px 20px;margin-bottom:22px;"><p style="font-size:11px;line-height:1.65;margin:0;color:rgba(255,255,255,0.82);"><strong style="color:${ci.accentOnDark};">The compounding mechanism.</strong> ${esc(d.closedloop.compounding)}</p></div>`
    + footerDark(d.brand_short, 16));
}

// 17 ROLLOUT (light). Timeline rail (gate discs) + gated week cards (icon + title + pods tag + bullets + gate pill).
function rolloutPage(d: ProposalDoc, ci: CiTokens): string {
  const r = d.rollout;
  const railDisc = (badge: string, label: string) =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;"><div style="min-width:26px;height:26px;padding:0 6px;border-radius:999px;background:${ci.iconDisc};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9.5px;white-space:nowrap;position:relative;z-index:1;box-shadow:0 0 0 4px #FAF8FC;">${esc(badge)}</div><div style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ci.accentDeep};text-align:center;">${esc(label)}</div></div>`;
  const weekCard = (w: (typeof r.weeks)[number]) =>
    `<div style="background:#FFFFFF;border-radius:14px;padding:13px 16px;box-shadow:0 6px 18px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="display:flex;align-items:center;gap:8px;">${disc(ci, 24, w.icon)}<div style="font-size:11px;font-weight:700;">${esc(w.title)}</div></div>`
    + `<div style="font-size:8px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};margin-top:2px;">${esc(w.pods)}</div>`
    + `<ul style="margin:7px 0 0;padding-left:14px;font-size:9.3px;line-height:1.5;color:${ci.muted};flex:1;">${w.bullets.map((b) => `<li style="margin-top:2px;">${esc(b)}</li>`).join("")}</ul>`
    + `<div style="margin-top:9px;min-height:34px;background:${ci.accentGrad};border-radius:10px;padding:6px 12px;font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;text-align:center;line-height:1.4;display:flex;align-items:center;justify-content:center;">${esc(w.gate)}</div></div>`;
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "08 · Your Rollout") + headline28(ci, r.headline)
    + `<p style="font-size:10.5px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(r.intro)}</p>`
    + `<div style="margin-top:12px;position:relative;padding:0 30px;"><div style="position:absolute;left:60px;right:60px;top:13px;height:2px;background:linear-gradient(90deg,${ci.accentOnDark} 0%,${ci.accentDeep} 100%);"></div><div style="display:flex;align-items:flex-start;">${r.rail.map((x) => railDisc(x.badge, x.label)).join("")}</div></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;flex:1;">${r.weeks.map(weekCard).join("")}</div>`
    + footerLight(ci, d.brand_short, 17));
}

// 18 FUNNEL + KPIS (light). Illustrative disclaimer + 6 narrowing funnel bars + the KPI table (dark header).
const FUNNEL_WIDTHS = ["100%", "86%", "72%", "58%", "44%", "30%"];
function funnelPage(d: ProposalDoc, ci: CiTokens): string {
  const f = d.funnel;
  const bar = (label: string, i: number) =>
    `<div style="display:flex;align-items:center;gap:9px;"><div style="width:20px;height:20px;border-radius:50%;background:${ci.iconDisc};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9.5px;flex-shrink:0;">${i + 1}</div><div style="width:${FUNNEL_WIDTHS[i] || "30%"};background:${ci.darkCard};border-radius:9px;padding:6px 12px;color:#FFFFFF;font-size:9.5px;font-weight:600;">${esc(label)}</div></div>`;
  const th = (t: string) => `<div style="padding:7px 12px;background:${ci.darkCard};color:#FFFFFF;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;font-size:8.5px;">${t}</div>`;
  const td = (t: string, bold: boolean) => `<div style="padding:7px 12px;border-top:1px solid #EEE8F5;color:${bold ? ci.body : ci.muted};${bold ? "font-weight:700;" : ""}">${esc(t)}</div>`;
  const rows = f.kpis.map((k) => td(k.metric, true) + td(k.why, false) + td(k.baseline, false)).join("");
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "09 · Funnel Economics and KPIs") + headline28(ci, { lead: "A precision funnel,", gradient: "measured against reality." })
    + `<p style="font-size:9.5px;line-height:1.55;color:${ci.muted};margin:8px 0 0;font-style:italic;">${esc(f.disclaimer)}</p>`
    + `<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">${f.bars.slice(0, 6).map(bar).join("")}</div>`
    + miniEyebrow(ci, "KPIs, agreed up front")
    + `<div style="display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:0;margin-top:8px;background:#FFFFFF;border-radius:14px;box-shadow:0 6px 18px ${ci.shadow};overflow:hidden;font-size:9px;line-height:1.45;">${th("Metric")}${th("Why it matters")}${th("Baseline and target")}${rows}</div>`
    + footerLight(ci, d.brand_short, 18));
}

// 19 GOVERNANCE (light). intro + 8 commitment cards (check disc) + the fixed compliance stack pills.
const SHIELD = `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .58-.91l7-3.5a1 1 0 0 1 .84 0l7 3.5A1 1 0 0 1 20 6Z"></path><path d="m9 12 2 2 4-4"></path>`;
function governancePage(d: ProposalDoc, ci: CiTokens): string {
  const card = (title: string, body: string) =>
    `<div style="background:#FFFFFF;border-radius:14px;padding:13px 17px;box-shadow:0 6px 18px ${ci.shadow};display:flex;gap:10px;align-items:flex-start;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ci.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M20 6 9 17l-5-5"></path></svg><div><div style="font-size:11px;font-weight:700;">${esc(title)}</div><div style="font-size:10px;line-height:1.55;color:${ci.muted};margin-top:3px;">${esc(body)}</div></div></div>`;
  // Pills in the BRAND accent (Gary, many times), white copy.
  const pill = (t: string) =>
    `<div style="display:flex;align-items:center;gap:7px;background:${ci.accent};border-radius:999px;padding:6px 12px;color:#FFFFFF;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.18);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${SHIELD}</svg><span style="font-size:7.8px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${t}</span></div>`;
  // The two compliance pillars a client wants to see, with real POPIA + GDPR hooks (Gary: these are the two main
  // drivers, make them comfortable). Fills the page and does the heavy lifting on trust.
  const pillar = (tag: string, title: string, points: string[]) =>
    `<div style="background:${ci.darkCard};border-radius:16px;padding:16px 18px;color:#FFFFFF;">`
    + `<div style="display:flex;align-items:center;gap:8px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${SHIELD}</svg><span style="font-size:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accentOnDark};">${tag}</span></div>`
    + `<div style="font-size:12px;font-weight:800;margin-top:6px;">${esc(title)}</div>`
    + `<ul style="margin:7px 0 0;padding-left:14px;font-size:9.3px;line-height:1.5;color:rgba(255,255,255,0.82);">${points.map((pt) => `<li style="margin-top:3px;">${esc(pt)}</li>`).join("")}</ul></div>`;
  const popia = pillar("POPIA · South Africa", "Compliant with the Protection of Personal Information Act", [
    "We process personal information lawfully under POPIA's eight conditions: consent, purpose limitation, data minimisation and security safeguards.",
    "Full data-subject rights honoured: access, correction, objection and deletion.",
    "As your operator we process only on your authority, and any security compromise is reported to you and the Information Regulator.",
    "Electronic direct marketing runs on consent, with a clear opt-out on every message.",
  ]);
  const gdpr = pillar("GDPR · International", "Aligned with the EU General Data Protection Regulation", [
    "A lawful basis for every processing activity, and consent that is freely given, specific and informed.",
    "The full rights, including erasure (right to be forgotten) and data portability.",
    "Personal-data breaches notified within 72 hours, and privacy by design and by default.",
    "Any cross-border transfer covered by Standard Contractual Clauses.",
  ]);
  return section(pageLight("48px 60px 34px"),
    eyebrow(ci, "09 · Governance") + headline(ci, { lead: "Trusted with data,", gradient: "by design." })
    + `<p style="font-size:11px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(d.governance.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">${popia}${gdpr}</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-top:12px;">${d.governance.commitments.slice(0, 6).map((c) => card(c.title, c.body)).join("")}</div>`
    + `<div style="margin-top:auto;background:#FFFFFF;border-radius:14px;padding:12px 18px;box-shadow:0 6px 18px ${ci.shadow};display:flex;align-items:center;gap:10px;justify-content:space-between;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accent};white-space:nowrap;">Compliance stack</div><div style="display:flex;gap:8px;flex-wrap:nowrap;">${["POPIA", "GDPR-aligned", "Platform policies", "Verified-claims register"].map(pill).join("")}</div></div>`
    + footerLight(ci, d.brand_short, 18));
}

// 20 "NO FINE PRINT" DIVIDER (dark). Fixed giant type + subhead + 4 chips; one client line.
function dealDividerPage(d: ProposalDoc, ci: CiTokens): string {
  const chips = ["Rate card", "Commercial terms", "One-page agreement", "Sign-off"]
    .map((t) => `<div style="background:${ci.accent};color:#FFFFFF;border-radius:999px;padding:7px 16px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;box-shadow:0 3px 10px rgba(0,0,0,0.28);">${t}</div>`).join("");
  return section(pageDark(ci, "56px 64px 44px", "position:relative;overflow:hidden;background:" + ci.darkCard + ";"),
    `<div style="position:absolute;right:-160px;top:-160px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,rgba(199,125,232,0) 70%);"></div>`
    + `<div style="font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};position:relative;">The Commercials</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;">`
    +   `<div style="font-size:84px;font-weight:800;line-height:0.98;letter-spacing:-0.02em;text-transform:uppercase;color:${ci.accentOnDark};">No Fine Print</div>`
    +   `<div style="font-size:36px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:18px;max-width:660px;">One tier. One page of terms.</div>`
    +   `<p style="font-size:14px;line-height:1.7;color:rgba(255,255,255,0.68);margin:16px 0 0;max-width:500px;">${esc(d.deal_divider)}</p>`
    + `</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:8px;position:relative;">${chips}</div>`
    + footerDark(d.brand_short, 19, "28px"));
}

// 21 INVESTMENT (light). The flat-retainer tier card (Dominate / Launch) - dark hero + 8 inclusion tiles + 3
// footnotes + honest para. (Bespoke uses a separate provincial-scale layout, added later per Gary's locked call.)
function investmentPage(d: ProposalDoc, ci: CiTokens): string {
  const iv = d.investment;
  const incl = (t: { title: string; pod_tag: string }) =>
    `<div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:10px 14px;display:flex;align-items:flex-start;gap:10px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M20 6 9 17l-5-5"></path></svg><div><div style="font-size:11px;font-weight:700;">${esc(t.title)}</div><div style="font-size:8.5px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.55);margin-top:2px;">${esc(t.pod_tag)}</div></div></div>`;
  const foot = (f: { label: string; body: string }) =>
    `<div style="background:${ci.tint};border-radius:14px;padding:12px 16px;"><div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentDeep};">${esc(f.label)}</div><div style="font-size:10.5px;line-height:1.55;color:${ci.body};margin-top:4px;">${esc(f.body)}</div></div>`;
  return section(pageLight("48px 60px 40px"),
    eyebrow(ci, "10 · Investment") + headline(ci, { lead: "The investment ·", gradient: `the ${iv.tier_name} system` })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(iv.intro)}</p>`
    + `<div style="margin-top:16px;background:${ci.darkPage};border-radius:18px;padding:22px 26px;color:#FFFFFF;position:relative;box-shadow:0 12px 30px rgba(46,26,74,0.28);">`
    +   `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div><div style="font-size:20px;font-weight:800;text-transform:uppercase;">${esc(iv.tier_name)}</div><div style="font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accentOnDark};margin-top:2px;">${esc(iv.tagline)}</div></div><div style="background:${ci.accentGrad};border-radius:999px;padding:6px 14px;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;white-space:nowrap;align-self:flex-start;">${esc(iv.poc_chip)}</div></div>`
    +   `<div style="display:flex;align-items:baseline;gap:14px;margin-top:8px;"><div style="font-size:58px;font-weight:800;letter-spacing:-0.02em;line-height:1;color:${ci.accentOnDark};">${esc(iv.price)}</div><div style="font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.65);line-height:1.5;">${esc(iv.price_unit).replace(/&lt;br\s*\/?&gt;/gi, "<br>")}</div></div>`
    +   `<p style="font-size:11px;line-height:1.65;color:rgba(255,255,255,0.75);margin:10px 0 0;">${esc(iv.body)}</p>`
    +   `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">${iv.inclusions.slice(0, 8).map(incl).join("")}</div>`
    + `</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px;">${iv.footnotes.slice(0, 3).map(foot).join("")}</div>`
    + `<p style="font-size:10px;line-height:1.6;color:${ci.muted};margin:12px 0 0;">${esc(iv.honest_para)}</p>`
    + footerLight(ci, d.brand_short, 20));
}

// 22 TERMS AND CLOSING (dark). 4 term cards + PoC-proves callout + 3 chips + logo footer.
function termsPage(d: ProposalDoc, ci: CiTokens): string {
  const t = d.terms;
  const glass = (label: string, body: string) =>
    `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.20);border-radius:16px;padding:16px 20px;"><div style="font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(label)}</div><p style="font-size:11.5px;line-height:1.65;color:rgba(255,255,255,0.85);margin:6px 0 0;">${esc(body)}</p></div>`;
  const chip = (t2: string, accent: boolean) => accent
    ? `<div style="background:${ci.accentGrad};border-radius:999px;padding:9px 20px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">${esc(t2)}</div>`
    : `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:9px 20px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">${esc(t2)}</div>`;
  // Always the clean white wordmark on the dark ground, never the raster logo (a boxed logo reads poorly, Gary). The
  // real logo appears only in the sign-off circle (page 24), on a white disc.
  const clientMark = `<span style="font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#FFFFFF;">${esc(d.client_name)}</span>`;
  return section(pageDark(ci, "52px 60px 44px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">11 · Commercial Terms and Next Steps</div>`
    + `<div style="font-size:30px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:12px;">We are not keeping pace with the future of marketing. <span style="color:${ci.accentOnDark};">We are writing its rulebook.</span></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px;">${glass("Validity", t.validity)}${glass("Engagement", t.engagement)}${glass("Media budget", t.media)}${glass("Ownership", t.ownership)}</div>`
    + `<div style="margin-top:20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:16px;padding:18px 22px;"><div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">What the proof of concept proves</div><p style="font-size:12px;line-height:1.7;color:rgba(255,255,255,0.85);margin:8px 0 0;">${esc(t.poc_proves)}</p></div>`
    + `<div style="display:flex;gap:10px;margin-top:auto;padding-top:20px;flex-wrap:nowrap;">${chip("Human Command. AI Execution.", true)}${chip("Eight integrated pods", false)}${chip("One closed-loop system", false)}</div>`
    + `<div style="margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.22);display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;align-items:center;gap:12px;"><div style="width:40px;height:40px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#FFFFFF;">GAS</div><div><div style="font-size:11px;font-weight:700;letter-spacing:0.06em;">GAS MARKETING AUTOMATION</div><div style="font-size:9px;letter-spacing:0.24em;color:${ci.accentOnDark};font-weight:600;">THE AGENCY OF NOW</div></div></div><div style="display:flex;align-items:center;gap:16px;">${clientMark}<span style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.55);">www.gasmarketing.co.za</span></div></div>`);
}

// 23 AGENCY AGREEMENT (light). 6 clause cards + dark closing strip. Clause titles are fixed; bodies carry the deal.
const CLAUSE_TITLES = ["1 · Engagement", "2 · Payment", "3 · Media spend", "4 · Ownership", "5 · Confidentiality and data", "6 · Exit"];
function agreementPage(d: ProposalDoc, ci: CiTokens): string {
  const clause = (title: string, body: string) =>
    `<div style="background:#FFFFFF;border-radius:16px;padding:16px 20px;box-shadow:0 6px 18px ${ci.shadow};"><div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accent};">${esc(title)}</div><div style="font-size:11px;line-height:1.6;color:${ci.body};margin-top:6px;">${esc(body)}</div></div>`;
  const cards = d.agreement.clauses.slice(0, 6).map((c, i) => clause(CLAUSE_TITLES[i] || c.title, c.body)).join("");
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "12 · Agency Agreement") + headline(ci, { lead: "Simple terms,", gradient: "in plain language." })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.muted};margin:12px 0 0;">${esc(d.agreement.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;flex:1;">${cards}</div>`
    + `<div style="margin-top:14px;background:${ci.darkPage};border-radius:16px;padding:16px 24px;color:#FFFFFF;display:flex;align-items:center;gap:16px;"><div style="width:34px;height:34px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></div><div style="font-size:11.5px;line-height:1.6;color:rgba(255,255,255,0.85);">That is the whole agreement: six clauses, one page. Deliberately simple, binding on signature, and written so a decision can be made in the room.</div></div>`);
}

// 24 SIGN-OFF (light). Two signature cards: client (data) + agency (fixed GAS/Gary Berman).
function signoffPage(d: ProposalDoc, ci: CiTokens): string {
  const s = d.signoff;
  // The client mark: their ACTUAL logo in the circle (Gary), rendered as a clean circular badge, a white disc with
  // the logo CONTAINED and padded so it sits neatly inside the circle instead of letterboxing into a strip. Only when
  // there is no logo do we fall back to a monogram circle (the initial of the first significant word, skipping "The").
  const clientInitial = ((d.client_name.trim().replace(/^(the|a|an)\s+/i, "")[0] || d.client_name.trim()[0] || "•")).toUpperCase();
  const clientMark = d.client_logo
    ? `<div style="width:36px;height:36px;border-radius:50%;background:#FFFFFF;box-shadow:inset 0 0 0 1px rgba(26,16,48,0.12);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;"><img src="${esc(d.client_logo.src)}" alt="${esc(d.client_name)}" style="max-width:76%;max-height:76%;object-fit:contain;display:block;"></div>`
    : `<div style="width:36px;height:36px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;font-size:14px;flex-shrink:0;">${esc(clientInitial)}</div>`;
  const sigRule = `<div style="margin-top:26px;"><div style="border-bottom:1.5px solid rgba(26,16,48,0.35);height:34px;"></div><div style="display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ci.muted};margin-top:6px;"><span>Signature</span><span>Date</span></div></div>`;
  const clientCard = `<div style="background:#FFFFFF;border-radius:18px;padding:22px 24px;box-shadow:0 8px 22px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};">For the client</div>`
    + `<div style="font-size:16px;font-weight:800;text-transform:uppercase;margin-top:6px;">${esc(d.client_name)}</div>`
    + `<div style="margin-top:14px;"><div style="font-size:13px;font-weight:700;">Authorised Signatory</div><div style="font-size:11px;color:${ci.muted};margin-top:2px;">${esc(s.client.signatory_label)}</div></div>`
    + `<div style="font-size:10.5px;line-height:1.8;color:${ci.muted};margin-top:10px;min-height:76px;">${s.client.contacts.map((c) => `<div>${esc(c)}</div>`).join("")}</div>`
    + sigRule
    + `<div style="margin-top:auto;padding-top:14px;display:flex;align-items:center;gap:10px;">${clientMark}<div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:${ci.muted};">${esc(s.client.tagline)}</div></div></div>`;
  const agencyCard = `<div style="background:#FFFFFF;border-radius:18px;padding:22px 24px;color:#1A1030;box-shadow:0 8px 22px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};">For the agency</div>`
    + `<div style="font-size:16px;font-weight:800;text-transform:uppercase;margin-top:6px;">GAS Marketing Automation</div>`
    + `<div style="margin-top:14px;"><div style="font-size:13px;font-weight:700;">Gary Berman</div><div style="font-size:11px;color:${ci.muted};margin-top:2px;">Managing Director</div></div>`
    + `<div style="font-size:10.5px;line-height:1.8;color:${ci.muted};margin-top:10px;min-height:76px;"><div>Cell: 082 566 3708</div><div>Email: gary@gasmarketing.co.za</div><div>www.gasmarketing.co.za</div></div>`
    + sigRule
    + `<div style="margin-top:auto;padding-top:14px;display:flex;align-items:center;gap:10px;"><div style="width:32px;height:32px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#FFFFFF;">GAS</div><div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:${ci.muted};">Human Command. AI Execution.</div></div></div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "14 · Acceptance and Sign-off") + headline(ci, { lead: "Agreement", gradient: "and sign-off" })
    + `<p style="font-size:12px;line-height:1.7;color:${ci.body};margin:14px 0 0;">${esc(s.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;align-items:stretch;">${clientCard}${agencyCard}</div>`
    + footerLight(ci, d.brand_short, 23));
}

// ── document shell ────────────────────────────────────────────────────────────────────────────────────────────

// Assemble the full HTML document: Poppins from Google Fonts, one fixed A4 page box per section, print geometry.
export function renderProposalHtml(d: ProposalDoc, ci: CiTokens = deriveCiTokens()): string {
  const pages = [
    coverPage(d, ci), execPage(d, ci), opportunityPage(d, ci), strategyPage(d, ci), marketPage(d, ci),
    philosophyPage(d, ci), ecosystemPage(d, ci), dividerPage(d, ci),
    pods12Page(d, ci), audiencePage(d, ci), targetingPage(d, ci),
    creativePage(d, ci), channelsPage(d, ci), psiPage(d, ci), pods78Page(d, ci),
    closedLoopPage(d, ci), rolloutPage(d, ci), governancePage(d, ci), dealDividerPage(d, ci),
    investmentPage(d, ci), termsPage(d, ci), agreementPage(d, ci), signoffPage(d, ci),
  ].join("\n");
  return docShell(pages);
}

// The shared HTML document shell (Poppins, A4 page boxes, print geometry). Both renderers use it.
function docShell(pages: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">`
    + `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
    + `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">`
    + `<style>*{margin:0;padding:0;box-sizing:border-box}`
    + `html,body{background:#2A2140}`
    + `.page{width:${A4_W}px;height:${A4_H}px;overflow:hidden;position:relative;margin:0 auto}`
    + `@page{size:${A4_W}px ${A4_H}px;margin:0}`
    + `@media print{.page{break-after:page;margin:0}}`
    + `</style></head><body>${pages}</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SHARPENED DECK (Gary): a punchy, funnel-styled, ≤15-page cut of the same content. Where the full deck is the
// comprehensive 23-page reference, this is the short, visual, "reads like our funnel" version — it MERGES pages and
// leans into signature funnel visuals (intent gauge, proportional funnel, FB ad mock, live dashboard) while keeping
// the pertinent detail. Eyebrows drop the section numbers (cleaner, funnel-like); footers number sequentially.
// It reuses every shared primitive + the SAME ProposalDoc, so `content` drives both renderers.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// A semicircular intent-score gauge (the PSI signature). Score is illustrative (marked so). Arc computed with Math.
function intentGauge(ci: CiTokens, score: number): string {
  const s = Math.max(0, Math.min(100, score));
  const cx = 100, cy = 100, r = 78;
  const theta = Math.PI * (s / 100);
  const ex = (cx - r * Math.cos(theta)).toFixed(1);
  const ey = (cy - r * Math.sin(theta)).toFixed(1);
  return `<div style="position:relative;width:200px;height:116px;margin:0 auto;">`
    + `<svg width="200" height="116" viewBox="0 0 200 116">`
    +   `<path d="M22 100 A78 78 0 0 1 178 100" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="13" stroke-linecap="round"></path>`
    +   `<path d="M22 100 A78 78 0 0 1 ${ex} ${ey}" fill="none" stroke="${ci.accentOnDark}" stroke-width="13" stroke-linecap="round"></path>`
    + `</svg>`
    + `<div style="position:absolute;left:0;right:0;top:50px;text-align:center;"><div style="font-size:38px;font-weight:800;line-height:1;color:#FFFFFF;">${s}</div>`
    +   `<div style="font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentOnDark};font-weight:700;margin-top:3px;">Intent score</div></div></div>`;
}

// A signal bar (what builds the score). pct illustrative.
const signalBar = (ci: CiTokens, label: string, pct: number) =>
  `<div style="margin-top:9px;"><div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,0.8);margin-bottom:3px;"><span>${esc(label)}</span><span style="color:${ci.accentOnDark};font-weight:700;">${pct}</span></div>`
  + `<div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.12);overflow:hidden;"><div style="height:6px;width:${pct}%;border-radius:999px;background:${ci.accentGrad};"></div></div></div>`;

// Sharp-deck footers: the brand line left, the PAGE NUMBER far right (Gary: page number, not the client name). The
// ##PG## sentinel is replaced with the sequential "NN / total" in renderProposalHtmlSharp, so reordering never needs
// hand-renumbering. `brand` is accepted for signature stability but no longer shown.
const sFootLight = (ci: CiTokens, _brand: string) =>
  `<div style="margin-top:auto;padding-top:14px;border-top:1px solid rgba(26,16,48,0.12);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${ci.muted};"><span>GAS Marketing Automation · The Agency of NOW</span><span class="tabular">##PG##</span></div>`;
const sFootDark = (_brand: string, mt = "14px") =>
  `<div style="margin-top:${mt};padding-top:14px;border-top:1px solid rgba(255,255,255,0.22);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.55);"><span>GAS Marketing Automation · The Agency of NOW</span><span class="tabular">##PG##</span></div>`;

// ── S01 COVER (dark) — same wedge cover, sequential footer ────────────────────────────────────────────────────
function sCoverPage(d: ProposalDoc, ci: CiTokens): string {
  const logo = `<div style="margin-left:auto;font-weight:800;font-size:19px;letter-spacing:0.08em;text-transform:uppercase;color:#FFFFFF;">${esc(d.client_name)}</div>`;
  return `<section class="page" style="${pageDark(ci, "56px 64px 44px", "position:relative;overflow:hidden;")}">`
    + `<div style="position:absolute;right:-180px;top:-180px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,transparent 70%);"></div>`
    + `<div style="display:flex;align-items:center;gap:14px;position:relative;">${gasLockup(ci, true)}${logo}</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;">`
    +   `<div style="font-size:11px;font-weight:600;letter-spacing:0.28em;color:${ci.accentOnDark};text-transform:uppercase;margin-bottom:18px;">Growth Proposal · Strictly Confidential</div>`
    +   `<div style="font-size:46px;font-weight:800;line-height:1.0;text-transform:uppercase;letter-spacing:-0.01em;max-width:660px;">${esc(d.cover.headline.lead)} <span style="color:${ci.accentOnDark};">${esc(d.cover.headline.gradient)}</span></div>`
    +   `<p style="margin:22px 0 0;font-size:15px;line-height:1.65;color:rgba(255,255,255,0.72);max-width:560px;">${esc(d.cover.summary)}</p>`
    + `</div>`
    + `<div style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;position:relative;">`
    +   `<div style="box-sizing:border-box;flex:0 1 auto;min-width:0;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.20);border-radius:16px;padding:8px 16px;font-size:10.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;line-height:1.4;">${esc(d.cover.audience_chip)}</div>`
    +   `<div style="box-sizing:border-box;flex-shrink:0;background:${ci.accentGrad};border-radius:999px;padding:8px 16px;font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;">${esc(d.date_label)} · ${esc(d.validity_label)}</div>`
    + `</div>`
    + `<div style="margin-top:32px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.22);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.55);"><span>GAS Marketing Automation · The Agency of Now</span><span>Human Command. AI Execution.</span></div>`
    + `</section>`;
}

// ── S03 THE OPPORTUNITY (light) — six sourced big-number stat cards + the definition of success ────────────────
function sOpportunityPage(d: ProposalDoc, ci: CiTokens): string {
  const cards = d.opportunity.stat_cards.slice(0, 6);
  const heroes = cards.slice(0, 2);
  const rest = cards.slice(2, 6);
  // Keep the strategic setup copy: up to two paras lead the page, the rest of the argument lives in the stats.
  const paras = d.opportunity.paras.slice(0, 2).map((p, i) =>
    `<p style="font-size:${i === 0 ? "12px" : "11px"};line-height:1.7;color:${ci.body};margin:${i === 0 ? "12px" : "8px"} 0 0;">${esc(p)}</p>`).join("");
  // The signature: the two headline numbers rendered oversized (46px accent numerals), the icon top-left, the number
  // and its meaning centred so the card fills its height cleanly, and the source pinned to the card floor.
  const heroCard = (s: StatCard) =>
    `<div style="background:#FFFFFF;border-radius:18px;padding:22px 24px;box-shadow:0 6px 18px ${ci.shadow};height:100%;display:flex;flex-direction:column;">`
    + `<div>${disc(ci, 40, s.icon)}</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:16px 0;">`
    +   `<div style="font-size:46px;font-weight:800;line-height:1.0;letter-spacing:-0.01em;color:${ci.accent};">${esc(s.stat)}</div>`
    +   `<div style="font-size:11px;line-height:1.55;color:${ci.body};margin-top:12px;">${esc(s.body)}</div>`
    + `</div>`
    + `<div style="padding-top:12px;border-top:1px solid rgba(26,16,48,0.08);font-size:8px;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};">${esc(s.source)}</div>`
    + `</div>`;
  // The wider signals: the remaining stats as one unified ledger strip (not four floating equal cards), each cell a
  // 30px accent numeral over its meaning, divided by hairlines, sources flush on the floor via margin-top:auto.
  const ledgerCell = (s: StatCard, i: number) =>
    `<div style="padding:2px 18px;${i > 0 ? "border-left:1px solid rgba(26,16,48,0.08);" : ""}display:flex;flex-direction:column;">`
    + `<div>${disc(ci, 24, s.icon)}</div>`
    + `<div style="font-size:30px;font-weight:800;line-height:1.0;letter-spacing:-0.01em;color:${ci.accent};margin-top:11px;">${esc(s.stat)}</div>`
    + `<div style="font-size:9px;line-height:1.5;color:${ci.muted};margin-top:8px;">${esc(s.body)}</div>`
    + `<div style="margin-top:auto;padding-top:10px;font-size:7.5px;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};">${esc(s.source)}</div>`
    + `</div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "The Opportunity") + headline(ci, d.opportunity.headline) + paras
    // The hero pair grows to consume slack (flex:1) so the page fills top-to-bottom with the oversized numerals.
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;flex:1;align-items:stretch;">${heroes.map(heroCard).join("")}</div>`
    + (rest.length
        ? miniEyebrow(ci, "The wider signals", "16px")
          + `<div style="background:#FFFFFF;border-radius:16px;padding:16px 6px;box-shadow:0 6px 18px ${ci.shadow};margin-top:9px;display:grid;grid-template-columns:repeat(${rest.length}, 1fr);align-items:stretch;">${rest.map(ledgerCell).join("")}</div>`
        : "")
    // The one dark element: the definition of success, bottom-anchored as a closing band.
    + `<div style="margin-top:14px;background:${ci.darkCard};border-radius:16px;padding:18px 24px;color:#FFFFFF;">`
    +   `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">The definition of success</div>`
    +   `<div style="font-size:12px;line-height:1.65;margin-top:6px;color:rgba(255,255,255,0.9);">${esc(d.opportunity.success_body)}</div></div>`
    + sFootLight(ci, d.brand_short));
}

// ── S02 EXECUTIVE SUMMARY (light) — intro + 4 cards + the fixed journey strip ──────────────────────────────────
function sExecPage(d: ProposalDoc, ci: CiTokens): string {
  // Signature: a numbered VALUE LADDER, not a 2x2 of white cards. Each of the four exec cards becomes a full-width
  // rung welding a dark numeral plate (the mandated single dark element on a light page) to a white content card.
  // The four dark plates stack into a vertical dark spine down the left edge, the ladder's rail and the deck's
  // dark/light rhythm echo in one move. The rung grid takes flex:1 with equal 1fr rows so it consumes all vertical
  // slack; the white body vertically centres its content so a stretched rung reads as deliberate air, not a void.
  const rungs = d.exec.cards.slice(0, 4).map((c, i) =>
    `<div style="display:flex;align-items:stretch;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="width:64px;flex-shrink:0;background:${ci.darkCard};display:flex;align-items:center;justify-content:center;">`
    +   `<div style="font-size:30px;font-weight:800;line-height:1;letter-spacing:-0.02em;color:${ci.accentOnDark};">0${i + 1}</div></div>`
    + `<div style="flex:1;min-width:0;background:#FFFFFF;padding:16px 20px;display:flex;flex-direction:column;justify-content:center;">`
    +   `<div style="display:flex;align-items:center;gap:11px;">${disc(ci, 34, c.icon)}<div style="font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;line-height:1.15;">${esc(c.title)}</div></div>`
    +   `<p style="font-size:10.5px;line-height:1.6;color:${ci.muted};margin:7px 0 0;">${esc(c.body)}</p>`
    + `</div></div>`).join("");
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Executive Summary") + headline(ci, d.exec.headline)
    + `<p style="font-size:11.5px;line-height:1.7;color:${ci.body};margin:12px 0 0;">${esc(d.exec.intro)}</p>`
    + `<div style="display:grid;grid-template-rows:repeat(4,1fr);gap:12px;margin-top:16px;flex:1;">${rungs}</div>`
    + journeyStrip(ci) + sFootLight(ci, d.brand_short));
}

// ── S04 MARKET INTELLIGENCE (light) — intro + six "what we do about it" recommendation cards ───────────────────
function sMarketPage(d: ProposalDoc, ci: CiTokens): string {
  const m = d.market;
  const acts = m.actions.slice(0, 6);
  const quotes = (m.quotes || []).slice(0, 3);

  // LEFT — the market reality: a headline split-bar comparison + the sourced evidence lines that back it.
  const bar = (label: string, pct: string, width: string, primary: boolean) =>
    `<div style="margin-top:${primary ? "0" : "13px"};">`
    + `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">`
    +   `<span style="font-size:9px;font-weight:600;letter-spacing:0.06em;color:rgba(255,255,255,0.82);">${esc(label)}</span>`
    +   `<span style="font-size:19px;font-weight:800;line-height:1;color:${primary ? ci.accentOnDark : "rgba(255,255,255,0.5)"};">${esc(pct)}</span></div>`
    + `<div style="margin-top:6px;height:8px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden;">`
    +   `<div style="height:100%;width:${esc(width)};border-radius:999px;background:${primary ? ci.accentGrad : "rgba(255,255,255,0.22)"};"></div></div></div>`;
  const evidence = (q: { body: string; source: string }, i: number) =>
    `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:11px 0;${i ? `border-top:1px solid rgba(255,255,255,0.12);` : ""}">`
    + `<div style="font-size:10px;line-height:1.5;color:rgba(255,255,255,0.85);">${esc(q.body)}</div>`
    + `<div style="display:flex;align-items:center;gap:6px;font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ci.accentOnDark};margin-top:6px;">`
    +   `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${BOOK}</svg>${esc(q.source)}</div></div>`;
  const reality = `<div style="background:${ci.darkCard};border-radius:18px;padding:20px 22px;color:#FFFFFF;display:flex;flex-direction:column;height:100%;">`
    + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">What the market is telling us</div>`
    + `<div style="margin-top:16px;">${bar(m.split.left_label, m.split.left_pct, m.split.left_width, true)}${bar(m.split.right_label, m.split.right_pct, m.split.right_width, false)}`
    +   `<div style="font-size:8.5px;line-height:1.5;color:rgba(255,255,255,0.6);margin-top:11px;">${esc(m.split.caption)}</div></div>`
    + (quotes.length
        ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.14);flex:1;display:flex;flex-direction:column;">`
          + `<div style="font-size:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.5);">The evidence on record</div>`
          + `<div style="flex:1;display:flex;flex-direction:column;margin-top:2px;">${quotes.map(evidence).join("")}</div></div>`
        : "")
    + `</div>`;

  // RIGHT — our move: the six actions as a numbered ledger, equal flex rows so the column fills flush.
  const moveRow = (a: { title: string; body: string }, i: number) =>
    `<div style="flex:1;display:flex;align-items:center;gap:13px;padding:10px 0;${i ? `border-top:1px solid #EEE8F5;` : ""}">`
    + `<div style="font-size:19px;font-weight:800;line-height:1;color:${ci.accent};width:26px;flex-shrink:0;">${String(i + 1).padStart(2, "0")}</div>`
    + `<div style="min-width:0;"><div style="font-size:11px;font-weight:700;line-height:1.3;">${esc(a.title)}</div>`
    +   `<div style="font-size:10px;line-height:1.5;color:${ci.muted};margin-top:2px;">${esc(a.body)}</div></div></div>`;
  const moves = `<div style="background:#FFFFFF;border-radius:18px;padding:20px 22px;box-shadow:0 6px 18px ${ci.shadow};display:flex;flex-direction:column;height:100%;">`
    + `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">`
    +   `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">What we do about it</div>`
    +   `<div style="display:flex;align-items:center;gap:6px;font-size:7.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ci.muted};">${acts.length} plays${flowArrow(ci, 13)}</div></div>`
    + `<div style="flex:1;display:flex;flex-direction:column;margin-top:4px;">${acts.map(moveRow).join("")}</div></div>`;

  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Market Intelligence") + headline(ci, m.headline)
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(m.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:0.92fr 1.08fr;gap:14px;margin-top:16px;flex:1;align-items:stretch;">${reality}${moves}</div>`
    + sFootLight(ci, d.brand_short));
}

// ── S05 COMPETITIVE POSITIONING (light) — the positioning map + the named competitor set ──────────────────────
function sCompetitorsPage(d: ProposalDoc, ci: CiTokens): string {
  const m = d.pods12.map;
  const rivals = m.competitors.length;
  const setN = m.set ? m.set.length : 0;
  const axisLbl = (pos: string, t: string) =>
    `<div style="position:absolute;${pos}font-size:7.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8A8496;line-height:1.3;">${esc(t)}</div>`;
  // Muted rival dots (neutral #B7AECB), name + note, vertically centred on their coordinate.
  const compDot = (c: { name: string; note: string; left: string; top: string }) =>
    `<div style="position:absolute;left:${c.left};top:${c.top};transform:translateY(-50%);display:flex;align-items:center;gap:6px;">`
    + `<div style="width:10px;height:10px;border-radius:50%;background:#B7AECB;flex-shrink:0;box-shadow:0 0 0 3px rgba(183,174,203,0.18);"></div>`
    + `<div style="font-size:9px;font-weight:700;color:${ci.muted};white-space:nowrap;">${esc(c.name)} <span style="font-weight:400;">· ${esc(c.note)}</span></div></div>`;
  // The client dot GLOWING: iconDisc radial + glow halo + a soft accent ring.
  const clientDot =
    `<div style="position:absolute;left:${m.client.left};top:${m.client.top};transform:translateY(-50%);display:flex;align-items:center;gap:8px;z-index:2;">`
    + `<div style="position:relative;width:16px;height:16px;flex-shrink:0;">`
    +   `<div style="position:absolute;inset:-7px;border-radius:50%;border:1.5px solid ${ci.accent};opacity:0.35;"></div>`
    +   `<div style="position:absolute;inset:0;border-radius:50%;background:${ci.iconDisc};box-shadow:0 0 14px ${ci.glow};"></div></div>`
    + `<div style="font-size:10.5px;font-weight:800;color:${ci.accentDeep};white-space:nowrap;">${esc(m.client.name)} <span style="font-weight:500;color:${ci.muted};">· ${esc(m.client.note)}</span></div></div>`;

  const legend =
    `<div style="display:flex;align-items:center;gap:16px;flex-shrink:0;">`
    + `<div style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#B7AECB;"></span><span style="font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ci.muted};">${rivals} rivals</span></div>`
    + `<div style="display:flex;align-items:center;gap:6px;"><span style="width:11px;height:11px;border-radius:50%;background:${ci.iconDisc};box-shadow:0 0 8px ${ci.glow};"></span><span style="font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accentDeep};">${esc(d.client_name)}</span></div></div>`;

  // The growth block: a proper framed 2x2 quadrant with a soft dashed crosshair. flex:1 consumes page slack.
  const mapCard =
    `<div style="margin-top:16px;flex:1;min-height:0;background:#FFFFFF;border-radius:18px;padding:18px 22px;box-shadow:0 6px 18px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;">`
    +   `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">${esc(m.title)}</div>${legend}</div>`
    + `<div style="position:relative;flex:1;min-height:0;margin-top:14px;">`
    +   axisLbl("top:0;left:64px;right:64px;text-align:center;", m.y_top)
    +   axisLbl("bottom:0;left:64px;right:64px;text-align:center;", m.y_bottom)
    +   axisLbl("left:0;top:50%;transform:translateY(-50%);width:58px;text-align:center;", m.x_left)
    +   axisLbl("right:0;top:50%;transform:translateY(-50%);width:58px;text-align:center;", m.x_right)
    +   `<div style="position:absolute;top:16px;bottom:16px;left:64px;right:64px;border:1px solid #ECE6F3;border-radius:8px;">`
    +     `<div style="position:absolute;left:50%;top:0;bottom:0;width:0;border-left:1px dashed #E4DEEF;"></div>`
    +     `<div style="position:absolute;top:50%;left:0;right:0;height:0;border-top:1px dashed #E4DEEF;"></div>`
    +     m.competitors.map(compDot).join("") + clientDot
    +   `</div></div></div>`;

  // The one dark anchor, pinned to the foot: the named set as chips + the strategic evidence line.
  const chips = (m.set || []).map((n) =>
    `<span style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:5px 13px;font-size:9.5px;font-weight:600;color:#FFFFFF;">${esc(n)}</span>`).join("");
  const darkStrip =
    `<div style="margin-top:14px;background:${ci.darkCard};border-radius:16px;padding:16px 22px;color:#FFFFFF;">`
    + `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">`
    +   `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">The named competitor set</div>`
    +   (setN ? `<div style="font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${setN} tracked</div>` : "")
    + `</div>`
    + (setN ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:11px;">${chips}</div>` : "")
    + `<div style="font-size:10.5px;line-height:1.6;color:rgba(255,255,255,0.82);margin-top:13px;">The direct and adjacent rivals the Researcher tracks. Every targeting and message decision is checked against this set, so ${esc(d.client_name)} moves on evidence, not assumption.</div></div>`;

  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Competitive Positioning") + headline(ci, { lead: "Where you win,", gradient: "and who you beat" })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">We plot every rival on the two axes that decide this category, then place ${esc(d.client_name)} where demand is strongest and the competition is thinnest.</p>`
    + mapCard + darkStrip + sFootLight(ci, d.brand_short));
}

// ── S03 WHY WE WIN (light) — the wedge + argument + 4 proofs + the belief→buy→outcome flow ─────────────────────
function sEdgePage(d: ProposalDoc, ci: CiTokens): string {
  const proofs = d.strategy.proof_cards.slice(0, 6).map((c) => proofCard(ci, c.title, c.body)).join("");
  const node = (icon: string, label: string, sub: string) =>
    `<div style="display:flex;align-items:center;gap:9px;">${disc(ci, 30, icon)}<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${esc(label)}</div><div style="font-size:8.5px;color:${ci.muted};line-height:1.4;">${esc(sub)}</div></div></div>`;
  const flow = stripCard(ci, "How the argument lands",
    node(MIC, "Reason to believe", d.strategy.flow.believe) + flowArrow(ci, 15)
    + node(CHECK, "Reason to buy", d.strategy.flow.buy) + flowArrow(ci, 15)
    + node(CIRCLE_DOLLAR, "Commercial outcome", d.strategy.flow.outcome), "14px");
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Why We Win") + headline(ci, d.strategy.headline)
    + darkBox(ci, "The single-minded wedge", d.strategy.wedge_body)
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:14px 0 0;">${esc(d.strategy.argument)}</p>`
    + miniEyebrow(ci, "Why this wedge wins", "16px")
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">${proofs}</div>`
    + flow + sFootLight(ci, d.brand_short));
}

// ── S04 ONE CLOSED-LOOP SYSTEM (dark) — the six-step wheel (shared loop constants) ─────────────────────────────
function sSystemPage(d: ProposalDoc, ci: CiTokens): string {
  const arrow = (a: { left: number; top: number; rot: number }) =>
    `<div style="position:absolute;left:${a.left}px;top:${a.top}px;transform:translate(-50%,-50%) rotate(${a.rot}deg);width:26px;height:26px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px ${ci.glow};"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></div>`;
  const stepCard = (s: { left: number; top: number; title: string; sub: string }, i: number) =>
    `<div style="position:absolute;left:${s.left}px;top:${s.top}px;transform:translate(-50%,-50%);width:172px;background:${ci.darkCard};border:1px solid ${ci.glow};border-radius:14px;padding:10px 12px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.35);"><div style="font-size:9px;font-weight:600;letter-spacing:0.18em;color:${ci.accentOnDark};">STEP ${i + 1}</div><div style="font-size:12px;font-weight:700;margin-top:2px;line-height:1.3;">${esc(s.title)}</div><div style="font-size:9.5px;color:rgba(255,255,255,0.65);line-height:1.4;margin-top:2px;">${esc(i === 4 && d.closedloop.step5_sub ? d.closedloop.step5_sub : s.sub)}</div></div>`;
  return section(pageDark(ci, "52px 60px 40px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">The System</div>`
    + `<div style="font-size:30px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:10px;">One closed-loop <span style="color:${ci.accentOnDark};">growth system</span></div>`
    + `<p style="font-size:12.5px;line-height:1.7;color:rgba(255,255,255,0.75);margin:14px 0 0;">${esc(d.closedloop.intro)}</p>`
    + `<div style="flex:1;display:flex;align-items:center;justify-content:center;margin-top:6px;"><div style="position:relative;width:620px;height:620px;">`
    +   `<svg width="620" height="620" viewBox="0 0 620 620" style="position:absolute;inset:0;"><circle cx="310" cy="310" r="225" fill="none" stroke="${ci.glow}" stroke-width="2" stroke-dasharray="3 7"></circle></svg>`
    +   LOOP_ARROWS.map(arrow).join("") + LOOP_STEPS.map(stepCard).join("")
    +   `<div style="position:absolute;left:310px;top:284px;transform:translate(-50%,-50%);width:236px;height:236px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,transparent 70%);"></div>`
    +   `<div style="position:absolute;left:310px;top:284px;transform:translate(-50%,-50%);width:89px;height:89px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:25px;color:#FFFFFF;box-shadow:0 0 44px ${ci.glow},0 0 0 6px rgba(255,255,255,0.08);">GAS</div>`
    +   `<div style="position:absolute;left:310px;top:346px;transform:translateX(-50%);width:220px;text-align:center;"><div style="font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">The Agency of NOW</div><div style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;color:${ci.accentOnDark};">From Interest to Intent</div></div>`
    + `</div></div>`
    + `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:16px;padding:14px 20px;margin-bottom:22px;"><p style="font-size:11px;line-height:1.65;margin:0;color:rgba(255,255,255,0.82);"><strong style="color:${ci.accentOnDark};">The compounding mechanism.</strong> ${esc(d.closedloop.compounding)}</p></div>`
    + sFootDark(d.brand_short));
}

// ── S05 THE AUDIENCE (light) — 4 personas + geo + the targeting matrix ────────────────────────────────────────
function sAudiencePage(d: ProposalDoc, ci: CiTokens): string {
  // Lucide map-pin, used for the geo disc (paths only; disc() supplies the radial + stroke).
  const MAP_PIN = `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>`;
  // A rich persona "dossier" card: 40px avatar disc + name, an oversized accent pull-quote as the hero, and the
  // geography pinned to the card floor so the four cards align across the row.
  const persona = (p: { icon: string; name: string; geo: string; quote: string }) =>
    `<div style="background:#FFFFFF;border-radius:16px;padding:15px 18px;box-shadow:0 6px 18px ${ci.shadow};display:flex;flex-direction:column;height:100%;">`
    + `<div style="display:flex;align-items:center;gap:11px;">${disc(ci, 38, p.icon)}<div style="flex:1;min-width:0;font-size:12.5px;font-weight:800;line-height:1.15;">${esc(p.name)}</div></div>`
    + `<div style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;">`
    +   `<span style="font-size:26px;font-weight:800;line-height:0.7;color:${ci.accentDeep};flex-shrink:0;">&ldquo;</span>`
    +   `<div style="font-size:10.5px;line-height:1.55;color:${ci.body};font-style:italic;">${esc(p.quote)}&rdquo;</div></div>`
    + `<div style="margin-top:auto;padding-top:11px;border-top:1px solid rgba(26,16,48,0.10);display:flex;align-items:center;gap:7px;">`
    +   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${ci.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${MAP_PIN}</svg>`
    +   `<span style="font-size:8.5px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accent};">${esc(p.geo)}</span></div></div>`;
  const geoChip = (c: { label: string; accent: boolean }) =>
    `<span style="background:${c.accent ? ci.accent : ci.tint};color:${c.accent ? "#FFFFFF" : ci.accentDeep};border-radius:999px;padding:5px 13px;font-size:9.5px;font-weight:600;">${esc(c.label)}</span>`;
  const geoStrip = `<div style="margin-top:14px;background:#FFFFFF;border-radius:16px;padding:13px 18px;box-shadow:0 6px 18px ${ci.shadow};display:flex;align-items:center;gap:14px;">`
    + disc(ci, 26, MAP_PIN)
    + `<div style="flex-shrink:0;max-width:120px;font-size:8.5px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${ci.muted};line-height:1.35;">${esc(d.audience.geo_label)}</div>`
    + `<div style="flex:1;display:flex;flex-wrap:wrap;gap:7px;">${d.audience.geo_chips.map(geoChip).join("")}</div></div>`;
  // The strategic notes the client needs: how we reach them (the trigger-moment discipline) and the targeting blueprint.
  const note = (label: string, body: string) =>
    `<div style="background:${ci.tint};border-radius:14px;padding:13px 16px;"><div style="font-size:8.5px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accentDeep};">${label}</div><div style="font-size:9.5px;line-height:1.55;color:${ci.body};margin-top:5px;">${esc(body)}</div></div>`;
  const notes = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">${note("How we reach them", d.audience.discipline_note)}${note("The targeting blueprint", d.audience.blueprint_note)}</div>`;
  // The signature device: budget lean as a true proportional stacked bar on a dark ground (the page's dark anchor),
  // pinned to the base via margin-top:auto. The primary lane is accent; the rest neutral-on-dark whites (never a
  // second lilac). A weighted legend restates each lane's share as a percentage of total spend.
  const budgets = (d.audience.budget || []).slice(0, 3);
  const totalFlex = budgets.reduce((s, b) => s + (b.flex || 1), 0) || 1;
  const segFill = [ci.accentGrad, "rgba(255,255,255,0.30)", "rgba(255,255,255,0.15)"];
  const dotFill = [ci.accentOnDark, "rgba(255,255,255,0.55)", "rgba(255,255,255,0.30)"];
  const bar = `<div style="display:flex;gap:4px;height:16px;margin-top:13px;">`
    + budgets.map((b, i) => `<div style="flex:${b.flex || 1};background:${segFill[i] || segFill[2]};border-radius:5px;"></div>`).join("") + `</div>`;
  const legend = `<div style="display:grid;grid-template-columns:repeat(${budgets.length || 1},1fr);gap:16px;margin-top:13px;">`
    + budgets.map((b, i) => {
        const pct = Math.round(((b.flex || 1) / totalFlex) * 100);
        return `<div><div style="display:flex;align-items:center;gap:7px;"><span style="width:9px;height:9px;border-radius:2px;background:${dotFill[i] || dotFill[2]};flex-shrink:0;"></span><span style="font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#FFFFFF;">${esc(b.label)}</span><span style="margin-left:auto;font-size:12px;font-weight:800;color:${ci.accentOnDark};">${pct}%</span></div><div style="font-size:9.5px;line-height:1.5;color:rgba(255,255,255,0.72);margin-top:5px;">${esc(b.body)}</div></div>`;
      }).join("") + `</div>`;
  const budgetBlock = budgets.length
    ? `<div style="margin-top:auto;background:${ci.darkCard};border-radius:18px;padding:18px 22px;color:#FFFFFF;"><div style="display:flex;align-items:baseline;gap:10px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">Where the budget leans</div><div style="margin-left:auto;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Weighted to the highest-intent segments</div></div>${bar}${legend}</div>`
    : "";
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "The Audience") + headline(ci, d.audience.headline)
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(d.audience.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;align-items:stretch;">${d.audience.personas.slice(0, 4).map(persona).join("")}</div>`
    + geoStrip + notes + budgetBlock + sFootLight(ci, d.brand_short));
}

// ── S10 TARGETING (light) — the segment rows + the who-leads-on-which-channel matrix ──────────────────────────
function sTargetingPage(d: ProposalDoc, ci: CiTokens): string {
  const t = d.targeting;
  const mx = t.matrix;
  const N = Math.max(1, mx.channels.length);
  const cols = `minmax(96px,1.5fr) repeat(${N}, 1fr)`;

  // The segment rows: who each persona is and where we buy them. Light context cards in a stretched 2-up grid,
  // pinned to equal height (align-items:stretch + height:100%) so a short and a long persona sit flush.
  const seg = (r: { name: string; platforms: string; segments: { label: string; text: string }[] }) =>
    `<div style="background:#FFFFFF;border-radius:14px;padding:13px 16px;box-shadow:0 6px 18px ${ci.shadow};height:100%;display:flex;flex-direction:column;">`
    + `<div style="display:flex;align-items:baseline;gap:8px;"><div style="font-size:12px;font-weight:800;">${esc(r.name)}</div><div style="font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};margin-left:auto;white-space:nowrap;">${esc(r.platforms)}</div></div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${r.segments.slice(0, 6).map((s) => `<span style="background:${ci.tint};border-radius:8px;padding:4px 10px;font-size:8.5px;line-height:1.35;color:${ci.accentDeep};"><strong style="font-weight:700;">${esc(s.label)}</strong> ${esc(s.text)}</span>`).join("")}</div></div>`;

  // Signature device: the persona-by-channel plan rendered as a live DARK planning panel (the single dark anchor on
  // this light page, echoing the PSI dashboard). Lead dots glow on the dark ground exactly as the PSI score tiles do;
  // support and test stay neutral grey so the eye reads the home channel first. flex:1 grows it onto the footer.
  const dot = (k: "lead" | "support" | "test") =>
    k === "lead"
      ? `<span style="width:14px;height:14px;border-radius:50%;background:${ci.iconDisc};box-shadow:0 0 10px ${ci.glow},0 1px 2px rgba(0,0,0,0.28);display:inline-block;flex-shrink:0;"></span>`
      : k === "support"
        ? `<span style="width:10px;height:10px;border-radius:50%;background:#B7AECB;display:inline-block;flex-shrink:0;"></span>`
        : `<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.30);display:inline-block;flex-shrink:0;"></span>`;
  const matrixHead = `<div style="display:grid;grid-template-columns:${cols};align-items:end;gap:2px;padding-bottom:11px;border-bottom:1px solid rgba(255,255,255,0.16);">`
    + `<div style="font-size:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Persona</div>`
    + mx.channels.map((c) => `<div style="text-align:center;font-size:8px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${ci.accentOnDark};line-height:1.2;">${esc(c)}</div>`).join("") + `</div>`;
  const matrixRows = mx.rows.map((r, i) =>
    `<div style="display:grid;grid-template-columns:${cols};align-items:center;gap:2px;flex:1;${i === 0 ? "" : "border-top:1px solid rgba(255,255,255,0.08);"}">`
    + `<div style="font-size:10px;font-weight:700;color:#FFFFFF;line-height:1.25;padding-right:6px;">${esc(r.persona)}</div>`
    + r.cells.slice(0, N).map((c) => `<div style="display:flex;align-items:center;justify-content:center;">${dot(c)}</div>`).join("") + `</div>`).join("");
  const legendChip = (sw: string, label: string, note: string) =>
    `<span style="display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:4px 12px 4px 9px;">${sw}`
    + `<span style="font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#FFFFFF;">${label}</span>`
    + `<span style="font-size:8px;letter-spacing:0.04em;color:rgba(255,255,255,0.55);">${note}</span></span>`;
  const matrixPanel = `<div style="margin-top:12px;flex:1;display:flex;flex-direction:column;background:${ci.darkCard};border-radius:18px;padding:18px 22px;color:#FFFFFF;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;"><div style="font-size:8.5px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">Who leads on which channel</div><div style="font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">The whole plan on one grid</div></div>`
    + `<div style="margin-top:14px;flex:1;display:flex;flex-direction:column;">${matrixHead}${matrixRows}</div>`
    + `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.16);">`
    +   legendChip(dot("lead"), "Lead", "home channel")
    +   legendChip(dot("support"), "Support", "assists reach")
    +   legendChip(dot("test"), "Test", "proving ground")
    + `</div></div>`;

  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Targeting") + headline(ci, t.headline)
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">Reach is cheap; precision is the edge. Each persona has a home channel where it converts and a proving ground where we earn the next win, so ${esc(d.client_name)} spends against intent, never against a flat audience.</p>`
    + miniEyebrow(ci, "The segments we buy, persona by persona", "16px")
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;align-items:stretch;">${t.rows.slice(0, 4).map(seg).join("")}</div>`
    + matrixPanel
    + sFootLight(ci, d.brand_short));
}

// ── S06 THE CREATIVE (light) — StorySelling + a live FB ad mock + the channel plan ────────────────────────────
function sCreativePage(d: ProposalDoc, ci: CiTokens): string {
  const clientInitial = ((d.client_name.trim().replace(/^(the|a|an)\s+/i, "")[0] || d.client_name.trim()[0] || "•")).toUpperCase();
  const avatar = d.client_logo
    ? `<div style="width:32px;height:32px;border-radius:50%;background:#FFFFFF;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;"><img src="${esc(d.client_logo.src)}" style="max-width:78%;max-height:78%;object-fit:contain;"></div>`
    : `<div style="width:32px;height:32px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;font-size:12px;flex-shrink:0;">${esc(clientInitial)}</div>`;

  // The ad's primary text is the client-specific creative message. Kept whole; only a very long line is trimmed on a
  // word boundary so the mock can never overflow the feed frame.
  const cap = d.creative.for_client || d.creative.intro || "";
  const capText = cap.length > 240 ? cap.slice(0, 236).replace(/\s+\S*$/, "") + "…" : cap;

  // A live Meta feed ad, framed in a phone. The hero image grows (flex:1) so the device fills the column top to bottom.
  const bar = (h: number) => `<span style="width:2px;height:${h}px;background:#1A1030;border-radius:1px;"></span>`;
  const statusBar = `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 15px 3px;">`
    + `<span style="font-size:9px;font-weight:700;color:#1A1030;letter-spacing:0.02em;">9:41</span>`
    + `<span style="width:34px;height:9px;border-radius:999px;background:#1A1030;"></span>`
    + `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="display:inline-flex;align-items:flex-end;gap:1.5px;height:9px;">${bar(3)}${bar(5)}${bar(7)}${bar(9)}</span>`
    +   `<span style="display:inline-flex;align-items:center;"><span style="width:16px;height:9px;border:1px solid #1A1030;border-radius:2px;position:relative;display:inline-block;"><span style="position:absolute;left:1px;top:1px;bottom:1px;width:10px;background:#1A1030;border-radius:1px;"></span></span><span style="width:1.5px;height:4px;background:#1A1030;border-radius:0 1px 1px 0;margin-left:1px;display:inline-block;"></span></span></span>`
    + `</div>`;
  const topBar = `<div style="display:flex;align-items:center;gap:9px;padding:7px 13px 9px;border-bottom:1px solid #F0ECF5;">${avatar}`
    + `<div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:700;color:#1A1030;line-height:1.15;">${esc(d.client_name)}</div><div style="font-size:8px;color:#8A8496;line-height:1.2;">Sponsored &middot; &#127760;</div></div>`
    + `<div style="font-size:13px;color:#8A8496;font-weight:700;line-height:0.4;">&#8943;</div></div>`;
  const caption = `<div style="font-size:9.5px;line-height:1.5;color:#1A1030;padding:9px 14px 10px;">${esc(capText)}</div>`;
  const hero = `<div style="flex:1;min-height:180px;background:${ci.accentGrad};position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px;">`
    + `<div style="font-size:8px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.72);margin-bottom:11px;">StorySelling</div>`
    + `<div style="font-size:22px;font-weight:800;text-transform:uppercase;line-height:1.08;color:#FFFFFF;text-align:center;">${esc(d.cover.headline.lead)} ${esc(d.cover.headline.gradient)}</div>`
    + `<div style="position:absolute;left:12px;bottom:12px;background:rgba(0,0,0,0.2);border-radius:5px;padding:3px 8px;font-size:7px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Scene shot &middot; 15s</div>`
    + `<div style="position:absolute;right:12px;bottom:12px;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;"><svg width="10" height="10" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none"><path d="M8 5v14l11-7z"></path></svg></div>`
    + `</div>`;
  const cta = `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#F4F0FA;border-top:1px solid #EDE7F5;">`
    + `<div style="flex:1;min-width:0;"><div style="font-size:7.5px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8496;">WhatsApp</div><div style="font-size:10px;font-weight:700;color:#1A1030;line-height:1.2;">Start the conversation</div></div>`
    + `<div style="background:${ci.accent};color:#FFFFFF;border-radius:8px;padding:8px 15px;font-size:9px;font-weight:700;white-space:nowrap;flex-shrink:0;">Message us</div></div>`;
  const engagement = `<div style="display:flex;align-items:center;gap:14px;padding:8px 14px 11px;font-size:8.5px;color:#8A8496;"><span>&#128077; 128</span><span>24 comments</span><span>12 shares</span></div>`;
  const phone = `<div style="height:100%;background:${ci.darkPage};border-radius:34px;padding:9px;box-shadow:0 6px 18px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="flex:1;background:#FFFFFF;border-radius:26px;overflow:hidden;display:flex;flex-direction:column;">${statusBar}${topBar}${caption}${hero}${cta}${engagement}</div></div>`;

  // Placement-format cards: the little accentGrad thumbnail IS the format's real aspect ratio, drawn to scale.
  const fmt = (a: { ratio: string; icon: string; title: string; caption: string }) => {
    const m = a.ratio.match(/(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)/i);
    const rw = m ? parseFloat(m[1]) : 1, rh = m ? parseFloat(m[2]) : 1;
    const sc = 44 / Math.max(rw, rh);
    const tw = Math.max(6, Math.round(rw * sc)), th = Math.max(6, Math.round(rh * sc));
    return `<div style="background:#FFFFFF;border-radius:14px;padding:13px 16px;box-shadow:0 6px 18px ${ci.shadow};display:flex;align-items:center;gap:12px;flex:1;">`
      + `${disc(ci, 30, a.icon)}`
      + `<div style="flex:1;min-width:0;"><div style="display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;"><span style="font-size:11.5px;font-weight:700;color:${ci.ink};">${esc(a.title)}</span><span style="font-size:8.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ci.accent};">${esc(a.ratio)}</span></div>`
      +   `<div style="font-size:9px;line-height:1.45;color:${ci.muted};margin-top:3px;">${esc(a.caption)}</div></div>`
      + `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div style="width:${tw}px;height:${th}px;background:${ci.accentGrad};border-radius:5px;box-shadow:0 2px 6px ${ci.shadow};"></div></div>`
      + `</div>`;
  };
  const right = `<div style="height:100%;display:flex;flex-direction:column;">`
    + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:10px;">Built for every placement</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;gap:10px;">${d.creative.asset_formats.slice(0, 4).map(fmt).join("")}</div>`
    + `</div>`;

  const strip = `<div style="margin-top:14px;background:${ci.darkCard};border-radius:16px;padding:15px 20px;color:#FFFFFF;">`
    + `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;gap:12px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">The channel plan, at a glance</div><div style="font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);white-space:nowrap;">One story, every placement</div></div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:7px;">${d.channels5.rows.slice(0, 5).map((r) => `<span style="background:rgba(255,255,255,0.1);border-radius:999px;padding:5px 13px;font-size:9.5px;font-weight:600;">${esc(r.name)} <span style="color:${ci.accentOnDark};font-weight:700;">&middot; ${esc(r.role)}</span></span>`).join("")}</div>`
    + `</div>`;

  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "The Creative") + headline(ci, { lead: "StorySelling,", gradient: "at machine speed" })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(d.creative.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:290px 1fr;gap:16px;margin-top:16px;flex:1;align-items:stretch;">`
    +   `<div style="height:100%;">${phone}</div>`
    +   right
    + `</div>`
    + strip
    + sFootLight(ci, d.brand_short));
}

// ── S12 THE CHANNEL PLAN (light) — the five channels, each with role, what and why + reach hook ────────────────
function sChannelsPage(d: ProposalDoc, ci: CiTokens): string {
  const rows = d.channels5.rows.slice(0, 5);
  // Parse each reach string ("4.2M", "38 000", "1.2bn") to a comparable number so the bars share one scale and the
  // reader can weigh the channels against each other. No number => no bar (kept qualitative).
  const reachVal = (s?: string): number => {
    if (!s) return 0;
    const m = s.replace(/,/g, "").replace(/\s/g, "").match(/([\d.]+)(bn|b|m|k)?/i);
    if (!m) return 0;
    let v = parseFloat(m[1]);
    const u = (m[2] || "").toLowerCase();
    if (u === "bn" || u === "b") v *= 1e9;
    else if (u === "m") v *= 1e6;
    else if (u === "k") v *= 1e3;
    return isFinite(v) ? v : 0;
  };
  const maxVal = Math.max(1, ...rows.map((r) => reachVal(r.reach)));
  // Role is structural colour: lead = the accent gradient (the weight we lean on), support = accentDeep, test = neutral
  // grey (secondary data stays neutral per the palette). The bar and the numeral read the same datum, so they reinforce.
  const roleBg = (k: "lead" | "support" | "test") => k === "lead" ? ci.accentGrad : k === "support" ? ci.accentDeep : "#ECE9F1";
  const roleFg = (k: "lead" | "support" | "test") => k === "test" ? ci.muted : "#FFFFFF";
  const barFill = (k: "lead" | "support" | "test") => k === "lead" ? ci.accentGrad : k === "support" ? ci.accentDeep : "#D9D5E2";
  const row = (r: (typeof rows)[number]) => {
    const v = reachVal(r.reach);
    const pct = v > 0 ? Math.max(12, Math.round((v / maxVal) * 100)) : 0;
    const reachTag = r.reach
      ? `<div style="margin-left:auto;text-align:right;flex-shrink:0;"><div style="font-size:16px;font-weight:800;color:${ci.accent};line-height:1;">${esc(r.reach)}</div><div style="font-size:7px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ci.muted};margin-top:3px;">reach in market</div></div>`
      : "";
    const bar = pct > 0
      ? `<div style="margin-top:10px;height:7px;border-radius:999px;background:#F1F1F4;overflow:hidden;"><div style="height:7px;width:${pct}%;border-radius:999px;background:${barFill(r.kind)};"></div></div>`
      : "";
    return `<div style="background:#FFFFFF;border-radius:14px;padding:13px 18px;box-shadow:0 6px 18px ${ci.shadow};display:flex;flex-direction:column;justify-content:center;flex:1;">`
      + `<div style="display:flex;align-items:center;gap:11px;">${disc(ci, 30, r.icon)}`
      +   `<div style="font-size:12px;font-weight:700;line-height:1;">${esc(r.name)}</div>`
      +   `<div style="background:${roleBg(r.kind)};border-radius:999px;padding:3px 11px;font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${roleFg(r.kind)};">${esc(r.role)}</div>`
      +   reachTag
      + `</div>`
      + bar
      + `<div style="font-size:9.8px;line-height:1.5;color:${ci.body};margin-top:8px;">${esc(r.what)}</div>`
      + `<div style="font-size:9.3px;line-height:1.45;color:${ci.muted};margin-top:3px;font-style:italic;">${esc(r.why)}</div>`
      + `</div>`;
  };
  // A legend keys the chart: the bar length is audience reach, and the colour is the channel's job in the mix.
  const key = (bg: string, label: string) =>
    `<span style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:7px;border-radius:999px;background:${bg};display:inline-block;flex-shrink:0;"></span>${label}</span>`;
  const legend = `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:14px;font-size:7.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ci.muted};">`
    + `<span>Bar length = audience reach</span>`
    + key(ci.accentGrad, "Lead") + key(ci.accentDeep, "Support") + key("#D9D5E2", "Test") + `</div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "The Channel Plan") + headline(ci, { lead: "Omnichannel media,", gradient: "tuned daily" })
    + `<p style="font-size:11px;line-height:1.6;color:${ci.body};margin:12px 0 0;">${esc(d.channels5.intro)}</p>`
    + legend
    + `<div style="flex:1;display:flex;flex-direction:column;gap:9px;margin-top:12px;">${rows.map(row).join("")}</div>`
    + darkBox(ci, "How the mix stays sharp", "Nothing is set and forgotten. Every week the budget moves to the channels proving the lowest cost per qualified lead, so the plan compounds on evidence rather than guesswork.", "16px")
    + sFootLight(ci, d.brand_short));
}

// ── S13 MEDIA & PLACEMENTS (light) — where the work runs: the asset formats/placements + the flighting logic ───
function sMediaPage(d: ProposalDoc, ci: CiTokens): string {
  // The client mark for the feed post: the real logo on a white disc, else the initial in an accent disc (as Creative).
  const clientInitial = ((d.client_name.trim().replace(/^(the|a|an)\s+/i, "")[0] || d.client_name.trim()[0] || "•")).toUpperCase();
  const avatar = d.client_logo
    ? `<div style="width:30px;height:30px;border-radius:50%;background:#FFFFFF;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;"><img src="${esc(d.client_logo.src)}" style="max-width:78%;max-height:78%;object-fit:contain;"></div>`
    : `<div style="width:30px;height:30px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;font-size:12px;flex-shrink:0;">${esc(clientInitial)}</div>`;

  // Signature device 1 — the ad LIVE in a phone feed: the primary placement, shown running, not described.
  const phone = `<div style="width:212px;margin:auto;background:${ci.darkCard};border-radius:34px;padding:9px;box-shadow:0 12px 32px rgba(26,16,48,0.20);">`
    + `<div style="background:#FFFFFF;border-radius:26px;overflow:hidden;">`
    +   `<div style="height:22px;display:flex;align-items:center;justify-content:center;"><div style="width:44px;height:5px;border-radius:999px;background:${ci.darkCard};"></div></div>`
    +   `<div style="display:flex;align-items:center;gap:8px;padding:2px 13px 10px;">${avatar}<div style="min-width:0;"><div style="font-size:10px;font-weight:700;color:#1A1030;line-height:1.2;">${esc(d.client_name)}</div><div style="font-size:7.5px;color:#8A8496;">Sponsored &middot; &#127760;</div></div></div>`
    +   `<div style="font-size:9px;line-height:1.5;color:#1A1030;padding:0 13px 9px;">${esc((d.creative.for_client || d.creative.intro || "").slice(0, 96))}</div>`
    +   `<div style="height:132px;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;padding:0 20px;"><div style="font-size:16px;font-weight:800;text-transform:uppercase;line-height:1.1;color:#FFFFFF;text-align:center;letter-spacing:-0.01em;">${esc(d.cover.headline.gradient)}</div></div>`
    +   `<div style="display:flex;align-items:center;gap:9px;padding:10px 13px;background:#F2EEF7;"><div style="flex:1;min-width:0;"><div style="font-size:7.5px;letter-spacing:0.1em;text-transform:uppercase;color:#8A8496;">gasmarketing.co.za</div><div style="font-size:9.5px;font-weight:700;color:#1A1030;line-height:1.2;">${esc(d.cover.headline.lead)}</div></div><div style="background:${ci.accent};color:#FFFFFF;border-radius:8px;padding:7px 12px;font-size:8.5px;font-weight:700;white-space:nowrap;flex-shrink:0;">Message us</div></div>`
    +   `<div style="display:flex;gap:14px;padding:8px 13px;font-size:8px;color:#8A8496;"><span>&#128077; 128</span><span>24 comments</span><span>12 shares</span></div>`
    + `</div></div>`;
  const phoneCard = `<div style="background:#FFFFFF;border-radius:18px;box-shadow:0 6px 18px ${ci.shadow};padding:18px;height:100%;display:flex;flex-direction:column;">`
    + `<div style="display:flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;border-radius:50%;background:${ci.iconDisc};box-shadow:0 0 8px ${ci.glow};flex-shrink:0;"></span><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">Live in feed</div></div>`
    + `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:12px 0;">${phone}</div></div>`;

  // Signature device 2 — each placement drawn at its TRUE aspect ratio (a tall story, a square post, a wide feed),
  // filled with the accent creative gradient and labelled with its ratio. The shape IS the point.
  const swatch = (ratio: string) => {
    const m = ratio.match(/(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)/i);
    const w0 = m ? parseFloat(m[1]) : 1, h0 = m ? parseFloat(m[2]) : 1;
    const ar = (w0 > 0 && h0 > 0) ? w0 / h0 : 1;
    const MAX = 50;
    const fw = ar >= 1 ? MAX : Math.round(MAX * ar);
    const fh = ar >= 1 ? Math.round(MAX / ar) : MAX;
    return `<div style="width:60px;height:60px;flex-shrink:0;border-radius:10px;background:${ci.tint};display:flex;align-items:center;justify-content:center;">`
      + `<div style="width:${fw}px;height:${fh}px;border-radius:5px;background:${ci.accentGrad};box-shadow:0 2px 6px ${ci.shadow};position:relative;overflow:hidden;">`
      +   `<div style="position:absolute;left:5px;right:5px;top:5px;height:2px;border-radius:2px;background:rgba(255,255,255,0.55);"></div>`
      +   `<div style="position:absolute;left:5px;bottom:5px;width:${Math.max(9, Math.round(fw * 0.5))}px;height:2px;border-radius:2px;background:rgba(255,255,255,0.35);"></div>`
      + `</div></div>`;
  };
  const fmt = (a: { ratio: string; icon: string; title: string; caption: string }) =>
    `<div style="flex:1;background:#FFFFFF;border-radius:14px;padding:11px 14px;box-shadow:0 6px 18px ${ci.shadow};display:flex;align-items:center;gap:12px;">`
    + swatch(a.ratio)
    + `<div style="flex:1;min-width:0;"><div style="display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;"><div style="font-size:11px;font-weight:700;line-height:1.2;">${esc(a.title)}</div><span style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ci.accent};white-space:nowrap;">${esc(a.ratio)}</span></div>`
    + `<div style="font-size:9px;line-height:1.45;color:${ci.muted};margin-top:4px;">${esc(a.caption)}</div></div></div>`;
  const formatsCol = `<div style="display:flex;flex-direction:column;gap:10px;height:100%;">`
    + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">Built for every placement</div>`
    + d.creative.asset_formats.slice(0, 4).map(fmt).join("") + `</div>`;

  // Signature device 3 — the flighting strip: budget bars widen Test -> Concentrate -> Scale, the money concentrating
  // onto proven winners. The single dark anchor on the page, echoing the PSI dashboard.
  const darkArrow = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;align-self:center;"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;
  const stages = [
    { n: 1, label: "Test", pct: 34, body: "Multiple hooks and audiences run small, side by side, from day one." },
    { n: 2, label: "Concentrate", pct: 66, body: "Budget moves to the winning placements and creative, on evidence." },
    { n: 3, label: "Scale", pct: 100, body: "Winners scale; fatigued creative is refreshed before it costs you." },
  ];
  const stage = (s: typeof stages[number]) =>
    `<div style="flex:1;">`
    + `<div style="display:flex;align-items:center;gap:8px;"><div style="width:20px;height:20px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#FFFFFF;flex-shrink:0;box-shadow:0 0 10px ${ci.glow};">${s.n}</div>`
    + `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#FFFFFF;">${esc(s.label)}</div>`
    + `<div style="margin-left:auto;font-size:8px;font-weight:700;color:${ci.accentOnDark};" class="tabular">${s.pct}%</div></div>`
    + `<div style="height:7px;border-radius:999px;background:rgba(255,255,255,0.12);overflow:hidden;margin-top:8px;"><div style="height:7px;width:${s.pct}%;border-radius:999px;background:${ci.accentGrad};"></div></div>`
    + `<div style="font-size:9px;line-height:1.5;color:rgba(255,255,255,0.78);margin-top:8px;">${esc(s.body)}</div></div>`;
  const flightStrip = `<div style="margin-top:auto;background:${ci.darkCard};border-radius:16px;padding:16px 22px;color:#FFFFFF;">`
    + `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">How we flight the media</div><div style="font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Share of budget on winners</div></div>`
    + `<div style="display:flex;align-items:stretch;gap:14px;margin-top:14px;">${stage(stages[0])}${darkArrow}${stage(stages[1])}${darkArrow}${stage(stages[2])}</div></div>`;

  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Media and Placements") + headline(ci, { lead: "Right placement,", gradient: "right moment" })
    + `<p style="font-size:11px;line-height:1.6;color:${ci.body};margin:12px 0 0;">${esc(d.creative.for_client || d.creative.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;flex:1;align-items:stretch;">${phoneCard}${formatsCol}</div>`
    + flightStrip
    + sFootLight(ci, d.brand_short));
}

function intentDonut(ci: CiTokens): string {
  const C = 2 * Math.PI * 45;
  const segs = [{ pct: 13, color: ci.accentOnDark }, { pct: 27, color: ci.accent }, { pct: 60, color: "rgba(255,255,255,0.22)" }];
  let acc = 0;
  const arcs = segs.map((s) => {
    const len = C * s.pct / 100, off = -C * acc / 100;
    acc += s.pct;
    return `<circle cx="60" cy="60" r="45" fill="none" stroke="${s.color}" stroke-width="15" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>`;
  }).join("");
  return `<svg width="118" height="118" viewBox="0 0 120 120"><g transform="rotate(-90 60 60)">${arcs}</g></svg>`;
}

// ── S07 PSI · THE INTENT ENGINE (dark, HERO) — the signature funnel page: a live lead card + gauge + tiers ─────
const USER_ICON = `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>`;
function sPsiPage(d: ProposalDoc, ci: CiTokens): string {
  const p = d.psi;
  // Route ladder in the funnel's own language: HOT / WARM / COLD with 0-100 bands. Uses the model's tile captions
  // for the routing line where present, with confident defaults otherwise.
  const bands = [
    { band: "Hot", range: "67 – 100", color: ci.accentOnDark, action: p.tiles[0]?.caption || "Routed to your sales team to close now." },
    { band: "Warm", range: "34 – 66", color: ci.accent, action: p.tiles[1]?.caption || "Held in automated nurture until they are ready." },
    { band: "Cold", range: "0 – 33", color: "rgba(255,255,255,0.45)", action: p.tiles[2]?.caption || "A long-cycle drip, with zero team time spent." },
  ];
  const routeRow = (b: typeof bands[number]) =>
    `<div style="display:flex;align-items:center;gap:14px;padding:11px 16px;background:rgba(255,255,255,0.05);border-radius:12px;border-left:3px solid ${b.color};">`
    + `<div style="width:70px;flex-shrink:0;"><div style="font-size:14px;font-weight:800;text-transform:uppercase;color:${b.color};">${b.band}</div><div style="font-size:8px;letter-spacing:0.08em;color:rgba(255,255,255,0.5);">${b.range}</div></div>`
    + `<div style="flex:1;font-size:10.5px;line-height:1.5;color:rgba(255,255,255,0.85);">${esc(b.action)}</div></div>`;
  const legendRow = (color: string, label: string, pct: string) =>
    `<div style="display:flex;align-items:center;gap:7px;"><span style="width:9px;height:9px;border-radius:2px;background:${color};flex-shrink:0;"></span><span style="font-size:9px;color:rgba(255,255,255,0.85);flex:1;">${label}</span><span style="font-size:9px;font-weight:700;color:#FFFFFF;">${pct}</span></div>`;
  // The hero: one live enquiry being scored, exactly as the funnel demos it (source, gauge, tier, the signals behind it).
  const leadCard = `<div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.16);border-radius:18px;padding:18px 20px;">`
    + `<div style="display:flex;align-items:center;gap:11px;">${disc(ci, 34, USER_ICON)}<div style="flex:1;"><div style="font-size:12px;font-weight:800;">New enquiry</div><div style="font-size:8.5px;letter-spacing:0.06em;color:rgba(255,255,255,0.6);">via Meta ad · scored in 90 seconds</div></div><span style="display:flex;align-items:center;gap:5px;font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ci.success};"><span style="width:6px;height:6px;border-radius:50%;background:${ci.success};"></span>Live</span></div>`
    + `<div style="margin-top:14px;">${intentGauge(ci, 87)}</div>`
    + `<div style="text-align:center;margin-top:2px;"><span style="display:inline-block;background:${ci.accentGrad};border-radius:999px;padding:5px 16px;font-size:10px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#FFFFFF;">Hot · route to sales now</span></div>`
    + `<div style="margin-top:16px;">${signalBar(ci, "Budget fit", 90)}${signalBar(ci, "Timeline to buy", 82)}${signalBar(ci, "Product match", 88)}</div>`
    + `<div style="font-size:7.5px;color:rgba(255,255,255,0.45);text-align:center;margin-top:12px;font-style:italic;">Illustrative lead · real signals from week one</div></div>`;
  const distCard = `<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:16px 18px;">`
    + `<div style="font-size:8.5px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentOnDark};">Every enquiry, scored</div>`
    + `<div style="display:flex;align-items:center;gap:16px;margin-top:12px;"><div style="flex-shrink:0;">${intentDonut(ci)}</div>`
    +   `<div style="flex:1;display:flex;flex-direction:column;gap:9px;">${legendRow(ci.accentOnDark, "Hot", "13%")}${legendRow(ci.accent, "Warm", "27%")}${legendRow("rgba(255,255,255,0.22)", "Cold", "60%")}</div></div>`
    + `<div style="font-size:9.5px;line-height:1.55;color:rgba(255,255,255,0.7);margin-top:14px;">Your team stops guessing. They spend their day on the 13% ready to buy, while the rest are nurtured automatically until they are.</div></div>`;
  return section(pageDark(ci, "56px 60px 44px", "position:relative;overflow:hidden;"),
    `<div style="position:absolute;right:-160px;top:-160px;width:460px;height:460px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,transparent 70%);"></div>`
    + `<div style="position:relative;">`
    +   `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">Proprietary · The Conversion Layer</div>`
    +   `<div style="font-size:38px;font-weight:800;line-height:1.02;letter-spacing:-0.01em;margin-top:12px;max-width:600px;">Interest is noise.<br><span style="color:${ci.accentOnDark};">Intent is the signal.</span></div>`
    +   `<p style="font-size:12.5px;line-height:1.7;color:rgba(255,255,255,0.78);margin:16px 0 0;max-width:560px;">${esc(p.intro)}</p>`
    + `</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px;position:relative;">${leadCard}${distCard}</div>`
    + `<div style="margin-top:20px;position:relative;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};margin-bottom:9px;">The score routes itself</div><div style="display:flex;flex-direction:column;gap:8px;">${bands.map(routeRow).join("")}</div></div>`
    + `<div style="margin-top:auto;padding-top:20px;position:relative;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;"><div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px 16px;"><div style="font-size:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.5);">The old way</div><div style="font-size:10.5px;line-height:1.5;color:rgba(255,255,255,0.7);margin-top:4px;">Chase every lead. Burn the team on tyre-kickers who were never going to buy.</div></div><div style="background:${ci.accentGrad};border-radius:12px;padding:12px 16px;"><div style="font-size:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.85);">The PSI way</div><div style="font-size:10.5px;line-height:1.5;color:#FFFFFF;font-weight:600;margin-top:4px;">Your team only ever speaks to the ones ready to buy.</div></div></div></div>`
    + sFootDark(d.brand_short));
}

// ── S15 FUNNEL ECONOMICS & KPIs (light) — the six stages as EQUAL measured cards (no step-down) + KPI table ────
function sFunnelPage(d: ProposalDoc, ci: CiTokens): string {
  const stageCard = (label: string, i: number) =>
    `<div style="display:flex;align-items:center;gap:12px;background:#FFFFFF;border-radius:12px;padding:11px 16px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="width:26px;height:26px;border-radius:50%;background:${ci.iconDisc};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;">${i + 1}</div>`
    + `<div style="flex:1;font-size:10.5px;font-weight:600;color:${ci.body};line-height:1.4;">${esc(label)}</div>`
    + (i < 5 ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${ci.arrow}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>` : `<span style="font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};flex-shrink:0;">Enrolled</span>`)
    + `</div>`;
  const th = (t: string) => `<div style="padding:7px 12px;background:${ci.darkCard};color:#FFFFFF;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;font-size:8.5px;">${t}</div>`;
  const td = (t: string, bold: boolean) => `<div style="padding:7px 12px;border-top:1px solid #EEE8F5;color:${bold ? ci.body : ci.muted};${bold ? "font-weight:700;" : ""}">${esc(t)}</div>`;
  const rows = d.funnel.kpis.slice(0, 5).map((k) => td(k.metric, true) + td(k.why, false) + td(k.baseline, false)).join("");
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Funnel Economics and KPIs") + headline(ci, { lead: "A precision funnel,", gradient: "measured against reality" })
    + `<p style="font-size:9.5px;line-height:1.55;color:${ci.muted};margin:10px 0 0;font-style:italic;">${esc(d.funnel.disclaimer)}</p>`
    + `<div style="display:flex;flex-direction:column;gap:7px;margin-top:12px;">${d.funnel.bars.slice(0, 6).map(stageCard).join("")}</div>`
    + miniEyebrow(ci, "KPIs, agreed up front", "16px")
    + `<div style="display:grid;grid-template-columns:1.05fr 1fr 1fr;gap:0;margin-top:8px;background:#FFFFFF;border-radius:14px;box-shadow:0 6px 18px ${ci.shadow};overflow:hidden;font-size:9px;line-height:1.45;">${th("Metric")}${th("Why it matters")}${th("Baseline and target")}${rows}</div>`
    + sFootLight(ci, d.brand_short));
}

// ── S08 PROOF & DASHBOARD (light) — a live dashboard mock + the KPI table ──────────────────────────────────────
function sDashboardPage(d: ProposalDoc, ci: CiTokens): string {
  const kpiTile = (t: { label: string; spark: "line-down" | "bars" | "line-up" | "gauge"; caption: string }) =>
    `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px 14px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(t.label)}</div><div style="margin-top:6px;">${sparkline(ci, t.spark)}</div><div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-top:6px;">${esc(t.caption)}</div></div>`;
  const dash = `<div style="background:${ci.darkPage};border-radius:16px;padding:16px 18px;box-shadow:0 10px 26px rgba(46,26,74,0.3);">`
    + `<div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.14);"><span style="width:8px;height:8px;border-radius:50%;background:#FF5F57;"></span><span style="width:8px;height:8px;border-radius:50%;background:#FEBC2E;"></span><span style="width:8px;height:8px;border-radius:50%;background:#28C840;"></span><div style="margin-left:8px;flex:1;background:rgba(255,255,255,0.08);border-radius:6px;padding:3px 12px;font-size:8px;color:rgba(255,255,255,0.6);letter-spacing:0.08em;">psi.gasmarketing.co.za/dashboard</div></div>`
    + `<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:12px;"><div><div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentOnDark};font-weight:600;">PSI Conversion Dashboard</div><div style="font-size:8px;color:rgba(255,255,255,0.55);margin-top:2px;">One screen the bi-weekly review argues from</div></div><span style="display:flex;align-items:center;gap:5px;font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ci.success};"><span style="width:6px;height:6px;border-radius:50%;background:${ci.success};"></span>Live</span></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">${d.pods78.tiles.slice(0, 4).map(kpiTile).join("")}</div></div>`;
  // The fortnightly loop that compounds (the review cadence), instead of repeating the KPI table (now on the Funnel page).
  const loopStep = (t: string, b: string) => `<div style="flex:1;background:${ci.tint};border-radius:12px;padding:12px 15px;"><div style="font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentDeep};">${t}</div><div style="font-size:9.5px;line-height:1.5;color:${ci.body};margin-top:4px;">${b}</div></div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Proof and Measurement") + headline(ci, { lead: "Every rand,", gradient: "accounted for." })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(d.pods78.dashboard_para)}</p>`
    + `<div style="margin-top:16px;">${dash}</div>`
    + `<div style="margin-top:auto;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:9px;">The fortnightly loop that compounds</div><div style="display:flex;gap:10px;">`
    +   loopStep("Review", "Cost per qualified lead by persona and channel, on one screen.")
    +   loopStep("Reallocate", "Budget shifts to the winning personas, triggers and creative, on evidence.")
    +   loopStep("Compound", "Each fortnight is sharper and cheaper than the last, never a reset.")
    + `</div></div>`
    + sFootLight(ci, d.brand_short));
}

// ── S09 YOUR ROLLOUT (light) — timeline rail + gated week cards ────────────────────────────────────────────────
function sRolloutPage(d: ProposalDoc, ci: CiTokens): string {
  const r = d.rollout;
  const railDisc = (badge: string, label: string) =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;"><div style="min-width:26px;height:26px;padding:0 6px;border-radius:999px;background:${ci.iconDisc};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9.5px;white-space:nowrap;position:relative;z-index:1;box-shadow:0 0 0 4px #FAF8FC;">${esc(badge)}</div><div style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ci.accentDeep};text-align:center;">${esc(label)}</div></div>`;
  const weekCard = (w: (typeof r.weeks)[number]) =>
    `<div style="background:#FFFFFF;border-radius:14px;padding:13px 16px;box-shadow:0 6px 18px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="display:flex;align-items:center;gap:8px;">${disc(ci, 24, w.icon)}<div style="font-size:11px;font-weight:700;">${esc(w.title)}</div></div>`
    + `<div style="font-size:8px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};margin-top:2px;">${esc(w.pods)}</div>`
    + `<ul style="margin:7px 0 0;padding-left:14px;font-size:9.3px;line-height:1.5;color:${ci.muted};flex:1;">${w.bullets.map((b) => `<li style="margin-top:2px;">${esc(b)}</li>`).join("")}</ul>`
    + `<div style="margin-top:9px;min-height:34px;background:${ci.accentGrad};border-radius:10px;padding:6px 12px;font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;text-align:center;line-height:1.4;display:flex;align-items:center;justify-content:center;">${esc(w.gate)}</div></div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Your Rollout") + headline(ci, r.headline)
    + `<p style="font-size:11px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(r.intro)}</p>`
    + `<div style="margin-top:14px;position:relative;padding:0 30px;"><div style="position:absolute;left:60px;right:60px;top:13px;height:2px;background:linear-gradient(90deg,${ci.accentOnDark} 0%,${ci.accentDeep} 100%);"></div><div style="display:flex;align-items:flex-start;">${r.rail.map((x) => railDisc(x.badge, x.label)).join("")}</div></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;flex:1;">${r.weeks.map(weekCard).join("")}</div>`
    + sFootLight(ci, d.brand_short));
}

// ── S10 TRUSTED WITH DATA (light) — POPIA/GDPR pillars + commitments ──────────────────────────────────────────
function sGovernancePage(d: ProposalDoc, ci: CiTokens): string {
  const commit = (title: string, body: string) =>
    `<div style="background:#FFFFFF;border-radius:14px;padding:12px 15px;box-shadow:0 6px 18px ${ci.shadow};display:flex;gap:9px;align-items:flex-start;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${ci.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M20 6 9 17l-5-5"></path></svg><div><div style="font-size:10.5px;font-weight:700;">${esc(title)}</div><div style="font-size:9px;line-height:1.5;color:${ci.muted};margin-top:2px;">${esc(body)}</div></div></div>`;
  const pillar = (tag: string, title: string) =>
    `<div style="background:${ci.darkCard};border-radius:16px;padding:15px 18px;color:#FFFFFF;flex:1;"><div style="display:flex;align-items:center;gap:8px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${SHIELD}</svg><span style="font-size:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accentOnDark};">${tag}</span></div><div style="font-size:11.5px;font-weight:800;margin-top:6px;line-height:1.3;">${esc(title)}</div></div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Governance") + headline(ci, { lead: "Trusted with data,", gradient: "by design." })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(d.governance.intro)}</p>`
    + `<div style="display:flex;gap:12px;margin-top:16px;">${pillar("POPIA · South Africa", "Compliant with the Protection of Personal Information Act")}${pillar("GDPR · International", "Aligned with the EU General Data Protection Regulation")}</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">${d.governance.commitments.slice(0, 6).map((c) => commit(c.title, c.body)).join("")}</div>`
    + `<div style="margin-top:auto;background:#FFFFFF;border-radius:14px;padding:12px 18px;box-shadow:0 6px 18px ${ci.shadow};display:flex;align-items:center;gap:10px;justify-content:space-between;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accent};white-space:nowrap;">Compliance stack</div><div style="display:flex;gap:8px;flex-wrap:wrap;">${["POPIA", "GDPR-aligned", "Platform policies", "Verified-claims register"].map((t) => `<span style="background:${ci.accent};color:#FFFFFF;border-radius:999px;padding:5px 12px;font-size:8px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${t}</span>`).join("")}</div></div>`
    + sFootLight(ci, d.brand_short));
}

// ── S11 THE INVESTMENT (light) — tier hero + inclusions + footnotes ───────────────────────────────────────────
function sInvestmentPage(d: ProposalDoc, ci: CiTokens): string {
  const iv = d.investment;
  // Price + unit are shown EXACTLY as edited; price_unit carries an intentional <br> we must un-escape (as the old code did).
  const priceUnit = esc(iv.price_unit).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  const check = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${ci.accentOnDark}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${CHECK}</svg>`;

  // The confident checklist: 8 inclusions as an edge-to-edge ledger, each row flex:1 so they distribute evenly down the
  // tall hero column, hairline-divided like a premium price list.
  const inclRow = (t: { title: string; pod_tag: string }, i: number) =>
    `<div style="display:flex;align-items:center;gap:11px;flex:1;${i > 0 ? "border-top:1px solid rgba(255,255,255,0.12);" : ""}">`
    + check
    + `<div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:700;line-height:1.25;">${esc(t.title)}</div>`
    + `<div style="font-size:8px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-top:2px;">${esc(t.pod_tag)}</div></div></div>`;

  const foot = (f: { label: string; body: string }) =>
    `<div style="background:${ci.tint};border-radius:14px;padding:12px 15px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentDeep};">${esc(f.label)}</div>`
    + `<div style="font-size:10px;line-height:1.5;color:${ci.body};margin-top:4px;">${esc(f.body)}</div></div>`;

  // LEFT of the hero: the pricing moment. Name/tagline at the top, the giant 58px numeral held in the middle, the
  // strategy body + PoC pill anchored to the floor via space-between so the column fills the whole panel height.
  const leftCol = `<div style="display:flex;flex-direction:column;justify-content:space-between;padding:24px 26px;position:relative;z-index:1;">`
    + `<div><div style="font-size:20px;font-weight:800;text-transform:uppercase;line-height:1.05;">${esc(iv.tier_name)}</div>`
    +   `<div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentOnDark};margin-top:5px;">${esc(iv.tagline)}</div></div>`
    + `<div style="margin:18px 0;"><div style="display:flex;align-items:baseline;gap:12px;">`
    +   `<div style="font-size:58px;font-weight:800;letter-spacing:-0.02em;line-height:1;color:${ci.accentOnDark};">${esc(iv.price)}</div>`
    +   `<div style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.62);line-height:1.4;">${priceUnit}</div></div></div>`
    + `<div><p style="font-size:10.5px;line-height:1.6;color:rgba(255,255,255,0.78);margin:0 0 12px;">${esc(iv.body)}</p>`
    +   `<span style="display:inline-block;background:${ci.accentGrad};border-radius:999px;padding:7px 16px;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#FFFFFF;">${esc(iv.poc_chip)}</span></div>`
    + `</div>`;

  const rightCol = `<div style="display:flex;flex-direction:column;padding:24px 26px;border-left:1px solid rgba(255,255,255,0.14);position:relative;z-index:1;">`
    + `<div style="font-size:9px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">Every pod, included</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;margin-top:10px;">${iv.inclusions.slice(0, 8).map(inclRow).join("")}</div>`
    + `</div>`;

  // The signature device: one dark pricing hero (the page's earned "moment"), flex:1 so it consumes the page's slack
  // top-to-bottom, corner radial glow, giant numeral beside the divided inclusion ledger.
  const hero = `<div style="flex:1;min-height:340px;margin-top:16px;background:${ci.darkPage};border-radius:18px;position:relative;overflow:hidden;box-shadow:0 12px 30px rgba(46,26,74,0.28);display:grid;grid-template-columns:0.92fr 1.08fr;">`
    + `<div style="position:absolute;right:-120px;top:-120px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,transparent 70%);pointer-events:none;"></div>`
    + leftCol + rightCol + `</div>`;

  const honest = `<div style="margin-top:14px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};display:flex;gap:13px;align-items:flex-start;">`
    + disc(ci, 30, CHECK)
    + `<div><div style="font-size:9px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">No fine print</div>`
    + `<div style="font-size:10.5px;line-height:1.6;color:${ci.body};margin-top:4px;">${esc(iv.honest_para)}</div></div></div>`;

  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "The Investment") + headline(ci, { lead: "The investment ·", gradient: `the ${iv.tier_name} system` })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(iv.intro)}</p>`
    + hero
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-top:14px;">${iv.footnotes.slice(0, 3).map(foot).join("")}</div>`
    + honest
    + sFootLight(ci, d.brand_short));
}

// ── S12 THE TERMS (dark) — 4 term cards + PoC callout + condensed clauses ──────────────────────────────────────
function sTermsPage(d: ProposalDoc, ci: CiTokens): string {
  const t = d.terms;
  const glass = (label: string, body: string) =>
    `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.20);border-radius:14px;padding:13px 16px;"><div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(label)}</div><p style="font-size:10.5px;line-height:1.55;color:rgba(255,255,255,0.85);margin:5px 0 0;">${esc(body)}</p></div>`;
  const clause = (title: string, body: string) =>
    `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:11px 14px;"><div style="font-size:8.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(title)}</div><div style="font-size:9.5px;line-height:1.5;color:rgba(255,255,255,0.8);margin-top:4px;">${esc(body)}</div></div>`;
  const clauses = d.agreement.clauses.slice(0, 6).map((c, i) => clause(CLAUSE_TITLES[i] || c.title, c.body)).join("");
  return section(pageDark(ci, "52px 60px 40px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">Commercial Terms</div>`
    + `<div style="font-size:30px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:10px;">No fine print. <span style="color:${ci.accentOnDark};">One page of terms.</span></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;">${glass("Validity", t.validity)}${glass("Engagement", t.engagement)}${glass("Media budget", t.media)}${glass("Ownership", t.ownership)}</div>`
    + `<div style="margin-top:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:13px 18px;"><div style="font-size:9px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">What the proof of concept proves</div><p style="font-size:11px;line-height:1.6;color:rgba(255,255,255,0.85);margin:6px 0 0;">${esc(t.poc_proves)}</p></div>`
    + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};margin:16px 0 8px;">The agreement · six clauses</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;">${clauses}</div>`
    + sFootDark(d.brand_short));
}

// ── S13 SIGN-OFF (light) — client + agency signature cards ────────────────────────────────────────────────────
function sSignoffPage(d: ProposalDoc, ci: CiTokens): string {
  const s = d.signoff;
  const clientInitial = ((d.client_name.trim().replace(/^(the|a|an)\s+/i, "")[0] || d.client_name.trim()[0] || "•")).toUpperCase();
  const clientMark = d.client_logo
    ? `<div style="width:36px;height:36px;border-radius:50%;background:#FFFFFF;box-shadow:inset 0 0 0 1px rgba(26,16,48,0.12);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;"><img src="${esc(d.client_logo.src)}" alt="${esc(d.client_name)}" style="max-width:76%;max-height:76%;object-fit:contain;display:block;"></div>`
    : `<div style="width:36px;height:36px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;font-size:14px;flex-shrink:0;">${esc(clientInitial)}</div>`;
  const sigRule = `<div style="margin-top:26px;"><div style="border-bottom:1.5px solid rgba(26,16,48,0.35);height:34px;"></div><div style="display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ci.muted};margin-top:6px;"><span>Signature</span><span>Date</span></div></div>`;
  const clientCard = `<div style="background:#FFFFFF;border-radius:18px;padding:22px 24px;box-shadow:0 8px 22px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};">For the client</div>`
    + `<div style="font-size:16px;font-weight:800;text-transform:uppercase;margin-top:6px;">${esc(d.client_name)}</div>`
    + `<div style="margin-top:14px;"><div style="font-size:13px;font-weight:700;">Authorised Signatory</div><div style="font-size:11px;color:${ci.muted};margin-top:2px;">${esc(s.client.signatory_label)}</div></div>`
    + `<div style="font-size:10.5px;line-height:1.8;color:${ci.muted};margin-top:10px;min-height:76px;">${s.client.contacts.map((c) => `<div>${esc(c)}</div>`).join("")}</div>`
    + sigRule
    + `<div style="margin-top:auto;padding-top:14px;display:flex;align-items:center;gap:10px;">${clientMark}<div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:${ci.muted};">${esc(s.client.tagline)}</div></div></div>`;
  const agencyCard = `<div style="background:#FFFFFF;border-radius:18px;padding:22px 24px;color:#1A1030;box-shadow:0 8px 22px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};">For the agency</div>`
    + `<div style="font-size:16px;font-weight:800;text-transform:uppercase;margin-top:6px;">GAS Marketing Automation</div>`
    + `<div style="margin-top:14px;"><div style="font-size:13px;font-weight:700;">Gary Berman</div><div style="font-size:11px;color:${ci.muted};margin-top:2px;">Managing Director</div></div>`
    + `<div style="font-size:10.5px;line-height:1.8;color:${ci.muted};margin-top:10px;min-height:76px;"><div>Cell: 082 566 3708</div><div>Email: gary@gasmarketing.co.za</div><div>www.gasmarketing.co.za</div></div>`
    + sigRule
    + `<div style="margin-top:auto;padding-top:14px;display:flex;align-items:center;gap:10px;"><div style="width:32px;height:32px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:#FFFFFF;">GAS</div><div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:${ci.muted};">Human Command. AI Execution.</div></div></div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "Acceptance and Sign-off") + headline(ci, { lead: "Agreement", gradient: "and sign-off" })
    + `<p style="font-size:12px;line-height:1.7;color:${ci.body};margin:14px 0 0;">${esc(s.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;align-items:stretch;">${clientCard}${agencyCard}</div>`
    + sFootLight(ci, d.brand_short));
}

// The sharpened 20-page deck (Gary): the full strategy, punchier and more visual than the 23-page reference. Same
// content model (ProposalDoc), same CI recolour. Restores the pertinent detail (competitors, targeting, channels,
// media/placements) the 13-page cut left out, and drops the step-down funnel chart.
export function renderProposalHtmlSharp(d: ProposalDoc, ci: CiTokens = deriveCiTokens()): string {
  const fns = [
    sCoverPage, sExecPage, sOpportunityPage, sMarketPage, sCompetitorsPage,
    sEdgePage, sSystemPage, sAudiencePage, sTargetingPage, sCreativePage,
    sChannelsPage, sMediaPage, sPsiPage, sFunnelPage, sDashboardPage,
    sRolloutPage, sGovernancePage, sInvestmentPage, sTermsPage, sSignoffPage,
  ];
  const total = fns.length;
  // Stamp the far-right footer page number ("NN / total") into each page's ##PG## sentinel. The cover has no sentinel.
  const pages = fns.map((fn, i) => fn(d, ci).replace("##PG##", `${String(i + 1).padStart(2, "0")} / ${total}`)).join("\n");
  return docShell(pages);
}
