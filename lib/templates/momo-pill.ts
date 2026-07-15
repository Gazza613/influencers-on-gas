// MTN MOMO — THE CALLOUT PILL. The signature 3D lozenge that carries the campaign line on the masthead and
// section 1 ("Y'ello & Welcome to the MTN MoMo Family", "WELCOME TO MOMO"). Recreated as code from the client's
// own artwork so the WORDS can become the campaign's while the OBJECT stays exactly MoMo's - the same fix we
// made for the deal card and the logo. The AI never draws these letters, so the pill can never garble or carry
// the reference's copy through onto a Mother's Day ad (Gary's repeated flag).
//
// MEASURED OFF THE REFERENCE PILLS:
//   fill      a deep navy lozenge with a soft top-lit gradient
//   border    a thick MoMo yellow rim, then a white outer ring (double stroke)
//   type      heavy italic, chunky EXTRUDED 3D white headline, a smaller yellow/white subline
//   shape     fully rounded (a lozenge, not a rectangle), strong drop shadow so it floats

export const PILL_NAVY = "#0B405B";
export const PILL_YELLOW = "#FFCE0B";

/** Scoped pill CSS. `s` scales the whole pill - 1 renders at reference size. */
export function momoPillCss(s = 1): string {
  const px = (n: number) => `${(n * s).toFixed(1)}px`;
  // The extruded 3D headline: a stack of hard 1px shadows stepping down-right builds the "carved" depth, then a
  // soft dark shadow grounds it. Light-grey steps read as a bevel catching the top light.
  const extrude = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((d, i) => `0 ${px(d)} 0 ${i < 3 ? "#e9edf0" : i < 6 ? "#c3ccd2" : "#98a2a9"}`)
    .join(",");
  return `
.pill{position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;
  background:linear-gradient(163deg,#14567a 0%, ${PILL_NAVY} 52%, #072d42 100%);
  border:${px(12)} solid ${PILL_YELLOW};border-radius:${px(200)};
  box-shadow:0 0 0 ${px(7)} #ffffff, 0 ${px(30)} ${px(54)} rgba(0,0,0,.45),
    inset 0 ${px(4)} ${px(10)} rgba(255,255,255,.22), inset 0 -${px(6)} ${px(12)} rgba(0,0,0,.28);
  padding:${px(66)} ${px(150)};
  font-family:'MTNBrighterSans',sans-serif;font-style:italic;font-weight:800;text-align:center;line-height:.96}
.pill .p1{color:#ffffff;font-size:${px(220)};letter-spacing:-${px(2)};white-space:nowrap;
  text-shadow:${extrude}, 0 ${px(12)} ${px(16)} rgba(0,0,0,.5)}
.pill .p2{color:${PILL_YELLOW};font-size:${px(92)};font-weight:800;margin-top:${px(26)};white-space:nowrap;
  text-shadow:0 ${px(3)} 0 #a97f00, 0 ${px(5)} ${px(6)} rgba(0,0,0,.5)}
`;
}

/** The pill markup. `line2` optional (the smaller subline). */
export function momoPillHtml(line1: string, line2?: string | null): string {
  const esc = (t: string) => String(t || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div class="pill"><div class="p1">${esc(line1)}</div>${
    line2 && line2.trim() ? `<div class="p2">${esc(line2)}</div>` : ""
  }</div>`;
}
