import { APP_URL } from "./app-url";
// Shared branded shell for ALL Studio on GAS emails - invites, password resets, research, cost, tips.
//
// ALIGNED TO THE MEDIA ON GAS "WEEKLY PULSE" LAYOUT (Gary). Media on GAS ships a very tight email design and
// Gary wants every email on this platform to read as the same family. So the numbers below are the Pulse's own
// shipped numbers: the Manrope font stack, the #070E16 background, the gradient panel (#0F1820 -> #13202C) with
// a 1px orchid hairline and a 22px radius, the 84px orbed logo, the ember eyebrow, the "WORD ON GAS" wordmark
// with ON in ember and GAS in lava, and the ember hairline divider under the header.
//
// WHAT WE KEEP that the Pulse does not need: the mobile-first inversion. Gmail's mobile app frequently STRIPS
// <style> blocks, so a desktop-inline + max-width-down email (which is how the Pulse is written) renders raw
// desktop sizes on a phone. Here the INLINE base is the mobile size and a min-width query scales UP to the
// Pulse's desktop sizes - so a stripped email still reads correctly on the phone, where it is mostly opened.
const BASE = APP_URL;

// The Pulse palette, verbatim.
const BG = "#070E16";
const RULE = "rgba(168,85,247,0.18)";     // orchid hairline
const TXT = "#FFFBF8";
const EMBER = "#F96203";
const LAVA = "#FF3D00";
const CAPTION = "rgba(255,251,248,0.58)";
const FONT = `Manrope, "Helvetica Neue", Helvetica, Arial, sans-serif`;

// `wordmark` lets a specific email carry its own name (e.g. STRATEGIST, RESEARCHER) instead of the platform
// default. Rendered the Pulse way: the word in white, ON in ember, GAS in lava.
export function emailHeader(strapline: string, dateLabel: string, wordmark = "STUDIO"): string {
  return `
  <div class="pad" style="padding:28px 20px 20px;text-align:center;">
    <!-- 84px orbed logo. The soft radial flare sits on the cell BEHIND the transparent PNG so it hugs the orb
         with no visible edge; a client that ignores the gradient just shows a clean round logo. -->
    <div class="orbwrap" style="width:84px;height:84px;margin:0 auto 16px;border-radius:50%;background:radial-gradient(circle at 50% 50%, rgba(249,98,3,0.42) 0%, rgba(249,98,3,0.16) 42%, rgba(249,98,3,0) 68%);">
      <img src="${BASE}/gas-logo.png" width="56" height="56" class="orb" style="display:block;margin:0 auto;padding-top:14px;border:0;outline:none;" alt="GAS" />
    </div>
    <div class="strap" style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${EMBER};font-weight:800;">${strapline}</div>
    <!-- Wordmark must NEVER be nowrap on a phone: "STRATEGIST ON GAS" is wider than a phone and was clipping
         ("STRATEGI ST ..."). Smaller base + a wrap that keeps "ON GAS" together. Desktop bumps it back up. -->
    <div class="wordmark" style="margin-top:6px;font-size:17px;font-weight:900;letter-spacing:2px;color:${TXT};line-height:1.2;">${wordmark} <span style="white-space:nowrap;"><span style="color:${EMBER};">ON</span> <span style="color:${LAVA};">GAS</span></span></div>
    <div class="datelabel" style="margin-top:8px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${CAPTION};font-weight:700;">${dateLabel}</div>
  </div>
  <div class="pad" style="padding:0 20px;"><div style="height:1px;background:linear-gradient(90deg,transparent,${EMBER},transparent);"></div></div>`;
}

// Sami signature + GAS-marked footer. `cadence` is the small line under the footer brand
// (e.g. "ON-DEMAND RESEARCH" or "DAILY COST CONTROL, 07:30 SAST"). Sami wears a different hat per email, but
// the DEFAULT is STUDIO ON GAS, never Influencers (Gary: "we communicate as Studio on GAS, not Influencers on
// GAS"). A hat is only put on when an email overrides it (the Strategist signs as Research Strategist); left
// alone, every email speaks for the platform, which is Studio.
export function emailSignature(cadence: string, role = "AI Studio Lead", department = "Studio on GAS", wordmark = "STUDIO"): string {
  return `
  <div class="pad" style="padding:26px 20px 30px;">
    <div style="height:1px;background:linear-gradient(90deg,${RULE},transparent);margin:0 0 16px;"></div>
    <div class="sig-name" style="font-size:15px;font-weight:800;color:${TXT};">Sami</div>
    <div class="sig-role" style="font-size:12px;font-weight:700;color:${EMBER};">${role}</div>
    <div class="sig-role" style="font-size:12px;color:${CAPTION};">${department}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
      <td style="vertical-align:middle;padding-right:12px;">
        <div style="width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 50% 50%, rgba(249,98,3,0.34) 0%, rgba(249,98,3,0.12) 44%, rgba(249,98,3,0) 70%);">
          <img src="${BASE}/gas-logo.png" width="40" height="40" style="display:block;margin:0 auto;padding-top:8px;border:0;outline:none;" alt="GAS" />
        </div>
      </td>
      <td style="vertical-align:middle;">
        <div class="foot-mark" style="font-size:12px;font-weight:800;letter-spacing:1px;color:${TXT};white-space:nowrap;">${wordmark} <span style="color:${EMBER};">ON</span> <span style="color:${LAVA};">GAS</span></div>
        <div style="font-size:10px;letter-spacing:1px;color:${CAPTION};">${cadence}</div>
        <div style="font-size:10px;color:${CAPTION};word-break:break-all;">grow@gasmarketing.co.za</div>
      </td>
    </tr></table>
  </div>`;
}

// Full email wrapper: the Pulse gradient panel on a dark field, header + body + signature inside it.
export function emailShell(opts: {
  strapline: string; dateLabel: string; body: string; cadence: string;
  wordmark?: string; role?: string; department?: string;
}): string {
  return `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Desktop is the ENHANCEMENT - anything that strips this still gets a clean mobile email at the Pulse's
       own mobile sizes. These bumps ARE the Pulse's desktop numbers. */
    @media only screen and (min-width:601px) {
      .container  { max-width:720px !important; border-radius:22px !important; }
      .pad        { padding-left:36px !important; padding-right:36px !important; }
      .wordmark   { font-size:26px !important; letter-spacing:4px !important; }
      .strap      { font-size:11px !important; letter-spacing:6px !important; }
      .datelabel  { font-size:11px !important; }
      .h1         { font-size:22px !important; }
      .h2         { font-size:18px !important; }
      .p          { font-size:14px !important; }
      .small      { font-size:12px !important; }
      .card       { padding:16px 18px !important; }
      .tag        { font-size:11px !important; }
    }
  </style>
  <div style="background:${BG};padding:24px 10px;font-family:${FONT};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
    <div class="container" style="max-width:100%;margin:0 auto;background:linear-gradient(170deg,#0F1820 0%,#13202C 100%);border:1px solid ${RULE};border-radius:16px;overflow:hidden;">
      ${emailHeader(opts.strapline, opts.dateLabel, opts.wordmark)}
      <div class="pad" style="padding:4px 20px 4px;">${opts.body}</div>
      ${emailSignature(opts.cadence, opts.role, opts.department, opts.wordmark)}
    </div>
  </div>`;
}
