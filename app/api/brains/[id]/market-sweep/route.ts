import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { runIntel, setIntelStatus } from "@/lib/intel";
import { addFindingToBrain } from "@/lib/market-brain";
import { retrieve } from "@/lib/rag";

// THE MARKET SWEEP, ON THE BRAIN (Gary). Part of feeding the brain, not a dashboard afterthought: a wide ~24-month
// open-web sweep of the client and its market. The CONFIRMED findings are embedded straight into the brain (so they
// appear in Knowledge Sources and lift the strength score); the rest come back to accept or reject. Because a
// finding is only ever added to THIS brain (client_id scoped) and the sweep runs in answer mode (older material
// kept, not gated to two weeks), the brain gains real, durable market context.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";

// The market research instructions. The brain's OWN description of what the client does is prepended at run time
// (retrieved from its passages), so the model researches the RIGHT market and category, not just news about the
// client's name. Findings are framed as the client's MARKET CONTEXT, which the scope lock explicitly permits.
const MARKET_INSTRUCTIONS =
  "Now build a MARKET BASELINE for this client over roughly the last 24 months. This is about their MARKET, not " +
  "just news about them. Research and file each as its own well-sourced finding, framed as MARKET CONTEXT for this " +
  "client (their market and competitive set), which your scope allows:\n" +
  "(1) THE MARKET AND CATEGORY (the priority, and it always exists): the state and direction of the industry this " +
  "client operates in, the competitive set and what key rivals are doing by name, category and demand trends, " +
  "shifts in customer behaviour, pricing and business-model changes, and relevant regulation. A fact about a " +
  "competitor or the wider category IS wanted here, filed as this client's market context.\n" +
  "(2) THE CLIENT ITSELF, where public coverage exists: investments, deals, launches, leadership and board " +
  "changes, partnerships, funding, awards and milestones.\n" +
  "Search the CATEGORY and the COMPETITORS by name, not only the client's own name. This is a foundational " +
  "knowledge build, not a news check, so older material is welcome. Only file what is genuinely sourced, never " +
  "invent.";

// What the brain already knows about the client - the query that pulls a good description out of its passages.
const CONTEXT_QUERY = "What does this organisation do, what does it sell or offer, who are its customers, what industry, category and market does it operate in, and who are its main competitors?";

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
    // SEED WITH THE BRAIN'S OWN KNOWLEDGE (Gary: "we have 500 passages, you know who they are"). Pull the client's
    // own description of what they do from their passages, so the sweep researches the RIGHT market and category
    // rather than just news about the client's name. Without this, a rich brain barely informed the research.
    const ctx = await retrieve(clientId, CONTEXT_QUERY, 14, { userEmail: session.user?.email ?? null }).catch(() => []);
    const brainCtx = ctx.map((h) => h.content).join("\n\n").slice(0, 6000);
    const focus = (brainCtx
      ? `WHAT THIS CLIENT DOES, from their own knowledge base (use this to identify their market, category and competitors):\n${brainCtx}\n\n`
      : "") + MARKET_INSTRUCTIONS;
    const findings = await runIntel(clientId, "researcher", today, session.user?.email ?? null, focus, 120);
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
