import { emailShell } from "./email-shell";
import { splitFactCheck, mastheadLines, wordCount, FACT_CHECK_INTRO, type FactCheckItem } from "./newsletter-format";

// THE CEO/MD THOUGHT-LEADERSHIP EMAIL (Gary). Two looks, one builder:
//   - review=true  -> the INTERNAL draft preview, on the dark ops shell, with a "not yet sent" banner. This is
//                     the team's copy, so it reads like the rest of the platform's internal mail.
//   - review=false -> the PIECE ITSELF, to the exec, on a clean WHITE editorial template branded to the client
//                     (their logo, the creative embedded at the top), so it arrives post-ready for LinkedIn.
// Branded from the RESEARCHER. Works for either publisher: pass the CEO's or the MD's name + designation.
// Escapes for HTML text AND attributes: quotes are escaped too, because several values here go into
// attributes (alt="...", src="..."), where an unescaped quote would break out of the attribute.
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// "## " lines become light section headings; blank lines split paragraphs. Rendered for the DARK branded panel.
export function renderArticleBody(post: string): string {
  return post.split(/\n{2,}/).map((blk) => blk.trim()).filter(Boolean).map((blk) => {
    const h = blk.match(/^#{1,3}\s+(.*)$/);
    if (h) return `<h3 style="font-size:17px;line-height:1.3;color:#FFFBF8;margin:22px 0 8px;font-weight:800;">${esc(h[1])}</h3>`;
    return `<p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:rgba(255,251,248,0.86);">${esc(blk)}</p>`;
  }).join("");
}

// The same body, rendered for the WHITE editorial email: dark ink on white, generous line height.
function renderArticleBodyLight(post: string): string {
  return post.split(/\n{2,}/).map((blk) => blk.trim()).filter(Boolean).map((blk) => {
    const h = blk.match(/^#{1,3}\s+(.*)$/);
    if (h) return `<h3 style="font-size:18px;line-height:1.35;color:#16181c;margin:24px 0 9px;font-weight:800;">${esc(h[1])}</h3>`;
    return `<p style="margin:0 0 15px;font-size:15px;line-height:1.78;color:#3c4043;">${esc(blk)}</p>`;
  }).join("");
}

// THE FACT CHECK & SOURCES block, with LIVE links (Gary: "Retain hyperlinks through every review round"). One
// variant for the white editorial email, one for the dark internal preview. Links open in a new tab.
function renderFactCheck(items: FactCheckItem[], dark: boolean): string {
  if (!items.length) return "";
  const ink = dark ? "rgba(255,251,248,0.86)" : "#3c4043";
  const faint = dark ? "rgba(255,251,248,0.55)" : "#7a8085";
  const head = dark ? "#FFFBF8" : "#16181c";
  const rule = dark ? "rgba(168,85,247,0.18)" : "#eceef0";
  const link = dark ? "#c9a7f5" : "#0A66C2";
  const rows = items.map((it) => {
    const line = (label: string, val: string) => val ? `<div style="margin:1px 0;font-size:12.5px;line-height:1.55;color:${ink};"><span style="color:${faint};font-weight:700;">${label}:</span> ${esc(val)}</div>` : "";
    const href = esc(it.link);
    return `<div style="margin:0 0 13px;">`
      + line("Claim", it.claim)
      + line("Source", it.source)
      + line("Date", it.date)
      + `<div style="margin:1px 0;font-size:12.5px;line-height:1.55;color:${ink};"><span style="color:${faint};font-weight:700;">Link:</span> <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:${link};text-decoration:underline;word-break:break-all;">${href}</a></div>`
      + `</div>`;
  }).join("");
  return `<div style="margin-top:26px;padding-top:16px;border-top:1px solid ${rule};">`
    + `<div style="font-size:15px;font-weight:800;color:${head};margin:0 0 4px;">Fact Check &amp; Sources</div>`
    + `<div style="font-size:12px;line-height:1.5;color:${faint};margin:0 0 14px;">${esc(FACT_CHECK_INTRO)}</div>`
    + rows + `</div>`;
}

// THE WHITE EDITORIAL EMAIL. A clean white card on a light field, the client's own logo at the top, the chosen
// 16x9 creative embedded as the hero, then the piece. Branded but not busy - it should look like a considered
// note from the exec's office, not a marketing blast. The image is a public Vercel Blob URL, embedded inline.
function renderWhiteCeoEmail(opts: {
  client: string; signerName?: string; signerTitle?: string; title: string; rest: string;
  logoUrl?: string | null; heroUrl?: string | null; dateLabel: string; preparedDate: string;
}): string {
  const FONT = `"Helvetica Neue", Helvetica, Arial, sans-serif`;
  const logoBlock = opts.logoUrl
    ? `<img src="${esc(opts.logoUrl)}" width="150" style="display:block;margin:0 auto;max-height:56px;object-fit:contain;border:0;outline:none;" alt="${esc(opts.client)}" />`
    : `<div style="font-size:18px;font-weight:800;letter-spacing:.5px;color:#16181c;">${esc(opts.client)}</div>`;
  const hero = opts.heroUrl
    ? `<img src="${esc(opts.heroUrl)}" width="100%" style="display:block;width:100%;height:auto;border:0;outline:none;margin:22px 0 0;" alt="" />`
    : "";
  const signer = [opts.signerName, [opts.signerTitle, opts.client].filter(Boolean).join(" · ")].filter(Boolean);
  // The body and the fact-check are stored together; split them so the sources render as their own linked block.
  const { body, factCheck } = splitFactCheck(opts.rest);
  // The masthead lines that sit under the title, exactly as the client-approved piece is laid out.
  const mh = mastheadLines({ signerName: opts.signerName, signerTitle: opts.signerTitle, company: opts.client, words: wordCount(body), preparedDate: opts.preparedDate });
  const mastheadHtml =
    (mh.byline ? `<div style="font-size:13px;line-height:1.5;color:#5f6368;margin:0 0 4px;">${esc(mh.byline)}</div>` : "")
    + `<div style="font-size:12px;line-height:1.5;color:#9aa0a6;margin:0 0 2px;">${esc(mh.meta)}</div>`
    + `<div style="font-size:12px;line-height:1.5;color:#9aa0a6;margin:0 0 18px;">${esc(mh.prepared)}</div>`;
  return `
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <div style="background:#eef0f2;padding:26px 10px;font-family:${FONT};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e8eb;">
      <div style="padding:30px 34px 0;text-align:center;">
        ${logoBlock}
        <div style="margin-top:16px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#9aa0a6;font-weight:700;">Thought leadership</div>
        <div style="margin-top:6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b6bbc0;font-weight:600;">${esc(opts.dateLabel)}</div>
      </div>
      ${hero}
      <div style="padding:26px 34px 6px;">
        <h1 style="font-size:25px;line-height:1.25;color:#16181c;margin:0 0 10px;font-weight:900;letter-spacing:-.01em;">${esc(opts.title)}</h1>
        ${mastheadHtml}
        ${renderArticleBodyLight(body)}
        ${renderFactCheck(factCheck, false)}
      </div>
      <div style="padding:20px 34px 30px;border-top:1px solid #eceef0;margin-top:14px;">
        ${signer[0] ? `<div style="font-size:14px;font-weight:800;color:#16181c;">${esc(signer[0])}</div>` : ""}
        ${signer[1] ? `<div style="font-size:12px;color:#7a8085;margin-top:2px;">${esc(signer[1])}</div>` : ""}
        <div style="margin-top:14px;font-size:11px;line-height:1.6;color:#9aa0a6;">Drafted for you by GAS Marketing's Researcher. Review and edit before you post.</div>
      </div>
    </div>
  </div>`;
}

export function buildCeoArticleEmail(opts: {
  client: string; ceoName?: string; ceoTitle?: string; post: string; art?: string; ceoRecipients?: string[];
  srcHeadline?: string; logoUrl?: string | null; heroUrl?: string | null; dateLabel: string; preparedDate?: string; review: boolean;
}): string {
  const lines = opts.post.split(/\n{2,}/);
  const title = (lines[0] || "").replace(/^#{1,3}\s+/, "").trim();
  const rest = lines.slice(1).join("\n\n");
  const preparedDate = opts.preparedDate || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });

  // THE PIECE ITSELF -> the clean white editorial email, post-ready, with the creative embedded.
  if (!opts.review) {
    return renderWhiteCeoEmail({
      client: opts.client, signerName: opts.ceoName, signerTitle: opts.ceoTitle,
      title, rest, logoUrl: opts.logoUrl, heroUrl: opts.heroUrl, dateLabel: opts.dateLabel, preparedDate,
    });
  }

  // THE INTERNAL DRAFT PREVIEW -> the dark ops shell, with the "not yet sent" banner and the image embedded so
  // the team sees exactly what the exec will get.
  const intended = opts.ceoRecipients && opts.ceoRecipients.length ? opts.ceoRecipients.join(", ") : "no recipient email saved yet on this brain";
  const banner = `<div style="background:rgba(249,98,3,0.08);border:1px solid rgba(168,85,247,0.22);border-radius:12px;padding:14px 16px;margin-bottom:18px;">`
    + `<div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#F96203;font-weight:800;">Thought-leadership draft, for review</div>`
    + `<div style="font-size:13px;line-height:1.6;color:rgba(255,251,248,0.86);margin-top:6px;">A LinkedIn thought-leadership piece for <b style="color:#FFFBF8;">${esc(opts.ceoName || opts.client + "'s exec")}</b>. It has <b>not</b> been sent. Review it, edit if needed, then forward to ${esc(intended)}.</div></div>`;
  const heroImg = opts.heroUrl ? `<img src="${esc(opts.heroUrl)}" width="100%" style="display:block;width:100%;height:auto;border-radius:12px;border:0;outline:none;margin:0 0 16px;" alt="" />` : "";
  const meta = `<div style="margin-top:22px;padding-top:14px;border-top:1px solid rgba(168,85,247,0.18);font-size:12px;color:rgba(255,251,248,0.58);">`
    + (opts.art ? `<div><b style="color:rgba(255,251,248,0.82);">Image idea:</b> ${esc(opts.art)}</div>` : "")
    + (opts.srcHeadline ? `<div style="margin-top:6px;"><b style="color:rgba(255,251,248,0.82);">Drawn from:</b> ${esc(opts.srcHeadline)}</div>` : "")
    + `</div>`;
  // Split the fact-check off so the internal preview shows the SAME linked sources block the exec's copy carries.
  const { body: draftBody, factCheck } = splitFactCheck(rest);
  const mh = mastheadLines({ signerName: opts.ceoName, signerTitle: opts.ceoTitle, company: opts.client, words: wordCount(draftBody), preparedDate });
  const masthead = `<div style="margin:0 0 16px;">`
    + (mh.byline ? `<div style="font-size:12.5px;line-height:1.5;color:rgba(255,251,248,0.66);">${esc(mh.byline)}</div>` : "")
    + `<div style="font-size:11.5px;line-height:1.5;color:rgba(255,251,248,0.5);">${esc(mh.meta)}</div>`
    + `<div style="font-size:11.5px;line-height:1.5;color:rgba(255,251,248,0.5);">${esc(mh.prepared)}</div></div>`;
  const body = banner + heroImg
    + `<h1 style="font-size:22px;line-height:1.25;color:#FFFBF8;margin:0 0 10px;font-weight:900;">${esc(title)}</h1>`
    + masthead
    + renderArticleBody(draftBody)
    + renderFactCheck(factCheck, true) + meta;
  return emailShell({
    strapline: "CEO THOUGHT LEADERSHIP",
    dateLabel: opts.dateLabel,
    body,
    cadence: "CEO ARTICLE DRAFT, REVIEW BEFORE SENDING",
    wordmark: "RESEARCHER",
    logoUrl: opts.logoUrl ?? null,
    role: `AI Researcher · ${opts.client}`,
    department: "GAS Marketing Automation",
    signName: null,
  });
}
