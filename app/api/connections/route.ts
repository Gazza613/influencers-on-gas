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
  // Live-verify the key against the vendor before storing, so "connected" means verified-working.
  const check = await verifyVendorKey(provider, secret.trim());
  if (!check.ok) return NextResponse.json({ error: check.detail || "The key could not be verified." }, { status: 400 });
  await saveConnection(provider, secret.trim());
  return NextResponse.json({ ok: true, verified: true });
}
