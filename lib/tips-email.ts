import { emailShell } from "./email-shell";

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
  const body = `
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
      </div>`;
  const html = emailShell({ strapline: "GAS Daily Research", dateLabel, body, cadence: "DAILY RESEARCH, 08:00 SAST" });
  return { subject: `Higgsfield ideas for ${dateLabel}`, html };
}
