import { NextResponse } from "next/server";
import { acceptInvite, getInvite, isGasEmail } from "@/lib/users";

// Public (logged-out): an invited member sets their password from the emailed link.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!token) return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });

  const inv = await getInvite(token);
  if (!inv) return NextResponse.json({ error: "This invite link is invalid or has expired. Ask Gary to re-send it." }, { status: 400 });
  if (!isGasEmail(inv.email)) return NextResponse.json({ error: "Access is gated to GAS Marketing (@gasmarketing.co.za). For external access, email grow@gasmarketing.co.za." }, { status: 403 });

  const ok = await acceptInvite(token, password);
  if (!ok) return NextResponse.json({ error: "Could not set your password. The link may have expired." }, { status: 400 });
  return NextResponse.json({ ok: true, email: inv.email });
}
