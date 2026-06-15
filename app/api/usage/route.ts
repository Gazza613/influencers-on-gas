import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSummary } from "@/lib/usage";

// Spend summary from the usage ledger (fast, DB only).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ summary: await getSummary() });
}
