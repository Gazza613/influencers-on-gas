import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { designVoiceBrief } from "@/lib/vendors/anthropic";
import { designVoicePreviews, createDesignedVoice, previewVoice } from "@/lib/vendors/elevenlabs";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// Design-a-voice. Two steps:
//  - { description }            -> AI-optimise the prompt, generate ElevenLabs voice previews.
//  - { generatedVoiceId, voice_description } -> save the chosen preview as the influencer's voice.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const body = await req.json().catch(() => ({}));

  try {
    // Step 2: save a chosen designed preview.
    if (typeof body.generatedVoiceId === "string" && body.generatedVoiceId) {
      const desc = typeof body.voice_description === "string" ? body.voice_description : "Designed voice";
      const voiceId = await createDesignedVoice(inf.name, desc, body.generatedVoiceId);
      await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "clone", unit: "voice", action: "voice", count: 1 }).catch(() => {});
      let previewUrl: string | null = null;
      try { previewUrl = await putBytes(await previewVoice(voiceId), "voice-preview", "mp3", "audio/mpeg"); } catch { /* best effort */ }
      await updateInfluencer(id, { persona: { ...persona, voice_id: voiceId, voice_name: `${inf.name} (designed)`, voice_preview_url: previewUrl } });
      return NextResponse.json({ voice_id: voiceId, voice_name: `${inf.name} (designed)`, preview_url: previewUrl });
    }

    // Step 1: design previews from a description.
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 800) : "";
    if (description.length < 4) return NextResponse.json({ error: "Describe the voice you want." }, { status: 400 });
    const brief = await designVoiceBrief(description);
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "anthropic", model: "claude-sonnet-4-6", unit: "scene", action: "voice_design", count: 1 }).catch(() => {});
    const previews = await designVoicePreviews(brief.voice_description, brief.sample_text);
    await recordUsage({ influencerId: id, userEmail: session.user.email ?? null, provider: "elevenlabs", model: "eleven_multilingual_v2", unit: "tts", action: "voice", count: 1 }).catch(() => {});
    const hosted = await Promise.all(previews.map(async (p) => ({ generatedVoiceId: p.generatedVoiceId, url: await putBytes(p.audio, "voice-design", "mp3", "audio/mpeg").catch(() => null) })));
    return NextResponse.json({ voice_description: brief.voice_description, sample_text: brief.sample_text, previews: hosted.filter((p) => p.url) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
