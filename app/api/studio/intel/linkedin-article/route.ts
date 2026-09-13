import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadIntelBrief } from "@/lib/intel";
import { draftLinkedinArticle } from "@/lib/linkedin-article";

// THE "LINKEDIN ARTICLE" BUTTON (Gary, admin-only). Type a topic; the pod drafts the client executive's LinkedIn
// thought-leadership piece grounded in the client's OWN verified material, with fresh external market context
// folded in where the topic has public coverage. The grounded draft logic is shared with the automation
// (lib/linkedin-article.ts), so a hand-run piece is identical to a scheduled one.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; topic?: string };
  const clientId = String(b.clientId || "").trim();
  const topic = String(b.topic || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });
  if (!topic) return NextResponse.json({ error: "Type the topic you want the article to be about." }, { status: 400 });

  const r = await draftLinkedinArticle(clientId, topic, { userEmail: session.user?.email ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  const brief = await loadIntelBrief(clientId).catch(() => null);
  return NextResponse.json({
    ok: true, id: r.id, post: r.post, art: r.art, sourceHeadline: r.sourceHeadline,
    usedBrain: r.usedBrain, usedExternal: r.usedExternal, sources: r.sources,
    publisher: brief?.publisher ?? "ceo",
  });
}
