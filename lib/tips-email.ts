const BASE = "https://influencers.gasmarketing.co.za";

// Branded shell for the daily "Higgsfield expert" ideas email. The ideas HTML fragment
// is produced by researchHiggsfieldTips() (Claude + live web search).
export function buildTipsEmail(opts: { ideasHtml: string; dateLabel: string }): { subject: string; html: string } {
  const { ideasHtml, dateLabel } = opts;
  const html = `
  <div style="background:#07090d;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:0 18px;">
      <div style="text-align:center;padding:8px 0 18px;">
        <img src="${BASE}/gas-logo.png" width="68" height="68" style="border-radius:50%;" alt="GAS" />
        <div style="margin-top:12px;font-size:26px;font-weight:800;letter-spacing:-0.5px;">
          <span style="background:linear-gradient(135deg,#ec4899,#a855f7 50%,#60a5fa);-webkit-background-clip:text;background-clip:text;color:#a855f7;">Influencers on GAS</span>
        </div>
        <div style="margin-top:5px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a8f98;">Higgsfield Expert · Daily Ideas · ${dateLabel}</div>
      </div>

      <div style="border:1px solid rgba(168,85,247,0.3);border-radius:14px;padding:16px 18px;background:rgba(168,85,247,0.06);">
        <div style="font-size:13px;color:#b8bcc4;line-height:1.5;">
          Fresh ideas from researching the latest Higgsfield features and AI-influencer best practice, tailored to what we are building. Reply if you want any of these turned into work.
        </div>
      </div>

      <div style="margin:6px 0 0;">
        ${ideasHtml}
      </div>

      <div style="margin-top:22px;text-align:center;">
        <a href="${BASE}/studio" style="display:inline-block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 22px;border-radius:999px;">Open the Studio</a>
      </div>
      <div style="margin-top:18px;text-align:center;font-size:11px;color:#5b616b;">
        Influencers on GAS · your daily Higgsfield brief
      </div>
    </div>
  </div>`;
  return { subject: `Higgsfield ideas for ${dateLabel}`, html };
}
