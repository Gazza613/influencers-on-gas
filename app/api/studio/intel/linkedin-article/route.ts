import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { runIntel, loadIntelBrief } from "@/lib/intel";
import { writeCeoNewsletter } from "@/lib/ceo-newsletter";

// THE "LINKEDIN ARTICLE" BUTTON (Gary, admin-only). Type a topic, and the pod runs the SAME grounded research the
// daily watch does - brain-scoped, ask-mode, the last three months - then drafts the CEO/MD's thought-leadership
// piece DIRECTLY from a source it actually verified. It reaches the same draft surface as a market finding, just
// seeded by a typed topic instead of a surfaced one.
//
// GROUNDING IS NON-NEGOTIABLE (Gary): the topic STEERS the research, it never becomes the article. If nothing
// verifiable comes back on the topic, we say so - we never fabricate a piece to fit the prompt.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

// Admin-only: this drafts a piece that will go out under a client executive's name from the agency mailbox.
const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; topic?: string; publisher?: string };
  const clientId = String(b.clientId || "").trim();
  const topic = String(b.topic || "").trim().slice(0, 600);
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });
  if (!topic) return NextResponse.json({ error: "Type the topic you want the article to be about." }, { status: 400 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }); // YYYY-MM-DD, SAST

  try {
    // 1. GROUNDED RESEARCH on the topic. Ask-mode, ~90 days (the article is a considered point of view, not a
    //    breaking-news watch), brain-scoped, and it persists its findings to studio_intel like any other run - so
    //    the finding we draft from has a real id the existing send flow already understands.
    const findings = await runIntel(clientId, "strategist", today, session.user?.email ?? null, topic, 90);

    // 2. Only a VERIFIED (or partially verified) source may seed a public piece under an executive's name. Prefer
    //    a material finding; fall back to any verified one. No verified finding => no article, and we say why.
    const grounded = findings.filter((f) => f.verification === "verified" || f.verification === "partial");
    const pick = grounded.find((f) => f.material) || grounded[0];
    if (!pick || !pick.id) {
      return NextResponse.json({
        error: "The research could not stand up a verified source on that topic in the last three months, so there is nothing solid to build a CEO article on. Try a sharper topic, or one with recent public coverage.",
      }, { status: 400 });
    }

    // 3. DRAFT the piece from the public-safe substance of that finding, steered by the typed topic.
    const result = await writeCeoNewsletter(clientId, {
      headline: pick.headline,
      why_it_matters: pick.why_it_matters,
      detail: pick.detail,
      sources: Array.isArray(pick.sources) ? pick.sources : [],
      published_at: pick.published_at ? String(pick.published_at) : null,
    }, { userEmail: session.user?.email ?? null, notes: `The team asked for a LinkedIn thought-leadership piece on: ${topic}` });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    // Persist the draft on the finding so a reload keeps it, exactly like the finding-driven draft path.
    await db().query(`update studio_intel set newsletter = $2, newsletter_art = $3 where id = $1 and client_id = $4`,
      [pick.id, result.post, result.art?.subject || null, clientId]).catch(() => {});

    const brief = await loadIntelBrief(clientId).catch(() => null);
    return NextResponse.json({
      ok: true,
      id: pick.id,
      post: result.post,
      art: result.art,
      sourceHeadline: pick.headline,
      verification: pick.verification ?? null,
      sources: Array.isArray(pick.sources) ? pick.sources : [],
      publisher: brief?.publisher ?? "ceo",
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
