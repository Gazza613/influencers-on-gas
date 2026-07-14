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

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildEmail(client: string, journalist: Intel[], strategist: Intel[], today: string): string {
  const badge = (c: string) =>
    c === "high" ? `<span style="background:#dcfce7;color:#166534;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">high</span>`
      : c === "low" ? `<span style="background:#fee2e2;color:#991b1b;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">low</span>`
        : `<span style="background:#fef3c7;color:#92400e;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">medium</span>`;

  const block = (title: string, items: Intel[]) => {
    if (!items.length) {
      return `<h3 style="margin:26px 0 6px;font-size:15px;color:#0f172a">${title}</h3>
        <p style="margin:0;color:#64748b;font-size:14px">Nothing material today. That is a real answer, not a gap.</p>`;
    }
    return `<h3 style="margin:26px 0 10px;font-size:15px;color:#0f172a">${title}</h3>` + items.map((i) => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:10px">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0f172a">${esc(i.headline)} ${badge(i.confidence)}</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#334155"><b>Why it matters:</b> ${esc(i.why_it_matters)}</p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#475569">${esc(String(i.detail || "").slice(0, 700))}</p>
        ${i.source_url ? `<a href="${esc(i.source_url)}" style="font-size:12px;color:#2563eb">${esc(i.source_name || i.source_url)}</a>` : ""}
      </div>`).join("");
  };

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="margin:0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8">Studio on GAS · daily intelligence</p>
    <h2 style="margin:6px 0 2px;font-size:22px">${esc(client)}</h2>
    <p style="margin:0;color:#64748b;font-size:13px">${esc(today)} · only material findings are shown. Everything else is in the review queue.</p>
    ${block("The Journalist — material for a defensible public argument", journalist)}
    ${block("The Strategist — what should change what we advise", strategist)}
    <p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
      These are PROPOSALS. Nothing has been written into the client brain. Accept or bin each one on the platform.
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

      let emailed = false;
      if ((jm.length || sm.length) && emailConfigured()) {
        await sendEmail({
          to: process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za",
          subject: `${c.name} · ${jm.length + sm.length} material finding${jm.length + sm.length === 1 ? "" : "s"} · ${today}`,
          html: buildEmail(c.name, jm, sm, today),
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
