import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBalance } from "@/lib/vendors/higgsfield";
import { recordBalanceSnapshot } from "@/lib/usage";

// Take a fresh balance snapshot (ledger vs live balance) on demand — keeps the daily
// audit current even if the cron hasn't fired. Any signed-in user can trigger it.
export const maxDuration = 30;

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let remaining: number | null = null;
  try { remaining = (await getBalance()).remaining; } catch { /* store null only if unreadable */ }
  await recordBalanceSnapshot(remaining, "viewed Cost Control");
  return NextResponse.json({ ok: true, remaining });
}
