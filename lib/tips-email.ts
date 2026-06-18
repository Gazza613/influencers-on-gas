const BASE = "https://influencers.gasmarketing.co.za";

// The ideas HTML is produced by a model from LIVE web-search content, so treat it as
// untrusted. Allow only safe formatting tags (keeping their inline style), and strip
// scripts, images, links, iframes and any event handlers / dangerous URLs.
const ALLOWED_TAGS = new Set(["h3", "p", "b", "strong", "em", "ul", "ol", "li", "br", "span"]);
function sanitizeIdeasHtml(html: string): string {
  let s = html
    .replace(/<(script|style|iframe|object|embed|svg|img|a)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(?:script|style|iframe|object|embed|svg|img|a|link|meta|form|input)\b[^>]*>/gi, "");
  s = s.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return ""; // drop the tag, keep any inner text
    if (slash) return `</${t}>`;
    const sm = /\bstyle\s*=\s*"([^"]*)"/i.exec(attrs);
    const style = sm ? ` style="${sm[1].replace(/expression\s*\(|url\s*\(|javascript:|@import/gi, "").replace(/"/g, "")}"` : "";
    return `<${t}${style}>`;
  });
  return s;
}

// Branded shell for the daily "Higgsfield expert" ideas email. The ideas HTML fragment
// is produced by researchHiggsfieldTips() (Claude + live web search).
export function buildTipsEmail(opts: { ideasHtml: string; dateLabel: string }): { subject: string; html: string } {
  const { ideasHtml, dateLabel } = opts;
  const html = `
  <div style="background:#07090d;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:0 18px;">
      <div style="text-align:center;padding:8px 0 18px;">
        <img src="${BASE}/gas-logo.png" width="82" height="82" style="border-radius:50%;box-shadow:0 0 26px rgba(249,98,3,0.45);" alt="GAS" />
        <div style="margin-top:12px;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Influencers on GAS</div>
        <div style="margin-top:5px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a8f98;">Higgsfield Expert · Daily Research · ${dateLabel}</div>
      </div>

      <div style="border:1px solid rgba(168,85,247,0.3);border-radius:14px;padding:16px 18px;background:rgba(168,85,247,0.06);">
        <div style="font-size:13px;color:#b8bcc4;line-height:1.5;">
          Fresh ideas from researching the latest Higgsfield features and AI-influencer best practice, tailored to what we are building. Reply if you want any of these turned into work.
        </div>
      </div>

      <div style="margin:6px 0 0;">
        ${sanitizeIdeasHtml(ideasHtml)}
      </div>

      <div style="margin-top:22px;text-align:center;">
        <a href="${BASE}/studio" style="display:inline-block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 22px;border-radius:999px;">Open the Studio</a>
      </div>

      <!-- Signature -->
      <div style="margin-top:30px;">
        <div style="font-size:16px;font-weight:800;color:#ffffff;">Sami</div>
        <div style="font-size:13px;font-weight:700;color:#f96203;">AI Influencer Expert</div>
        <div style="font-size:13px;color:#8a8f98;">Creative Department</div>
        <div style="height:1px;background:linear-gradient(90deg,rgba(168,85,247,0.5),transparent);margin:14px 0;"></div>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:12px;">
            <img src="${BASE}/gas-logo.png" width="44" height="44" style="border-radius:50%;box-shadow:0 0 16px rgba(249,98,3,0.4);" alt="GAS" />
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:14px;font-weight:800;letter-spacing:2px;color:#ffffff;">INFLUENCERS <span style="color:#f96203;">ON</span> GAS</div>
            <div style="font-size:11px;letter-spacing:2px;color:#8a8f98;">DAILY RESEARCH, 08:15 SAST</div>
            <div style="font-size:11px;color:#8a8f98;">grow@gasmarketing.co.za</div>
          </td>
        </tr></table>
      </div>
    </div>
  </div>`;
  return { subject: `Higgsfield ideas for ${dateLabel}`, html };
}
