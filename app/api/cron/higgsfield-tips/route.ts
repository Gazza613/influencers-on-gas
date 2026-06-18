import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { researchHiggsfieldTips } from "@/lib/vendors/anthropic";
import { buildTipsEmail } from "@/lib/tips-email";
import { sendEmail, emailConfigured } from "@/lib/email";
import { recordUsage } from "@/lib/usage";
import { cronAuthed } from "@/lib/cron";

// Daily "Higgsfield expert" research email to Gary: latest Higgsfield + AI-influencer
// best practice turned into concrete ideas for the platform. Scheduled in vercel.json
// (06:00 UTC ~ 08:00 SAST). Also triggerable manually by a signed-in user (for testing).
export const maxDuration = 120;

export async function GET(req: Request) {
  const session = await auth();
  if (!cronAuthed(req) && !session?.user) return NextResponse.json({ error: "forbidden" }, { status: 401 });

  try {
    const to = process.env.TIPS_EMAIL_TO || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
    const today = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });
    const ideasHtml = await researchHiggsfieldTips(today);
    // Meter the research call (Claude + web search) so it shows in Cost Control.
    await recordUsage({ provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: "research", count: 1 }).catch(() => {});

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
