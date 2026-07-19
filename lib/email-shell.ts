import { APP_URL } from "./app-url";
// Shared branded shell for ALL Studio on GAS emails - invites, password resets, research, cost.
// Centred GAS orb with an orange glow, an orange strapline, the white "STUDIO ON GAS" wordmark
// (ON GAS in orange), a date line, then the Sami signature + footer.
//
// The default wordmark was "INFLUENCERS" and every email still went out branded as the old product after the
// platform became Studio on GAS. An invite is often the first thing a new teammate ever sees from us, so it
// carrying the wrong product name is not a small thing.
const BASE = APP_URL;

// `wordmark` lets a specific email carry its own name (e.g. STRATEGIST ON GAS) instead of the platform default.
// The Strategist briefing goes to EXCO and MoMo's internal team, so it should say what it is.
export function emailHeader(strapline: string, dateLabel: string, wordmark = "STUDIO"): string {
  return `
  <div style="text-align:center;padding:10px 0 22px;">
    <img src="${BASE}/gas-logo.png" width="62" height="62" class="orb" style="border-radius:50%;box-shadow:0 0 28px rgba(249,98,3,0.55);" alt="GAS" />
    <div class="strap" style="margin-top:12px;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#f96203;font-weight:700;">${strapline}</div>
    <div class="wordmark" style="margin-top:6px;font-size:22px;font-weight:800;letter-spacing:0;color:#ffffff;white-space:nowrap;">${wordmark} <span style="color:#f96203;">ON GAS</span></div>
    <div class="datelabel" style="margin-top:8px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a8f98;">${dateLabel}</div>
  </div>`;
}

// Sami signature + GAS-marked footer. `cadence` is the small line under the footer brand
// (e.g. "DAILY RESEARCH, 08:15 SAST" or "DAILY COST CONTROL, 07:30 SAST").
// Sami wears a different hat per email: the AI Influencer Expert on the creative side, the AI Research
// Strategist on the intelligence briefing (Gary). Same person, honest about which job he is doing.
export function emailSignature(cadence: string, role = "AI Influencer Expert", department = "Creative Department", wordmark = "STUDIO"): string {
  return `
  <div style="margin-top:30px;">
    <div class="sig-name" style="font-size:15px;font-weight:800;color:#ffffff;">Sami</div>
    <div class="sig-role" style="font-size:12px;font-weight:700;color:#f96203;">${role}</div>
    <div class="sig-role" style="font-size:12px;color:#8a8f98;">${department}</div>
    <div style="height:1px;background:linear-gradient(90deg,rgba(168,85,247,0.5),transparent);margin:14px 0;"></div>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:12px;">
        <img src="${BASE}/gas-logo.png" width="44" height="44" style="border-radius:50%;box-shadow:0 0 16px rgba(249,98,3,0.4);" alt="GAS" />
      </td>
      <td style="vertical-align:middle;">
        <div class="foot-mark" style="font-size:12px;font-weight:800;letter-spacing:1px;color:#ffffff;white-space:nowrap;">${wordmark} <span style="color:#f96203;">ON</span> GAS</div>
        <div style="font-size:10px;letter-spacing:1px;color:#8a8f98;">${cadence}</div>
        <div style="font-size:10px;color:#8a8f98;word-break:break-all;">grow@gasmarketing.co.za</div>
      </td>
    </tr></table>
  </div>`;
}

// Full email wrapper: dark background, centred column, header + body + signature.
//
// MOBILE-FIRST, and that inversion is the whole fix. The first pass wrote DESKTOP sizes inline and used a
// max-width media query to shrink them on phones - but Gmail's mobile app frequently STRIPS <style> blocks, so
// the query never ran and the raw desktop sizes rendered on a 400px screen (Gary: "STRATEGI ST ON GAS", giant
// body copy). Now the INLINE base is mobile-safe and a min-width query scales UP for desktop: if the styles are
// stripped, the email still reads correctly on a phone, which is where it is mostly opened.
export function emailShell(opts: {
  strapline: string; dateLabel: string; body: string; cadence: string;
  wordmark?: string; role?: string; department?: string;
}): string {
  return `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    /* Desktop is the ENHANCEMENT. Anything that strips this still gets a clean mobile email. */
    @media only screen and (min-width:601px) {
      .orb { width:84px !important; height:84px !important; }
      .wordmark { font-size:30px !important; letter-spacing:1px !important; }
      .strap { font-size:12px !important; letter-spacing:5px !important; }
      .datelabel { font-size:12px !important; letter-spacing:3px !important; }
      .h1 { font-size:24px !important; }
      .h2 { font-size:18px !important; }
      .p  { font-size:15px !important; }
      .small { font-size:14px !important; }
      .card { padding:16px 18px !important; }
      .tag { font-size:13px !important; }
      .sig-name { font-size:16px !important; }
      .sig-role { font-size:13px !important; }
      .foot-mark { font-size:14px !important; }
    }
  </style>
  <div class="shell" style="background:#07090d;padding:16px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div class="col" style="max-width:640px;margin:0 auto;padding:0 14px;">
      ${emailHeader(opts.strapline, opts.dateLabel, opts.wordmark)}
      ${opts.body}
      ${emailSignature(opts.cadence, opts.role, opts.department, opts.wordmark)}
    </div>
  </div>`;
}
