import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { generateBible } from "@/lib/vendors/anthropic";
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
    const bible = await generateBible(inf.name, brief, gender, look);
    await updateInfluencer(id, { persona: { ...inf.persona, brief, bible } });
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-opus-4-8", unit: "bible", action: "bible", count: 1 }).catch(() => {});
    return NextResponse.json({ bible });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
