import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInfluencer } from "@/lib/influencers";
import { tts, pickVoiceForGender } from "@/lib/vendors/elevenlabs";
import { putBytes } from "@/lib/blob";
import { getSecret } from "@/lib/connections";

// DIAGNOSTIC (super-admin): submit ONE real OmniHuman job (hero + short TTS) and report EXACTLY what
// fal returns + the true timing, so we can see whether the poll detects completion. Costs ~1 short
// render. Hit /api/producer/fal-aroll-test?id=<influencerId>.
export const maxDuration = 300;
const MODEL = process.env.FAL_OMNIHUMAN_MODEL?.includes("/") && !process.env.FAL_OMNIHUMAN_MODEL.includes(":") ? process.env.FAL_OMNIHUMAN_MODEL : "fal-ai/bytedance/omnihuman/v1.5";

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const k = (await getSecret("fal")) || process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!k) return NextResponse.json({ error: "fal not connected" }, { status: 400 });
  const inf = id ? await getInfluencer(id) : null;
  if (!inf) return NextResponse.json({ error: "Pass ?id=<influencerId> of a built influencer" }, { status: 400 });
  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const refs = (inf.look_refs as { url: string }[] | undefined) ?? [];
  const hero = (persona.hero_realism_url as string) || refs[0]?.url || (persona.reference_url as string) || "";
  if (!hero) return NextResponse.json({ error: "No hero image on this influencer" }, { status: 400 });

  const t0 = Date.now();
  const samples: { t: number; httpStatus: number; status: string }[] = [];
  try {
    // Short TTS for the audio input.
    const voiceId = (persona.voice_id as string) || (await pickVoiceForGender(persona.gender as string))?.voice_id;
    if (!voiceId) return NextResponse.json({ error: "No voice available to test with" }, { status: 400 });
    const audioUrl = await putBytes(await tts(voiceId, "Hi, this is a quick a-roll test."), "fal-test", "mp3", "audio/mpeg");

    const submitRes = await fetch(`https://queue.fal.run/${MODEL}`, {
      method: "POST", headers: { Authorization: `Key ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: hero, audio_url: audioUrl, resolution: "720p", turbo_mode: true }),
      signal: AbortSignal.timeout(30000),
    });
    const submitText = await submitRes.text();
    let submit: Record<string, unknown> = {};
    try { submit = JSON.parse(submitText); } catch { /* keep text */ }
    if (!submitRes.ok) return NextResponse.json({ stage: "submit", httpStatus: submitRes.status, raw: submitText.slice(0, 500) });
    const requestId = submit.request_id as string | undefined;
    const statusUrl = (submit.status_url as string) || `https://queue.fal.run/${MODEL}/requests/${requestId}/status`;
    const responseUrl = (submit.response_url as string) || `https://queue.fal.run/${MODEL}/requests/${requestId}`;

    // Poll ~4 min, sampling the raw status.
    let finalResponse: unknown = null; let videoUrl: string | null = null; let done = false;
    for (let n = 0; n < 48 && !done; n++) {
      await new Promise((r) => setTimeout(r, 5000));
      const sr = await fetch(statusUrl, { headers: { Authorization: `Key ${k}` }, cache: "no-store" });
      let sj: Record<string, unknown> = {};
      try { sj = await sr.json(); } catch { /* */ }
      const status = String(sj.status || "").toUpperCase();
      samples.push({ t: Math.round((Date.now() - t0) / 1000), httpStatus: sr.status, status: status || JSON.stringify(sj).slice(0, 60) });
      if (status === "COMPLETED" || sr.status === 200 && sj.status === undefined) {
        const rr = await fetch(responseUrl, { headers: { Authorization: `Key ${k}` }, cache: "no-store" });
        finalResponse = await rr.json().catch(() => null);
        const fr = finalResponse as { video?: { url?: string }; url?: string } | null;
        videoUrl = fr?.video?.url || fr?.url || null;
        done = true;
      }
      if (status === "FAILED" || status === "ERROR") { done = true; }
    }
    return NextResponse.json({
      model: MODEL, submit: { request_id: requestId, status_url: statusUrl, response_url: responseUrl, keys: Object.keys(submit) },
      samples, videoUrl, elapsedSec: Math.round((Date.now() - t0) / 1000), done, finalResponse,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300), samples, elapsedSec: Math.round((Date.now() - t0) / 1000) });
  }
}
