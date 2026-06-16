import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Lightweight session info for client chrome (nav role gating, email).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { email: session.user.email ?? "", role: session.user.role ?? "producer" } });
}
