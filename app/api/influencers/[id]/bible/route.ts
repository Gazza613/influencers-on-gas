import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { generateBible, generateTagline, friendlyAnthropicError } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// Claude expands a short brief into the full Character Bible (one-off, ~20-40s).
export const maxDuration = 120;

// Save an edited bible (no regeneration) — autosave from the document-style editor.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!body.bible || typeof body.bible !== "object") return NextResponse.json({ error: "No bible" }, { status: 400 });
  await updateInfluencer(id, { persona: { ...inf.persona, bible: body.bible } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Influencer not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 10) return NextResponse.json({ error: "Add a sentence or two of brief to work from." }, { status: 400 });

  try {
    const p = (inf.persona ?? {}) as Record<string, unknown>;
    const gender = typeof p.gender === "string" ? (p.gender as string) : undefined;
    const look = typeof p.look === "string" ? (p.look as string) : undefined;
    const bible = await generateBible(inf.name, brief, gender, look, inf.mode === "twin");
    const tagline = await generateTagline(inf.name, bible as unknown as Record<string, unknown>).catch(() => "");
    await updateInfluencer(id, { persona: { ...inf.persona, brief, bible, tagline } });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "bible", action: "bible", count: 1 }).catch(() => {});
    // The tagline is a second (small) Claude call — meter it too so no paid call goes untracked.
    if (tagline) await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "tagline", count: 1 }).catch(() => {});
    return NextResponse.json({ bible });
  } catch (e) {
    return NextResponse.json({ error: friendlyAnthropicError(e) }, { status: 500 });
  }
}
