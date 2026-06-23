import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listConnections, saveConnection, isProvider, verifyVendorKey } from "@/lib/connections";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ connections: await listConnections() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { provider, secret } = await req.json().catch(() => ({}));
  if (!isProvider(provider) || typeof secret !== "string" || !secret.trim()) {
    return NextResponse.json({ error: "Invalid provider or secret" }, { status: 400 });
  }
  // Live-verify against the vendor, but ADVISORY ONLY — always save the key (never block on our own
  // verify call being strict/flaky); surface verified true/false + a warning so the UI can show it.
  const check = await verifyVendorKey(provider, secret.trim());
  await saveConnection(provider, secret.trim());
  return NextResponse.json({ ok: true, verified: check.ok, ...(check.ok ? {} : { warning: check.detail }) });
}
