import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBalance } from "@/lib/vendors/higgsfield";
import { CREDIT_ZAR_CENTS, MONTHLY_CREDITS } from "@/lib/usage";

// Live Higgsfield credit balance (ground truth). Slower (MCP call), so it's separate.
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await getBalance();
    return NextResponse.json({ remaining: b.remaining, monthly: MONTHLY_CREDITS, creditZarCents: CREDIT_ZAR_CENTS });
  } catch {
    return NextResponse.json({ remaining: null });
  }
}
