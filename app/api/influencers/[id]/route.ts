import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteInfluencer, updateInfluencer, getInfluencer } from "@/lib/influencers";

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
  const ALLOWED_PATCH = new Set(["chosen_url", "selected_frames", "video_selects", "creatives"]);
  let persona: Record<string, unknown> | undefined;
  if (body.personaPatch && typeof body.personaPatch === "object") {
    const inf = await getInfluencer(id);
    if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = inf.persona as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(body.personaPatch)) {
      if (!ALLOWED_PATCH.has(k)) continue;
      // `creatives` is prune-only: rebuild the kept list from the STORED objects (keyed by
      // url), so a client can remove shots but never inject images OR mutate other fields
      // (resolution/scene/etc.) on a kept shot.
      if (k === "creatives") {
        const byUrl = new Map((Array.isArray(existing?.creatives) ? existing.creatives : []).map((c: { url?: string }) => [c?.url, c]));
        const next = Array.isArray(body.personaPatch[k]) ? body.personaPatch[k] : [];
        const seen = new Set<string>();
        patch[k] = next
          .map((c: { url?: string }) => (c && typeof c.url === "string" ? byUrl.get(c.url) : undefined))
          .filter((c: { url?: string } | undefined): c is { url?: string } => !!c && !seen.has(c.url!) && (seen.add(c.url!), true));
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
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteInfluencer(id);
  return NextResponse.json({ ok: true });
}
