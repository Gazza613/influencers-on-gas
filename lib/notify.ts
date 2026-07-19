import { sendEmail, emailConfigured } from "@/lib/email";

// "Notify me when it's ready" (option B): the final render + stitch are long jobs that run durably on our
// servers, so the producer shouldn't have to sit and watch. When a long job finishes we email them a link so
// they can walk away and get pulled back only when there's something to do. Fully guarded: a no-op unless email
// is configured, and every send is wrapped so a mail hiccup can NEVER fail the render job.
import { APP_URL } from "./app-url";
// Gary is always BCC'd on every render notification (team oversight), whoever built it.
const gary = () => process.env.SUPER_ADMIN_EMAIL || process.env.ALERT_EMAIL_TO || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
const recipient = () => process.env.ALERT_EMAIL_TO || process.env.SUPER_ADMIN_EMAIL || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";
const esc = (s: string) => String(s).replace(/[<>&]/g, (c) => (({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string));

function shell(heading: string, body: string, ctaHref: string, ctaLabel: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0a0b0f;padding:28px;border-radius:16px;color:#eef1f6;max-width:520px">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c07cff;font-weight:700">Influencers on GAS · Producer</div>
    <div style="font-size:22px;font-weight:800;margin:8px 0 10px">${heading}</div>
    <p style="color:#aab2c2;font-size:14px;line-height:1.6;margin:0 0 18px">${body}</p>
    <a href="${ctaHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:linear-gradient(90deg,#ec4899,#a855f7,#60a5fa);color:#fff;font-size:13px;font-weight:700;text-decoration:none">${ctaLabel}</a>
    <p style="color:#6f7788;font-size:11px;margin:18px 0 0">You're getting this because a long render finished while you were away.</p>
  </div>`;
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
    await sendEmail({ to, bcc, subject, html: shell(heading, body, href, label) });
    return { sent: true };
  } catch {
    return { sent: false }; // never let a mail failure break the render
  }
}
