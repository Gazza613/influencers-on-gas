import { emailShell } from "./email-shell";

// THE CEO THOUGHT-LEADERSHIP EMAIL, branded (Gary). One builder for both paths so a piece reads the same whether
// it was drafted on the automated cadence (review=true, goes to the internal team with a "not yet sent" banner) or
// sent on demand to the CEO (review=false, the piece itself). It rides the shared Pulse shell, wears the client's
// own logo when on file (else the GAS orb), and is branded from the RESEARCHER, not the Strategist.
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// "## " lines become light section headings; blank lines split paragraphs. Rendered for the DARK branded panel.
export function renderArticleBody(post: string): string {
  return post.split(/\n{2,}/).map((blk) => blk.trim()).filter(Boolean).map((blk) => {
    const h = blk.match(/^#{1,3}\s+(.*)$/);
    if (h) return `<h3 style="font-size:17px;line-height:1.3;color:#FFFBF8;margin:22px 0 8px;font-weight:800;">${esc(h[1])}</h3>`;
    return `<p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:rgba(255,251,248,0.86);">${esc(blk)}</p>`;
  }).join("");
}

export function buildCeoArticleEmail(opts: {
  client: string; ceoName?: string; post: string; art?: string; ceoRecipients?: string[];
  srcHeadline?: string; logoUrl?: string | null; dateLabel: string; review: boolean;
}): string {
  const lines = opts.post.split(/\n{2,}/);
  const title = (lines[0] || "").replace(/^#{1,3}\s+/, "").trim();
  const rest = lines.slice(1).join("\n\n");
  const intended = opts.ceoRecipients && opts.ceoRecipients.length ? opts.ceoRecipients.join(", ") : "no CEO email saved yet on this brain";
  const banner = opts.review
    ? `<div style="background:rgba(249,98,3,0.08);border:1px solid rgba(168,85,247,0.22);border-radius:12px;padding:14px 16px;margin-bottom:18px;">`
      + `<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#F96203;font-weight:800;">CEO article draft, for review</div>`
      + `<div style="font-size:13px;line-height:1.6;color:rgba(255,251,248,0.86);margin-top:6px;">A LinkedIn thought-leadership piece for <b style="color:#FFFBF8;">${esc(opts.ceoName || opts.client + "'s CEO")}</b>. It has <b>not</b> been sent to the CEO. Review it, edit if needed, then forward to ${esc(intended)}.</div></div>`
    : "";
  const meta = opts.review
    ? `<div style="margin-top:22px;padding-top:14px;border-top:1px solid rgba(168,85,247,0.18);font-size:12px;color:rgba(255,251,248,0.58);">`
      + (opts.art ? `<div><b style="color:rgba(255,251,248,0.82);">Image idea:</b> ${esc(opts.art)}</div>` : "")
      + (opts.srcHeadline ? `<div style="margin-top:6px;"><b style="color:rgba(255,251,248,0.82);">Drawn from:</b> ${esc(opts.srcHeadline)}</div>` : "")
      + `</div>`
    : "";
  const body = banner
    + `<h1 style="font-size:22px;line-height:1.25;color:#FFFBF8;margin:0 0 16px;font-weight:900;">${esc(title)}</h1>`
    + renderArticleBody(rest) + meta;
  return emailShell({
    strapline: "CEO THOUGHT LEADERSHIP",
    dateLabel: opts.dateLabel,
    body,
    cadence: opts.review ? "CEO ARTICLE DRAFT, REVIEW BEFORE SENDING" : "CEO THOUGHT LEADERSHIP",
    wordmark: "RESEARCHER",
    logoUrl: opts.logoUrl ?? null,
    role: `AI Researcher · ${opts.client}`,
    department: "GAS Marketing Automation",
    signName: null,
  });
}
