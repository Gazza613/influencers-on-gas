import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateMusic, generateSfx } from "@/lib/vendors/elevenlabs";
import { putBytes } from "@/lib/blob";

// VERIFICATION SPIKE - prove the ElevenLabs MUSIC bed + ambient SFX endpoints actually work on the
// live account (this is the "music doesn't add / no ambient" bug). Returns playable urls or the
// exact error per call. Super-admin only. Spends a little (one short music + one sfx generation).
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let musicUrl: string | null = null; let musicError: string | null = null;
  try {
    const m = await generateMusic("warm, upbeat, modern background music bed for a social ad, no vocals", 15000);
    musicUrl = await putBytes(m.buf, "spike-music", m.ext, m.mime);
  } catch (e) { musicError = String((e as Error)?.message || e).slice(0, 300); }

  let sfxUrl: string | null = null; let sfxError: string | null = null;
  try {
    const buf = await generateSfx("busy coffee shop ambience, low murmur of chatter, cups and clinks, espresso machine", 6);
    sfxUrl = await putBytes(buf, "spike-sfx", "mp3", "audio/mpeg");
  } catch (e) { sfxError = String((e as Error)?.message || e).slice(0, 300); }

  return NextResponse.json({ music_url: musicUrl, music_error: musicError, ambient_url: sfxUrl, ambient_error: sfxError });
}
