import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listUsers, inviteUser, isGasEmail } from "@/lib/users";
import { sendEmail, emailConfigured } from "@/lib/email";
import { inviteEmail } from "@/lib/invite-email";
import { APP_URL } from "@/lib/app-url";

export const maxDuration = 30;

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized", status: 401 as const };
  // Team management is the ONE thing a team admin can do that a member cannot. Platform configuration -
  // connected tools, brains, the landing layout - stays super-admin only and is unaffected by this.
  if (session.user.role !== "super_admin" && session.user.role !== "admin") {
    return { error: "Admins only", status: 403 as const };
  }
  return { session };
}

export async function GET() {
  const a = await requireSuperAdmin();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: Request) {
  const a = await requireSuperAdmin();
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const role = body.role === "admin" ? "admin" : "producer";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!isGasEmail(email)) return NextResponse.json({ error: "Access is for @gasmarketing.co.za only. For external access, email grow@gasmarketing.co.za." }, { status: 400 });

  const token = await inviteUser({ email, name, role });
  const link = `${APP_URL}/invite/${token}`;
  const { subject, html } = inviteEmail({ inviterName: a.session.user.name ?? "GAS", inviteeName: name, link });
  const result = await sendEmail({ to: email, subject, html, fromName: "Studio on GAS" });

  return NextResponse.json({ ok: true, emailed: result.sent, configured: emailConfigured(), link });
}
