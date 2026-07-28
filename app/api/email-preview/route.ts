import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inviteEmail, resetEmail } from "@/lib/invite-email";
import { buildEmail } from "@/app/api/cron/daily-intel/route";
import { researchEmailHtml } from "@/lib/research-doc";
import { renderDoneEmailHtml } from "@/lib/notify";
import { brandedHtml } from "@/lib/alerts";
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
  else if (type === "research") html = researchEmailHtml({ clientName: "The Amber Room", version: 2, claimCount: 54, studioLink: `${APP_URL}/researcher`, pdfUrl: `${APP_URL}/sample.pdf`, wordUrl: `${APP_URL}/sample.doc`, driveUrl: "https://drive.google.com/sample", dateLabel: "28 July 2026" });
  else if (type === "producer") html = renderDoneEmailHtml("Your final cut is ready 🎉", "The final cut for <b>Kiara</b> has finished rendering and stitching. It is ready to review and download.", `${APP_URL}/studio`, "Watch the final cut →");
  else if (type === "alert") html = brandedHtml("Higgsfield API wallet out of credits", "403 not enough credits (developer-API wallet)", { tag: "OUT OF CREDITS", cause: "The fast REST lane's developer-API wallet ran dry mid-render.", fix: "Top up the API wallet at platform.higgsfield.ai, then re-run the step." }, { influencer: "Kiara", step: "b-roll clip 3", provider: "higgsfield" });
  else html = buildEmail("MTN MoMo", SAMPLE_INTEL, "19 July 2026", "Two findings worth your attention this morning.");

  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${html}</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
