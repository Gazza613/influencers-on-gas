import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { runIntel, loadIntelBrief, type Intel } from "@/lib/intel";
import { retrieve } from "@/lib/rag";
import { writeCeoNewsletter } from "@/lib/ceo-newsletter";

// THE "LINKEDIN ARTICLE" BUTTON (Gary, admin-only). Type a topic, and the pod drafts the client executive's
// LinkedIn thought-leadership piece grounded in the client's OWN verified material, with fresh external market
// context folded in where the topic has public coverage.
//
// GROUNDING, DONE RIGHT (Gary: "seems broken" when a topic about the client's own methodology returned nothing).
// A thought-leadership piece is usually about the client's OWN point of view, so the PRIMARY ground is the
// client's own brain - their verified doctrine and crawled material - which is the strongest grounding there is.
// External market research is a BONUS that adds freshness and third-party citations when the topic has coverage;
// it is never required. We refuse only when there is genuinely nothing to stand on: no brain material AND no
// verifiable external source. We never fabricate a fact to fit the prompt.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; topic?: string };
  const clientId = String(b.clientId || "").trim();
  const topic = String(b.topic || "").trim().slice(0, 600);
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });
  if (!topic) return NextResponse.json({ error: "Type the topic you want the article to be about." }, { status: 400 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }); // YYYY-MM-DD, SAST
  const userEmail = session.user?.email ?? null;

  try {
    // 1. THE CLIENT'S OWN MATERIAL on the topic - the primary ground. Hybrid retrieval over their brain.
    const passages = await retrieve(clientId, topic, 12, { userEmail }).catch(() => []);

    // 2. EXTERNAL MARKET CONTEXT, best-effort. Adds freshness + citable third-party sources when the topic has
    //    public coverage; a topic about the client's own methodology simply returns none, and that is fine.
    let external: Intel[] = [];
    try {
      external = (await runIntel(clientId, "strategist", today, userEmail, topic, 90))
        .filter((f) => f.verification === "verified" || f.verification === "partial");
    } catch { external = []; }

    // 3. GROUND CHECK: refuse only when there is genuinely nothing to build on.
    if (!passages.length && !external.length) {
      return NextResponse.json({
        error: "This brain holds nothing on that topic and no public source could be verified, so there is nothing to ground a piece on. Feed the brain material on it first, or try a topic with some public coverage.",
      }, { status: 400 });
    }

    // 4. Assemble the material. Brain passages are the client's own ground truth; external findings add context.
    const brainBlock = passages.map((p, i) => `[${i + 1}] ${p.content}`).join("\n\n").slice(0, 8000);
    const extBlock = external.map((f) => `- ${f.headline}: ${[f.why_it_matters, f.detail].filter(Boolean).join(" ")}`).join("\n").slice(0, 3000);
    const sourceMap = new Map<string, { name: string; url: string }>();
    for (const p of passages) {
      const url = String((p.metadata as Record<string, unknown>)?.url || "");
      if (url) sourceMap.set(url, { name: String((p.metadata as Record<string, unknown>)?.title || "Brain material"), url });
    }
    for (const f of external) for (const s of (Array.isArray(f.sources) ? f.sources : [])) if (s?.url) sourceMap.set(s.url, { name: s.name || "source", url: s.url });
    const sources = [...sourceMap.values()].slice(0, 12);

    const detail =
      `THE CLIENT'S OWN MATERIAL ON THIS TOPIC (ground truth - use it, never contradict it):\n` +
      `${brainBlock || "(the brain holds little specific material on this - lean on the doctrine below and make the case at the level of principle, never inventing a figure or fact)"}` +
      (extBlock ? `\n\nEXTERNAL MARKET CONTEXT (verified public sources):\n${extBlock}` : "");

    // 5. DRAFT via the shared CEO/MD writer - it already grounds in this brain's voice + full doctrine.
    const result = await writeCeoNewsletter(clientId, {
      headline: topic,
      why_it_matters: "A LinkedIn thought-leadership piece the executive can post, making the client's case on this topic.",
      detail,
      sources,
      published_at: null,
    }, {
      userEmail,
      notes: `Write a LinkedIn thought-leadership piece on: ${topic}. Make the client's case with authority and a clear point of view. Ground every claim in the material and the doctrine; where the material is thin on a point, make it at the level of principle rather than inventing a figure, date or named fact.`,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    // 6. PERSIST a finding row so the existing send flow can read it, and keep the draft on it for reloads.
    const grounded = passages.length > 0 || external.length > 0;
    const ins = (await db().query(
      `insert into studio_intel (client_id, role, headline, why_it_matters, detail, sources, confidence, material, status, verification, newsletter, newsletter_art)
       values ($1,'strategist',$2,$3,$4,$5::jsonb,'medium',true,'new',$6,$7,$8) returning id`,
      [clientId, topic.slice(0, 300), "LinkedIn thought-leadership piece drafted on a typed topic.", detail.slice(0, 6000), JSON.stringify(sources), grounded ? "verified" : "unverified", result.post, result.art?.subject || null],
    )) as { id: string }[];
    const id = ins[0]?.id;

    const brief = await loadIntelBrief(clientId).catch(() => null);
    return NextResponse.json({
      ok: true,
      id,
      post: result.post,
      art: result.art,
      sourceHeadline: topic,
      usedBrain: passages.length,
      usedExternal: external.length,
      sources,
      publisher: brief?.publisher ?? "ceo",
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 400 });
  }
}
