import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { inngest } from "@/lib/inngest";
import { isSafePublicUrl } from "@/lib/safe-url";

// THE PRODUCER step 4: "stitch the cut" - assemble the clips into one finished ad (music +
// captions + brand + VO) via Shotstack. Durable; the UI polls the storyboard GET.
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = persona.production as { clips?: { url?: string | null }[] } | undefined;
  if (!production?.clips?.some((c) => c.url)) return NextResponse.json({ error: "Render the clips first." }, { status: 400 });

  // Captions opt-in (default off); optional uploaded closing clip/image. Persist both so a refresh-driven
  // resume re-stitches the same way. URL is SSRF-guarded (Shotstack fetches it).
  const body = await req.json().catch(() => ({}));
  const captions = body.captions === true;
  const captionStyle = ["pill", "bold", "highlight", "clean", "sunny", "karaoke", "boldextra"].includes(body.captionStyle) ? body.captionStyle : "bold";
  // Active-word pill colour for the word-sync captions (validated hex; blank = the default brand purple).
  const captionAccent = /^#[0-9a-fA-F]{6}$/.test(String(body.captionAccent)) ? String(body.captionAccent) : "";
  const endCardUrl = typeof body.endCardUrl === "string" && isSafePublicUrl(body.endCardUrl) ? body.endCardUrl : "";
  const endCardKind = body.endCardKind === "image" ? "image" : "video";
  // ON-SCREEN OFFER CALLOUT (frosted glass): an optional animated overlay of the client's hook offer. Sanitise
  // every field - text is HTML-escaped in the stitch, but cap lengths + validate the accent hex + clamp timing.
  const cbRaw = (body.callout ?? {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const num = (v: unknown, d: number, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
  const callout = cbRaw.on === true ? {
    on: true,
    kick: str(cbRaw.kick, 40),
    line: str(cbRaw.line, 80),
    num: str(cbRaw.num, 24),
    suffix: str(cbRaw.suffix, 24),
    accent: /^#[0-9a-fA-F]{6}$/.test(String(cbRaw.accent)) ? String(cbRaw.accent) : "#ffcb05",
    start: num(cbRaw.start, 0.6, 0, 60),
    duration: num(cbRaw.duration, 4, 1.5, 12),
  } : { on: false };
  const briefNext = { ...(production as { brief?: Record<string, unknown> }).brief, endCardUrl, endCardKind, captionStyle, captionAccent, callout };
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, brief: briefNext, assembly_status: "running", final_url: null, stitch_captions: captions } } });
  try {
    await inngest.send({ name: "influencer/assemble.video", data: { influencerId: id, userEmail: session.user.email ?? undefined, captions, captionStyle, captionAccent, endCardUrl, endCardKind, callout } });
  } catch {
    await updateInfluencer(id, { persona: { ...persona, production: { ...production, assembly_status: "idle" } } });
    return NextResponse.json({ error: "Could not start the stitch (assembly engine not connected)." }, { status: 503 });
  }
  return NextResponse.json({ queued: true });
}
