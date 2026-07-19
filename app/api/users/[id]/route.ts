import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUser, suspendUser, reactivateUser, listUsers } from "@/lib/users";

// Super-admin only, for both verbs. Both take effect on the person's NEXT REQUEST rather than whenever their
// token happens to expire, because the auth gate now re-checks account status against the database
// (lib/access-check).
export const dynamic = "force-dynamic";

// Guard shared by both handlers, including the rule that matters most here: you cannot lock yourself out.
async function gate(id: string) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized", status: 401 as const };
  if (session.user.role !== "super_admin") return { error: "Super admin only", status: 403 as const };

  // SELF-PROTECTION. Suspending or deleting your own account would now revoke the session you are holding on
  // the very next click, and there is no second super admin to undo it. The database would be perfectly fine
  // and the studio would be unreachable. This became a real risk the moment revocation started working.
  const target = (await listUsers().catch(() => [])).find((u) => u.id === id);
  if (target && target.email.toLowerCase() === String(session.user.email ?? "").toLowerCase()) {
    return { error: "You cannot suspend or remove your own account.", status: 400 as const };
  }
  return { ok: true as const };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "suspend") await suspendUser(id);
  else if (body.action === "reactivate") await reactivateUser(id);
  else return NextResponse.json({ error: "action must be suspend or reactivate" }, { status: 400 });

  return NextResponse.json({ ok: true, users: await listUsers() });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
