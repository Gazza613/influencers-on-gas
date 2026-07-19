import { NextResponse } from "next/server";
import { startPasswordReset, completePasswordReset, isGasEmail } from "@/lib/users";
import { resetEmail } from "@/lib/invite-email";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/app-url";
import { checkLoginAllowed, recordAttempt, clientIp } from "@/lib/login-guard";

// PASSWORD RESET. Public by necessity - the person asking is by definition locked out - which is exactly why
// it needs the same care as the login form.
export const dynamic = "force-dynamic";

// POST { email }  -> request a reset link
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string };
  const email = String(b.email ?? "").toLowerCase().trim();

  // ALWAYS THE SAME ANSWER, whatever happens below. Confirming whether an address has an account turns this
  // form into a staff directory, and those addresses are the first half of a credential attack. The person
  // who genuinely owns the mailbox learns everything they need from the email itself.
  const same = NextResponse.json({ ok: true, message: "If that address has an account, a reset link is on its way." });

  if (!email || !isGasEmail(email)) return same;

  // Throttled on the same counters as sign-in, so this cannot be used as an unmetered way to probe accounts
  // or to flood someone's inbox.
  const ip = clientIp(req);
  const guard = await checkLoginAllowed(email, ip);
  if (!guard.allowed) return same;

  try {
    const started = await startPasswordReset(email);
    // A missing, suspended or never-activated account lands here and still gets the identical response.
    if (!started) { await recordAttempt(email, ip, false); return same; }

    const link = `${APP_URL}/reset/${started.token}`;
    const { subject, html } = resetEmail({ name: started.name, link });
    await sendEmail({ to: email, subject, html, fromName: "Studio on GAS" });
  } catch {
    /* never leak an internal failure through a different-looking response */
  }
  return same;
}

// PUT { token, password } -> set the new password
export async function PUT(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  const token = String(b.token ?? "").trim();
  const password = String(b.password ?? "");

  if (!token) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  if (password.length < 10) {
    return NextResponse.json({ error: "Use at least 10 characters." }, { status: 400 });
  }

  const ok = await completePasswordReset(token, password);
  if (!ok) {
    return NextResponse.json({ error: "This link has expired or has already been used. Request a new one." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
