import { emailShell } from "./email-shell";

// TRANSACTIONAL EMAILS FOR TEAM ACCESS: the invite and the password reset.
//
// Both are built on the shared shell rather than their own inline HTML. The invite used to be bespoke markup,
// which meant it missed the mobile-first work done for the briefing emails: it wrote desktop sizes inline, and
// Gmail's mobile app frequently strips <style> blocks, so a phone got desktop type. An invite is usually
// opened on a phone and is often the first thing a new teammate ever sees from us.
//
// It also said "Influencers on GAS" long after the platform became Studio on GAS.

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const ukDate = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });

// A table cell with a background colour, not a styled <a>. The bulletproof-button pattern: Outlook and a few
// webmail clients drop padding and background from anchors, and a CTA that renders as bare blue text makes
// the whole email look broken at exactly the moment we are asking someone to trust us with a password.
function button(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 6px;">
    <tr><td align="center" bgcolor="#f96203" style="border-radius:999px;">
      <a href="${href}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:800;color:#0b0d12;text-decoration:none;border-radius:999px;">${label}</a>
    </td></tr>
  </table>`;
}

// The same link in plain text underneath. Some clients strip buttons, some people forward the mail to a
// laptop, and a link nobody can copy out is a support request.
function fallback(href: string): string {
  return `<p class="small" style="font-size:12px;line-height:1.6;color:#6f757e;margin:14px 0 0;text-align:center;word-break:break-all;">
    Or paste this into your browser:<br /><span style="color:#8a8f98;">${href}</span>
  </p>`;
}

export function inviteEmail(opts: { inviterName: string; inviteeName?: string; link: string }): { subject: string; html: string } {
  const hi = opts.inviteeName ? `Hi ${esc(opts.inviteeName)},` : "Hi,";
  const body = `
    <p class="p" style="font-size:14px;line-height:1.65;color:#e6e8eb;margin:0 0 12px;">${hi}</p>
    <p class="p" style="font-size:14px;line-height:1.7;color:#9aa0a8;margin:0 0 4px;">
      ${esc(opts.inviterName)} has invited you to <b style="color:#ffffff;">Studio on GAS</b>, the platform GAS Marketing
      uses to build campaigns, creative and market intelligence. Set a password and you are in.
    </p>
    ${button(opts.link, "Set your password →")}
    ${fallback(opts.link)}
    <p class="small" style="font-size:12px;line-height:1.6;color:#6f757e;margin:18px 0 0;text-align:center;">
      This invitation expires in 7 days. If you were not expecting it, you can ignore this email.
    </p>`;
  return {
    subject: "You have been invited to Studio on GAS",
    html: emailShell({ strapline: "Team access", dateLabel: ukDate(), body, cadence: "STUDIO ACCESS", role: "AI Studio Lead", department: "GAS Marketing" }),
  };
}

export function resetEmail(opts: { name?: string | null; link: string }): { subject: string; html: string } {
  const hi = opts.name ? `Hi ${esc(opts.name)},` : "Hi,";
  const body = `
    <p class="p" style="font-size:14px;line-height:1.65;color:#e6e8eb;margin:0 0 12px;">${hi}</p>
    <p class="p" style="font-size:14px;line-height:1.7;color:#9aa0a8;margin:0 0 4px;">
      Someone asked to reset the password on your <b style="color:#ffffff;">Studio on GAS</b> account.
      Choose a new one below.
    </p>
    ${button(opts.link, "Choose a new password →")}
    ${fallback(opts.link)}
    <p class="small" style="font-size:12px;line-height:1.6;color:#6f757e;margin:18px 0 0;text-align:center;">
      This link expires in 1 hour and can be used once. <b style="color:#9aa0a8;">If you did not ask for this,
      ignore this email</b> - your password has not changed and nobody has gained access to your account.
    </p>`;
  return {
    subject: "Reset your Studio on GAS password",
    html: emailShell({ strapline: "Password reset", dateLabel: ukDate(), body, cadence: "STUDIO ACCESS", role: "AI Studio Lead", department: "GAS Marketing" }),
  };
}
