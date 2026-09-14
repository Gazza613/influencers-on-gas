import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runIntel, setIntelStatus } from "@/lib/intel";

// BUILD THE BASELINE (Gary). Before "what's new" can mean anything, the brain needs a COMPREHENSIVE picture of the
// client. This runs a wide, ~24-month open-web sweep in the RESEARCHER role (structural research, deliberately NOT
// gated on the 2-week recency window) and files every material, well-sourced fact. The confirmed ones are
// AUTO-ACCEPTED straight into the brain's standing research; the rest come back for the team to accept or reject.
// Stored as role='researcher', so every future "Find what's new" run reasons against this baseline, not a vacuum.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";

export async function POST(req: Request) {
  const session = await auth();
  // Shaping the brain's baseline is a curation action, so it is admin-only (members can still Ask / Find).
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string };
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  // The focus makes this a BASELINE build, not a news check: breadth over recency, older items explicitly wanted.
  // It runs in answer mode (a focus is set), so the hard freshness gate is off and 24-month-old facts are kept.
  const focus =
    "Build a COMPREHENSIVE baseline briefing on this client, covering roughly the last 24 months. This is a " +
    "foundational knowledge build, NOT a news check, so older material is wanted, not filtered out. Cover " +
    "everything material and well sourced: major investments, deals and acquisitions; product and service " +
    "launches; leadership and board changes; partnerships; regulatory, licensing and compliance events; funding " +
    "and financial milestones; market position, share and notable competitor moves. File every distinct, " +
    "well-sourced, material fact as its own finding with its real source. Be thorough and wide-ranging.";

  try {
    const findings = await runIntel(clientId, "researcher", today, session.user?.email ?? null, focus, 120);
    // AUTO-ACCEPT the confirmed facts (verified or partially verified) into the brain's standing research; leave the
    // could-not-confirm (bot-blocked 'unverified') ones for manual accept/reject, exactly as Gary asked.
    const auto = findings.filter((f) => f.verification === "verified" || f.verification === "partial");
    const review = findings.filter((f) => !(f.verification === "verified" || f.verification === "partial"));
    for (const f of auto) if (f.id) await setIntelStatus(clientId, f.id, "accepted").catch(() => {});

    return NextResponse.json({
      ok: true,
      autoAccepted: auto.length,
      total: findings.length,
      review: review.map((f) => ({
        id: f.id,
        headline: f.headline,
        why_it_matters: f.why_it_matters,
        detail: f.detail,
        impact_risk: f.impact_risk,
        campaign_response: f.campaign_response,
        material: f.material,
        verification: f.verification ?? null,
        sources: Array.isArray(f.sources) ? f.sources : [],
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
