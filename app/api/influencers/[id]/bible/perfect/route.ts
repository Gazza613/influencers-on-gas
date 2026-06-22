import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { perfectCharacterBrief } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// "Perfect with AI": polish the user's rough character idea into a richer casting brief. Returns the
// improved text only (does NOT cast or save the bible) so the user can review/edit, then cast.
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const brief = typeof b.brief === "string" ? b.brief.trim().slice(0, 1000) : "";
  if (brief.length < 4) return NextResponse.json({ error: "Write a few words first, then I'll perfect it." }, { status: 400 });
  const gender = (inf.persona as { gender?: string } | null)?.gender;
  try {
    const improved = await perfectCharacterBrief(brief, gender);
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "perfect-brief", count: 1 }).catch(() => {});
    return NextResponse.json({ brief: improved });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
