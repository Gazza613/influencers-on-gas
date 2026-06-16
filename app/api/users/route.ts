import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listUsers, inviteUser } from "@/lib/users";
import { sendEmail, emailConfigured } from "@/lib/email";
import { inviteEmail } from "@/lib/invite-email";

export const maxDuration = 30;

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized", status: 401 as const };
  if (session.user.role !== "super_admin") return { error: "Super admin only", status: 403 as const };
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

  const token = await inviteUser({ email, name, role });
  const link = `https://influencers.gasmarketing.co.za/invite/${token}`;
  const { subject, html } = inviteEmail({ inviterName: a.session.user.name ?? "GAS", inviteeName: name, link });
  const result = await sendEmail({ to: email, subject, html });

  return NextResponse.json({ ok: true, emailed: result.sent, configured: emailConfigured(), link });
}
