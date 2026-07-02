import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteInfluencer, updateInfluencer, getInfluencer } from "@/lib/influencers";
import { isSafePublicUrl } from "@/lib/safe-url";
import { deleteBlobs } from "@/lib/blob";

// Walk any nested value and collect every http(s) URL string (hero/refs/shots/clips/scene_audio/final/...).
function collectUrls(v: unknown, out: string[]): void {
  if (!v) return;
  if (typeof v === "string") { if (/^https?:\/\//i.test(v)) out.push(v); return; }
  if (Array.isArray(v)) { for (const x of v) collectUrls(x, out); return; }
  if (typeof v === "object") { for (const x of Object.values(v as Record<string, unknown>)) collectUrls(x, out); }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const influencer = await getInfluencer(id);
  if (!influencer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ influencer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Merge a small persona patch (step hand-off only). Allow-listed so a client can't
  // overwrite gates like `locked` or identity fields (element_id / soul references).
  const ALLOWED_PATCH = new Set(["chosen_url", "selected_frames", "video_selects", "creatives", "aroll_ref_url", "broll_ref_url", "voice_model", "voice_speed"]);
  let persona: Record<string, unknown> | undefined;
  if (body.personaPatch && typeof body.personaPatch === "object") {
    const inf = await getInfluencer(id);
    if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = inf.persona as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(body.personaPatch)) {
      if (!ALLOWED_PATCH.has(k)) continue;
      // `creatives` is prune-only: rebuild the kept list from the STORED objects (keyed by
      // id (fallback url)), so a client can remove shots but never inject images OR mutate
      // other fields (resolution/scene/etc.) on a kept shot.
      if (k === "creatives") {
        const stored = (Array.isArray(existing?.creatives) ? existing.creatives : []) as { id?: string; url?: string | null }[];
        const keyOf = (c: { id?: string; url?: string | null }) => (typeof c?.id === "string" && c.id ? `id:${c.id}` : (typeof c?.url === "string" && c.url ? `url:${c.url}` : null));
        const byKey = new Map<string, { id?: string; url?: string | null }>();
        for (const c of stored) { const key = keyOf(c); if (key) byKey.set(key, c); }
        const next = Array.isArray(body.personaPatch[k]) ? body.personaPatch[k] : [];
        const seen = new Set<string>();
        patch[k] = next
          .map((c: { id?: string; url?: string | null }) => {
            const key = keyOf(c);
            return key ? byKey.get(key) : undefined;
          })
          .filter((c: { id?: string; url?: string | null } | undefined): c is { id?: string; url?: string | null } => {
            if (!c) return false;
            const key = keyOf(c);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
      } else if (k === "aroll_ref_url" || k === "broll_ref_url") {
        // Guide reference = a URL of one of the influencer's OWN creatives (or "" to clear). The engine
        // fetches it, so SSRF-guard: accept only an empty string or a safe public URL.
        const v = body.personaPatch[k];
        if (v === "" || (typeof v === "string" && isSafePublicUrl(v))) patch[k] = v;
      } else if (k === "voice_speed") {
        const n = Number(body.personaPatch[k]); // ElevenLabs speed range
        if (Number.isFinite(n)) patch[k] = Math.max(0.7, Math.min(1.2, n));
      } else {
        patch[k] = body.personaPatch[k];
      }
    }
    persona = { ...existing, ...patch };
  }

  await updateInfluencer(id, {
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : undefined,
    voice_id: typeof body.voice_id === "string" ? body.voice_id : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    ...(persona ? { persona } : {}),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const { id } = await params;
  // NUKE EVERYWHERE: purge every blob this influencer owns (references, keyframes, clips, voice, final cut)
  // BEFORE dropping the row - best-effort, never blocks the delete. Then remove the DB record, which takes it
  // out of the studio, cast list, landing, start and showcase (all its production data lives in persona).
  const inf = await getInfluencer(id).catch(() => null);
  if (inf) {
    const urls: string[] = [];
    collectUrls(inf.persona, urls);
    collectUrls(inf.look_refs, urls);
    await deleteBlobs(urls).catch(() => {});
  }
  await deleteInfluencer(id);
  return NextResponse.json({ ok: true });
}
