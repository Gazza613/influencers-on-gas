import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { pickVoiceForGender, cloneVoice, previewVoice, listVoices } from "@/lib/vendors/elevenlabs";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// Create / set the influencer's voice (Phase 2 foundation).
//  - "auto"  : synthetic — pick a library voice matching the gender.
//  - "clone" : twin — clone from uploaded voice samples (consent-gated).
// Stores voice_id + voice_name on the persona and returns a short preview clip.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  const body = await req.json().catch(() => ({}));
  const action = body.action === "clone" ? "clone" : body.action === "select" ? "select" : "auto";
  try {
    let voiceId: string; let voiceName: string;
    if (action === "select") {
      voiceId = typeof body.voiceId === "string" ? body.voiceId : "";
      if (!voiceId) return NextResponse.json({ error: "Pick a voice." }, { status: 400 });
      const v = (await listVoices().catch(() => [])).find((x) => x.voice_id === voiceId);
      voiceName = typeof body.voiceName === "string" && body.voiceName ? body.voiceName : v?.name || "Selected voice";
    } else if (action === "clone") {
      // GUARD: ElevenLabs requires THEIR OWN voice-captcha verification to clone a voice (to confirm
      // the speaker consented). Our upload path bypasses that — a moderation/ToS risk — so instant
      // cloning is disabled here. Use a library or designed voice instead. (Set ALLOW_VOICE_CLONE=1
      // only once a verified-consent flow is in place.)
      if (process.env.ALLOW_VOICE_CLONE !== "1") {
        return NextResponse.json({ error: "Voice cloning is disabled: ElevenLabs requires their own voice verification to clone a voice. Pick a library voice or design one instead." }, { status: 403 });
      }
      const samples = Array.isArray(body.sampleUrls) ? (body.sampleUrls as string[]).filter((u) => typeof u === "string") : [];
      if (samples.length < 1) return NextResponse.json({ error: "Add at least one clear voice sample (20 to 60 seconds is ideal)." }, { status: 400 });
      if (!body.consentId) return NextResponse.json({ error: "Voice consent is required to clone a real person's voice." }, { status: 400 });
      voiceId = await cloneVoice(inf.name, samples);
      voiceName = `${inf.name} (cloned)`;
      await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "clone", unit: "voice", action: "voice", count: 1 }).catch(() => {});
    } else {
      const descriptor = String((persona.bible as { voice_descriptor?: string })?.voice_descriptor || "");
      const picked = await pickVoiceForGender(typeof persona.gender === "string" ? (persona.gender as string) : "", descriptor);
      if (!picked) return NextResponse.json({ error: "No voices available on the ElevenLabs account." }, { status: 502 });
      voiceId = picked.voice_id; voiceName = picked.name;
    }
    // Short preview so the producer can hear it before relying on it.
    let previewUrl: string | null = null;
    try {
      const buf = await previewVoice(voiceId);
      previewUrl = await putBytes(buf, "voice-preview", "mp3", "audio/mpeg");
      await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {});
    } catch { /* preview is best-effort */ }

    // Changing the voice INVALIDATES any rendered clips: the a-roll/b-roll lips were synced to the OLD
    // voice (and the stitch replays each clip's baked-in audio), so reusing them would play the old
    // voice. Clear the clips + the cut so the producer re-animates with the NEW voice, and drop the
    // animate/stitch approvals so the wizard reflects that those steps need redoing.
    const production = (persona.production ?? null) as Record<string, unknown> | null;
    const personaNext: Record<string, unknown> = { ...persona, voice_id: voiceId, voice_name: voiceName, voice_preview_url: previewUrl };
    if (production && Array.isArray(production.clips) && (production.clips as unknown[]).length) {
      const keptApprovals = (Array.isArray(production.wizard_approved) ? (production.wizard_approved as string[]) : []).filter((k) => !["aroll", "broll", "audio", "stitch", "showreel"].includes(k));
      personaNext.production = { ...production, clips: [], clips_status: "idle", music_url: null, ambient_url: null, audio_status: "idle", final_url: null, assembly_status: "idle", wizard_approved: keptApprovals };
    }
    await updateInfluencer(id, { persona: personaNext });
    return NextResponse.json({ voice_id: voiceId, voice_name: voiceName, preview_url: previewUrl });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
