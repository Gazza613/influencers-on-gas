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
    rows: { icon: string; name: string; role: string; kind: "lead" | "support" | "test"; what: string; why: string }[];  // up to 5
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
    + `<div style="width:52px;height:52px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#FFFFFF;box-shadow:0 0 24px rgba(155,79,201,0.45);">GAS</div>`
    + `<div><div style="font-weight:700;font-size:14px;letter-spacing:0.06em;color:${word};">GAS MARKETING AUTOMATION</div>`
    + `<div style="font-size:10px;letter-spacing:0.28em;color:${sub};font-weight:600;">THE AGENCY OF NOW</div></div></div>`;
}

// An icon disc (radial gradient) holding a 2px-stroke white lucide SVG. `inner` is the svg's inner markup.
function disc(ci: CiTokens, size: number, inner: string): string {
  const ic = Math.round(size * 0.5);
  // A clean, solid accent circle with the icon centred crisply. line-height:0 + overflow:hidden + svg display:block
  // kill the sub-pixel baseline offset that made the icon sit low and the disc read as "not a precise circle"
  // (Gary). A soft outer shadow defines the edge without the double-line look of an inset ring.
  return `<div style="width:${size}px;height:${size}px;min-width:${size}px;min-height:${size}px;border-radius:50%;background:${ci.iconDisc};box-shadow:0 1px 3px rgba(0,0,0,0.14);display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:0;overflow:hidden;">`
    + `<svg width="${ic}" height="${ic}" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${inner}</svg></div>`;
}

const eyebrow = (ci: CiTokens, t: string) =>
  `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accent};">${esc(t)}</div>`;

// Section headline with one gradient phrase (background-clip:text). size defaults to the 30px content-page headline.
function headline(ci: CiTokens, h: Headline, size = 30): string {
  return `<div style="font-size:${size}px;font-weight:800;text-transform:uppercase;line-height:1.02;margin-top:10px;">${esc(h.lead)} `
    + `<span style="background:${ci.accentGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accent};">${esc(h.gradient)}</span></div>`;
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
  const logo = d.client_logo
    ? `<img src="${esc(d.client_logo.src)}" alt="${esc(d.client_name)}" width="${d.client_logo.w}" height="${d.client_logo.h}" style="width:${d.client_logo.w}px;height:${d.client_logo.h}px;margin-left:auto;">`
    : `<div style="margin-left:auto;font-weight:700;font-size:18px;letter-spacing:0.02em;color:#FFFFFF;">${esc(d.client_name)}</div>`;
  return `<section class="page" style="${pageDark(ci, "56px 64px 44px", "position:relative;overflow:hidden;")}">`
    + `<div style="position:absolute;right:-180px;top:-180px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,rgba(199,125,232,0) 70%);"></div>`
    + `<div style="display:flex;align-items:center;gap:14px;position:relative;">${gasLockup(ci, true)}${logo}</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;">`
    +   `<div style="font-size:11px;font-weight:600;letter-spacing:0.28em;color:${ci.accentOnDark};text-transform:uppercase;margin-bottom:18px;">Growth Proposal · Strictly Confidential</div>`
    +   `<div style="font-size:46px;font-weight:800;line-height:1.0;text-transform:uppercase;letter-spacing:-0.01em;max-width:660px;">${esc(d.cover.headline.lead)} `
    +     `<span style="background:${ci.coverTextGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">${esc(d.cover.headline.gradient)}</span></div>`
    +   `<p style="margin:22px 0 0;font-size:15px;line-height:1.65;color:rgba(255,255,255,0.72);max-width:560px;">${esc(d.cover.summary)}</p>`
    + `</div>`
    + `<div style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:nowrap;position:relative;">`
    +   `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:8px 18px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">${esc(d.cover.audience_chip)}</div>`
    +   `<div style="background:${ci.accentGrad};border:1px solid transparent;border-radius:999px;padding:8px 18px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">${esc(d.date_label)} · ${esc(d.validity_label)}</div>`
    + `</div>`
    + `<div style="margin-top:32px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.22);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.55);"><span>www.gasmarketing.co.za</span><span>Human Command. AI Execution.</span></div>`
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
  const nodes = JOURNEY.map((s) =>
    `<div style="display:flex;align-items:center;gap:9px;">${disc(ci, 32, s.icon)}<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;line-height:1.1;">${esc(s.label)}</div><div style="font-size:8.5px;color:${ci.muted};line-height:1.35;margin-top:1px;">${esc(s.sub)}</div></div></div>`
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
  // every result feeds the next. The two arrows show the cycle, in the brand accent + white.
  const orbCPU = `<div style="width:56px;height:56px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;line-height:0;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${CPU}</svg></div>`;
  const orbHeart = `<div style="width:56px;height:56px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;line-height:0;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1A1030" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">${HEART}</svg></div>`;
  const loop = `<svg width="170" height="58" viewBox="0 0 170 58" fill="none" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="M20 22 C 62 6, 108 6, 150 22" stroke="${ci.accentOnDark}" stroke-width="2.2"/><path d="M150 22 l -9 -1 M150 22 l -3 8" stroke="${ci.accentOnDark}" stroke-width="2.2"/>`
    + `<path d="M150 36 C 108 52, 62 52, 20 36" stroke="rgba(255,255,255,0.7)" stroke-width="2.2"/><path d="M20 36 l 9 1 M20 36 l 3 -8" stroke="rgba(255,255,255,0.7)" stroke-width="2.2"/></svg>`;
  const collab = `<div style="margin-top:24px;display:flex;align-items:center;justify-content:center;gap:14px;">`
    + `<div style="text-align:center;">${orbCPU}<div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentOnDark};font-weight:700;margin-top:7px;">AI executes</div></div>`
    + `<div style="text-align:center;">${loop}<div style="font-size:8px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-top:1px;">every result feeds the next</div></div>`
    + `<div style="text-align:center;">${orbHeart}<div style="font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:#FFFFFF;font-weight:700;margin-top:7px;">Humans command</div></div></div>`;
  return section(pageDark(ci, "52px 60px 40px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">05 · Core Philosophy</div>`
    + `<div style="font-size:34px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:10px;">Human Command. <span style="background:${ci.accentGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">AI Execution.</span></div>`
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
    + `<div style="margin-top:16px;background:#FFFFFF;border-radius:16px;padding:14px 18px;box-shadow:0 6px 18px ${ci.shadow};"><div style="font-size:9px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};text-align:center;">How intelligence flows through the system</div><div style="display:flex;align-items:flex-start;justify-content:center;gap:5px;margin-top:10px;">${flow}</div></div>`
    + `<div style="margin-top:auto;background:${ci.accentGrad};border-radius:999px;padding:10px 22px;box-shadow:0 6px 18px rgba(46,26,74,0.2);color:#FFFFFF;display:flex;align-items:center;justify-content:center;gap:12px;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;"><span style="width:22px;height:22px;border-radius:50%;background:${ci.iconDisc};display:inline-flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;">&#8635;</span><span>Feedback loop: every outcome flows back to sharpen the whole system</span></div>`
    + footerLight(ci, d.brand_short, 7));
}

// 08 POD DIVIDER (dark). Fixed giant "VIII" + headline + 8 pod chips; one client-specific intro line.
function dividerPage(d: ProposalDoc, ci: CiTokens): string {
  const chips = ["I · Researcher", "II · Strategist", "III · Audience", "IV · Creative", "V · Channels", "VI · Pre-Sales Intelligence", "VII · Conversion Dashboard", "VIII · Media on GAS"]
    .map((t) => `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.18);border-radius:999px;padding:7px 16px;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">${t}</div>`).join("");
  return section(pageDark(ci, "56px 64px 44px", "position:relative;overflow:hidden;background:" + ci.darkCard + ";"),
    `<div style="position:absolute;left:-140px;bottom:-140px;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,rgba(199,125,232,0) 70%);"></div>`
    + `<div style="font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};position:relative;">The Ecosystem, Pod by Pod</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;">`
    +   `<div style="font-size:170px;font-weight:800;line-height:0.9;letter-spacing:-0.02em;background:${ci.coverTextGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">VIII</div>`
    +   `<div style="font-size:36px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:18px;max-width:660px;">Eight AI Marketing Pods.<br>One accountable partner.</div>`
    +   `<p style="font-size:14px;line-height:1.7;color:rgba(255,255,255,0.68);margin:16px 0 0;max-width:480px;">${esc(d.divider_line)}</p>`
    + `</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:8px;position:relative;">${chips}</div>`
    + footerDark(d.brand_short, null, "28px"));
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
  const podBlock = (roman: string, name: string, subtitle: string, para: string, chip: string) =>
    `<div style="background:#FFFFFF;border-radius:16px;padding:16px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:10px;">${podDisc(ci, roman)}<div><div style="font-size:14px;font-weight:800;text-transform:uppercase;">${esc(name)}</div><div style="font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accent};">${esc(subtitle)}</div></div></div>`
    + `<p style="font-size:10.5px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(para)}</p>${tintChip(ci, chip)}</div>`;
  const dot = (c: { name: string; note: string; left: string; top: string }) =>
    `<div style="position:absolute;left:${c.left};top:${c.top};display:flex;align-items:center;gap:5px;"><div style="width:11px;height:11px;border-radius:50%;background:#B7AECB;"></div><div style="font-size:9px;font-weight:700;color:${ci.muted};">${esc(c.name)} <span style="font-weight:400;">· ${esc(c.note)}</span></div></div>`;
  const clientDot = `<div style="position:absolute;left:${m.client.left};top:${m.client.top};display:flex;align-items:center;gap:6px;"><div style="width:15px;height:15px;border-radius:50%;background:${ci.iconDisc};box-shadow:0 0 12px rgba(155,79,201,0.5);"></div><div style="font-size:10px;font-weight:800;color:${ci.accentDeep};">${esc(m.client.name)} <span style="font-weight:400;color:${ci.muted};">· ${esc(m.client.note)}</span></div></div>`;
  const axisLbl = (pos: string, t: string) => `<div style="position:absolute;${pos};font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:#8A8496;">${esc(t)}</div>`;
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "The System · Intelligence Layer") + headline28(ci, d.pods12.headline)
    + `<div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">`
    +   podBlock("I", "The Researcher", "The business brain: market, competitors, customer", d.pods12.researcher_para, d.pods12.researcher_chip)
    +   podBlock("II", "The Strategist", "Intelligence converted into a commercial plan and KPIs", d.pods12.strategist_para, d.pods12.strategist_chip)
    + `</div>`
    + `<div style="margin-top:12px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    +   `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:20px;">${esc(m.title)}</div>`
    +   `<div style="position:relative;height:150px;border-left:2px solid #E4DEEF;border-bottom:2px solid #E4DEEF;margin:0 12px 20px 12px;">`
    +     axisLbl("left:-10px;top:-15px", m.y_top) + axisLbl("left:-10px;bottom:-16px", m.y_bottom)
    +     axisLbl("right:0;bottom:-16px", m.x_right) + axisLbl("left:16%;bottom:-16px", m.x_left)
    +     m.competitors.map(dot).join("") + clientDot
    +   `</div></div>`
    + footerLight(ci, d.brand_short, 9));
}

// 10 POD III + PERSONAS (light). intro + 4 persona cards (+ discipline note) + blueprint chip + geo chips + budget bar.
function audiencePage(d: ProposalDoc, ci: CiTokens): string {
  const a = d.audience;
  const personaCard = (p: { icon: string; name: string; geo: string; quote: string }) =>
    `<div style="background:#FFFFFF;border-radius:12px;padding:11px 14px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:8px;">${disc(ci, 24, p.icon)}<div style="font-size:10.5px;font-weight:700;">${esc(p.name)}</div></div>`
    + `<div style="font-size:8px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${ci.accent};margin-top:2px;">${esc(p.geo)}</div>`
    + `<div style="font-size:9.5px;line-height:1.5;color:${ci.muted};margin-top:5px;font-style:italic;">${esc(p.quote)}</div></div>`;
  const disciplineCard = `<div style="background:${ci.tint};border-radius:12px;padding:11px 14px;"><div style="font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentDeep};">Trade-only discipline</div><div style="font-size:9.5px;line-height:1.5;color:${ci.body};margin-top:4px;">${esc(a.discipline_note)}</div></div>`;
  const geoChip = (c: { label: string; accent: boolean }) => c.accent
    ? `<div style="background:${ci.accentGrad};color:#FFFFFF;border-radius:999px;padding:5px 13px;font-size:8.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;">${esc(c.label)}</div>`
    : `<div style="background:#FFFFFF;border-radius:999px;padding:5px 13px;font-size:8.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;box-shadow:0 4px 12px ${ci.shadow};white-space:nowrap;">${esc(c.label)}</div>`;
  const seg = (b: { label: string; body: string; flex: number }, i: number) => {
    const bg = i === 0 ? `linear-gradient(90deg,${ci.accent} 0%,${ci.accentDeep} 100%)` : i === 1 ? "#D9CBEA" : "#EFE8F7";
    const col = i === 0 ? "#FFFFFF" : "#3A2A55";
    const sub = i === 0 ? "rgba(255,255,255,0.85)" : "#3A2A55";
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
    eyebrow(ci, "Pod III · Applied") + headline28(ci, t.headline)
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
    + `<div style="font-size:24px;font-weight:800;text-transform:uppercase;line-height:1.04;">${esc(line1)}<br><span style="background:${ci.accentGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${gradTextColor};">${esc(grad2)}</span></div></div></div>`;
}
// The oversized ghost roman numeral, top-right on pod pages. z-index:0 keeps it BEHIND the header/content (which
// carry z-index:1); it sits high in the corner so it reads as a watermark, never over the title.
const ghostNumeral = (ci: CiTokens, roman: string, onDark: boolean) =>
  `<div style="position:absolute;right:24px;top:-44px;z-index:0;font-size:170px;font-weight:800;line-height:1;letter-spacing:-0.02em;color:${onDark ? ci.ghostDark : ci.ghostLight};pointer-events:none;">${roman}</div>`;

// 12 POD IV CREATIVE (light, ghost IV). Header + intro + dark for-client box + 4 fixed capability cards + 2 benefit
// cards + the launch asset system (4 mini format frames). Capability cards are fixed doctrine; only copy varies.
const WAND = `<path d="m12 19 7-7 3 3-7 7-3-3z"></path><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="m2 2 7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle>`;
const CREATIVE_CAPS: { title: string; body: string }[] = [
  { title: "Dynamic formats", body: "High-impact statics, motion graphics, rapid-fire video and short-form, tested at volume." },
  { title: "AI influencers and ambassadors", body: "Bespoke AI brand ambassadors that resonate with niche demographics." },
  { title: "Performance copywriting", body: "Message engineered for the platform, the audience and the point in the journey." },
  { title: "Test, measure, optimise", body: "Creative testing and measurement built into the workflow, not bolted on after." },
];
function creativePage(d: ProposalDoc, ci: CiTokens): string {
  const caps = CREATIVE_CAPS.map((c) => `<div style="background:#FFFFFF;border-radius:14px;padding:14px 18px;box-shadow:0 6px 18px ${ci.shadow};"><div style="font-size:11.5px;font-weight:700;">${esc(c.title)}</div><div style="font-size:10.5px;color:${ci.muted};line-height:1.55;margin-top:4px;">${esc(c.body)}</div></div>`).join("");
  const frames = d.creative.asset_formats.slice(0, 4).map((f) =>
    `<div style="background:#FFFFFF;border-radius:12px;box-shadow:0 6px 18px ${ci.shadow};overflow:hidden;"><div style="height:56px;background:${ci.darkCard};display:flex;align-items:center;justify-content:center;position:relative;"><div style="position:absolute;top:6px;left:8px;font-size:6.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">${esc(f.ratio)}</div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${f.icon}</svg></div><div style="padding:8px 11px;"><div style="font-size:9px;font-weight:700;line-height:1.3;">${esc(f.title)}</div><div style="font-size:8px;color:${ci.muted};line-height:1.4;margin-top:2px;">${esc(f.caption)}</div></div></div>`).join("");
  const benefit = (eb: string, body: string) => `<div style="flex:1;background:${ci.tint};border-radius:14px;padding:12px 16px;"><div style="font-size:9px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentDeep};">${esc(eb)}</div>${body}</div>`;
  const p = (t: string) => `<div style="font-size:11px;line-height:1.6;color:${ci.body};margin-top:4px;">${esc(t)}</div>`;
  return section(pageLight("52px 60px 40px", "position:relative;overflow:hidden;"),
    ghostNumeral(ci, "IV", false)
    + podHeader(ci, WAND, "Pod IV of VIII · The Execution Layer", "Performance Creative Studio", "Emotive StorySelling", false)
    + `<p style="font-size:12.5px;line-height:1.7;color:${ci.body};margin:16px 0 0;">${esc(d.creative.intro)}</p>`
    + `<div style="margin-top:16px;background:${ci.darkCard};border-radius:16px;padding:18px 22px;color:#FFFFFF;"><div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentOnDark};">For ${esc(d.client_name)}</div><p style="font-size:12px;line-height:1.7;margin:8px 0 0;color:rgba(255,255,255,0.85);">${esc(d.creative.for_client)}</p></div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;">${caps}</div>`
    + `<div style="display:flex;gap:10px;margin-top:16px;">${benefit("Client benefit", p("More shots on goal, faster learning, and creative accountable to conversion rather than applause."))}${benefit("Connects forward", p("Supplies the assets Channel Management deploys to your defined audiences."))}</div>`
    + `<div style="margin-top:12px;background:#FAF5FE;border:1px solid #EEE3F8;border-radius:14px;padding:12px 16px;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:9px;">The launch asset system, format by format</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:9px;">${frames}</div></div>`
    + footerLight(ci, d.brand_short, 12));
}

// 13 POD V CHANNELS (light). intro + up to 5 channel rows (icon + name + role chip + what + why-italic).
function channelsPage(d: ProposalDoc, ci: CiTokens): string {
  const roleBg = (k: "lead" | "support" | "test") => k === "lead" ? ci.accentGrad : k === "support" ? ci.accentDeep : ci.accent;
  const row = (r: (typeof d.channels5.rows)[number]) =>
    `<div style="background:#FFFFFF;border-radius:12px;padding:12px 16px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:10px;">${disc(ci, 26, r.icon)}<div style="font-size:11.5px;font-weight:700;">${esc(r.name)}</div><div style="background:${roleBg(r.kind)};border-radius:999px;padding:3px 10px;font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FFFFFF;">${esc(r.role)}</div></div>`
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
    + podHeader(ci, WHATSAPP, "Pod VI of VIII · The Conversion Layer · Proprietary", "PSI · Pre-Sales Intelligence", "Interest into Intent", true)
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
  const podBlock = (roman: string, name: string, subtitle: string, para: string, chip: string) =>
    `<div style="background:#FFFFFF;border-radius:16px;padding:14px 18px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:10px;">${podDisc(ci, roman)}<div><div style="font-size:14px;font-weight:800;text-transform:uppercase;">${esc(name)}</div><div style="font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accent};">${esc(subtitle)}</div></div></div>`
    + `<p style="font-size:10px;line-height:1.55;color:${ci.body};margin:8px 0 0;">${esc(para)}</p>${tintChip(ci, chip)}</div>`;
  const kpiTile = (t: { label: string; spark: "line-down" | "bars" | "line-up" | "gauge"; caption: string }) =>
    `<div style="background:${ci.darkCard};border-radius:14px;padding:14px 18px;color:#FFFFFF;"><div style="font-size:9px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(t.label)}</div><div style="margin-top:6px;">${sparkline(ci, t.spark)}</div><div style="font-size:8.5px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-top:7px;">${esc(t.caption)}</div></div>`;
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "The System · Conversion and Learning Layers") + headline28(ci, p.headline)
    + `<div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">`
    +   podBlock("VII", "PSI Conversion Dashboard", "The bridge from marketing to your team", p.dashboard_para, p.dashboard_chip)
    +   podBlock("VIII", "Media on GAS", "Learns, reallocates and scales winners", p.media_para, p.media_chip)
    + `</div>`
    + `<div style="margin-top:12px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    +   `<div style="display:flex;justify-content:space-between;align-items:baseline;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};">The one screen the bi-weekly review argues from</div><div style="font-size:7.5px;letter-spacing:0.14em;text-transform:uppercase;color:#8A8496;">Illustrative preview · real baselines from week one</div></div>`
    +   `<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:10px;">${p.tiles.slice(0, 4).map(kpiTile).join("")}</div>`
    + `</div>`
    + footerLight(ci, d.brand_short, 15));
}

// 16 CLOSED LOOP (dark). Fixed 6-step wheel (ring + 6 arrow discs + 6 step cards + centre GAS disc); intro +
// compounding callout vary. The step titles are fixed doctrine; step 5's sub can be tuned per client.
const LOOP_STEPS: { left: number; top: number; title: string; sub: string }[] = [
  { left: 310, top: 85, title: "Research and strategise", sub: "The business brain sets the plan" },
  { left: 505, top: 197, title: "Target the audience", sub: "Precision over reach" },
  { left: 505, top: 423, title: "Create and deploy", sub: "StorySelling at machine speed" },
  { left: 310, top: 535, title: "Qualify with PSI", sub: "Interest scored into intent" },
  { left: 115, top: 423, title: "Manage and convert", sub: "Your team works warm leads" },
  { left: 115, top: 197, title: "Optimise and learn", sub: "Every result sharpens the next" },
];
const LOOP_ARROWS: { left: number; top: number; rot: number }[] = [
  { left: 422, top: 115, rot: 30 }, { left: 535, top: 310, rot: 90 }, { left: 422, top: 505, rot: 150 },
  { left: 198, top: 505, rot: 210 }, { left: 85, top: 310, rot: 270 }, { left: 198, top: 115, rot: 330 },
];
function closedLoopPage(d: ProposalDoc, ci: CiTokens): string {
  const arrow = (a: { left: number; top: number; rot: number }) =>
    `<div style="position:absolute;left:${a.left}px;top:${a.top}px;transform:translate(-50%,-50%) rotate(${a.rot}deg);width:26px;height:26px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px rgba(155,79,201,0.5);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></div>`;
  const stepCard = (s: { left: number; top: number; title: string; sub: string }, i: number) =>
    `<div style="position:absolute;left:${s.left}px;top:${s.top}px;transform:translate(-50%,-50%);width:172px;background:rgba(28,17,64,0.85);border:1px solid rgba(199,125,232,0.4);border-radius:14px;padding:10px 12px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.35);"><div style="font-size:9px;font-weight:600;letter-spacing:0.18em;color:${ci.accentOnDark};">STEP ${i + 1}</div><div style="font-size:12px;font-weight:700;margin-top:2px;line-height:1.3;">${esc(s.title)}</div><div style="font-size:9.5px;color:rgba(255,255,255,0.65);line-height:1.4;margin-top:2px;">${esc(i === 4 && d.closedloop.step5_sub ? d.closedloop.step5_sub : s.sub)}</div></div>`;
  return section(pageDark(ci, "52px 60px 40px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">07 · Ecosystem Integration</div>`
    + `<div style="font-size:30px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:10px;">One closed-loop <span style="background:${ci.accentGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">growth system</span></div>`
    + `<p style="font-size:12.5px;line-height:1.7;color:rgba(255,255,255,0.75);margin:14px 0 0;">${esc(d.closedloop.intro)}</p>`
    + `<div style="flex:1;display:flex;align-items:center;justify-content:center;margin-top:6px;"><div style="position:relative;width:620px;height:620px;">`
    +   `<svg width="620" height="620" viewBox="0 0 620 620" style="position:absolute;inset:0;"><circle cx="310" cy="310" r="225" fill="none" stroke="rgba(199,125,232,0.35)" stroke-width="2" stroke-dasharray="3 7"></circle></svg>`
    +   LOOP_ARROWS.map(arrow).join("") + LOOP_STEPS.map(stepCard).join("")
    +   `<div style="position:absolute;left:310px;top:310px;transform:translate(-50%,-50%);width:230px;height:230px;border-radius:50%;background:radial-gradient(circle,rgba(155,79,201,0.35) 0%,rgba(155,79,201,0) 70%);"></div>`
    +   `<div style="position:absolute;left:310px;top:310px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;text-align:center;"><div style="width:89px;height:89px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:25px;color:#FFFFFF;box-shadow:0 0 44px rgba(155,79,201,0.75),0 0 0 6px rgba(255,255,255,0.08);">GAS</div><div style="font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin-top:12px;">The Agency of NOW</div><div style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:4px;background:${ci.coverTextGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">From Interest to Intent</div></div>`
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
    + `<div style="margin-top:9px;background:${ci.accentGrad};border-radius:999px;padding:5px 12px;font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#FFFFFF;align-self:flex-start;">${esc(w.gate)}</div></div>`;
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
  const pill = (t: string) =>
    `<div style="display:flex;align-items:center;gap:7px;background:${ci.darkCard};border-radius:999px;padding:6px 11px;color:#FFFFFF;white-space:nowrap;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${SHIELD}</svg><span style="font-size:7.8px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${t}</span></div>`;
  return section(pageLight("52px 60px 40px"),
    eyebrow(ci, "10 · Governance") + headline(ci, { lead: "Trusted with data,", gradient: "by design." })
    + `<p style="font-size:11.5px;line-height:1.7;color:${ci.body};margin:12px 0 0;">${esc(d.governance.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;">${d.governance.commitments.slice(0, 8).map((c) => card(c.title, c.body)).join("")}</div>`
    + `<div style="margin-top:12px;background:#FFFFFF;border-radius:14px;padding:12px 18px;box-shadow:0 6px 18px ${ci.shadow};display:flex;align-items:center;gap:10px;justify-content:space-between;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accent};white-space:nowrap;">Compliance stack</div><div style="display:flex;gap:8px;flex-wrap:nowrap;">${["POPIA", "GDPR-aligned", "Platform policies", "Verified-claims register"].map(pill).join("")}</div></div>`
    + footerLight(ci, d.brand_short, 19));
}

// 20 "NO FINE PRINT" DIVIDER (dark). Fixed giant type + subhead + 4 chips; one client line.
function dealDividerPage(d: ProposalDoc, ci: CiTokens): string {
  const chips = ["Rate card", "Commercial terms", "One-page agreement", "Sign-off"]
    .map((t) => `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.18);border-radius:999px;padding:7px 16px;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">${t}</div>`).join("");
  return section(pageDark(ci, "56px 64px 44px", "position:relative;overflow:hidden;background:" + ci.darkCard + ";"),
    `<div style="position:absolute;right:-160px;top:-160px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,${ci.glow} 0%,rgba(199,125,232,0) 70%);"></div>`
    + `<div style="font-size:11px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};position:relative;">The Commercials</div>`
    + `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;position:relative;">`
    +   `<div style="font-size:84px;font-weight:800;line-height:0.98;letter-spacing:-0.02em;text-transform:uppercase;background:${ci.coverTextGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">No Fine Print</div>`
    +   `<div style="font-size:36px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:18px;max-width:660px;">One tier. One page of terms.</div>`
    +   `<p style="font-size:14px;line-height:1.7;color:rgba(255,255,255,0.68);margin:16px 0 0;max-width:500px;">${esc(d.deal_divider)}</p>`
    + `</div>`
    + `<div style="display:flex;flex-wrap:wrap;gap:8px;position:relative;">${chips}</div>`
    + footerDark(d.brand_short, null, "28px"));
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
    eyebrow(ci, "11 · Investment") + headline(ci, { lead: "The investment ·", gradient: `the ${iv.tier_name} system` })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.body};margin:12px 0 0;">${esc(iv.intro)}</p>`
    + `<div style="margin-top:16px;background:${ci.darkPage};border-radius:18px;padding:22px 26px;color:#FFFFFF;position:relative;box-shadow:0 12px 30px rgba(46,26,74,0.28);">`
    +   `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div><div style="font-size:20px;font-weight:800;text-transform:uppercase;">${esc(iv.tier_name)}</div><div style="font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ci.accentOnDark};margin-top:2px;">${esc(iv.tagline)}</div></div><div style="background:${ci.accentGrad};border-radius:999px;padding:6px 14px;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;white-space:nowrap;align-self:flex-start;">${esc(iv.poc_chip)}</div></div>`
    +   `<div style="display:flex;align-items:baseline;gap:14px;margin-top:8px;"><div style="font-size:58px;font-weight:800;letter-spacing:-0.02em;line-height:1;background:${ci.coverTextGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">${esc(iv.price)}</div><div style="font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.65);line-height:1.5;">${esc(iv.price_unit).replace(/&lt;br\s*\/?&gt;/gi, "<br>")}</div></div>`
    +   `<p style="font-size:11px;line-height:1.65;color:rgba(255,255,255,0.75);margin:10px 0 0;">${esc(iv.body)}</p>`
    +   `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">${iv.inclusions.slice(0, 8).map(incl).join("")}</div>`
    + `</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px;">${iv.footnotes.slice(0, 3).map(foot).join("")}</div>`
    + `<p style="font-size:10px;line-height:1.6;color:${ci.muted};margin:12px 0 0;">${esc(iv.honest_para)}</p>`
    + footerLight(ci, d.brand_short, 21));
}

// 22 TERMS AND CLOSING (dark). 4 term cards + PoC-proves callout + 3 chips + logo footer.
function termsPage(d: ProposalDoc, ci: CiTokens): string {
  const t = d.terms;
  const glass = (label: string, body: string) =>
    `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.20);border-radius:16px;padding:16px 20px;"><div style="font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${ci.accentOnDark};">${esc(label)}</div><p style="font-size:11.5px;line-height:1.65;color:rgba(255,255,255,0.85);margin:6px 0 0;">${esc(body)}</p></div>`;
  const chip = (t2: string, accent: boolean) => accent
    ? `<div style="background:${ci.accentGrad};border-radius:999px;padding:9px 20px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">${esc(t2)}</div>`
    : `<div style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:9px 20px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;">${esc(t2)}</div>`;
  const clientMark = d.client_logo
    ? `<img src="${esc(d.client_logo.src)}" alt="${esc(d.client_name)}" width="126" height="44" style="width:126px;height:44px;">`
    : `<span style="font-size:12px;font-weight:700;color:#FFFFFF;">${esc(d.client_name)}</span>`;
  return section(pageDark(ci, "52px 60px 44px"),
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accentOnDark};">12 · Commercial Terms and Next Steps</div>`
    + `<div style="font-size:30px;font-weight:800;text-transform:uppercase;line-height:1.04;margin-top:12px;">We are not keeping pace with the future of marketing. <span style="background:${ci.accentGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accentOnDark};">We are writing its rulebook.</span></div>`
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
    eyebrow(ci, "13 · Agency Agreement") + headline(ci, { lead: "Simple terms,", gradient: "in plain language." })
    + `<p style="font-size:11.5px;line-height:1.65;color:${ci.muted};margin:12px 0 0;">${esc(d.agreement.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;flex:1;">${cards}</div>`
    + `<div style="margin-top:14px;background:${ci.darkPage};border-radius:16px;padding:16px 24px;color:#FFFFFF;display:flex;align-items:center;gap:16px;"><div style="width:34px;height:34px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></div><div style="font-size:11.5px;line-height:1.6;color:rgba(255,255,255,0.85);">That is the whole agreement: six clauses, one page. Deliberately simple, binding on signature, and written so a decision can be made in the room.</div></div>`);
}

// 24 SIGN-OFF (light). Two signature cards: client (data) + agency (fixed GAS/Gary Berman).
function signoffPage(d: ProposalDoc, ci: CiTokens): string {
  const s = d.signoff;
  // The client mark: their logo when on file, else a clean monogram of the client name (never an empty disc).
  const clientInitial = (d.client_name.trim()[0] || "•").toUpperCase();
  const clientMark = d.client_logo
    ? `<img src="${esc(d.client_logo.src)}" alt="${esc(d.client_name)}" style="width:32px;height:32px;border-radius:50%;object-fit:contain;background:#FFFFFF;">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:800;font-size:13px;">${esc(clientInitial)}</div>`;
  const sigRule = `<div style="margin-top:26px;"><div style="border-bottom:1.5px solid rgba(26,16,48,0.35);height:34px;"></div><div style="display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:${ci.muted};margin-top:6px;"><span>Signature</span><span>Date</span></div></div>`;
  const clientCard = `<div style="background:#FFFFFF;border-radius:18px;padding:22px 24px;box-shadow:0 8px 22px ${ci.shadow};display:flex;flex-direction:column;">`
    + `<div style="font-size:10px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accentDeep};">For the client</div>`
    + `<div style="font-size:16px;font-weight:800;text-transform:uppercase;margin-top:6px;">${esc(d.client_name)}</div>`
    + `<div style="margin-top:14px;"><div style="font-size:13px;font-weight:700;">Authorised Signatory</div><div style="font-size:11px;color:${ci.muted};margin-top:2px;">${esc(s.client.signatory_label)}</div></div>`
    + `<div style="font-size:10.5px;line-height:1.8;color:${ci.muted};margin-top:10px;">${s.client.contacts.map((c) => `<div>${esc(c)}</div>`).join("")}</div>`
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
    + footerLight(ci, d.brand_short, 24));
}

// ── document shell ────────────────────────────────────────────────────────────────────────────────────────────

// Assemble the full HTML document: Poppins from Google Fonts, one fixed A4 page box per section, print geometry.
export function renderProposalHtml(d: ProposalDoc, ci: CiTokens = deriveCiTokens()): string {
  const pages = [
    coverPage(d, ci), execPage(d, ci), opportunityPage(d, ci), strategyPage(d, ci), marketPage(d, ci),
    philosophyPage(d, ci), ecosystemPage(d, ci), dividerPage(d, ci),
    pods12Page(d, ci), audiencePage(d, ci), targetingPage(d, ci),
    creativePage(d, ci), channelsPage(d, ci), psiPage(d, ci), pods78Page(d, ci),
    closedLoopPage(d, ci), rolloutPage(d, ci), funnelPage(d, ci), governancePage(d, ci), dealDividerPage(d, ci),
    investmentPage(d, ci), termsPage(d, ci), agreementPage(d, ci), signoffPage(d, ci),
  ].join("\n");
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
