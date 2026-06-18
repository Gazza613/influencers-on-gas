import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReport, MONTHLY_CREDITS } from "@/lib/usage";
import { getBalance } from "@/lib/vendors/higgsfield";
import { buildCostEmail } from "@/lib/cost-email";
import { sendEmail, emailConfigured } from "@/lib/email";
import { cronAuthed, isoDaysAgo, cycleStartIso } from "@/lib/cron";

// Daily cost digest to Gary (line of sight on team spend). Scheduled in
// vercel.json (05:30 UTC ≈ 07:30 SAST). Sends from grow@ Gmail once creds are set.
// Also triggerable manually by a signed-in user (handy for testing).
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await auth();
  if (!cronAuthed(req) && session?.user?.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 401 }); // manual trigger: super-admin only (these can spend money)

  try {
    const to = process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
    const yesterday = isoDaysAgo(1);
    const [report, monthReport] = await Promise.all([
      getReport({ from: yesterday, to: yesterday }),
      getReport({ from: cycleStartIso() }), // spend window = current Higgsfield cycle (10th to 10th)
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
