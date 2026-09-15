import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runIntel } from "@/lib/intel";
import { humanApiError } from "@/lib/errors";

// ASK THE MARKET A QUESTION (Gary): the dashboard free-text box. Runs the Strategist desk on demand for one brain,
// seeded with the team's question, and returns the sourced findings + the internal read (what it could do, and
// the DEFENSIVE/PROACTIVE move). Same engine as the daily email, just triggered by a question instead of a
// schedule - so it never leaves the brain's scope lock and never invents a source. It does NOT email; the
// findings also land in the /strategist review queue like any other, so nothing is lost.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; question?: string; mode?: string };
  const clientId = String(b.clientId || "").trim();
  const question = String(b.question || "").trim().slice(0, 600);
  // TWO RECENCY MODES (Gary): a specific "ask" question looks back up to ~90 days; a proactive "discover" sweep for
  // new relevant topics (no question needed) starts at ~14 days, so it surfaces what is genuinely NEW.
  const mode = b.mode === "discover" ? "discover" : "question";
  const baseWindow = mode === "discover" ? 14 : 90;
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });
  if (mode === "question" && !question) return NextResponse.json({ error: "Type a market question to ask." }, { status: 400 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }); // YYYY-MM-DD, SAST
  try {
    let windowDays = baseWindow;
    let findings = await runIntel(clientId, "strategist", today, session.user?.email ?? null, mode === "discover" ? null : question, windowDays);
    // AUTO-WIDEN ON EMPTY (Gary): a "Find what's new" 2-week sweep that comes back empty must NOT silently hide a
    // material story that is only a little older than 2 weeks (a big deal 3 weeks ago is exactly what caught us out
    // on DNI: the coverage was 21 days old, just past the 14-day gate). So when the tight sweep finds nothing, we
    // look back once more over ~6 weeks and flag that we widened, rather than leaving the user with a bare "nothing"
    // when there was findable news. Only widens on a genuinely empty first pass, so no duplicate findings are filed.
    let widened = 0;
    if (mode === "discover" && findings.length === 0) {
      widened = 45;
      windowDays = widened;
      findings = await runIntel(clientId, "strategist", today, session.user?.email ?? null, null, widened);
    }
    return NextResponse.json({
      ok: true,
      mode,
      windowDays,
      widened: widened || null,
      findings: findings.map((f) => ({
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
    return NextResponse.json({ error: humanApiError(e, "Couldn't run that.") }, { status: 400 });
  }
}
