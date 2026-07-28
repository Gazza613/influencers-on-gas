import { sendEmail, emailConfigured } from "@/lib/email";

// "Notify me when it's ready" (option B): the final render + stitch are long jobs that run durably on our
// servers, so the producer shouldn't have to sit and watch. When a long job finishes we email them a link so
// they can walk away and get pulled back only when there's something to do. Fully guarded: a no-op unless email
// is configured, and every send is wrapped so a mail hiccup can NEVER fail the render job.
import { APP_URL } from "./app-url";
import { emailShell } from "./email-shell";
// Gary is always BCC'd on every render notification (team oversight), whoever built it.
const gary = () => process.env.SUPER_ADMIN_EMAIL || process.env.ALERT_EMAIL_TO || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
const recipient = () => process.env.ALERT_EMAIL_TO || process.env.SUPER_ADMIN_EMAIL || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
const esc = (s: string) => String(s).replace(/[<>&]/g, (c) => (({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string));
const ukDate = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });

// Built on the shared MOBILE-FIRST shell (Gary: raw emails were oversized on a phone). Inline sizes are the
// mobile sizes; the shell scales them up on desktop and survives Gmail stripping the <style> block.
export function renderDoneEmailHtml(heading: string, body: string, ctaHref: string, ctaLabel: string): string {
  const inner = `
    <p class="h2" style="font-size:16px;line-height:1.35;font-weight:800;color:#ffffff;margin:0 0 8px;">${heading}</p>
    <p class="p" style="font-size:14px;line-height:1.7;color:#9aa0a8;margin:0 0 4px;">${body}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 6px;">
      <tr><td align="center" bgcolor="#f96203" style="border-radius:999px;">
        <a href="${ctaHref}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:800;color:#0b0d12;text-decoration:none;border-radius:999px;">${ctaLabel}</a>
      </td></tr>
    </table>
    <p class="small" style="font-size:12px;line-height:1.6;color:#6f757e;margin:16px 0 0;text-align:center;">You are getting this because a long render finished while you were away.</p>`;
  return emailShell({ strapline: "Producer", dateLabel: ukDate(), body: inner, cadence: "STUDIO PRODUCER", role: "AI Studio Lead", department: "Studio on GAS", wordmark: "PRODUCER" });
}

// kind "final-render" = the ~40-min full-quality render finished (ready to stitch).
// kind "cut-ready"    = the finished cut is stitched + downloadable.
export async function notifyRenderDone(opts: { name: string; kind: "final-render" | "cut-ready"; url?: string | null; to?: string | null }): Promise<{ sent: boolean }> {
  if (!emailConfigured()) return { sent: false };
  const name = esc(opts.name || "your influencer");
  const isCut = opts.kind === "cut-ready";
  const subject = isCut ? `✅ Your cut for ${name} is ready` : `🎬 ${name}: full-quality render done - ready to stitch`;
  const heading = isCut ? "Your final cut is ready 🎉" : "Full-quality render complete 🎬";
  const body = isCut
    ? `The final cut for <b>${name}</b> has finished rendering and stitching. It's ready to review and download.`
    : `Every scene for <b>${name}</b> has re-rendered at full delivery quality. Head back to the Stitch step to assemble the final cut - it only takes a couple of minutes now.`;
  const href = isCut && opts.url ? opts.url : `${APP_URL}/studio`;
  const label = isCut ? "Watch the final cut →" : "Open the Studio to stitch →";
  // Send to the USER who built it (the logged-in producer), and always BCC Gary for team oversight. Falls back
  // to the super-admin if we somehow don't know who triggered it. If the builder IS Gary, skip the redundant BCC.
  const to = (opts.to && opts.to.includes("@")) ? opts.to.trim() : recipient();
  const bcc = to.toLowerCase() === gary().toLowerCase() ? undefined : gary();
  try {
    await sendEmail({ to, bcc, subject, html: renderDoneEmailHtml(heading, body, href, label) });
    return { sent: true };
  } catch {
    return { sent: false }; // never let a mail failure break the render
  }
}
