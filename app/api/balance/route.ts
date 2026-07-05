import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBalance } from "@/lib/vendors/higgsfield";
import { creditZarCents, MONTHLY_CREDITS } from "@/lib/usage";
import { getZarPerUsd } from "@/lib/fx";

// Live Higgsfield credit balance (ground truth). Slower (MCP call), so it's separate.
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Value each credit at the LIVE USD/ZAR rate, so the remaining balance's Rand worth tracks the market.
    const [b, zar] = await Promise.all([getBalance(), getZarPerUsd()]);
    return NextResponse.json({ remaining: b.remaining, monthly: MONTHLY_CREDITS, creditZarCents: creditZarCents(zar), zarPerUsd: zar });
  } catch {
    return NextResponse.json({ remaining: null });
  }
}
