import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// THE LINKEDIN ARTICLE AUTOMATION CONTROL, per brain (Gary). Topic-DRIVEN, the opposite of the market-driven
// digest: on a cadence the pod drafts the exec's LinkedIn piece from a TOPIC QUEUE the team controls, and emails
// the team a DRAFT to review (never auto-sends). This route is the switch + the queue; the cron does the drafting.
//
// It also SUGGESTS topics from what the market is currently discussing (the brain's recent findings), so the team
// can fill the queue from real market interest rather than a blank box - "either our own topic or an option for
// what the market is talking about", the choice Gary asked for.
export const dynamic = "force-dynamic";

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";
const normLinkedin = (v: unknown): "off" | "weekly" | "monthly" => {
  const s = String(v || "").trim().toLowerCase();
  return s === "weekly" || s === "monthly" ? s : "off";
};
const cleanTopics = (input: unknown): string[] => {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const v = String(t || "").trim().slice(0, 300);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 30) break;
  }
  return out;
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });

  const rows = (await db().query(
    `select linkedin_schedule, linkedin_topics, newsletter_publisher, ceo_name, md_name from intel_briefs where client_id = $1`,
    [clientId],
  )) as { linkedin_schedule: string | null; linkedin_topics: unknown; newsletter_publisher: string | null; ceo_name: string | null; md_name: string | null }[];
  const r = rows[0];
  if (!r) return NextResponse.json({ briefed: false, schedule: "off", topics: [], publisher: "ceo", ceoName: "", mdName: "", suggestions: [] });

  // MARKET-SUGGESTED TOPICS: what this brain's own recent research surfaced, deduped, freshest first. Real market
  // interest the team can turn into a piece with one tap, alongside their own typed topics.
  const sug = (await db().query(
    `select distinct on (lower(headline)) headline from studio_intel
      where client_id = $1 and found_at > now() - interval '60 days'
      order by lower(headline), found_at desc`,
    [clientId],
  ).catch(() => [])) as { headline: string }[];
  const suggestions = sug.map((x) => String(x.headline || "").trim()).filter(Boolean).slice(0, 10);

  return NextResponse.json({
    briefed: true,
    schedule: normLinkedin(r.linkedin_schedule),
    topics: Array.isArray(r.linkedin_topics) ? (r.linkedin_topics as unknown[]).map((s) => String(s).trim()).filter(Boolean) : [],
    publisher: r.newsletter_publisher === "md" ? "md" : "ceo",
    ceoName: r.ceo_name || "", mdName: r.md_name || "",
    suggestions,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  // ADMINS ONLY (Gary): scheduling a draft that goes out under a client exec's name is admin-only.
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; schedule?: string; topics?: unknown; publisher?: string };
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });
  const schedule = normLinkedin(b.schedule);
  const topics = cleanTopics(b.topics);
  if (schedule !== "off" && !topics.length) {
    return NextResponse.json({ error: "Add at least one topic before switching the automation on, or the scheduled run has nothing to write about." }, { status: 400 });
  }
  // Publisher is a brain-level setting shared with the CEO-article flow; only overwrite it when provided.
  const pub = b.publisher === undefined ? null : (b.publisher === "md" ? "md" : "ceo");
  const rows = (await db().query(
    `update intel_briefs set linkedin_schedule = $1, linkedin_topics = $2::jsonb,
       newsletter_publisher = coalesce($4, newsletter_publisher), updated_at = now()
     where client_id = $3
     returning linkedin_schedule`,
    [schedule, JSON.stringify(topics), clientId, pub],
  )) as { linkedin_schedule: string }[];
  if (!rows[0]) return NextResponse.json({ error: "This brain has no brief yet, so there is nothing to schedule for it." }, { status: 404 });
  return NextResponse.json({ ok: true, schedule: rows[0].linkedin_schedule, topics });
}
