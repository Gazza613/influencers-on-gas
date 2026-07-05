import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Super-admin one-click: apply the newest rate-card rows to the LIVE DB without needing the CLI
// migrate (the deployed app can reach Neon). Upserts, so it also corrects existing values.
export const dynamic = "force-dynamic";

// [provider, model, unit, credits_per_unit, price_cents_per_unit] - ZAR cents.
const ROWS: [string, string, string, number, number][] = [
  ["higgsfield", "kling3", "video", 6, 462], // Kling 3.0 ~5s std, from the Ultra credit pool
  ["higgsfield", "kling3_0", "video", 6, 462], // b-roll engine id used in metering
  ["higgsfield", "seedance_2_0", "video", 6, 462], // a-roll fallback, from the Ultra credit pool
  ["higgsfield", "veo3_1", "video", 40, 3080], // Veo 3.1 HERO b-roll (4K + native audio) - pricey; approx, recalibrate
  ["higgsfield", "dop_turbo", "video", 4, 308], // PRIMARY b-roll (DoP-turbo) - ESTIMATE, trued up by the get_cost pass below
  ["heygen", "avatar_iv", "video", 0, 300], // PRIMARY a-roll (HeyGen Avatar IV) - ESTIMATE per clip, confirm HeyGen plan
  ["heygen", "talking_photo", "video", 0, 300], // legacy build/twin presenter
  ["heygen", "talking_photo", "avatar", 0, 300], // legacy build/twin presenter
  ["fal", "omnihuman_1_5", "second", 0, 296], // OmniHuman 1.5 a-roll - fal PAYG $0.16/s ≈ R2.96/s (metered per second)
  ["elevenlabs", "eleven_multilingual_v2", "tts", 0, 0], // within the ElevenLabs subscription quota
  ["elevenlabs", "clone", "voice", 0, 0], // voice clone - within subscription quota
  ["elevenlabs", "scribe_v1", "stt", 0, 0], // Scribe STT - within subscription quota
  ["elevenlabs", "music", "music", 0, 0], // covered by the ElevenLabs subscription quota
  ["anthropic", "claude-sonnet-4-6", "bible", 0, 200], // Character Casting + creative refine
  ["voyage", "voyage-3.5", "embedding", 0, 0], // brief retrieval embeddings
  ["shotstack", "edit", "render", 0, 450], // Shotstack PAYG ~$0.30/min, ~$0.24 per 45s render
];

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const sql = db();
  try {
    for (const [provider, model, unit, credits, cents] of ROWS) {
      await sql`
        insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
        values (${provider}, ${model}, ${unit}, ${credits}, ${cents}, true)
        on conflict (provider, model, unit)
        do update set credits_per_unit = excluded.credits_per_unit, price_cents_per_unit = excluded.price_cents_per_unit, active = true`;
    }
    const rows = await sql`select provider, model, unit, credits_per_unit, price_cents_per_unit, active from rate_card order by provider, model, unit`;
    return NextResponse.json({ ok: true, applied: ROWS.map((r) => `${r[0]}/${r[1]}/${r[2]}`), rate_card: rows });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
