import { db } from "./db";
import { renderPdf } from "./studio-render";
import { putBytes } from "./blob";
import { fileToClientDrive, driveConfigured } from "./drive";
import { sendEmail, emailConfigured } from "./email";
import { listResearchClaims, listCompetitors, type ResearchClaim, type ResearchRun } from "./researcher-v3";

// THE RESEARCH DOCUMENT (build spec 3.8, 3.9). A concise, internal, GAS-CI PDF render of the claim store: the
// eleven fixed sections, every claim with its source and TIER, then a full source register. On completion it is
// stored (Blob), filed to Drive under the client's /Research folder when Drive is configured, and Gary is emailed
// a notice with a Studio link - notification only, approval always happens in Studio (never by email).
//
// FACTS ONLY. This document carries no analysis: no SWOT, no recommendations. That is deliberate and is what makes
// Gate 1 a check of fact, not opinion. The analysis is the Strategist's job, in the next stage.

const STUDIO_URL = (process.env.APP_URL || "https://studio.gasmarketing.co.za").replace(/\/+$/, "");
const NOTIFY_TO = process.env.SUPER_ADMIN_EMAIL || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";

// The claim sections in document order (spec 3.8, extended with contact/social and published FAQs at Gary's
// request). The final section 13, the source register, is derived from every claim's source, not stored.
const DOC_SECTIONS: { id: string; n: number; label: string }[] = [
  { id: "snapshot", n: 1, label: "Client snapshot" },
  { id: "foundations", n: 2, label: "Company foundations" },
  { id: "products", n: 3, label: "Products and services" },
  { id: "market", n: 4, label: "Market and category" },
  { id: "digital", n: 5, label: "Digital footprint audit" },
  { id: "contact", n: 6, label: "Contact and social channels" },
  { id: "competitor", n: 7, label: "Competitor intelligence" },
  { id: "competitor_set", n: 8, label: "Competitor set" },
  { id: "activity", n: 9, label: "90-day activity log" },
  { id: "customer_voice", n: 10, label: "Customer voice" },
  { id: "faqs", n: 11, label: "Published FAQs" },
  { id: "unverified", n: 12, label: "Unverified, treat as signal only" },
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

function claimRow(c: ResearchClaim, clientName: string): string {
  const showSubject = c.subject && !new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(c.subject);
  const tier = c.tier && TIER_LABEL[c.tier]
    ? `<span class="tier ${TIER_CLASS[c.tier]}">${TIER_LABEL[c.tier]}</span>` : "";
  const verified = c.verified ? `<span class="ok">verified</span>` : `<span class="unc">unconfirmed</span>`;
  const date = c.source_date ? `<span class="date">${esc(ukDate(c.source_date))}</span>` : "";
  const src = c.source_url
    ? `<a class="src" href="${esc(c.source_url)}">${esc(c.source_name || "source")}</a>`
    : `<span class="src none">${esc(c.source_name || "no source")}</span>`;
  const conflict = c.conflict ? `<div class="conflict">Sources conflict: ${esc(c.conflict)}</div>` : "";
  const reason = c.section === "unverified" && c.unverified_reason ? `<div class="reason">Why unverified: ${esc(c.unverified_reason)}</div>` : "";
  return `<div class="claim">
    <div class="ctext">${showSubject ? `<span class="subj">${esc(c.subject)}</span>` : ""}${esc(c.claim)}${conflict}${reason}</div>
    <div class="cmeta">${tier}${verified}${date}${src}</div>
  </div>`;
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

export function researchDocHtml(clientName: string, website: string | null, run: ResearchRun, claims: ResearchClaim[], competitors: { name: string; website: string | null }[]): string {
  const verified = claims.filter((c) => c.verified).length;
  const sources = new Set(claims.filter((c) => c.source_url).map((c) => c.source_url!.toLowerCase())).size;

  const sections = DOC_SECTIONS.map((sec) => {
    const rows = claims.filter((c) => c.section === sec.id);
    if (!rows.length) return "";
    const unver = sec.id === "unverified";
    return `<section class="sec ${unver ? "unverified" : ""}">
      <h2><span class="n">${sec.n}</span>${esc(sec.label)}<span class="count">${rows.length}</span></h2>
      ${unver ? `<p class="warn">Nothing here is a fact. The Strategist may treat these as flagged hypotheses only, never cite them as fact.</p>` : ""}
      ${rows.map((c) => claimRow(c, clientName)).join("")}
    </section>`;
  }).join("");

  const compBlock = competitors.length
    ? `<div class="compset">${competitors.map((c) => c.website ? `<a href="${esc(c.website)}">${esc(c.name)}</a>` : `<span>${esc(c.name)}</span>`).join("")}</div>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #17161d; font-size: 10.5px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: #6d28d9; text-decoration: none; word-break: break-word; }
  .cover { min-height: 247mm; display: flex; flex-direction: column; page-break-after: always; padding: 4mm 0; }
  .mark { font-weight: 800; letter-spacing: .5px; font-size: 13px; }
  .mark b { color: #f97316; }
  .cover .band { height: 6px; border-radius: 3px; margin: 10px 0 0; background: linear-gradient(90deg,#ff4d8d,#a855f7,#3b82f6); }
  .cover .title { margin-top: auto; }
  .cover h1 { font-size: 40px; line-height: 1.05; margin: 0 0 6px; letter-spacing: -0.5px; }
  .cover .sub { font-size: 15px; color: #4b4a55; }
  .cover .site { font-size: 12px; color: #6d28d9; margin-top: 4px; }
  .meta { margin-top: 22px; display: flex; gap: 26px; flex-wrap: wrap; font-size: 11px; }
  .meta .k { color: #8a8992; text-transform: uppercase; letter-spacing: .6px; font-size: 9px; }
  .meta .v { font-weight: 700; font-size: 15px; }
  .notice { margin-top: 22px; border: 1px solid #ece9f5; background: #faf9fe; border-radius: 8px; padding: 12px 14px; font-size: 10.5px; color: #4b4a55; }
  .notice b { color: #17161d; }
  .legend { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 9.5px; color: #6b6a75; }
  .compset { margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; }
  .compset a, .compset span { border: 1px solid #e5e2ef; border-radius: 20px; padding: 2px 10px; font-size: 10px; font-weight: 600; color: #17161d; }
  .foot { margin-top: 18px; font-size: 9px; color: #a3a2ab; }
  .tier { display: inline-block; border-radius: 4px; padding: 1px 6px; font-size: 8.5px; font-weight: 700; border: 1px solid; }
  .t1 { color: #15803d; border-color: #86efac; background: #f0fdf4; }
  .t2 { color: #1d4ed8; border-color: #93c5fd; background: #eff6ff; }
  .t3 { color: #b45309; border-color: #fcd34d; background: #fffbeb; }
  .ok { color: #15803d; font-weight: 700; font-size: 9px; }
  .unc { color: #a3a2ab; font-size: 9px; }
  .date { color: #8a8992; font-size: 9px; }
  .sec { margin: 0 0 14px; }
  .sec h2 { font-size: 15px; margin: 16px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #17161d; display: flex; align-items: baseline; gap: 8px; page-break-after: avoid; }
  .sec h2 .n { color: #a855f7; font-weight: 800; }
  .sec h2 .count { margin-left: auto; font-size: 10px; color: #a3a2ab; font-weight: 600; }
  .sec.unverified h2 { border-bottom-color: #f59e0b; }
  .warn { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 10px; margin: 0 0 8px; font-size: 10px; }
  .claim { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid #f0eff4; page-break-inside: avoid; }
  .ctext { flex: 1; }
  .subj { display: inline-block; background: #f3f1fa; color: #4b4a55; font-weight: 700; font-size: 8.5px; border-radius: 4px; padding: 1px 6px; margin-right: 6px; }
  .conflict { color: #b45309; font-size: 9.5px; margin-top: 3px; }
  .reason { color: #8a8992; font-size: 9.5px; margin-top: 3px; }
  .cmeta { flex-shrink: 0; width: 46mm; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .cmeta .src { font-size: 9.5px; max-width: 46mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .src.none { color: #a3a2ab; }
  .reg { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .reg th { text-align: left; color: #8a8992; text-transform: uppercase; letter-spacing: .5px; font-size: 8.5px; border-bottom: 1px solid #e5e2ef; padding: 4px 6px; }
  .reg td { padding: 5px 6px; border-bottom: 1px solid #f0eff4; vertical-align: top; }
  .empty { color: #a3a2ab; }
  </style></head><body>
  <div class="cover">
    <div class="mark">GAS<b>·</b>THE RESEARCHER</div>
    <div class="band"></div>
    <div class="title">
      <div class="sub">Research Document</div>
      <h1>${esc(clientName)}</h1>
      ${website ? `<div class="site">${esc(website)}</div>` : ""}
    </div>
    <div class="meta">
      <div><div class="k">Version</div><div class="v">v${run.version}</div></div>
      <div><div class="k">Collected</div><div class="v">${esc(ukDate(run.created_at))}</div></div>
      <div><div class="k">Claims</div><div class="v">${claims.length}</div></div>
      <div><div class="k">Verified</div><div class="v">${verified}</div></div>
      <div><div class="k">Sources</div><div class="v">${sources}</div></div>
    </div>
    ${compBlock}
    <div class="notice"><b>Facts only.</b> This is a collected, source-tiered fact base. It contains no analysis, no SWOT and no recommendations, by design, so what is approved at Gate 1 is falsifiable fact. The strategy comes next, from the Strategist.</div>
    <div class="legend">
      <span class="tier t1">Tier 1</span> load-bearing
      <span class="tier t2">Tier 2</span> reliable
      <span class="tier t3">Tier 3</span> directional
    </div>
    <div class="foot">Prepared by The Researcher · GAS Marketing · Internal · ${esc(ukDate(run.created_at))}</div>
  </div>
  ${sections}
  <section class="sec"><h2><span class="n">13</span>Source register<span class="count">${sources}</span></h2>${sourceRegister(claims)}</section>
  </body></html>`;
}

/**
 * Build the Research Document PDF for a run, store it (Blob), file it to Drive when configured, and email Gary a
 * completion notice with a Studio link. Idempotent-ish: safe to call again to regenerate. Never throws for the
 * Drive/email unconfigured cases - those degrade to skipped, and the PDF (Blob) always exists.
 */
export async function buildResearchDocument(clientId: string, runId: string): Promise<{ pdfUrl: string; driveUrl: string | null; driveReason?: string; emailed: boolean }> {
  const rows = (await db().query(
    `select r.id, r.client_id, r.version, r.status, r.website, r.notes, r.user_email, r.created_at, c.name as client_name
     from research_runs r join clients c on c.id = r.client_id where r.id = $1 and r.client_id = $2`,
    [runId, clientId],
  )) as (ResearchRun & { client_name: string })[];
  const run = rows[0];
  if (!run) throw new Error("Research run not found.");
  const clientName = run.client_name;
  const [claims, competitors] = await Promise.all([listResearchClaims(runId), listCompetitors(clientId)]);
  if (!claims.length) throw new Error("This run has no claims to document.");

  const html = researchDocHtml(clientName, run.website, run, claims, competitors);
  const pdf = await renderPdf(html);
  const safeName = clientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "client";
  const filename = `${safeName}-research-v${run.version}.pdf`;
  const pdfUrl = await putBytes(pdf, `research/${clientId}`, "pdf", "application/pdf");

  // File to Drive under <client>/Research (gated - skips cleanly if not configured).
  const drive = await fileToClientDrive({ clientName, subfolder: "Research", filename, bytes: pdf, contentType: "application/pdf" });
  const driveUrl = drive.filed ? drive.url! : null;

  await db().query(
    `update research_runs set pdf_url = $1, drive_url = coalesce($2, drive_url) where id = $3`,
    [pdfUrl, driveUrl, runId],
  );

  // Notify Gary - a Studio link, never an approval mechanism (spec 3.9, 4).
  let emailed = false;
  if (emailConfigured()) {
    const studioLink = `${STUDIO_URL}/researcher`;
    const driveLine = driveUrl ? `<p style="margin:6px 0"><a href="${esc(driveUrl)}" style="color:#6d28d9">Open in Google Drive</a></p>` : "";
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px">
      <div style="font-weight:800;letter-spacing:.5px">GAS · THE RESEARCHER</div>
      <div style="height:5px;border-radius:3px;margin:8px 0 16px;background:linear-gradient(90deg,#ff4d8d,#a855f7,#3b82f6)"></div>
      <p style="font-size:16px;margin:0 0 4px"><b>${esc(clientName)}</b> research is ready for your review.</p>
      <p style="color:#555;margin:0 0 14px">Version ${run.version} · ${claims.length} claim${claims.length === 1 ? "" : "s"} collected, every one sourced and tiered. It is awaiting Gate 1, approve, rerun with notes, or reject in Studio.</p>
      <p style="margin:0 0 14px"><a href="${esc(studioLink)}" style="display:inline-block;background:#a855f7;color:#fff;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none">Review in Studio</a></p>
      <p style="margin:6px 0"><a href="${esc(pdfUrl)}" style="color:#6d28d9">Download the Research Document (PDF)</a></p>
      ${driveLine}
      <p style="color:#999;font-size:12px;margin-top:16px">Approval always happens in Studio, never from this email.</p>
    </div>`;
    const r = await sendEmail({ to: NOTIFY_TO, subject: `Research ready · ${clientName} (v${run.version})`, html, fromName: "The Researcher · GAS" }).catch(() => ({ sent: false }));
    emailed = !!r.sent;
    if (emailed) await db().query(`update research_runs set notified_at = now() where id = $1`, [runId]).catch(() => {});
  }

  return { pdfUrl, driveUrl, driveReason: drive.filed ? undefined : drive.reason, emailed };
}

export function documentDeliveryStatus() {
  return { drive: driveConfigured(), email: emailConfigured() };
}
