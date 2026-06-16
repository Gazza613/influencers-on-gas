import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReport, getAuditTrail, type CostFilters } from "@/lib/usage";

// Filtered Cost Control report (DB only — fast). Live balance comes from /api/balance.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const u = new URL(req.url);
  const filters: CostFilters = {
    from: u.searchParams.get("from"),
    to: u.searchParams.get("to"),
    influencerId: u.searchParams.get("influencerId"),
    provider: u.searchParams.get("provider"),
    userEmail: u.searchParams.get("userEmail"),
  };
  const [report, audit] = await Promise.all([getReport(filters), getAuditTrail(30)]);
  return NextResponse.json({ report, audit });
}
