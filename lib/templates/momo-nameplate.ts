// MTN MOMO - THE EXECUTIVE NAME PLATE. Kagiso Mothibi's attribution on a CEO creative, so the piece reads as
// HIM on the record, not an anonymous poster (Gary). Modelled on how his real exec cards already work (Payments
// Live, TCS+): the name in MoMo yellow, the title in white beneath it, on a clean navy bar that sits at the
// bottom of the creative.
//
// Typeset by us, never AI-drawn - like the deal card, the pill and the logo - so a real person's name and title
// can never garble. That matters more here than anywhere: a misspelt CEO name is unshippable.
//
// The "push out": a yellow accent rule leads the plate in from the left edge, so it reads as pushed out from the
// side rather than floating - the small piece of craft that makes it look designed, not pasted.

export const PLATE_NAVY = "#0B405B";
export const PLATE_YELLOW = "#FFCE0B";

// The plate's colours are per-BRAND, not fixed to MoMo (Gary: a GAS piece must read as GAS, not fintech navy +
// yellow). Defaults keep MoMo's exact look; a brand design passes its own field + accent + title colours.
export type NameplateColors = { plate?: string; plate2?: string; accent?: string; title?: string };

/** Scoped name-plate CSS. `s` scales the whole plate - 1 at reference size. */
export function nameplateCss(s = 1, colors?: NameplateColors): string {
  const px = (n: number) => `${(n * s).toFixed(1)}px`;
  const plate = colors?.plate || PLATE_NAVY;
  const plate2 = colors?.plate2 || "#0e4a68";
  const accent = colors?.accent || PLATE_YELLOW;
  const title = colors?.title || "#ffffff";
  return `
.np{position:relative;display:inline-flex;align-items:center;gap:${px(34)};
  background:linear-gradient(100deg, ${plate} 0%, ${plate2} 100%);
  border-radius:${px(14)};padding:${px(30)} ${px(52)} ${px(30)} ${px(40)};
  box-shadow:0 ${px(20)} ${px(44)} rgba(0,0,0,.42);
  font-family:'MTNBrighterSans',sans-serif;line-height:1}
/* The accent bar that leads the plate in - the "push out". */
.np .bar{width:${px(8)};align-self:stretch;border-radius:${px(4)};background:${accent};flex-shrink:0}
.np .txt{display:flex;flex-direction:column;gap:${px(10)}}
.np .name{color:${accent};font-style:italic;font-weight:800;font-size:${px(84)};letter-spacing:-${px(1)};
  white-space:nowrap;text-transform:uppercase}
.np .title{color:${title};font-weight:700;font-size:${px(40)};letter-spacing:${px(2)};white-space:nowrap;
  text-transform:uppercase;opacity:.92}
`;
}

/** The plate markup. `name` and `title` are typeset verbatim. */
export function nameplateHtml(name: string, title: string): string {
  const esc = (t: string) => String(t || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div class="np"><div class="bar"></div><div class="txt">` +
    `<div class="name">${esc(name)}</div>` +
    `<div class="title">${esc(title)}</div>` +
    `</div></div>`;
}
