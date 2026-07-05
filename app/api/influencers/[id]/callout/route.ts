import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";

// PER-SCENE offer callout: save (or clear) the frosted-glass callout for ONE scene. Stored on
// production.scene_callouts keyed by scene index; the stitch renders each during its scene's window.
export const maxDuration = 15;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const production = (persona.production ?? {}) as Record<string, unknown>;

  const b = await req.json().catch(() => ({}));
  const scene = Number(b.scene);
  if (!Number.isInteger(scene) || scene < 0) return NextResponse.json({ error: "Bad scene index." }, { status: 400 });

  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const num = (v: unknown, d: number, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
  const cbRaw = (b.callout ?? {}) as Record<string, unknown>;

  const callouts = { ...((production.scene_callouts as Record<string, unknown>) || {}) };
  // Empty text OR on:false clears the callout for this scene.
  const hasText = ["kick", "line", "num", "suffix"].some((k) => typeof cbRaw[k] === "string" && (cbRaw[k] as string).trim());
  if (cbRaw.on === false || !hasText) {
    delete callouts[String(scene)];
  } else {
    callouts[String(scene)] = {
      on: true,
      kick: str(cbRaw.kick, 40),
      line: str(cbRaw.line, 80),
      num: str(cbRaw.num, 24),
      suffix: str(cbRaw.suffix, 24),
      accent: /^#[0-9a-fA-F]{6}$/.test(String(cbRaw.accent)) ? String(cbRaw.accent) : "#ffcb05",
      hold: num(cbRaw.hold, 4, 1.5, 12),
    };
  }
  await updateInfluencer(id, { persona: { ...persona, production: { ...production, scene_callouts: callouts } } });
  return NextResponse.json({ saved: true, scene_callouts: callouts });
}
