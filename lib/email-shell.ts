// Shared branded shell for ALL Influencers on GAS emails (research, cost, future).
// Centred GAS orb with an orange glow, an orange strapline, the white "INFLUENCERS ON GAS"
// wordmark (ON GAS in orange), a date line, then the Sami signature + footer.
const BASE = "https://influencers.gasmarketing.co.za";

// `wordmark` lets a specific email carry its own name (e.g. STRATEGIST ON GAS) instead of the platform default.
// The Strategist briefing goes to EXCO and MoMo's internal team, so it should say what it is.
export function emailHeader(strapline: string, dateLabel: string, wordmark = "INFLUENCERS"): string {
  return `
  <div style="text-align:center;padding:10px 0 22px;">
    <img src="${BASE}/gas-logo.png" width="84" height="84" style="border-radius:50%;box-shadow:0 0 32px rgba(249,98,3,0.55);" alt="GAS" />
    <div style="margin-top:16px;font-size:12px;letter-spacing:5px;text-transform:uppercase;color:#f96203;font-weight:700;">${strapline}</div>
    <div style="margin-top:6px;font-size:30px;font-weight:800;letter-spacing:1px;color:#ffffff;">${wordmark} <span style="color:#f96203;">ON GAS</span></div>
    <div style="margin-top:8px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8a8f98;">${dateLabel}</div>
  </div>`;
}

// Sami signature + GAS-marked footer. `cadence` is the small line under the footer brand
// (e.g. "DAILY RESEARCH, 08:15 SAST" or "DAILY COST CONTROL, 07:30 SAST").
// Sami wears a different hat per email: the AI Influencer Expert on the creative side, the AI Research
// Strategist on the intelligence briefing (Gary). Same person, honest about which job he is doing.
export function emailSignature(cadence: string, role = "AI Influencer Expert", department = "Creative Department", wordmark = "INFLUENCERS"): string {
  return `
  <div style="margin-top:30px;">
    <div style="font-size:16px;font-weight:800;color:#ffffff;">Sami</div>
    <div style="font-size:13px;font-weight:700;color:#f96203;">${role}</div>
    <div style="font-size:13px;color:#8a8f98;">${department}</div>
    <div style="height:1px;background:linear-gradient(90deg,rgba(168,85,247,0.5),transparent);margin:14px 0;"></div>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;padding-right:12px;">
        <img src="${BASE}/gas-logo.png" width="44" height="44" style="border-radius:50%;box-shadow:0 0 16px rgba(249,98,3,0.4);" alt="GAS" />
      </td>
      <td style="vertical-align:middle;">
        <div style="font-size:14px;font-weight:800;letter-spacing:2px;color:#ffffff;">${wordmark} <span style="color:#f96203;">ON</span> GAS</div>
        <div style="font-size:11px;letter-spacing:2px;color:#8a8f98;">${cadence}</div>
        <div style="font-size:11px;color:#8a8f98;">grow@gasmarketing.co.za</div>
      </td>
    </tr></table>
  </div>`;
}

// Full email wrapper: dark background, centred column, header + body + signature.
export function emailShell(opts: {
  strapline: string; dateLabel: string; body: string; cadence: string;
  wordmark?: string; role?: string; department?: string;
}): string {
  return `
  <div style="background:#07090d;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:0 18px;">
      ${emailHeader(opts.strapline, opts.dateLabel, opts.wordmark)}
      ${opts.body}
      ${emailSignature(opts.cadence, opts.role, opts.department, opts.wordmark)}
    </div>
  </div>`;
}
