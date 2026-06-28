import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";

// VIDEO SPIKE trigger + status. GET ?go=1 fires a fresh run (one b-roll + one a-roll on a locked
// influencer's existing frame); GET (no param) returns the current result. ?id= or ?name= to target;
// otherwise the most-recently-built locked influencer. Super-admin only.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function resolveId(id: string, name: string): Promise<string | null> {
  if (id) return id;
  const sql = db();
  if (name) {
    const r = (await sql`select id from influencers where name ilike ${"%" + name + "%"} order by created_at desc limit 1`) as { id: string }[];
    if (r[0]) return r[0].id;
  }
  const r = (await sql`select id from influencers where (persona->>'locked') = 'true' order by created_at desc limit 1`) as { id: string }[];
  return r[0]?.id ?? null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const url = new URL(req.url);
  const id = await resolveId(url.searchParams.get("id") || "", url.searchParams.get("name") || "");
  if (!id) return NextResponse.json({ error: "No locked influencer found. Lock one first, or pass ?name=Ayanda." }, { status: 404 });
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const spike = (persona.spike ?? null) as Record<string, unknown> | null;

  if (url.searchParams.get("go") === "1" && spike?.status !== "running") {
    await updateInfluencer(id, { persona: { ...persona, spike: { status: "running", started: true } } });
    try { await inngest.send({ name: "producer/spike", data: { influencerId: id } }); }
    catch { return NextResponse.json({ error: "Engine not connected" }, { status: 503 }); }
    return NextResponse.json({ influencer: inf.name, status: "running", note: "Spike started. Refresh this URL (without ?go=1) in a few minutes to see broll_url + aroll_url." });
  }
  return NextResponse.json({ influencer: inf.name, voice_set: !!persona.voice_id, spike: spike ?? "not run yet - hit this URL with ?go=1 to start" });
}
