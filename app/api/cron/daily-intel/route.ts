import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cronAuthed } from "@/lib/cron";
import { sendEmail, emailConfigured } from "@/lib/email";
import { runIntel, type Intel } from "@/lib/intel";
import { listBrains } from "@/lib/brains";
import { recordUsage } from "@/lib/usage";
import { PREMIUM } from "@/lib/vendors/anthropic";

// THE DAILY INTELLIGENCE RUN. The Journalist and The Strategist each go and find what changed, decide whether
// it is MATERIAL, and file it into the "Worth reviewing" queue. Only the material findings are emailed.
//
// They PROPOSE, they never assert: nothing is written into the client brain automatically. A human accepts or
// bins each finding on the platform. That gate is the product, not friction - without it a bad source quietly
// becomes "fact" and every future article and strategy inherits it.
//
// Scheduled in vercel.json. Also manually triggerable by a super-admin (these calls cost money).
export const maxDuration = 800;
export const dynamic = "force-dynamic";

// WHO GETS THE DIGEST. The intel digest has its own recipient list, separate from the cost email - the people
// who need to read the Strategist every morning are not the same people who watch spend.
//   INTEL_EMAIL_TO  - comma-separated, overrides everything (set it in Vercel to change the list, no deploy).
//   otherwise       - the cost recipient (or Gary) PLUS sam@ (Gary asked for Sam on the strategist findings).
// Deduped and trimmed, because nodemailer will happily mail the same person twice.
function intelRecipients(): string {
  if (process.env.INTEL_EMAIL_TO?.trim()) return process.env.INTEL_EMAIL_TO.trim();
  const base = (process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za").split(",");
  const list = [...base, "sam@gasmarketing.co.za"].map((e) => e.trim().toLowerCase()).filter(Boolean);
  return [...new Set(list)].join(",");
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// THE DECISION, not just the news (Gary). Every finding carries an INTERNAL read of what it could do to MoMo SA
// and the campaign move it argues for. Set apart visually so nobody mistakes it for the sourced reporting above
// it - and, for the Journalist, so nobody mistakes GAS's commercial thinking for the CEO's public voice.
function assessmentHtml(i: Intel): string {
  const risk = String(i.impact_risk || "").trim();
  const move = String(i.campaign_response || "").trim();
  if (!risk && !move) return "";
  const defensive = /\bdefensive\b/i.test(move);
  const proactive = /\bproactive\b/i.test(move);
  const tag = defensive && proactive ? "defensive + proactive" : defensive ? "defensive" : proactive ? "proactive" : "";
  // The two roles assess different things, so label them honestly. The Strategist guides our activations and the
  // positioning we take to MoMo's teams; the Journalist is about the CEO's public narrative.
  const isStrat = i.role === "strategist";
  const riskLabel = isStrat ? "Commercial impact / risk to MoMo SA" : "Narrative impact / risk for MoMo SA";
  const moveLabel = isStrat ? "Activation + positioning call" : "Narrative move";
  return `<div style="margin:0 0 8px;padding:10px 12px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0">
    <p style="margin:0 0 4px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6366f1">Internal${tag ? ` · ${tag}` : ""}</p>
    ${risk ? `<p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#334155"><b>${riskLabel}:</b> ${esc(risk.slice(0, 900))}</p>` : ""}
    ${move ? `<p style="margin:0;font-size:13px;line-height:1.55;color:#334155"><b>${moveLabel}:</b> ${esc(move.slice(0, 900))}</p>` : ""}
  </div>`;
}

const APP_URL = process.env.APP_URL || "https://influencers.gasmarketing.co.za";

// THE STRATEGIST BRIEFING. Gary: "we will just get the daily strategist email - no need for the Journalist to
// send a daily email. Make it clear what this email is all about for Sam and Gary."
//
// The Journalist still RUNS and still files to the review queue - it is the tool for drafting the CEO's LinkedIn
// material, pulled on when someone sits down to write. It is not a daily bulletin, so it no longer pushes an
// inbox. This email is the Strategist only: the tool GAS uses as MoMo's performance marketing agency to guide
// campaign activations and the positioning we take to MoMo's internal teams.
function buildEmail(client: string, strategist: Intel[], today: string): string {
  const badge = (c: string) =>
    c === "high" ? `<span style="background:#dcfce7;color:#166534;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">high</span>`
      : c === "low" ? `<span style="background:#fee2e2;color:#991b1b;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">low</span>`
        : `<span style="background:#fef3c7;color:#92400e;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">medium</span>`;

  const block = (title: string, items: Intel[]) => {
    if (!items.length) {
      return `<h3 style="margin:26px 0 6px;font-size:15px;color:#0f172a">${title}</h3>
        <p style="margin:0;color:#64748b;font-size:14px">Nothing material today. That is a real answer, not a gap.</p>`;
    }
    return `<h3 style="margin:26px 0 10px;font-size:15px;color:#0f172a">${title}</h3>` + items.map((i) => {
      // Every finding carries its sources into the inbox, so you can check it without opening the platform.
      // An unsourced claim is flagged, never quietly passed off as verified.
      const srcs = (Array.isArray(i.sources) && i.sources.length)
        ? i.sources
        : i.source_url ? [{ name: i.source_name || i.source_url, url: i.source_url }] : [];
      const sourceHtml = srcs.length
        ? `<p style="margin:10px 0 0;padding-top:8px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8">SOURCES</p>
           <ol style="margin:4px 0 0;padding-left:18px">${srcs.map((s) =>
             `<li style="font-size:12px;line-height:1.6"><a href="${esc(s.url)}" style="color:#2563eb">${esc(s.name || s.url)}</a></li>`).join("")}</ol>`
        : `<p style="margin:10px 0 0;font-size:12px;font-weight:700;color:#b91c1c">⚠ No source. Do not treat this as verified.</p>`;
      // DATE TAGS. When the source was published vs when we found it - a 2019 article discovered today is not
      // news, and anything over 90 days old is flagged so it can never read as this morning's intelligence.
      const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const age = i.published_at ? Math.floor((Date.now() - new Date(i.published_at).getTime()) / 86_400_000) : null;
      const stale = age !== null && age > 90;
      const dateHtml = i.published_at
        ? `<span style="display:inline-block;border:1px solid ${stale ? "#fcd34d" : "#e2e8f0"};background:${stale ? "#fffbeb" : "#fff"};color:${stale ? "#92400e" : "#64748b"};border-radius:5px;padding:1px 6px;font-size:11px;font-weight:600">📅 ${esc(fmt(i.published_at))}${stale ? ` · ${age} days old` : ""}</span>`
        : `<span style="display:inline-block;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;border-radius:5px;padding:1px 6px;font-size:11px;font-weight:600">📅 undated</span>`;
      const periodHtml = i.period
        ? ` <span style="display:inline-block;border:1px solid #e2e8f0;color:#64748b;border-radius:5px;padding:1px 6px;font-size:11px;font-weight:600">data: ${esc(i.period)}</span>`
        : "";
      return `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:10px">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a">${esc(i.headline)} ${badge(i.confidence)}</p>
        <p style="margin:0 0 8px">${dateHtml}${periodHtml}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#334155"><b>Why it matters:</b> ${esc(i.why_it_matters)}</p>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:#475569">${esc(String(i.detail || "").slice(0, 700))}</p>
        ${assessmentHtml(i)}
        ${sourceHtml}
      </div>`;
    }).join("");
  };

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="margin:0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8">Studio on GAS · The Strategist</p>
    <h2 style="margin:6px 0 2px;font-size:22px">${esc(client)} · daily intelligence</h2>
    <p style="margin:0 0 14px;color:#64748b;font-size:13px">${esc(today)}</p>

    <!-- WHAT THIS IS. Gary asked for this to be explicit: a briefing nobody can place is a briefing nobody acts
         on, and Sam is new to it. Say what it is for, what it is not, and what is expected of the reader. -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 8px">
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#334155">
        <b>What this is.</b> GAS is MTN MoMo's performance marketing agency. Every morning The Strategist goes and
        finds what actually changed in the SA fintech market - competitor moves, risks to MoMo's position, and
        openings worth taking - and only what is <b>material</b> reaches this email. A quiet day means nothing
        material was found, which is a real answer, not a gap.
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#334155">
        <b>What to do with it.</b> Each finding carries an internal read of the <b>commercial impact or risk to
        MoMo SA</b> and the <b>activation and positioning call</b> it argues for - defensive or proactive. It is
        written to guide our campaign activations and the positioning we take to MoMo's internal teams. Every
        claim is sourced: check the links before you repeat anything.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#334155">
        <b>These are proposals.</b> Nothing is written into the client brain automatically - a human accepts or
        bins each one on the platform. That gate is deliberate: without it a bad source quietly becomes "fact"
        and every future strategy inherits it.
      </p>
    </div>

    ${block("Material findings", strategist)}

    <p style="margin:22px 0 0">
      <a href="${APP_URL}/strategist" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:700">Review and accept on the platform →</a>
    </p>
    <p style="margin:14px 0 0;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#94a3b8">
      The Journalist (material for the CEO's LinkedIn voice) runs daily too, but does not email - its findings
      wait in the queue at <a href="${APP_URL}/journalist" style="color:#64748b">/journalist</a> for when you sit
      down to write.
    </p>
  </div>`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!cronAuthed(req) && session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 401 }); // these calls spend money
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("clientId") || "";
  const today = new Date().toISOString().slice(0, 10);

  // For v1 the intelligence roles run for the clients that have a brand kit doctrine to reason against.
  const clients = (await listBrains().catch(() => [])).filter((c) => (only ? c.id === only : /momo/i.test(c.name)));
  if (!clients.length) return NextResponse.json({ ok: true, skipped: "no client in scope" });

  const out: Record<string, unknown>[] = [];
  for (const c of clients) {
    try {
      // Do NOT swallow a role's failure. On the first live run the Journalist returned nothing and said
      // nothing about why - which is the worst possible outcome, because "no findings" and "it broke" look
      // identical from the outside. Capture the error and report it.
      const errors: string[] = [];
      const [journalist, strategist] = await Promise.all([
        runIntel(c.id, "journalist", today).catch((e) => { errors.push(`journalist: ${String((e as Error)?.message || e).slice(0, 140)}`); return [] as Intel[]; }),
        runIntel(c.id, "strategist", today).catch((e) => { errors.push(`strategist: ${String((e as Error)?.message || e).slice(0, 140)}`); return [] as Intel[]; }),
      ]);
      await recordUsage({ clientId: c.id, provider: "anthropic", model: PREMIUM, unit: "request", action: "daily-intel", count: 2 }).catch(() => {});

      // Only MATERIAL findings are worth an inbox. The rest wait in the queue.
      const jm = journalist.filter((i) => i.material);
      const sm = strategist.filter((i) => i.material);

      // THE EMAIL IS THE STRATEGIST ONLY (Gary). The Journalist still runs and still files to the queue - it is
      // the tool for drafting the CEO's LinkedIn voice, picked up when someone sits down to write, not a daily
      // bulletin. So a Journalist-only day sends nothing rather than mailing the team something to ignore.
      let emailed = false;
      if (sm.length && emailConfigured()) {
        await sendEmail({
          to: intelRecipients(),
          subject: `The Strategist · ${c.name} · ${sm.length} material finding${sm.length === 1 ? "" : "s"} · ${today}`,
          html: buildEmail(c.name, sm, today),
        }).catch(() => {});
        emailed = true;
      }
      out.push({ client: c.name, journalist: journalist.length, strategist: strategist.length, material: jm.length + sm.length, emailed, errors: errors.length ? errors : undefined });
    } catch (e) {
      out.push({ client: c.name, error: String((e as Error)?.message || e).slice(0, 160) });
    }
  }

  return NextResponse.json({ ok: true, today, ran: out });
}
