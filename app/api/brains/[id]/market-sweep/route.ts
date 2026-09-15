import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { runIntel, setIntelStatus } from "@/lib/intel";
import { addFindingToBrain } from "@/lib/market-brain";

// THE MARKET SWEEP, ON THE BRAIN (Gary). Part of feeding the brain, not a dashboard afterthought: a wide ~24-month
// open-web sweep of the client and its market. The CONFIRMED findings are embedded straight into the brain (so they
// appear in Knowledge Sources and lift the strength score); the rest come back to accept or reject. Because a
// finding is only ever added to THIS brain (client_id scoped) and the sweep runs in answer mode (older material
// kept, not gated to two weeks), the brain gains real, durable market context.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";

const FOCUS =
  "Build a COMPREHENSIVE market baseline on this client, covering roughly the last 24 months. This is a " +
  "foundational knowledge build, NOT a news check, so older material is wanted, not filtered out. Cover " +
  "everything material and well sourced: major investments, deals and acquisitions; product and service " +
  "launches; leadership and board changes; partnerships; regulatory, licensing and compliance events; funding " +
  "and financial milestones; market position, share and notable competitor moves. File every distinct, " +
  "well-sourced, material fact as its own finding with its real source. Be thorough and wide-ranging.";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id: clientId } = await params;
  const brain = await getBrain(clientId);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; intelId?: string };
  const action = String(b.action || "sweep").trim();

  // ADD one reviewed finding into the brain (embed + accept).
  if (action === "add") {
    const intelId = String(b.intelId || "").trim();
    if (!intelId) return NextResponse.json({ error: "Missing the finding." }, { status: 400 });
    const r = await addFindingToBrain(clientId, intelId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // REJECT one reviewed finding (bin it, so it leaves the queue and is never offered again).
  if (action === "reject") {
    const intelId = String(b.intelId || "").trim();
    if (!intelId) return NextResponse.json({ error: "Missing the finding." }, { status: 400 });
    await setIntelStatus(clientId, intelId, "binned").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // RUN the sweep. Auto-embed the confirmed (verified/partial) findings; return the rest to accept or reject.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  try {
    const findings = await runIntel(clientId, "researcher", today, session.user?.email ?? null, FOCUS, 120);
    const confirmed = findings.filter((f) => f.verification === "verified" || f.verification === "partial");
    const review = findings.filter((f) => !(f.verification === "verified" || f.verification === "partial"));
    let added = 0;
    for (const f of confirmed) if (f.id) { const r = await addFindingToBrain(clientId, f.id); if (r.ok) added++; }
    return NextResponse.json({
      ok: true,
      added,
      total: findings.length,
      review: review.map((f) => ({
        id: f.id,
        headline: f.headline,
        why_it_matters: f.why_it_matters,
        detail: f.detail,
        verification: f.verification ?? null,
        sources: Array.isArray(f.sources) ? f.sources : [],
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
