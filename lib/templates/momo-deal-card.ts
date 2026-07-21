import type { Deal } from "../studio-producer";

// MTN MOMO — THE DEAL CARD. Recreated as code from the client's own artwork, not invented.
//
// ONE OBJECT, TWO ORIENTATIONS. Gary: "deal-card pair, two orientations of one design". The vertical stacks;
// the horizontal splits into two columns divided by a thin white rule. Same palette, same type, same anatomy -
// because a deal card that looks different on the hero and the slider tells the customer the two pages are not
// the same company, and on a money product that doubt is the whole ballgame.
//
// MEASURED OFF THE REAL FILES (2250x2250 vertical, 9280x4888 horizontal), not guessed:
//   card fill   #0B405B   (a deep petrol navy, darker than the #004F71 MoMo web blue)
//   accent      #FFCE0B   (measured off the artwork; only ~2 deltaE from MoMo's web yellow, so this is a
//                          precision fix, not a correction - the colours were never the thing that was wrong)
//   white       #FFFFFF   outer stroke, label text, the column rule
//
// THE TYPE IS THE DESIGN. Heavy italic, and every yellow glyph carries a WHITE OUTLINE plus a soft dark drop
// shadow. That is what makes the numbers punch off the navy and survive being dropped onto a photograph. I had
// first built this as a bottom-offset text-shadow, which is a completely different thing and looked cheap.
// paint-order:stroke puts the stroke BEHIND the fill so the glyph keeps its weight - a plain -webkit-text-stroke
// paints down the middle and thins the letterform.
//
// THE VALIDITY LIVES INSIDE THE CARD, adjacent to the price. FAIS s14(3)(m) makes that proximity a LEGAL
// requirement, not a layout preference.

export const CARD_NAVY = "#0B405B";
export const CARD_YELLOW = "#FFCE0B";

export type CardOrientation = "vertical" | "horizontal";

/** Scoped card CSS. `s` scales the whole card - 1 renders at the reference size, 0.3 for a slider corner. */
export function dealCardCss(s = 1): string {
  const px = (n: number) => `${(n * s).toFixed(1)}px`;
  return `
/* 3D EXTRUDED CARD (Gary: same look as the library deal cards, not a flat rectangle). Volume comes from a navy
   GRADIENT (lit top-left, deep bottom-right), a big drop shadow that floats it off the photo, and TWO inset
   shadows - a bright top highlight and a dark bottom shadow - that bevel it like a moulded 3D badge. The white
   border is the rim. All shadow, no overlay, so the type stays crisp on top. */
.dc{position:relative;display:inline-block;
  background:linear-gradient(158deg, #15597f 0%, ${CARD_NAVY} 48%, #06293e 100%);
  border:${px(11)} solid #fff;border-radius:${px(58)};
  box-shadow:0 ${px(22)} ${px(48)} rgba(0,0,0,.5),
    inset 0 ${px(9)} ${px(18)} rgba(255,255,255,.24),
    inset 0 ${px(-14)} ${px(26)} rgba(0,0,0,.42);
  font-family:'MTNBrighterSans',sans-serif;font-style:italic;font-weight:800;
  font-variant-numeric:tabular-nums lining-nums;text-align:center;line-height:1}

/* The white outline on the yellow. paint-order:stroke keeps the stroke BEHIND the fill, so the letterform
   holds its weight instead of being eaten from the inside out. */
.dc .amt,.dc .price{color:${CARD_YELLOW};
  -webkit-text-stroke:${px(7)} #fff;paint-order:stroke fill;
  filter:drop-shadow(0 ${px(5)} ${px(4)} rgba(0,0,0,.45))}
.dc .lbl,.dc .only,.dc .valid{color:#fff;filter:drop-shadow(0 ${px(4)} ${px(4)} rgba(0,0,0,.45))}

.dc .lbl{font-size:${px(112)};white-space:nowrap}
.dc .amt{font-size:${px(300)};white-space:nowrap}
.dc .amt small{font-size:${px(170)}}
.dc .sub{color:#fff;font-size:${px(96)};white-space:nowrap;
  filter:drop-shadow(0 ${px(4)} ${px(4)} rgba(0,0,0,.45))}
.dc .only{font-size:${px(120)}}
.dc .price{font-size:${px(300)};white-space:nowrap}
.dc .price .r{font-size:${px(200)}}
.dc .valid{font-size:${px(74)};font-style:normal;font-weight:700;white-space:nowrap}
.dc .fine{color:rgba(255,255,255,.85);font-size:${px(52)};font-style:normal;font-weight:400}

/* VERTICAL: one column. label / amount / Only / price / validity. */
.dc.v{padding:${px(80)} ${px(90)} ${px(70)};display:flex;flex-direction:column;align-items:center;gap:${px(6)}}
.dc.v .only{margin-top:${px(40)}}
.dc.v .valid{margin-top:${px(46)}}

/* HORIZONTAL: two columns, divided by a thin white rule. Left sells the SIZE, right sells the PRICE. */
.dc.h{padding:${px(56)} ${px(80)};display:flex;align-items:stretch;gap:${px(70)}}
.dc.h .col{display:flex;flex-direction:column;justify-content:center}
.dc.h .col.l{align-items:flex-start;text-align:left}
.dc.h .col.r{align-items:center;border-left:${px(5)} solid rgba(255,255,255,.9);padding-left:${px(70)}}
.dc.h .col.r .only{align-self:flex-end;margin-right:${px(20)}}
.dc.h .col.r .valid{margin-top:${px(24)}}
`;
}

export function dealCardHtml(d: Deal, orientation: CardOrientation = "vertical"): string {
  // The reference prints the rand sign smaller than the digits ("R10", the R about two-thirds height).
  const price = d.price.replace(/^R/i, `<span class="r">R</span>`);
  const amount = `${d.amount}${d.amountSuffix ? `<small>${d.amountSuffix}</small>` : ""}`;

  if (orientation === "horizontal") {
    return `<div class="dc h">
  <div class="col l">
    <div class="lbl">${d.label}</div>
    <div class="amt">${amount}</div>
    ${d.amountSub ? `<div class="sub">${d.amountSub}</div>` : ""}
  </div>
  <div class="col r">
    <div class="only">Only</div>
    <div class="price">${price}</div>
    <div class="valid">${d.validity}</div>
    ${d.footnote ? `<div class="fine">${d.footnote}</div>` : ""}
  </div>
</div>`;
  }

  return `<div class="dc v">
  <div class="lbl">${d.label}</div>
  <div class="amt">${amount}</div>
  ${d.amountSub ? `<div class="sub">${d.amountSub}</div>` : ""}
  <div class="only">Only</div>
  <div class="price">${price}</div>
  <div class="valid">${d.validity}</div>
  ${d.footnote ? `<div class="fine">${d.footnote}</div>` : ""}
</div>`;
}
