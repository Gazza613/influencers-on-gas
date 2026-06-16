import { NextResponse } from "next/server";
import { getReport, MONTHLY_CREDITS } from "@/lib/usage";
import { getBalance } from "@/lib/vendors/higgsfield";
import { buildCostEmail } from "@/lib/cost-email";
import { sendEmail, emailConfigured } from "@/lib/email";
import { cronAuthed, isoDaysAgo, monthStartIso } from "@/lib/cron";

// Daily cost digest to Gary (line of sight on team spend). Scheduled in
// vercel.json (05:30 UTC ≈ 07:30 SAST). Sends from grow@ Gmail once creds are set.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthed(req)) return NextResponse.json({ error: "forbidden" }, { status: 401 });

  const to = process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
  const yesterday = isoDaysAgo(1);
  const [report, monthReport] = await Promise.all([
    getReport({ from: yesterday, to: yesterday }),
    getReport({ from: monthStartIso() }),
  ]);
  let remaining: number | null = null;
  try { remaining = (await getBalance()).remaining; } catch { /* ignore */ }

  const { subject, html } = buildCostEmail({ periodLabel: "Yesterday", report, monthReport, remaining, monthly: MONTHLY_CREDITS });
  const result = await sendEmail({ to, subject, html });
  return NextResponse.json({ ...result, configured: emailConfigured(), to });
}
