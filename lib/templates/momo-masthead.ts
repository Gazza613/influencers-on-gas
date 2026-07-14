import { fontFaceCss } from "../studio-render";

// MTN MOMO — FUNNEL MASTHEAD. Locked canvas 1080x811. Read off the client's own best-performing work.
//
// THE CONSTRUCTION, back to front (this is the grammar - it never changes between campaigns):
//   1. a MoMo-blue field
//   2. a soft radial glow behind the subject, lifting them off it
//   3. the YELLOW DISC - the brand's own signature. The subject stands in front of it.
//   4. an AMBER LIGHT STREAK that orbits the torso and hands - it passes BEHIND the subject and in FRONT
//      of the disc, which is what makes the composite read as one photograph rather than a cut-out pasted
//      on a circle. Two layers, one behind and one in front, is the whole trick.
//   5. the cut-out subject, holding a phone
//
// NO BAKED HEADLINE. Confirmed with Gary: the masthead and section 1 never carry baked copy - Webflow
// supplies the words beside the image as live HTML. So this canvas is pure image. Baking a headline here
// would collide with the page's own H1.
//
// The phone screen is a SLOT, not generated. Gary: "we do not always use the deal call outs on the phone,
// at times we use the MoMo app creatives". Both are supplied artwork, never AI-hallucinated UI - a made-up
// banking screen in a real bank's ad is a compliance problem, not a style one.

export type MastheadSlots = {
  /** The cut-out subject, background already removed (transparent PNG). */
  subject: string;
  /** What the phone shows: a supplied app screenshot / deal artwork, or nothing. Never generated. */
  phoneArt?: string | null;
  logoUrl: string;
  /** Off by default - the funnel page carries the full legal text in HTML beneath the hero. */
  complianceText?: string | null;
};

const MOMO_BLUE = "#004F71";
const MOMO_YELLOW = "#F9CB0F";

export function renderMomoMasthead(slots: MastheadSlots, fonts: { family: string; url: string }[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:811px;overflow:hidden}
.canvas{position:relative;width:1080px;height:811px;overflow:hidden;background:${MOMO_BLUE};
  font-family:'MTNBrighterSans',sans-serif;-webkit-font-smoothing:antialiased}

/* 2. The glow. Warm, off-centre, sitting under the disc - it stops the flat blue reading as a colour swatch. */
.glow{position:absolute;left:50%;top:46%;width:1020px;height:1020px;transform:translate(-50%,-50%);
  background:radial-gradient(circle,rgba(249,203,15,.30) 0%,rgba(249,203,15,.10) 42%,transparent 68%)}

/* 3. THE YELLOW DISC. The brand's signature shape. The subject stands in front of it. */
.disc{position:absolute;left:50%;top:50%;width:660px;height:660px;transform:translate(-50%,-50%);
  border-radius:50%;background:radial-gradient(circle at 38% 32%, #FFE45C 0%, ${MOMO_YELLOW} 46%, #E0AE00 100%)}

/* 4. THE LIGHT STREAK - BACK HALF. Passes behind the subject. */
.streak-back{position:absolute;left:50%;top:50%;width:900px;height:900px;transform:translate(-50%,-50%) rotate(-18deg);
  border-radius:50%;border:16px solid transparent;
  background:conic-gradient(from 200deg, transparent 0deg, rgba(255,196,60,0) 40deg, #FFC83C 96deg, #FFF2B8 132deg, rgba(255,200,60,0) 170deg, transparent 360deg);
  -webkit-mask:radial-gradient(circle, transparent 0 47%, #000 47.6% 50%, transparent 50.6%);
  mask:radial-gradient(circle, transparent 0 47%, #000 47.6% 50%, transparent 50.6%);
  filter:blur(2px) drop-shadow(0 0 26px rgba(255,190,50,.65))}

/* 5. THE SUBJECT. Cut out, anchored to the foot of the canvas so they stand ON the layout, not float in it. */
.subject{position:absolute;left:50%;bottom:0;height:96%;width:auto;transform:translateX(-50%);
  filter:drop-shadow(0 26px 50px rgba(0,20,32,.42))}

/* 4b. THE LIGHT STREAK - FRONT HALF. Crosses IN FRONT of the torso and hands. This overlap is what welds the
   cut-out to the disc; without it the subject reads as a sticker. Deliberately short - it is a highlight
   passing over them, not a ribbon wrapped around them. */
.streak-front{position:absolute;left:50%;top:50%;width:900px;height:900px;transform:translate(-50%,-50%) rotate(-18deg);
  border-radius:50%;pointer-events:none;
  background:conic-gradient(from 20deg, transparent 0deg, rgba(255,200,60,0) 26deg, #FFC83C 62deg, #FFF2B8 88deg, rgba(255,200,60,0) 120deg, transparent 360deg);
  -webkit-mask:radial-gradient(circle, transparent 0 47%, #000 47.6% 50%, transparent 50.6%);
  mask:radial-gradient(circle, transparent 0 47%, #000 47.6% 50%, transparent 50.6%);
  filter:blur(2px) drop-shadow(0 0 26px rgba(255,190,50,.7))}

/* The phone screen. SUPPLIED artwork, sized and skewed onto the device the subject is holding. */
.phone{position:absolute;left:50%;bottom:6%;width:196px;transform:translateX(96px) rotate(-6deg);
  border-radius:18px;box-shadow:0 18px 40px rgba(0,0,0,.4)}

.logo{position:absolute;top:40px;left:48px;height:88px;width:auto;
  filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}
.legal{position:absolute;left:0;right:0;bottom:0;padding:12px 48px;text-align:center;
  background:linear-gradient(to top, rgba(0,32,46,.92), rgba(0,32,46,0));
  font-weight:400;font-size:26px;line-height:1.3;color:rgba(255,255,255,.94)}
</style></head><body>
<div class="canvas">
  <div class="glow"></div>
  <div class="disc"></div>
  <div class="streak-back"></div>
  <img class="subject" src="${slots.subject}" alt="">
  <div class="streak-front"></div>
  ${slots.phoneArt ? `<img class="phone" src="${slots.phoneArt}" alt="">` : ""}
  ${slots.logoUrl ? `<img class="logo" src="${slots.logoUrl}" alt="MoMo">` : ""}
  ${slots.complianceText ? `<div class="legal">${slots.complianceText}</div>` : ""}
</div>
</body></html>`;
}
