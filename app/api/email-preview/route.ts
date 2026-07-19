import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inviteEmail, resetEmail } from "@/lib/invite-email";
import { buildEmail } from "@/app/api/cron/daily-intel/route";
import { APP_URL } from "@/lib/app-url";

// SEE AN EMAIL WITHOUT SENDING ONE.
//
// Every mobile problem in these templates has been found the same way: someone opens a real email on a real
// phone and reports it. That is a slow, embarrassing loop, and it means the only way to test a change is to
// post it to a colleague. This renders any template straight into the browser, so it can be checked at any
// width - and so an automated pass can measure it rather than anyone eyeballing it.
//
// Super-admin only. It renders with sample content and sends nothing.
export const dynamic = "force-dynamic";

const SAMPLE_INTEL = [{
  id: "sample", headline: "Category conversation shifting from wallets opened to meaningful participation",
  why_it_matters: "Regulator commentary has moved from access to usage, which changes what a growth number has to prove.",
  detail: "Two published sources this week frame adoption in terms of active participation rather than registrations. That reframes how our campaign reports progress and what the client's internal team will be asked for.",
  sources: [{ name: "Sample source", url: "https://example.com/a" }],
  published_at: "2026-07-18", confidence: "high", impact_risk: "Medium", campaign_response: "Lead with proof of use, not sign-ups.",
  status: "new", role: "strategist", period: "daily", source_name: "Sample", source_url: "https://example.com/a",
}] as unknown as Parameters<typeof buildEmail>[1];

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const type = new URL(req.url).searchParams.get("type") || "strategist";
  let html = "";

  if (type === "invite") html = inviteEmail({ inviterName: "Gary Berman", inviteeName: "Sam", link: `${APP_URL}/invite/sample-token` }).html;
  else if (type === "reset") html = resetEmail({ name: "Sam", link: `${APP_URL}/reset/sample-token` }).html;
  else html = buildEmail("MTN MoMo", SAMPLE_INTEL, "19 July 2026", "Two findings worth your attention this morning.");

  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${html}</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
