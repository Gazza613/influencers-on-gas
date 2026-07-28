import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { researchHiggsfieldTips } from "@/lib/vendors/anthropic";
import { buildTipsEmail } from "@/lib/tips-email";
import { sendEmail, emailConfigured } from "@/lib/email";
import { cronAuthed } from "@/lib/cron";

// RETIRED (Gary, July 2026): the daily "Higgsfield ideas" research email is no longer wanted - it cost money
// (a metered Claude + web-search run every morning) for diminishing value. The cron is removed from vercel.json
// AND the route is disabled here, so neither the schedule nor a stray manual trigger can spend on it again. Kept
// as a no-op (not deleted) so the history and the metering wiring stay legible if we ever want it back.
export const maxDuration = 120;
const RETIRED = true;

export async function GET(req: Request) {
  if (RETIRED) return NextResponse.json({ sent: false, retired: true, reason: "Daily Higgsfield-tips email was retired (Gary): no schedule, no spend." });

  const session = await auth();
  if (!cronAuthed(req) && session?.user?.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 401 }); // manual trigger: super-admin only (these can spend money)

  try {
    const to = process.env.TIPS_EMAIL_TO || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
    const today = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });
    // researchHiggsfieldTips meters its own Claude + web-search cost token-accurately (lib/vendors/anthropic).
    const ideasHtml = await researchHiggsfieldTips(today);

    // High-signal only: stay silent unless the research cleared the strict bar (a real
    // optimisation or a cost-control win). No noise on quiet days.
    const stripped = ideasHtml.replace(/<[^>]*>/g, "").trim();
    if (stripped === "NO_SIGNIFICANT_FINDINGS" || !ideasHtml.includes("<h3")) {
      return NextResponse.json({ sent: false, reason: "nothing cleared the bar today", to });
    }

    const dateLabel = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Johannesburg" });
    const { subject, html } = buildTipsEmail({ ideasHtml, dateLabel });
    const result = await sendEmail({ to, subject, html });
    return NextResponse.json({ ...result, configured: emailConfigured(), to });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
