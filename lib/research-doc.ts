import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getSecret } from "./connections";
import { FABLE } from "./vendors/anthropic";
import { recordTokens } from "./usage";
import { renderPdf } from "./studio-render";
import { putBytes } from "./blob";
import { fileToClientDrive, driveConfigured } from "./drive";
import { sendEmail, emailConfigured } from "./email";
import { emailShell } from "./email-shell";
import { listResearchClaims, listCompetitors, type ResearchClaim, type ResearchRun, type ResearchIdentity } from "./researcher-v3";

// THE RESEARCH BRIEF (build spec 3.8, 3.9, + Gary's brief construct). An internal, GAS-CI document that turns the
// claim store into a READ-FRIENDLY client research brief a marketing strategist can build a pitch from: a cover
// identity block, then each section written as flowing PROSE paragraphs (not tagged bullets), with the sources
// for that section listed at the foot of the section, plus a full source register. Conditional sections (e.g.
// regulatory) render only when they have facts.
//
// FACTS ONLY. The prose is written STRICTLY from the collected facts - it adds nothing, infers nothing and
// analyses nothing (analysis is the Strategist's job). The atomic claim store remains the checkable truth behind
// Gate 1; this document is the readable render of it.
//
// PROFESSIONAL LAYOUT. @page carries a real margin so every page gets clean margins and content never overlaps a
// page edge; the cover is a dark GAS-CI panel on page one.

const STUDIO_URL = (process.env.APP_URL || "https://studio.gasmarketing.co.za").replace(/\/+$/, "");
const NOTIFY_TO = process.env.SUPER_ADMIN_EMAIL || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";

const DOC_SECTIONS: { id: string; n: number; label: string; lead: string }[] = [
  { id: "snapshot", n: 1, label: "Who they are", lead: "Who the business is, what it sells and where it operates." },
  { id: "foundations", n: 2, label: "Company foundations", lead: "How the business came to be, who owns it and how it is structured." },
  { id: "leadership", n: 3, label: "Leadership and management team", lead: "The people who run the business, and their backgrounds." },
  { id: "products", n: 4, label: "Products, services and commercial model", lead: "What they sell, what it costs where public, and how the business makes its money." },
  { id: "market", n: 5, label: "Market and category", lead: "The market and category they compete in." },
  { id: "positioning", n: 6, label: "How they position themselves", lead: "How the client positions itself, in its own words." },
  { id: "audience", n: 7, label: "Audience and customers", lead: "Who the client serves today, and the audiences it speaks to." },
  { id: "digital", n: 8, label: "Digital footprint", lead: "Their website, search presence and social activity." },
  { id: "contact", n: 9, label: "Contact and channels", lead: "How to reach them, and every channel they run." },
  { id: "marketing", n: 10, label: "Current marketing and advertising", lead: "The marketing and advertising the client is running now." },
  { id: "competitor", n: 11, label: "Competitor landscape", lead: "The competitors in play and what they are doing, observed from public channels." },
  { id: "competitor_set", n: 12, label: "Competitor set", lead: "The competitors in play, a factual profile each." },
  { id: "activity", n: 13, label: "Recent activity (90 days)", lead: "What has moved in the last 90 days." },
  { id: "press", n: 14, label: "Press and media", lead: "Coverage, releases and mentions across the wider media." },
  { id: "customer_voice", n: 15, label: "Customer voice", lead: "What customers say, in reviews and public sentiment." },
  { id: "faqs", n: 16, label: "Published FAQs", lead: "The questions the client answers for its own customers." },
  { id: "regulatory", n: 17, label: "Regulatory, compliance and advertising rules", lead: "The licences the client holds and the advertising rules its campaigns must follow." },
  { id: "gaps", n: 18, label: "Gaps to verify with the client", lead: "Where the public record is thin. Confirm these directly with the client before the strategy leans on them." },
  { id: "unverified", n: 19, label: "Unverified signals", lead: "Signals we could not verify. Treat as leads, never as fact." },
];

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function ukDate(s: string | null): string {
  if (!s) return "";
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  const day = dt.getUTCDate();
  const th = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${th} ${dt.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${dt.getUTCFullYear()}`;
}
const TIER_LABEL: Record<number, string> = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
const TIER_CLASS: Record<number, string> = { 1: "t1", 2: "t2", 3: "t3" };

// The sources cited across a section, deduped, rendered at the foot of the section (Gary: source links per section).
function sectionSources(rows: ResearchClaim[]): string {
  const seen = new Map<string, { name: string; url: string }>();
  for (const c of rows) {
    if (!c.source_url) continue;
    const k = c.source_url.toLowerCase();
    if (!seen.has(k)) seen.set(k, { name: c.source_name || c.source_url, url: c.source_url });
  }
  const list = [...seen.values()];
  if (!list.length) return "";
  return `<div class="srcs"><span class="srcs-l">Sources</span> ${list.map((s) => `<a href="${esc(s.url)}">${esc(s.name)}</a>`).join(" &middot; ")}</div>`;
}

function sourceRegister(claims: ResearchClaim[]): string {
  const seen = new Map<string, { name: string; url: string; tier: number | null; date: string | null }>();
  for (const c of claims) {
    if (!c.source_url) continue;
    const key = c.source_url.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: c.source_name || c.source_url, url: c.source_url, tier: c.tier, date: c.source_date });
  }
  const rows = [...seen.values()].sort((a, b) => (a.tier || 9) - (b.tier || 9));
  if (!rows.length) return `<p class="empty">No cited sources.</p>`;
  return `<table class="reg"><thead><tr><th>Source</th><th>Tier</th><th>Date</th></tr></thead><tbody>${rows.map((r) => `<tr>
    <td><a href="${esc(r.url)}">${esc(r.name)}</a></td>
    <td>${r.tier && TIER_LABEL[r.tier] ? `<span class="tier ${TIER_CLASS[r.tier]}">${TIER_LABEL[r.tier]}</span>` : ""}</td>
    <td>${esc(ukDate(r.date))}</td></tr>`).join("")}</tbody></table>`;
}

// THE BRIEF WRITER. Turns the section-grouped fact base into flowing prose a strategist can read, using ONLY the
// facts given. Runs on the strongest model; falls back to the raw facts if it is unavailable, so a document is
// never blank. Metered to The Researcher desk.
async function writeBriefProse(clientId: string, clientName: string, vertical: string | null, sections: { id: string; label: string; facts: string[] }[], userEmail?: string | null): Promise<Record<string, string>> {
  if (!sections.length) return {};
  const key = await getSecret("anthropic");
  if (!key) return {};
  const client = new Anthropic({ apiKey: key });
  const SCHEMA = {
    type: "object", additionalProperties: false,
    properties: { sections: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, prose: { type: "string", description: "1 to 4 flowing paragraphs, plain prose, no bullet points or headings. Give a fact-rich section the room its detail needs; keep a thin one short. Separate paragraphs with a blank line." } }, required: ["id", "prose"] } } },
    required: ["sections"],
  } as unknown as Anthropic.Tool["input_schema"];
  const input = sections.map((s) => `## ${s.id} - ${s.label}\n${s.facts.map((f) => `- ${f}`).join("\n")}`).join("\n\n");
  try {
    const res = await client.messages.stream({
      model: FABLE, max_tokens: 12000,
      system: `You write internal research BRIEFS for GAS Marketing's strategy team - the read a marketing strategist does to understand a client before building strategy. Rewrite each section's facts as FLOWING PROFESSIONAL PARAGRAPHS, never bullet points.\n\nRULES:\n- Use ONLY the facts given. Add nothing, infer nothing, ANALYSE nothing - analysis is the strategist's job, not yours. No opinions, no recommendations, no SWOT.\n- Keep every specific: names, roles, numbers, dates, product names, addresses, quotes and prices. Detail is the point of this brief, do not summarise the specifics away into generalities.\n- Where the facts note something was not found, not disclosed, or that sources conflict, say so plainly in a sentence - do not hide gaps.\n- Write in UK British English. Never use an em dash or en dash, use a comma or full stop. Direct, confident, no fluff, no AI-sounding filler.\n- LEAD WITH RECENCY: in the positioning, current marketing and recent-activity sections, OPEN with the most recent developments and the current strategic thrust (the newest dated facts define where the business is now). Frame older products or campaigns as the established base, not the headline.\n- 1 to 4 paragraphs per section, separated by a blank line, scaled to how much real detail the facts hold. Do not repeat the section title inside the prose.`,
      tools: [{ name: "write_brief", description: "The brief prose, one entry per section id.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "write_brief" },
      messages: [{ role: "user", content: `Client: ${clientName}${vertical ? ` (${vertical})` : ""}\n\nThe verified fact base, grouped by section id. Write the brief prose for each:\n\n${input}` }],
    }).finalMessage();
    const u = res.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
    await recordTokens({ clientId, userEmail, model: FABLE, action: "research-brief", inputTokens: u?.input_tokens || 0, outputTokens: u?.output_tokens || 0, cacheReadTokens: u?.cache_read_input_tokens || 0, cacheCreationTokens: u?.cache_creation_input_tokens || 0 }).catch(() => {});
    const block = res.content.find((b) => b.type === "tool_use");
    const out = (block && block.type === "tool_use" ? (block.input as { sections?: { id?: string; prose?: string }[] }).sections : []) || [];
    const map: Record<string, string> = {};
    for (const s of out) if (s.id && s.prose) map[s.id] = String(s.prose).trim();
    return map;
  } catch {
    return {};
  }
}

export function briefHtml(clientName: string, website: string | null, run: ResearchRun, claims: ResearchClaim[], identity: ResearchIdentity | null, prose: Record<string, string>): string {
  const verified = claims.filter((c) => c.verified).length;
  const sources = new Set(claims.filter((c) => c.source_url).map((c) => c.source_url!.toLowerCase())).size;
  const id = (identity || {}) as ResearchIdentity;

  // NUMBER ONLY THE SECTIONS THAT RENDER, contiguously - an empty section (no facts) is skipped, and the numbers
  // must not leave a gap (external review flagged 11/15/17 vanishing). The "competitor" section absorbs the
  // competitor-set profiles too, so competitor intel is one section, never split with one half empty.
  let n = 0;
  const sections = DOC_SECTIONS.map((sec) => {
    if (sec.id === "competitor_set") return "";   // folded into "competitor" below
    const rows = sec.id === "competitor"
      ? claims.filter((c) => c.section === "competitor" || c.section === "competitor_set")
      : claims.filter((c) => c.section === sec.id);
    if (!rows.length) return "";   // conditional/empty sections simply do not render
    n += 1;
    const unver = sec.id === "unverified";
    // Prefer the written prose; fall back to the raw facts as sentences so the section is never empty.
    const text = (prose[sec.id] || rows.map((r) => r.claim).join(" ")).trim();
    const paras = text.split(/\n\n+/).map((p) => `<p class="pp">${esc(p.trim())}</p>`).join("");
    return `<section class="sec ${unver ? "warn-sec" : ""}">
      <h2><span class="n">${n}</span> ${esc(sec.label)}</h2>
      <p class="lead">${esc(sec.lead)}</p>
      ${unver ? `<p class="warn">Nothing here is a fact. The Strategist may treat these as flagged hypotheses only, never cite them as fact.</p>` : ""}
      ${paras}
      ${sectionSources(rows)}
    </section>`;
  }).join("");
  const registerN = n + 1;   // the source register follows the last rendered section, contiguously

  const idrow = (k: string, v: string) => v ? `<tr><td class="ik">${esc(k)}</td><td class="iv">${v}</td></tr>` : "";
  const idTable = `<table class="idt">
    ${idrow("Registered name", esc(id.legal_name || clientName))}
    ${id.licence ? idrow("Licence", esc(id.licence)) : ""}
    ${idrow("Vertical", esc(run.vertical || ""))}
    ${idrow("Head office", esc(id.address || ""))}
    ${idrow("Markets", esc(id.markets || ""))}
    ${website ? idrow("Website", `<a href="${esc(website)}">${esc(website)}</a>`) : ""}
    ${idrow("Contact", esc(id.contact_person || ""))}
    ${idrow("Contact details", esc(id.contact_details || ""))}
  </table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
  @page { size: A4 portrait; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Poppins, "Segoe UI", Helvetica, Arial, sans-serif; color: #1A1526; background: #FFF9F3; font-size: 11px; line-height: 1.62; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: #C42A6B; text-decoration: none; word-break: break-word; }
  /* COVER - a dark GAS-CI panel on page one (within the page margins, so it never bleeds into content). */
  .cover { color: #FFFBF8; background: #1A1043; background: linear-gradient(160deg, #1A1043 0%, #3A1580 52%, #0E2A6B 100%); border-radius: 16px; padding: 20mm 15mm; min-height: 246mm; page-break-after: always; }
  .cover .logo { height: 42px; }
  .eyebrow { margin-top: 20px; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; font-weight: 600; color: #FF7A2F; background: linear-gradient(90deg,#FF7A2F,#F80D5B); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  h1.client { font-size: 42px; line-height: 1.03; margin: 10px 0 8px; letter-spacing: -0.5px; text-transform: uppercase; font-weight: 800; color: #FFFBF8; }
  .descriptor { font-size: 14px; color: rgba(255,251,248,0.72); text-transform: capitalize; font-weight: 500; }
  .bar { height: 6px; width: 84px; border-radius: 3px; margin: 18px 0 20px; background: #FF6B00; background: linear-gradient(90deg,#FF7A2F,#F80D5B); }
  .idt { width: 100%; border-collapse: collapse; }
  .idt td { padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.12); vertical-align: top; font-size: 12px; }
  .idt .ik { color: rgba(255,251,248,0.55); text-transform: uppercase; letter-spacing: .6px; font-size: 9px; width: 30%; padding-right: 12px; font-weight: 600; }
  .idt .iv { color: #FFFBF8; font-weight: 500; }
  .idt .iv a { color: #FF9A5A; }
  .counts { margin-top: 26px; }
  .counts .c { display: inline-block; margin-right: 28px; }
  .counts .k { color: rgba(255,251,248,0.5); text-transform: uppercase; letter-spacing: .6px; font-size: 8.5px; font-weight: 600; }
  .counts .v { font-size: 21px; font-weight: 800; color: #FFFBF8; }
  .cover .notice { margin-top: 24px; border: 1px solid rgba(255,122,47,0.4); background: rgba(255,122,47,0.12); border-radius: 10px; padding: 12px 15px; font-size: 10.5px; color: rgba(255,251,248,0.82); }
  .cover .notice b { color: #FFFBF8; }
  .cover .legend { margin-top: 14px; font-size: 9.5px; color: rgba(255,251,248,0.6); }
  .cover .foot { margin-top: 20px; font-size: 9px; color: rgba(255,251,248,0.45); }
  .tier { display: inline-block; border-radius: 4px; padding: 1px 6px; font-size: 8.5px; font-weight: 700; border: 1px solid; }
  .t1 { color: #15803d; border-color: #86efac; background: #f0fdf4; }
  .t2 { color: #2540D6; border-color: #b6c1f6; background: #eef1ff; }
  .t3 { color: #b45309; border-color: #fcd34d; background: #fffbeb; }
  /* BODY sections - cream, prose. */
  .sec { margin: 0 0 14px; }
  .sec h2 { font-size: 15px; margin: 18px 0 2px; color: #1A1526; text-transform: uppercase; font-weight: 800; letter-spacing: 0.2px; page-break-after: avoid; }
  .sec h2 .n { color: #F96203; font-weight: 800; }
  .lead { margin: 0 0 9px; color: #6b6478; font-size: 10px; border-bottom: 2px solid #F96203; padding-bottom: 7px; font-style: italic; page-break-after: avoid; }
  .warn-sec .lead { border-bottom-color: #f59e0b; }
  .warn { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 10px; margin: 0 0 8px; font-size: 10px; }
  .pp { margin: 0 0 8px; color: #262130; font-size: 11.5px; line-height: 1.68; orphans: 3; widows: 3; }
  .srcs { margin: 8px 0 2px; padding-top: 7px; border-top: 1px solid #efe4d8; font-size: 9px; color: #9a92a4; }
  .srcs-l { text-transform: uppercase; letter-spacing: .6px; font-weight: 700; color: #b6adbf; margin-right: 6px; }
  .srcs a { color: #C42A6B; }
  .reg { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px; }
  .reg th { text-align: left; color: #8a8992; text-transform: uppercase; letter-spacing: .5px; font-size: 8.5px; border-bottom: 1px solid #e6ded5; padding: 4px 6px; }
  .reg td { padding: 5px 6px; border-bottom: 1px solid #efe9e2; vertical-align: top; }
  .empty { color: #a3a2ab; }
  </style></head><body>
  <div class="cover">
    <img class="logo" src="${STUDIO_URL}/gas-logo.png" alt="GAS Marketing" />
    <div class="eyebrow">GAS Marketing &middot; Research Brief</div>
    <h1 class="client">${esc(clientName)}</h1>
    <div class="descriptor">${esc(run.vertical || "")}</div>
    <div class="bar"></div>
    ${idTable}
    <div class="counts">
      <span class="c"><div class="k">Version</div><div class="v">v${run.version}</div></span>
      <span class="c"><div class="k">Prepared</div><div class="v">${esc(ukDate(run.created_at))}</div></span>
      <span class="c"><div class="k">Facts</div><div class="v">${claims.length}</div></span>
      <span class="c"><div class="k">Verified</div><div class="v">${verified}</div></span>
      <span class="c"><div class="k">Sources</div><div class="v">${sources}</div></span>
    </div>
    <div class="notice"><b>Facts only.</b> This brief is a collected, source-tiered fact base with no analysis or recommendations, by design, so what is approved at Gate 1 is falsifiable fact. The strategy comes next, from the Strategist.</div>
    <div class="legend"><span class="tier t1">Tier 1</span> load-bearing &nbsp; <span class="tier t2">Tier 2</span> reliable &nbsp; <span class="tier t3">Tier 3</span> directional</div>
    <div class="foot">Prepared by The Researcher &middot; GAS Marketing &middot; Internal &middot; ${esc(ukDate(run.created_at))}</div>
  </div>
  ${sections}
  <section class="sec"><h2><span class="n">${registerN}</span> Source register</h2><p class="lead">Every source behind this brief, with its tier and the date accessed.</p>${sourceRegister(claims)}</section>
  </body></html>`;
}

/**
 * Build the Research Brief for a run - a PDF (final) AND an editable Word .doc - store both (Blob), file the PDF
 * to Drive when configured, and email Gary a completion notice with a Studio link. Idempotent-ish: safe to call
 * again to regenerate. Never throws for the Drive/email unconfigured cases - those degrade to skipped.
 */
export async function buildResearchDocument(clientId: string, runId: string): Promise<{ pdfUrl: string; wordUrl: string; driveUrl: string | null; driveReason?: string; emailed: boolean }> {
  const rows = (await db().query(
    `select r.id, r.client_id, r.version, r.status, r.website, r.notes, r.user_email, r.created_at, r.vertical, r.identity, c.name as client_name
     from research_runs r join clients c on c.id = r.client_id where r.id = $1 and r.client_id = $2`,
    [runId, clientId],
  )) as (ResearchRun & { client_name: string })[];
  const run = rows[0];
  if (!run) throw new Error("Research run not found.");
  const clientName = run.client_name;
  const allClaims = await listResearchClaims(runId);
  // Rejected facts (dropped by Gary at Gate 1) never reach the document, the source register, or the Strategist.
  const claims = allClaims.filter((c) => !c.rejected);
  if (!claims.length) throw new Error("This run has no claims to document (all were rejected, or none filed).");

  // Write the brief prose from the fact base (facts only), then render.
  const sectionsForProse = DOC_SECTIONS
    .filter((sec) => sec.id !== "competitor_set")   // folded into "competitor"
    .map((sec) => ({
      id: sec.id, label: sec.label,
      facts: claims.filter((c) => sec.id === "competitor" ? (c.section === "competitor" || c.section === "competitor_set") : c.section === sec.id).map((c) => c.claim),
    })).filter((s) => s.facts.length);
  const prose = await writeBriefProse(clientId, clientName, run.vertical || null, sectionsForProse, run.user_email);

  const html = briefHtml(clientName, run.website, run, claims, run.identity || null, prose);
  const safeName = clientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "client";

  // PDF via Chromium. WORD DROPPED FOR NOW (Gary): the HTML-based .doc rendered poorly in Word, so PDF is the
  // deliverable; a native .docx export can be added later if the team needs to edit in Word.
  const pdf = await renderPdf(html);
  const pdfUrl = await putBytes(pdf, `research/${clientId}`, "pdf", "application/pdf");
  const wordUrl = "";

  // File the PDF to Drive under <client>/Research (gated - skips cleanly if not configured).
  const drive = await fileToClientDrive({ clientName, subfolder: "Research", filename: `${safeName}-research-brief-v${run.version}.pdf`, bytes: pdf, contentType: "application/pdf" });
  const driveUrl = drive.filed ? drive.url! : null;

  await db().query(
    `update research_runs set pdf_url = $1, word_url = null, drive_url = coalesce($2, drive_url) where id = $3`,
    [pdfUrl, driveUrl, runId],
  );

  // Notify Gary - a Studio link, never an approval mechanism (spec 3.9, 4).
  let emailed = false;
  if (emailConfigured()) {
    const emailHtml = researchEmailHtml({
      clientName, version: run.version, claimCount: claims.length,
      studioLink: `${STUDIO_URL}/researcher`, pdfUrl, driveUrl, dateLabel: ukDate(run.created_at),
    });
    const r = await sendEmail({ to: NOTIFY_TO, subject: `Research brief ready · ${clientName} (v${run.version})`, html: emailHtml, fromName: "The Researcher · GAS" }).catch(() => ({ sent: false }));
    emailed = !!r.sent;
    if (emailed) await db().query(`update research_runs set notified_at = now() where id = $1`, [runId]).catch(() => {});
  }

  return { pdfUrl, wordUrl, driveUrl, driveReason: drive.filed ? undefined : drive.reason, emailed };
}

export function documentDeliveryStatus() {
  return { drive: driveConfigured(), email: emailConfigured() };
}

// The "research ready" notification, on the shared MOBILE-FIRST shell (Gary: the old raw email was oversized on
// a phone, where these are opened). Inline sizes are the mobile sizes; the shell scales them up on desktop and
// survives Gmail stripping the <style>. Exported so /api/email-preview can render it at any width.
export function researchEmailHtml(o: { clientName: string; version: number; claimCount: number; studioLink: string; pdfUrl: string; wordUrl?: string | null; driveUrl?: string | null; dateLabel: string }): string {
  const links = `<p class="small" style="font-size:12px;line-height:1.9;color:#9aa0a8;margin:16px 0 0;text-align:center;">`
    + `<a href="${esc(o.pdfUrl)}" style="color:#7dd3fc;text-decoration:underline;">Download the brief (PDF)</a>`
    + (o.wordUrl ? `<br /><a href="${esc(o.wordUrl)}" style="color:#7dd3fc;text-decoration:underline;">Download the editable Word version</a>` : "")
    + (o.driveUrl ? `<br /><a href="${esc(o.driveUrl)}" style="color:#7dd3fc;text-decoration:underline;">Open in Google Drive</a>` : "")
    + `</p>`;
  const body = `
    <p class="p" style="font-size:14px;line-height:1.65;color:#e6e8eb;margin:0 0 10px;"><b style="color:#ffffff;">${esc(o.clientName)}</b> research brief is ready for your review.</p>
    <p class="p" style="font-size:14px;line-height:1.7;color:#9aa0a8;margin:0 0 4px;">Version ${o.version} &middot; ${o.claimCount} fact${o.claimCount === 1 ? "" : "s"} collected, every one sourced and tiered. It is awaiting Gate 1: approve, rerun with notes, or reject in Studio.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 6px;">
      <tr><td align="center" bgcolor="#f96203" style="border-radius:999px;">
        <a href="${esc(o.studioLink)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:800;color:#0b0d12;text-decoration:none;border-radius:999px;">Review in Studio &rarr;</a>
      </td></tr>
    </table>
    ${links}
    <p class="small" style="font-size:12px;line-height:1.6;color:#6f757e;margin:16px 0 0;text-align:center;">Approval always happens in Studio, never from this email.</p>`;
  return emailShell({ strapline: "Research brief ready", dateLabel: o.dateLabel, body, cadence: "ON-DEMAND RESEARCH", role: "Research Lead", department: "Studio on GAS", wordmark: "RESEARCHER" });
}
