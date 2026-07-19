import type { CostReport } from "@/lib/usage";
import { emailShell } from "./email-shell";
import { APP_URL } from "./app-url";

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PROVIDER_LABEL: Record<string, string> = {
  higgsfield: "Higgsfield · images & upscale", heygen: "HeyGen · presenter",
  anthropic: "Claude · co-pilot & QA", elevenlabs: "ElevenLabs · voice", voyage: "Voyage · embeddings", firecrawl: "Firecrawl · crawl",
};
const ACTION_LABEL: Record<string, string> = {
  casting: "Casting (looks)", photoshoot: "Photoshoot", soul: "Lock-down (legacy Soul)", humaniser: "Humaniser",
  presenter: "Presenter", bible: "Character Casting", ingest: "Brain ingestion", creative: "Creatives (social)",
  qa: "AI Vision QA", compose: "Scene writing", research: "Daily research", tagline: "Tagline",
};

const BASE = APP_URL;

// Escape user-controlled values (influencer names, emails) before HTML interpolation.
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function rows(items: { label: string; cents: number; sub?: string }[]) {
  if (!items.length) return `<tr><td style="padding:10px 14px;color:#8a8f98;font-size:13px;">No spend.</td></tr>`;
  return items.map((r, i) => `
    <tr style="background:${i % 2 ? "#0f141b" : "#0c1117"};">
      <td style="padding:9px 14px;color:#e6e8eb;font-size:13px;">${esc(r.label)}${r.sub ? `<span style="color:#6b7280;font-size:11px;"> · ${esc(r.sub)}</span>` : ""}</td>
      <td style="padding:9px 14px;color:#fff;font-size:13px;text-align:right;font-weight:600;white-space:nowrap;">${rand(r.cents)}</td>
    </tr>`).join("");
}

function card(title: string, body: string) {
  return `
  <div style="border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;margin:14px 0;background:#0c1117;">
    <div style="padding:10px 14px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c79bff;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600;">${title}</div>
    <table style="width:100%;border-collapse:collapse;">${body}</table>
  </div>`;
}

export function buildCostEmail(opts: {
  periodLabel: string;
  report: CostReport;       // period report (e.g. yesterday)
  monthReport: CostReport;  // month-to-date
  remaining: number | null;
  monthly: number;
}): { subject: string; html: string } {
  const { report, monthReport, remaining, monthly, periodLabel } = opts;
  const usedPct = remaining != null ? Math.max(0, Math.min(100, Math.round(((monthly - remaining) / monthly) * 100))) : null;

  const body = `
      <!-- Hero numbers -->
      <div style="display:flex;gap:10px;">
        <div style="flex:1;border:1px solid rgba(168,85,247,0.3);border-radius:14px;padding:14px;background:rgba(168,85,247,0.06);">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8f98;">Spent ${periodLabel.toLowerCase()}</div>
          <div style="font-size:26px;font-weight:800;color:#fff;margin-top:4px;">${rand(report.total.cents)}</div>
          <div style="font-size:12px;color:#9aa0a8;">${Math.round(report.total.credits).toLocaleString()} credits · ${report.total.events} jobs</div>
        </div>
        <div style="flex:1;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px;background:#0c1117;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a8f98;">This cycle (from the 10th)</div>
          <div style="font-size:26px;font-weight:800;color:#fff;margin-top:4px;">${rand(monthReport.total.cents)}</div>
          <div style="font-size:12px;color:#9aa0a8;">${remaining != null ? `${remaining.toLocaleString()} / ${monthly.toLocaleString()} credits left` : "balance n/a"}</div>
        </div>
      </div>
      ${usedPct != null ? `<div style="height:8px;border-radius:99px;background:#141b24;margin-top:10px;overflow:hidden;"><div style="height:100%;width:${usedPct}%;background:${usedPct > 88 ? "#ff453a" : "#34c759"};"></div></div>` : ""}

      ${card("By team member", rows(monthReport.byUser.map((u) => ({ label: u.user_email === "(system)" ? "Super Admin" : u.user_email, sub: `${u.events} jobs`, cents: u.cents }))))}
      ${card("By platform / API", rows(monthReport.byProvider.map((p) => ({ label: PROVIDER_LABEL[p.provider] ?? p.provider, cents: p.cents }))))}
      ${card("By function", rows(monthReport.byAction.map((a) => ({ label: ACTION_LABEL[a.action] ?? a.action, cents: a.cents }))))}
      ${card("By influencer", rows(monthReport.byInfluencer.slice(0, 12).map((i) => ({ label: i.name, sub: `${i.images} img · ${i.videos} vid`, cents: i.cents }))))}

      <div style="text-align:center;margin-top:18px;">
        <a href="${BASE}/cost-control" style="display:inline-block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:99px;">Open Cost Control →</a>
      </div>
      <div style="text-align:center;margin-top:14px;font-size:11px;color:#6b7280;">Higgsfield Ultra $375 / 9,000 credits.</div>`;

  const html = emailShell({ strapline: "GAS Daily Cost Control", dateLabel: periodLabel, body, cadence: "DAILY COST CONTROL, 07:30 SAST" });
  return { subject: `Cost Control · ${rand(report.total.cents)} spent ${periodLabel.toLowerCase()} · ${rand(monthReport.total.cents)} MTD`, html };
}
