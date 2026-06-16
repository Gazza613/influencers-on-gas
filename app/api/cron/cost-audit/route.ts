import { NextResponse } from "next/server";
import { getBalance } from "@/lib/vendors/higgsfield";
import { recordBalanceSnapshot } from "@/lib/usage";
import { cronAuthed } from "@/lib/cron";

// Daily: snapshot the live Higgsfield balance vs our ledger so Cost Control can
// prove it stays accurate. Scheduled in vercel.json (05:00 UTC ≈ 07:00 SAST).
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthed(req)) return NextResponse.json({ error: "forbidden" }, { status: 401 });
  let remaining: number | null = null;
  try { remaining = (await getBalance()).remaining; } catch { /* balance unreadable — store null */ }
  await recordBalanceSnapshot(remaining, "daily auto-audit");
  return NextResponse.json({ ok: true, remaining });
}
