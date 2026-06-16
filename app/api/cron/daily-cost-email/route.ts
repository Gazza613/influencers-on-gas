import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReport, MONTHLY_CREDITS } from "@/lib/usage";
import { getBalance } from "@/lib/vendors/higgsfield";
import { buildCostEmail } from "@/lib/cost-email";
import { sendEmail, emailConfigured } from "@/lib/email";
import { cronAuthed, isoDaysAgo, monthStartIso } from "@/lib/cron";

// Daily cost digest to Gary (line of sight on team spend). Scheduled in
// vercel.json (05:30 UTC ≈ 07:30 SAST). Sends from grow@ Gmail once creds are set.
// Also triggerable manually by a signed-in user (handy for testing).
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await auth();
  if (!cronAuthed(req) && !session?.user) return NextResponse.json({ error: "forbidden" }, { status: 401 });

  try {
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
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
