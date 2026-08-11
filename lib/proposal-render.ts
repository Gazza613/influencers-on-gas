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
  const ic = Math.round(size * 0.53);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${ci.iconDisc};display:flex;align-items:center;justify-content:center;flex-shrink:0;">`
    + `<svg width="${ic}" height="${ic}" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${inner}</svg></div>`;
}

const eyebrow = (ci: CiTokens, t: string) =>
  `<div style="font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:${ci.accent};">${esc(t)}</div>`;

// Section headline with one gradient phrase (background-clip:text). size defaults to the 30px content-page headline.
function headline(ci: CiTokens, h: Headline, size = 30): string {
  return `<div style="font-size:${size}px;font-weight:800;text-transform:uppercase;line-height:1.1;margin-top:10px;">${esc(h.lead)} `
    + `<span style="background:${ci.accentGrad};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${ci.accent};">${esc(h.gradient)}</span></div>`;
}

// The light-page footer rule: constant left, "Client · NN" right (NN zero-padded, regenerated on add/remove).
const footerLight = (ci: CiTokens, brandShort: string, n: number) =>
  `<div style="margin-top:auto;padding-top:14px;border-top:1px solid rgba(26,16,48,0.12);display:flex;justify-content:space-between;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:${ci.muted};">`
  + `<span>GAS Marketing Automation · The Agency of NOW</span><span>${esc(brandShort)} · ${String(n).padStart(2, "0")}</span></div>`;

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
    +   `<div style="font-size:46px;font-weight:800;line-height:1.08;text-transform:uppercase;letter-spacing:-0.01em;max-width:660px;">${esc(d.cover.headline.lead)} `
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
    `<div style="display:flex;align-items:center;gap:10px;">${disc(ci, 30, c.icon)}<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${esc(c.title)}</div></div>`
    + `<p style="font-size:11px;line-height:1.65;color:${ci.muted};margin:6px 0 0;">${esc(c.body)}</p>`)).join("");
  return `<section class="page" style="${pageLight("52px 60px 40px")}">`
    + eyebrow(ci, "01 · Executive Summary") + headline(ci, d.exec.headline)
    + `<p style="font-size:11.5px;line-height:1.7;color:${ci.body};margin:12px 0 0;">${esc(d.exec.intro)}</p>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;flex:1;">${cards}</div>`
    + journeyStrip(ci)
    + footerLight(ci, d.brand_short, 2) + `</section>`;
}

// The fixed journey strip (doctrine: paid ad -> WhatsApp -> PSI score -> booked step). Never landing-page/form.
const JOURNEY: { icon: string; label: string; sub: string }[] = [
  { icon: `<path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>`, label: "Paid ad", sub: "Meta, LinkedIn, Google" },
  { icon: `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>`, label: "WhatsApp", sub: "One click, no forms" },
  { icon: `<path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path>`, label: "PSI score", sub: "Qualified in-conversation" },
  { icon: `<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path><path d="m9 16 2 2 4-4"></path>`, label: "Tasting booked", sub: "Routed to the sales team" },
];
function journeyStrip(ci: CiTokens): string {
  const arrow = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${ci.arrow}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>`;
  const nodes = JOURNEY.map((s) =>
    `<div style="display:flex;align-items:center;gap:9px;">${disc(ci, 32, s.icon)}<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${esc(s.label)}</div><div style="font-size:8.5px;color:${ci.muted};line-height:1.4;">${esc(s.sub)}</div></div></div>`
  ).join(arrow);
  return `<div style="margin-top:14px;background:#FFFFFF;border-radius:16px;padding:14px 20px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="font-size:8.5px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${ci.accent};margin-bottom:9px;">The journey, deliberately short</div>`
    + `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:nowrap;">${nodes}</div></div>`;
}

// 03 THE OPPORTUNITY (light). two paras + 6 stat cards (3x2) + dark "definition of success" box.
function opportunityPage(d: ProposalDoc, ci: CiTokens): string {
  const paras = d.opportunity.paras.map((p, i) =>
    `<p style="font-size:11.5px;line-height:1.7;color:${ci.body};margin:${i === 0 ? "12px" : "10px"} 0 0;">${esc(p)}</p>`).join("");
  const stats = d.opportunity.stat_cards.slice(0, 6).map((s) => card(ci, "16px 20px",
    `<div style="display:flex;align-items:center;gap:9px;">${disc(ci, 26, s.icon)}<div style="font-size:24px;font-weight:800;color:${ci.accent};">${esc(s.stat)}</div></div>`
    + `<div style="font-size:10.5px;line-height:1.55;color:${ci.muted};margin-top:4px;">${esc(s.body)}</div>`
    + `<div style="font-size:8.5px;letter-spacing:0.14em;text-transform:uppercase;color:${ci.accent};margin-top:6px;">${esc(s.source)}</div>`)).join("");
  return `<section class="page" style="${pageLight("52px 60px 40px")}">`
    + eyebrow(ci, "02 · The Opportunity") + headline(ci, d.opportunity.headline) + paras
    + `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px;">${stats}</div>`
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

// 05 MARKET INTELLIGENCE (light). intro + split bar + 4 dark sourced quote cards (2x2) + 6 "what we do" cards (2x3).
function marketPage(d: ProposalDoc, ci: CiTokens): string {
  const s = d.market.split;
  const splitBar = `<div style="margin-top:10px;background:#FFFFFF;border-radius:14px;padding:12px 18px;box-shadow:0 6px 18px ${ci.shadow};">`
    + `<div style="display:flex;align-items:center;gap:10px;"><div style="width:34%;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${ci.muted};">${esc(s.left_label)}</div>`
    +   `<div style="flex:1;display:flex;align-items:center;"><div style="width:${s.left_width};height:16px;background:#D9D2E5;border-radius:8px 3px 3px 8px;margin-left:auto;"></div><div style="width:2px;height:26px;background:#1A1030;margin:0 6px;border-radius:2px;"></div><div style="width:${s.right_width};height:16px;background:linear-gradient(90deg,${ci.accent} 0%,${ci.accentDeep} 100%);border-radius:3px 8px 8px 3px;"></div></div>`
    +   `<div style="width:12%;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${ci.accentDeep};">${esc(s.right_label)}</div></div>`
    + `<div style="display:flex;align-items:center;gap:10px;margin-top:5px;"><div style="width:34%;text-align:right;font-size:14px;font-weight:800;color:#8A8496;">${esc(s.left_pct)}</div><div style="flex:1;text-align:center;font-size:8px;letter-spacing:0.16em;text-transform:uppercase;color:${ci.muted};">${esc(s.caption)}</div><div style="width:12%;font-size:14px;font-weight:800;color:${ci.accentDeep};">${esc(s.right_pct)}</div></div></div>`;
  const quotes = d.market.quotes.slice(0, 4).map((q) => quoteCard(ci, q.body, q.source)).join("");
  const actions = d.market.actions.slice(0, 6).map((a) => proofCard(ci, a.title, a.body)).join("");
  return section(pageLight("48px 60px 36px"),
    eyebrow(ci, "04 · Market Intelligence") + headline(ci, d.market.headline)
    + `<p style="font-size:10.5px;line-height:1.6;color:${ci.body};margin:10px 0 0;">${esc(d.market.intro)}</p>`
    + splitBar
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px;">${quotes}</div>`
    + miniEyebrow(ci, "What we do about it", "12px")
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px;">${actions}</div>`
    + footerLight(ci, d.brand_short, 5));
}

// ── document shell ────────────────────────────────────────────────────────────────────────────────────────────

// Assemble the full HTML document: Poppins from Google Fonts, one fixed A4 page box per section, print geometry.
export function renderProposalHtml(d: ProposalDoc, ci: CiTokens = deriveCiTokens()): string {
  const pages = [coverPage(d, ci), execPage(d, ci), opportunityPage(d, ci), strategyPage(d, ci), marketPage(d, ci)].join("\n");
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
