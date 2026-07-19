import { NextResponse } from "next/server";
import { getActivity } from "@/lib/activity";
import { emailShell } from "@/lib/email-shell";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/app-url";

// THE WEEKLY EXCO VIEW (Gary): is the team taking the studio up, and which parts.
//
// Adoption, not surveillance. It reports who signed in, what they built and which desks they used. It does not
// time anyone, rank anyone, or try to infer effort - those would be a different tool answering a question
// nobody asked.
//
// It states its own boundary out loud: Media on GAS has its own auth and its own reporting, so its activity
// genuinely cannot appear here. Saying so is the difference between a known gap and a silence that reads as
// zero - and a number an EXCO trusts is one that admits what it does not cover.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TO = ["gary@gasmarketing.co.za", "sam@gasmarketing.co.za"];
const rand = (c: number) => "R" + (c / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export async function GET(req: Request) {
  // Vercel cron carries a bearer secret when one is configured; a manual run by a signed-in super admin is
  // handled by the UI calling this behind the app's own gate.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  try {
    const a = await getActivity(7);
    const t = a.totals;

    const stat = (label: string, value: string, note = "") => `
      <td class="card" style="padding:12px 10px;background:#0c1117;border:1px solid rgba(168,85,247,0.22);border-radius:12px;vertical-align:top;">
        <div style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#8a8f98;">${label}</div>
        <div class="h2" style="margin-top:5px;font-size:20px;font-weight:800;color:#ffffff;">${value}</div>
        ${note ? `<div style="margin-top:2px;font-size:11px;color:#6f757e;">${note}</div>` : ""}
      </td>`;

    // Everyone is listed, busiest first. A quiet week is the finding, so nobody is hidden for having one.
    const rows = a.members.map((m) => {
      const desks = m.desks.slice(0, 2).map((d) => `${esc(d.desk.replace(" on GAS", ""))} ${d.jobs}`).join(" · ") || "—";
      const when = m.sessions === 0
        ? `<span style="color:#fbbf24;">not seen this week</span>`
        : `${m.daysActive} day${m.daysActive === 1 ? "" : "s"} active · ${m.sessions} session${m.sessions === 1 ? "" : "s"}${m.typicalDay ? ` · typically ${esc(m.typicalDay)}` : ""}`;
      return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:14px;font-weight:700;color:#ffffff;">${esc(m.name || m.email)}</div>
          <div style="font-size:11px;color:#8a8f98;">${when}</div>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:right;white-space:nowrap;">
          <div style="font-size:14px;font-weight:700;color:#ffffff;">${m.jobs}</div>
          <div style="font-size:11px;color:#8a8f98;">${rand(m.cents)}</div>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:right;font-size:11px;color:#9aa0a8;">${desks}</td>
      </tr>`;
    }).join("");

    const quiet = a.quietest.length
      ? `<p class="p" style="font-size:13px;line-height:1.7;color:#9aa0a8;margin:16px 0 0;">
           <b style="color:#fbbf24;">Not seen this week:</b> ${a.quietest.map((m) => esc(m.name || m.email)).join(", ")}.
           Worth a nudge if they were expected to be building.
         </p>`
      : `<p class="p" style="font-size:13px;line-height:1.7;color:#86efac;margin:16px 0 0;">Everyone on the team was active this week.</p>`;

    const body = `
      <p class="p" style="font-size:14px;line-height:1.7;color:#9aa0a8;margin:0 0 14px;">
        How the team used <b style="color:#ffffff;">Studio on GAS</b> from ${a.from} to ${a.to}.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 0 6px;">
        <tr>
          ${stat("Adoption", `${t.activeMembers}/${t.teamSize}`, "were active")}
          ${stat("Sessions", String(t.sessions), "visits to the studio")}
        </tr>
        <tr>
          ${stat("Jobs run", String(t.jobs))}
          ${stat("Spend", rand(t.cents), "on their work")}
        </tr>
      </table>

      <div style="margin-top:20px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#8a8f98;">By person</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">${rows}</table>
      ${quiet}

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 4px;">
        <tr><td align="center" bgcolor="#f96203" style="border-radius:999px;">
          <a href="${APP_URL}/setup/users" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0b0d12;text-decoration:none;border-radius:999px;">Open the team page →</a>
        </td></tr>
      </table>

      <p class="small" style="font-size:11px;line-height:1.6;color:#6f757e;margin:18px 0 0;">
        Sessions are visits to the studio, counted as activity with no gap longer than 30 minutes. We do not
        track time at a desk, so this reports how often and how regularly people come in, not hours worked.
        <br /><br />
        Studio on GAS only. Media on GAS is a separate product with its own team controls and its own reporting,
        so its activity is not included here and this is not a view of it.
      </p>`;

    const html = emailShell({
      strapline: "Weekly team activity",
      dateLabel: `${a.from} to ${a.to}`,
      body,
      cadence: "WEEKLY ADOPTION, MONDAYS 07:00 SAST",
      role: "AI Studio Lead",
      department: "GAS Marketing",
    });

    await sendEmail({ to: TO.join(","), subject: `Studio on GAS - team activity, ${a.from} to ${a.to}`, html });
    return NextResponse.json({ ok: true, sent: TO, members: a.members.length, ...t });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
