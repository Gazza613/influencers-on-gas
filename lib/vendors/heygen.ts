import { getSecret } from "../connections";

// HeyGen client — the "Presenter" (talking a-roll) vendor. Vendor-neutral in the UI.
const API = "https://api.heygen.com";
const UPLOAD = "https://upload.heygen.com";

async function key(): Promise<string> {
  const k = await getSecret("heygen");
  if (!k) throw new Error("Presenter (HeyGen) is not connected");
  return k;
}

// Verify the key works + return remaining quota (credits).
export async function remainingQuota(): Promise<unknown> {
  const res = await fetch(`${API}/v2/user/remaining_quota`, {
    headers: { "x-api-key": await key() },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HeyGen quota failed (${res.status}): ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

// Turn a hero image into a HeyGen Talking Photo → talking_photo_id (the "presenter").
// The image is fetched and uploaded as raw bytes to HeyGen's upload endpoint.
export async function createTalkingPhoto(imageUrl: string): Promise<string> {
  const k = await key();
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`Could not fetch hero image (${img.status})`);
  const ct = (img.headers.get("content-type") || "").toLowerCase();
  const contentType = ct.includes("png") ? "image/png" : "image/jpeg";
  const bytes = Buffer.from(await img.arrayBuffer());

  const res = await fetch(`${UPLOAD}/v1/talking_photo`, {
    method: "POST",
    headers: { "x-api-key": k, "Content-Type": contentType },
    body: bytes,
  });
  const data = (await res.json().catch(() => ({}))) as { code?: number; data?: { talking_photo_id?: string }; message?: string; msg?: string };
  const id = data?.data?.talking_photo_id;
  if (!id) throw new Error(`No talking_photo_id (${res.status}): ${(data.message || data.msg || JSON.stringify(data)).slice(0, 180)}`);
  return id;
}

// ── A-roll video generation (Phase 2) ──────────────────────────────────────
// Upload an audio clip (our ElevenLabs voice) to HeyGen → asset id, used as the
// talking_photo's audio so the lip-sync matches our voice (not HeyGen's TTS).
export async function uploadAudio(audioUrl: string): Promise<string> {
  const k = await key();
  const a = await fetch(audioUrl, { signal: AbortSignal.timeout(20000) });
  if (!a.ok) throw new Error(`Could not fetch audio (${a.status})`);
  const bytes = Buffer.from(await a.arrayBuffer());
  const res = await fetch(`${UPLOAD}/v1/asset`, { method: "POST", headers: { "x-api-key": k, "Content-Type": "audio/mpeg" }, body: bytes });
  const data = (await res.json().catch(() => ({}))) as { data?: { id?: string; asset_id?: string }; message?: string };
  const id = data?.data?.id || data?.data?.asset_id;
  if (!id) throw new Error(`No audio asset id (${res.status}): ${(data.message || JSON.stringify(data)).slice(0, 160)}`);
  return id;
}

// Generate a talking-head a-roll clip from a talking_photo + our audio asset.
// Returns the HeyGen video_id (poll videoStatus for the result url).
export async function generateAvatarVideo(opts: { talkingPhotoId: string; audioAssetId: string; ratio?: string; motionPrompt?: string }): Promise<string> {
  const k = await key();
  const [w, h] = opts.ratio === "1:1" ? [1080, 1080] : opts.ratio === "16:9" ? [1920, 1080] : [1080, 1920]; // default 9:16
  const motion = opts.motionPrompt || "natural lifelike movement: subtle head turns and nods, easy hand gestures, relaxed shoulders, talking expressively to camera";
  const body = {
    video_inputs: [{
      character: {
        type: "talking_photo",
        talking_photo_id: opts.talkingPhotoId,
        // Avatar IV motion engine = realistic lip-sync, facial expression, head + hand motion.
        talking_photo_style: "expressive",
        motion_prompt: motion,
        expressiveness: 0.9,
      },
      voice: { type: "audio", audio_asset_id: opts.audioAssetId },
      use_avatar_iv_model: true,
    }],
    dimension: { width: w, height: h },
  };
  const res = await fetch(`${API}/v2/video/generate`, {
    method: "POST", headers: { "x-api-key": k, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { video_id?: string }; message?: string; error?: unknown };
  const id = data?.data?.video_id;
  if (!id) throw new Error(`No video_id (${res.status}): ${(data.message || JSON.stringify(data.error || data)).slice(0, 200)}`);
  return id;
}

// Poll a HeyGen video render. Returns the final mp4 url, or null while pending / on failure.
export async function videoStatus(videoId: string): Promise<{ status: string; url: string | null; error: string | null }> {
  const k = await key();
  const res = await fetch(`${API}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers: { "x-api-key": k }, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { data?: { status?: string; video_url?: string; error?: unknown } };
  const status = String(data?.data?.status || "unknown");
  return { status, url: data?.data?.video_url || null, error: status === "failed" ? JSON.stringify(data?.data?.error || "render failed").slice(0, 200) : null };
}
