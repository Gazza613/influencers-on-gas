import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBalance } from "@/lib/vendors/higgsfield";
import { CREDIT_ZAR_CENTS, MONTHLY_CREDITS } from "@/lib/usage";

// Live Higgsfield credit balance (ground truth). Slower (MCP call), so it's separate.
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const debug = new URL(req.url).searchParams.get("debug") === "1" && session.user.role === "super_admin";
  try {
    const b = await getBalance();
    return NextResponse.json({
      remaining: b.remaining, monthly: MONTHLY_CREDITS, creditZarCents: CREDIT_ZAR_CENTS,
      ...(debug ? { tried: b.tried, samples: b.samples } : {}),
    });
  } catch (e) {
    return NextResponse.json({ remaining: null, error: String((e as Error)?.message || e).slice(0, 200) });
  }
}
