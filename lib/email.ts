import nodemailer from "nodemailer";

// Sends from the GAS Gmail (grow@gasmarketing.co.za) via an app password.
// Set GMAIL_USER + GMAIL_APP_PASSWORD in Vercel; until then sending is skipped.
export function emailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

// `fromName` overrides the inbox display name for a single email. The Strategist briefing goes to EXCO and to
// MoMo's internal team, and landing there as "Influencers on GAS" mislabels it (Gary). The address is unchanged.
export async function sendEmail(opts: { to: string; subject: string; html: string; bcc?: string; fromName?: string }) {
  if (!emailConfigured()) return { sent: false, reason: "GMAIL_USER / GMAIL_APP_PASSWORD not set" };
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  const from = `${opts.fromName || "Influencers on GAS"} <${process.env.GMAIL_USER}>`;
  await transport.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, ...(opts.bcc ? { bcc: opts.bcc } : {}) });
  return { sent: true };
}
