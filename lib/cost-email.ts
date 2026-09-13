import type { CostReport } from "@/lib/usage";
import { emailShell } from "./email-shell";
import { APP_URL } from "./app-url";

// THE DAILY COST EMAIL, aligned to the Cost Control PAGE (Gary): it leads with the same per-POD structure the
// team sees in the platform - The Brain's cost exposure, then every section's true cost (pay-per-use + its share
// of the subscriptions) - before the supporting team/provider/function detail. Same shape, same numbers.

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Labels matched to the Cost Control page so a name means the same thing in the email and in the platform.
const PROVIDER_LABEL: Record<string, string> = {
  higgsfield: "Higgsfield · images & scenes", fal: "fal.ai · talking shots", heygen: "HeyGen · presenter",
  anthropic: "Claude · research, copy & QA", elevenlabs: "ElevenLabs · voice", voyage: "Voyage · embeddings", firecrawl: "Firecrawl · crawl",
};
const ACTION_LABEL: Record<string, string> = {
  casting: "Casting", photoshoot: "Photoshoot", soul: "Lock-down", humaniser: "Humaniser", presenter: "Presenter",
  bible: "Character casting", ingest: "Brain ingestion", creative: "Wardrobe & set", wardrobe: "Wardrobe lock", qa: "Vision QA",
  compose: "Scene writing", "deep-research": "Deep research", "research-file": "Research filing", "research-verify": "Source check",
  "daily-intel": "Strategist watch", "ceo-newsletter": "CEO article", tagline: "Tagline", aroll: "Talking shot", broll: "Scene shot",
  "brain-answer": "Ask the brain", "brain-reindex": "Re-index", "sharpen-question": "Sharpen answer", "ask-ingest": "Save to brain",
};
// The desk key "Brains" reads as "The Brain" for the team (matches the dashboard pod name).
const DESK_LABEL = (desk: string) => (desk === "Brains" ? "The Brain" : desk);

const BASE = APP_URL;
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

function statCell(label: string, value: string, sub: string, strong = false) {
  return `<td width="33%" style="vertical-align:top;padding:0 3px;">
    <div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;background:#0f141b;">
      <div style="font-size:9px;letter-spacing:0.5px;text-transform:uppercase;color:#8a8f98;">${esc(label)}</div>
      <div style="font-size:${strong ? "18px" : "15px"};font-weight:${strong ? 800 : 700};color:#fff;margin-top:3px;white-space:nowrap;">${value}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px;">${esc(sub)}</div>
    </div></td>`;
}

// THE BRAIN · COST EXPOSURE, the same card the page leads with: the Firecrawl sub (fixed), Claude+Voyage (usage),
// the total, and the Firecrawl quota meter that warns before it bills overage.
function brainPodCard(usageCents: number, fixedCents: number, fc: { pages: number; quota: number; cycleStart: string } | null) {
  const total = usageCents + fixedCents;
  const quota = fc?.quota ?? 5000, pages = fc?.pages ?? 0;
  const pct = Math.min(100, Math.round((pages / Math.max(1, quota)) * 100));
  const warn = pct >= 80;
  return `
  <div style="border:1px solid rgba(244,114,182,0.3);border-radius:14px;overflow:hidden;margin:14px 0;background:#0c1117;">
    <div style="padding:10px 14px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#f472b6;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600;">The Brain · cost exposure</div>
    <div style="padding:12px 11px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${statCell("Fixed · Firecrawl", rand(fixedCents), "$19/mo, FX to ZAR")}
        ${statCell("Usage · Claude + Voyage", rand(usageCents), "per-use")}
        ${statCell("Total this cycle", rand(total), "fixed + usage", true)}
      </tr></table>
      <div style="margin-top:13px;font-size:11px;color:#8a8f98;">Firecrawl pages this cycle <span style="float:right;color:#e6e8eb;font-weight:600;">${pages.toLocaleString()} / ${quota.toLocaleString()}</span></div>
      <div style="height:8px;border-radius:99px;background:#141b24;margin-top:6px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${warn ? "#ff453a" : "#8b5cf6"};"></div></div>
      <div style="margin-top:8px;font-size:11px;color:${warn ? "#ff8f8a" : "#6b7280"};">${warn
        ? `Approaching the 5,000-page Firecrawl limit (${pct}%). Top up before it bills overage (about R81 per 1,000 pages).`
        : `Within the 5,000-page Hobby quota, so crawls are R0 marginal.`}</div>
    </div>
  </div>`;
}

// BY SECTION (BY POD), the page's "By section": each section's true cost = pay-per-use plus its share of the
// subscriptions its work runs on. The rows sum to the cycle total.
function sectionCard(
  desks: CostReport["byDesk"],
  fixedByDesk: Record<string, number>,
  idleCents: number,
) {
  const trueOf = (d: CostReport["byDesk"][number]) => d.cents + (fixedByDesk[d.desk] ?? 0);
  const total = desks.reduce((s, d) => s + trueOf(d), 0) + idleCents;
  const pctOf = (c: number) => (total > 0 ? (c / total) * 100 : 0);
  const bar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;height:10px;border-radius:99px;overflow:hidden;"><tr>
    ${desks.map((d) => `<td style="background:${d.tint};width:${Math.max(pctOf(trueOf(d)), trueOf(d) > 0 ? 1 : 0)}%;line-height:10px;">&nbsp;</td>`).join("")}
    ${idleCents > 0 ? `<td style="background:#475569;width:${Math.max(pctOf(idleCents), 1)}%;line-height:10px;">&nbsp;</td>` : ""}
  </tr></table>`;
  const rowHtml = desks.map((d, i) => {
    const fx = fixedByDesk[d.desk] ?? 0;
    const sub = fx > 0 ? `${rand(d.cents)} use + ${rand(fx)} plans` : `${pctOf(trueOf(d)).toFixed(0)}%`;
    return `<tr style="background:${i % 2 ? "#0f141b" : "#0c1117"};">
      <td style="padding:9px 14px;color:#e6e8eb;font-size:13px;"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:${d.tint};margin-right:8px;vertical-align:middle;"></span>${esc(DESK_LABEL(d.desk))}<span style="color:#6b7280;font-size:11px;"> · ${d.events.toLocaleString()} jobs</span></td>
      <td style="padding:9px 14px;text-align:right;white-space:nowrap;"><span style="color:#fff;font-size:13px;font-weight:700;">${rand(trueOf(d))}</span><br><span style="color:#6b7280;font-size:10px;">${sub}</span></td>
    </tr>`;
  }).join("");
  const idleRow = idleCents > 0
    ? `<tr style="background:${desks.length % 2 ? "#0f141b" : "#0c1117"};"><td style="padding:9px 14px;color:#9aa0a8;font-size:13px;"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:#475569;margin-right:8px;vertical-align:middle;"></span>Unused plans<span style="color:#6b7280;font-size:11px;"> · idle capacity</span></td><td style="padding:9px 14px;text-align:right;color:#9aa0a8;font-size:13px;font-weight:700;white-space:nowrap;">${rand(idleCents)}</td></tr>`
    : "";
  return `
  <div style="border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;margin:14px 0;background:#0c1117;">
    <div style="padding:10px 14px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c79bff;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600;">By section · by pod</div>
    <div style="padding:12px 14px 6px;">${bar}</div>
    <table style="width:100%;border-collapse:collapse;">${rowHtml}${idleRow}</table>
  </div>`;
}

export function buildCostEmail(opts: {
  periodLabel: string;
  report: CostReport;       // period report (e.g. yesterday)
  monthReport: CostReport;  // month-to-date (the current billing cycle)
  remaining: number | null;
  monthly: number;
  fixed?: { byDesk: { desk: string; cents: number }[]; idle: { name: string; cents: number }[] } | null;
  firecrawl?: { pages: number; quota: number; cycleStart: string } | null;
}): { subject: string; html: string } {
  const { report, monthReport, remaining, monthly, periodLabel, fixed, firecrawl } = opts;
  const usedPct = remaining != null ? Math.max(0, Math.min(100, Math.round(((monthly - remaining) / monthly) * 100))) : null;

  const fixedByDesk: Record<string, number> = Object.fromEntries((fixed?.byDesk ?? []).map((d) => [d.desk, d.cents]));
  const idleCents = (fixed?.idle ?? []).reduce((s, x) => s + (x.cents || 0), 0);
  const brainUsage = monthReport.byDesk.find((d) => d.desk === "Brains")?.cents ?? 0;
  const brainFixed = fixedByDesk["Brains"] ?? 0;

  const body = `
      <!-- Hero numbers. TABLE, not flexbox (Gmail mobile ignores flex). -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
        <tr>
          <td width="50%" style="vertical-align:top;padding-right:5px;">
            <div style="border:1px solid rgba(168,85,247,0.3);border-radius:14px;padding:13px;background:rgba(168,85,247,0.06);">
              <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a8f98;">Spent ${esc(periodLabel.toLowerCase())}</div>
              <div style="font-size:22px;font-weight:800;color:#fff;margin-top:4px;white-space:nowrap;">${rand(report.total.cents)}</div>
              <div style="font-size:11px;color:#9aa0a8;">${Math.round(report.total.credits).toLocaleString()} cr · ${report.total.events} jobs</div>
            </div>
          </td>
          <td width="50%" style="vertical-align:top;padding-left:5px;">
            <div style="border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:13px;background:#0c1117;">
              <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#8a8f98;">This cycle (from 10th)</div>
              <div style="font-size:22px;font-weight:800;color:#fff;margin-top:4px;white-space:nowrap;">${rand(monthReport.total.cents)}</div>
              <div style="font-size:11px;color:#9aa0a8;">${remaining != null ? `${remaining.toLocaleString()} / ${monthly.toLocaleString()} left` : "balance n/a"}</div>
            </div>
          </td>
        </tr>
      </table>
      ${usedPct != null ? `<div style="height:8px;border-radius:99px;background:#141b24;margin-top:10px;overflow:hidden;"><div style="height:100%;width:${usedPct}%;background:${usedPct > 88 ? "#ff453a" : "#34c759"};"></div></div>` : ""}

      ${brainPodCard(brainUsage, brainFixed, firecrawl ?? null)}
      ${sectionCard(monthReport.byDesk, fixedByDesk, idleCents)}

      ${card("By team member", rows(monthReport.byUser.map((u) => ({ label: u.user_email === "(system)" ? "Super Admin" : u.user_email, sub: `${u.events} jobs`, cents: u.cents }))))}
      ${card("By platform / API", rows(monthReport.byProvider.map((p) => ({ label: PROVIDER_LABEL[p.provider] ?? p.provider, cents: p.cents }))))}
      ${card("By function", rows(monthReport.byAction.map((a) => ({ label: ACTION_LABEL[a.action] ?? a.action, cents: a.cents }))))}

      <div style="text-align:center;margin-top:18px;">
        <a href="${BASE}/cost-control" style="display:inline-block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:99px;">Open Cost Control →</a>
      </div>
      <div style="text-align:center;margin-top:14px;font-size:11px;color:#6b7280;">Structured by pod, the same as the Cost Control page.</div>`;

  const html = emailShell({ strapline: "GAS Daily Cost Control", dateLabel: periodLabel, body, cadence: "DAILY COST CONTROL, 07:30 SAST" });
  return { subject: `Cost Control · ${rand(report.total.cents)} spent ${periodLabel.toLowerCase()} · ${rand(monthReport.total.cents)} MTD`, html };
}
