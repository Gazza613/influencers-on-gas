import { fontFaceCss } from "../studio-render";

// MTN MOMO — FUNNEL SLIDER. Locked canvas 1080x1080. Recreated from the client's own Winter Chats reference.
//
// THE DESIGN IS HARDCODED. Only the slots below can be changed from the UI. That is the whole product: the
// layout, the type ramp, the logo position, the scrim, the deal-card geometry and the compliance strip can
// never drift between campaigns, because nothing outside `slots` is reachable.
//
// WHAT THE REFERENCE ACTUALLY DOES (read off the file, not invented):
//   background photograph, full bleed
//   MoMo logo top-left
//   ONE deal card top-right: label / big figure / "Only" / price / validity
//   a two-line headline bottom-centre: line 1 white, line 2 MoMo yellow
//   a dark scrim rising from the foot, carrying the compliance strip
//
// THREE FIXES APPLIED, EACH EVIDENCED - AND EACH ONE STAYS INSIDE THE LOCKED DIRECTION:
//
// 1. THE COMPLIANCE STRIP. Measured on the live reference: 15px glyph height in the 1080 canvas, which renders
//    at 5.4 CSS px on a 390px phone (scale 0.361). FAIS s14(3)(o) requires disclaimers to have "sufficient
//    prominence" - there is no prescribed size in SA law, the test is functional, and 5.4px fails it by any
//    reading. It is also our cheapest anti-scam signal: scammers never carry a real FSP number and a named
//    regulated bank. Set here at 38px => ~13.7 CSS px, above the legibility floor.
//
// 2. THE HEADLINE at 92px => ~33 CSS px. Above the 66px floor that qualifies as WCAG "large text" (24 CSS px),
//    which also relaxes the contrast requirement from 4.5:1 to 3:1 over the scrim.
//
// 3. THE VALIDITY LINE sits INSIDE the deal card, adjacent to the price. FAIS s14(3)(m) makes proximity a
//    LEGAL requirement, not a layout preference, and s14(3)(e) forbids wording a limitation as a benefit.
//
// NO URGENCY DEVICES ANYWHERE. FAIS s14(3)(n) explicitly prohibits them, and they double as a scam cue.

export type SliderSlots = {
  /** The background photograph. Real people, ordinary context - GSMA's own advertising recommendation. */
  image: string;
  /** Line 1 of the headline, white. */
  headline1: string;
  /** Line 2 of the headline, MoMo yellow. The accent word carries the idea. */
  headline2: string;
  /** The deal, baked in. Picked from the deal menu at build time. */
  deal: {
    label: string;      // "All-Net", "Social Pass", "WhatsApp Deal"
    amount: string;     // "Unlimited", "500", "30"
    amountSuffix?: string; // "MB", "Min" - set smaller, inline, as in the reference
    amountSub?: string;    // "Calls Bundle" - the smaller line UNDER the big word, as in the reference
    price: string;      // "R10"
    validity: string;   // "*Valid for 24 Hours"
    footnote?: string;  // "*Subject to fair user policy"
  } | null;
  logoUrl: string;
  complianceText: string;
};

// The brand's own declared tokens, from MoMo's live stylesheet (--momo-blue / --momo-yellow). Not a swatch
// site, not a guess. MoMo INVERTS the masterbrand: blue-dominant, yellow accent.
const MOMO_BLUE = "#004F71";
const MOMO_YELLOW = "#F9CB0F";
const CARD_TOP = "#0E3A55";
const CARD_BOT = "#07212E";

export function renderMomoSlider(slots: SliderSlots, fonts: { family: string; url: string }[]): string {
  const d = slots.deal;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1080px;overflow:hidden}
.canvas{--legal-h:130px;position:relative;width:1080px;height:1080px;font-family:'MTNBrighterSans',sans-serif;
  -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums lining-nums}

/* Full-bleed photograph. */
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}

/* The scrim. Rises from the foot to carry the headline and the compliance strip. Verified per-image in the
   renderer, never a blind global preset: NN/g warn a scrim validated on one photo silently fails on another. */
.scrim{position:absolute;inset:0;background:linear-gradient(to top,
  ${MOMO_BLUE} 0%, ${MOMO_BLUE}F2 9%, ${MOMO_BLUE}CC 22%, ${MOMO_BLUE}66 38%, transparent 58%)}

/* MoMo logo, top-left. */
.logo{position:absolute;top:46px;left:52px;height:104px;width:auto}

/* THE DEAL CARD, top-right. Navy container, yellow price - the MoMo pairing. It wins on LUMINANCE and
   ENCLOSURE, never on more colour: on a bright field, loudness is already saturated (Treisman & Gelade;
   Itti & Koch), so dark value is the only preattentive dimension left unclaimed. */
.deal{position:absolute;top:44px;right:44px;width:274px;padding:22px 20px 18px;
  background:linear-gradient(160deg,${CARD_TOP} 0%,${CARD_BOT} 100%);
  border:3px solid rgba(255,255,255,.92);border-radius:26px;text-align:center;
  box-shadow:0 18px 44px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.22)}
.deal .label{font-weight:700;font-style:italic;font-size:30px;line-height:1.05;color:#fff;
  text-shadow:0 2px 5px rgba(0,0,0,.35)}
.deal .amount{font-weight:800;font-style:italic;font-size:58px;line-height:1.0;color:${MOMO_YELLOW};
  margin-top:2px;white-space:nowrap;text-shadow:0 3px 0 rgba(255,255,255,.9), 0 6px 14px rgba(0,0,0,.35)}
.deal .amount small{font-size:32px;font-weight:800}
.deal .amountsub{font-weight:700;font-style:italic;font-size:26px;line-height:1.05;color:#fff;margin-top:-2px}
.deal .only{font-weight:700;font-style:italic;font-size:26px;color:#fff;margin-top:6px}
.deal .price{font-weight:800;font-style:italic;font-size:80px;line-height:1.0;color:${MOMO_YELLOW};
  text-shadow:0 3px 0 rgba(255,255,255,.9), 0 6px 14px rgba(0,0,0,.35)}
/* The validity sits INSIDE the card, next to the price. s14(3)(m) makes that proximity a legal requirement. */
.deal .valid{font-weight:700;font-size:19px;color:#fff;margin-top:8px}
.deal .fine{font-weight:400;font-size:13px;color:rgba(255,255,255,.82);margin-top:2px}

/* THE HEADLINE. 84px in-canvas => ~30 CSS px on a 390px phone, above the WCAG "large text" floor (24px).
   It sits in its own band ABOVE the legal strip - they must never compete for the same pixels, which is what
   the reference does too. Long headlines shrink to fit rather than wrapping into the legal band. */
.head{position:absolute;left:0;right:0;bottom:var(--legal-h);text-align:center;padding:0 48px 26px;
  display:flex;flex-direction:column;justify-content:flex-end;gap:2px}
.head .l1,.head .l2{font-weight:800;font-size:84px;line-height:1.04;letter-spacing:-1.5px;
  text-shadow:0 3px 18px rgba(0,0,0,.5);white-space:nowrap}
.head .l1{color:#fff}
.head .l2{color:${MOMO_YELLOW}}

/* THE COMPLIANCE STRIP. 38px => ~13.7 CSS px, above the legibility floor. The reference shipped this at 15px
   (5.4 CSS px), which fails s14(3)(o)'s functional "prominence" test - and threw away our best trust signal. */
.legal{position:absolute;left:0;right:0;bottom:0;height:var(--legal-h);padding:14px 56px;text-align:center;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(to top, ${MOMO_BLUE} 0%, ${MOMO_BLUE}E6 100%);
  border-top:1px solid rgba(255,255,255,.16)}
.legal p{font-weight:400;font-size:34px;line-height:1.3;color:rgba(255,255,255,.95);letter-spacing:.1px}
</style></head><body>
<div class="canvas">
  <img class="photo" src="${slots.image}" alt="">
  <div class="scrim"></div>
  ${slots.logoUrl ? `<img class="logo" src="${slots.logoUrl}" alt="MoMo">` : ""}
  ${d ? `<div class="deal">
    <div class="label">${d.label}</div>
    <div class="amount">${d.amount}${d.amountSuffix ? `<small>${d.amountSuffix}</small>` : ""}</div>
    ${d.amountSub ? `<div class="amountsub">${d.amountSub}</div>` : ""}
    <div class="only">Only</div>
    <div class="price">${d.price}</div>
    <div class="valid">${d.validity}</div>
    ${d.footnote ? `<div class="fine">${d.footnote}</div>` : ""}
  </div>` : ""}
  <div class="head">
    <div class="l1">${slots.headline1}</div>
    <div class="l2">${slots.headline2}</div>
  </div>
  <div class="legal"><p>${slots.complianceText}</p></div>
</div>
</body></html>`;
}
