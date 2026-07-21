import { fontFaceCss } from "../studio-render";
import type { Deal } from "../studio-producer";

// MTN MOMO — FUNNEL SECTION 1. Locked canvas 1239x1080 (confirmed by Gary against the live funnel).
//
// Same grammar as the masthead - blue field, yellow disc, cut-out subject - but this canvas carries the
// DEAL CARDS, floating around the subject. It is the "here is what you actually get" beat of the page.
// Still NO baked headline: Webflow supplies the section heading beside it.
//
// THE CARDS ARE THE SAME OBJECT as the slider's deal card. One anatomy, rendered at two sizes, never
// redrawn - a deal card that looks different on the hero and the slider tells the customer the two pages
// are not the same company, which on a money product is the exact doubt we are trying to remove.
//
// WHY THEY SIT LEFT AND RIGHT, NOT OVER THE SUBJECT: the cards win attention on LUMINANCE (dark navy on a
// bright field) and ENCLOSURE. Both of those collapse if the card overlaps the busy edge of a cut-out.

// SECTION 1 IS PURE WHITE (Gary: "plain white background #FFFFFF, lock it in"). It drops into the white Webflow
// section, so the field is #ffffff - not the MoMo blue the masthead uses. The disc, the navy deal cards and the
// subject all read cleanly on white; the blue glow that lifted the subject off a blue field is removed, because
// on white it would only haze the clean background Gary asked for.
const SECTION1_WHITE = "#ffffff";
const MOMO_YELLOW = "#F9CB0F";
const CARD_TOP = "#0E3A55";
const CARD_BOT = "#07212E";

export type Section1Slots = {
  subject: string;            // cut-out, transparent PNG
  deals: Deal[];              // 2 to 4. Placed on alternating sides, never over the face.
  logoUrl: string;
  complianceText?: string | null;
};

// Where each card lands. Alternating sides, staggered heights, so they read as orbiting the subject rather
// than as a list bolted to the edge.
// The logo occupies the top-left to y=128px. Card 1 used to start at y=96 and printed straight over
// "from MTN" - the brand's own endorsement line, which is the last thing on this canvas allowed to be
// obscured. Every spot now clears the logo band.
const SPOTS = [
  "top:172px;left:44px",
  "top:118px;right:44px",
  "bottom:104px;left:56px",
  "bottom:150px;right:56px",
];

function card(d: Deal, i: number): string {
  return `<div class="deal" style="${SPOTS[i] || SPOTS[3]}">
    <div class="label">${d.label}</div>
    <div class="amount">${d.amount}${d.amountSuffix ? `<small>${d.amountSuffix}</small>` : ""}</div>
    ${d.amountSub ? `<div class="amountsub">${d.amountSub}</div>` : ""}
    <div class="only">Only</div>
    <div class="price">${d.price}</div>
    <div class="valid">${d.validity}</div>
    ${d.footnote ? `<div class="fine">${d.footnote}</div>` : ""}
  </div>`;
}

export function renderMomoSection1(slots: Section1Slots, fonts: { family: string; url: string }[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1239px;height:1080px;overflow:hidden}
.canvas{position:relative;width:1239px;height:1080px;overflow:hidden;background:${SECTION1_WHITE};
  font-family:'MTNBrighterSans',sans-serif;-webkit-font-smoothing:antialiased;
  font-variant-numeric:tabular-nums lining-nums}

 /* FLAT. A radial 3D gradient turns the brand's signature disc into a lemon - the fastest route to clip art. */
.disc{position:absolute;left:50%;top:52%;width:640px;height:640px;transform:translate(-50%,-50%);
  border-radius:50%;background:${MOMO_YELLOW}}
/* The ring ORBITS the disc, outside its edge - it is not a highlight on it. Same object, two arcs: one behind
   the subject, one in front. That overlap is what welds the cut-out to the disc. */
.streak-back{position:absolute;left:50%;top:52%;width:862px;height:862px;transform:translate(-50%,-50%) rotate(-13deg);
  border-radius:50%;
  background:conic-gradient(from 118deg, rgba(255,200,60,0) 0deg, #FFC83C 34deg, #FFF3BC 62deg, #FFC83C 86deg, rgba(255,200,60,0) 116deg, transparent 360deg);
  -webkit-mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  filter:blur(1.5px) drop-shadow(0 0 30px rgba(255,190,50,.7))}
.subject{position:absolute;left:50%;bottom:0;height:92%;width:auto;transform:translateX(-50%);
  filter:drop-shadow(0 26px 50px rgba(0,20,32,.42))}
.streak-front{position:absolute;left:50%;top:52%;width:862px;height:862px;transform:translate(-50%,-50%) rotate(-13deg);
  border-radius:50%;pointer-events:none;
  background:conic-gradient(from 300deg, rgba(255,200,60,0) 0deg, #FFC83C 26deg, #FFF3BC 50deg, #FFC83C 72deg, rgba(255,200,60,0) 98deg, transparent 360deg);
  -webkit-mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  filter:blur(1.5px) drop-shadow(0 0 30px rgba(255,190,50,.75))}

/* THE DEAL CARDS. Identical anatomy to the slider's, scaled for this canvas. Validity stays INSIDE the card,
   adjacent to the price - FAIS s14(3)(m) makes that proximity a legal requirement, not a layout choice. */
.deal{position:absolute;width:262px;padding:20px 18px 16px;
  background:linear-gradient(160deg,${CARD_TOP} 0%,${CARD_BOT} 100%);
  border:3px solid rgba(255,255,255,.92);border-radius:24px;text-align:center;
  box-shadow:0 18px 44px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.22)}
.deal .label{font-weight:700;font-style:italic;font-size:28px;line-height:1.05;color:#fff;
  text-shadow:0 2px 5px rgba(0,0,0,.35)}
.deal .amount{font-weight:800;font-style:italic;font-size:54px;line-height:1.0;color:${MOMO_YELLOW};
  margin-top:2px;white-space:nowrap;text-shadow:0 3px 0 rgba(255,255,255,.9), 0 6px 14px rgba(0,0,0,.35)}
.deal .amount small{font-size:30px;font-weight:800}
.deal .amountsub{font-weight:700;font-style:italic;font-size:24px;line-height:1.05;color:#fff;margin-top:-2px}
.deal .only{font-weight:700;font-style:italic;font-size:24px;color:#fff;margin-top:5px}
.deal .price{font-weight:800;font-style:italic;font-size:74px;line-height:1.0;color:${MOMO_YELLOW};
  text-shadow:0 3px 0 rgba(255,255,255,.9), 0 6px 14px rgba(0,0,0,.35)}
.deal .valid{font-weight:700;font-size:18px;color:#fff;margin-top:7px}
.deal .fine{font-weight:400;font-size:13px;color:rgba(255,255,255,.82);margin-top:2px}

.logo{position:absolute;top:40px;left:48px;height:88px;width:auto;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}
.legal{position:absolute;left:0;right:0;bottom:0;padding:12px 48px;text-align:center;
  background:linear-gradient(to top, rgba(0,32,46,.92), rgba(0,32,46,0));
  font-weight:400;font-size:28px;line-height:1.3;color:rgba(255,255,255,.94)}
</style></head><body>
<div class="canvas">
  <div class="disc"></div>
  <div class="streak-back"></div>
  <img class="subject" src="${slots.subject}" alt="">
  <div class="streak-front"></div>
  ${slots.deals.slice(0, 4).map(card).join("")}
  ${slots.logoUrl ? `<img class="logo" src="${slots.logoUrl}" alt="MoMo">` : ""}
  ${slots.complianceText ? `<div class="legal">${slots.complianceText}</div>` : ""}
</div>
</body></html>`;
}
