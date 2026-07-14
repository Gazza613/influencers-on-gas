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
.glow{position:absolute;left:50%;top:46%;width:1300px;height:1300px;transform:translate(-50%,-50%);
  background:radial-gradient(circle,rgba(0,120,166,.55) 0%,rgba(0,90,128,.22) 45%,transparent 70%)}

/* 3. THE YELLOW DISC. FLAT. The brand's signature shape is a disc, not a sphere - a radial 3D gradient turns
   it into a lemon, which is the single fastest way to make this look like clip art. One flat brand yellow,
   with only the faintest warm lift so it does not read as a colour swatch. */
.disc{position:absolute;left:50%;top:50%;width:604px;height:604px;transform:translate(-50%,-50%);
  border-radius:50%;background:${MOMO_YELLOW}}

/* 4. THE LIGHT STREAK. A ring ORBITING the disc, sitting outside its edge - not a highlight ON it. Radius is
   set so the ring clears the 330px disc with room to read as a separate object. The conic gradient makes it a
   short arc rather than a full circle: it is a streak of light passing through the frame. */
.streak-back{position:absolute;left:50%;top:50%;width:812px;height:812px;transform:translate(-50%,-50%) rotate(-16deg);
  border-radius:50%;
  background:conic-gradient(from 118deg, rgba(255,200,60,0) 0deg, #FFC83C 34deg, #FFF3BC 62deg, #FFC83C 86deg, rgba(255,200,60,0) 116deg, transparent 360deg);
  -webkit-mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  filter:blur(1.5px) drop-shadow(0 0 30px rgba(255,190,50,.75))}

/* 5. THE SUBJECT. Cut out, anchored to the foot of the canvas so they stand ON the layout, not float in it. */
.subject{position:absolute;left:50%;bottom:0;height:93%;width:auto;transform:translateX(-50%);
  filter:drop-shadow(0 26px 50px rgba(0,20,32,.42))}

/* 4b. THE SAME RING, FRONT HALF. Identical geometry, a different arc of it - so it is visibly ONE ring that
   passes behind the subject on one side and in front of them on the other. That single overlap is what welds
   the cut-out to the disc; without it the subject reads as a sticker. */
.streak-front{position:absolute;left:50%;top:50%;width:812px;height:812px;transform:translate(-50%,-50%) rotate(-16deg);
  border-radius:50%;pointer-events:none;
  background:conic-gradient(from 300deg, rgba(255,200,60,0) 0deg, #FFC83C 26deg, #FFF3BC 50deg, #FFC83C 72deg, rgba(255,200,60,0) 98deg, transparent 360deg);
  -webkit-mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  mask:radial-gradient(circle closest-side, transparent 0 91.5%, #000 92.5% 98.5%, transparent 99.5%);
  filter:blur(1.5px) drop-shadow(0 0 30px rgba(255,190,50,.8))}

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
