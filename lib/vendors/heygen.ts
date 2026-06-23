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
  const character = { type: "talking_photo", talking_photo_id: opts.talkingPhotoId };
  const voice = { type: "audio", audio_asset_id: opts.audioAssetId };
  const dimension = { width: w, height: h };
  const motion = opts.motionPrompt || "natural, lively delivery: expressive face, easy head movement and natural hand gestures while talking to camera";
  // Avatar IV's expressiveness DEFAULTS TO LOW (barely moves), so we push it HIGH with a motion
  // prompt. Field placement isn't publicly schema'd, so try richest first and fall back on a 400
  // so a render never hard-fails on an unknown field.
  const variants = [
    { video_inputs: [{ character, voice, use_avatar_iv_model: true, motion_prompt: motion, expressiveness: "high" }], dimension },
    { video_inputs: [{ character, voice, use_avatar_iv_model: true }], dimension },
    { video_inputs: [{ character, voice }], dimension },
  ];
  let lastErr = "";
  for (const body of variants) {
    const res = await fetch(`${API}/v2/video/generate`, {
      method: "POST", headers: { "x-api-key": k, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { data?: { video_id?: string }; message?: string; error?: unknown };
    const id = data?.data?.video_id;
    if (id) return id;
    lastErr = `${res.status}: ${(data.message || JSON.stringify(data.error || data)).slice(0, 200)}`;
    if (res.status !== 400) break; // a non-validation error won't be fixed by dropping fields
  }
  throw new Error(`No video_id (${lastErr})`);
}

// Poll a HeyGen video render. Returns the final mp4 url, or null while pending / on failure.
export async function videoStatus(videoId: string): Promise<{ status: string; url: string | null; error: string | null }> {
  const k = await key();
  const res = await fetch(`${API}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers: { "x-api-key": k }, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { data?: { status?: string; video_url?: string; error?: unknown } };
  const status = String(data?.data?.status || "unknown");
  return { status, url: data?.data?.video_url || null, error: status === "failed" ? JSON.stringify(data?.data?.error || "render failed").slice(0, 200) : null };
}

// ── Avatar IV via the CURRENT v3 image→video API (most realistic; motion + expressiveness
// actually apply here, unlike the legacy v2 talking_photo path). Falls back to v2 if v3 errs.
const V3 = "https://api.heygen.com/v3";

async function uploadAssetV3(url: string): Promise<string> {
  const k = await key();
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`fetch asset ${r.status}`);
  const ct = (r.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const bytes = Buffer.from(await r.arrayBuffer());
  const res = await fetch(`${V3}/assets`, { method: "POST", headers: { "x-api-key": k, "Content-Type": ct }, body: bytes });
  const data = (await res.json().catch(() => ({}))) as { data?: { asset_id?: string; id?: string }; asset_id?: string; id?: string; message?: string };
  const id = data?.data?.asset_id || data?.data?.id || data?.asset_id || data?.id;
  if (!id) throw new Error(`no asset_id (${res.status}): ${(data.message || JSON.stringify(data)).slice(0, 160)}`);
  return id;
}

function arOf(ratio?: string): string { return ratio === "1:1" ? "1:1" : ratio === "16:9" ? "16:9" : "9:16"; }

// Returns the video_id PLUS which variant rendered, so the caller can log whether the FULL Avatar IV
// quality (motion prompt + high expressiveness) was applied, or whether HeyGen rejected those fields
// and we had to drop to a leaner request (which looks more static — the thing we must catch).
async function generateV3(opts: { imageAssetId: string; audioAssetId: string; ratio?: string; motionPrompt?: string }): Promise<{ videoId: string; variant: string }> {
  const k = await key();
  const image = { type: "asset_id", asset_id: opts.imageAssetId };
  const motion = opts.motionPrompt || "natural, lively delivery: relaxed posture, easy head movement and subtle hand gestures while talking to camera";
  // Richest (expressiveness HIGH + motion) first; fall back ONLY if a field is rejected with a 400.
  const variants: { label: string; body: Record<string, unknown> }[] = [
    { label: "full(motion+expressiveness)", body: { type: "image", image, audio_asset_id: opts.audioAssetId, motion_prompt: motion, expressiveness: "high", resolution: "1080p", aspect_ratio: arOf(opts.ratio), title: "GAS a-roll" } },
    { label: "expressiveness-only", body: { type: "image", image, audio_asset_id: opts.audioAssetId, expressiveness: "high", resolution: "1080p", aspect_ratio: arOf(opts.ratio), title: "GAS a-roll" } },
    { label: "bare(no-motion/expressiveness)", body: { type: "image", image, audio_asset_id: opts.audioAssetId, resolution: "1080p", aspect_ratio: arOf(opts.ratio), title: "GAS a-roll" } },
  ];
  let lastErr = "";
  for (const v of variants) {
    const res = await fetch(`${V3}/videos`, { method: "POST", headers: { "x-api-key": k, "Content-Type": "application/json" }, body: JSON.stringify(v.body) });
    const data = (await res.json().catch(() => ({}))) as { data?: { video_id?: string; id?: string }; video_id?: string; id?: string; message?: string; error?: unknown };
    const id = data?.data?.video_id || data?.data?.id || data?.video_id || data?.id;
    if (id) { if (v.label !== "full(motion+expressiveness)") console.warn(`[heygen] Avatar IV rendered on LEANER variant "${v.label}" — HeyGen rejected the richer fields: ${lastErr}`); return { videoId: id, variant: v.label }; }
    lastErr = `${res.status}: ${(data.message || JSON.stringify(data.error || data)).slice(0, 180)}`;
    if (res.status !== 400) break;
  }
  throw new Error(`v3 generate ${lastErr}`);
}

async function statusV3(videoId: string): Promise<{ status: string; url: string | null; error: string | null }> {
  const k = await key();
  const res = await fetch(`${V3}/videos/${encodeURIComponent(videoId)}`, { headers: { "x-api-key": k }, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { data?: { status?: string; video_url?: string; url?: string; error?: unknown } };
  const d = data?.data || (data as Record<string, unknown>);
  const status = String((d as { status?: string })?.status || "unknown").toLowerCase();
  const url = ((d as { video_url?: string }).video_url || (d as { url?: string }).url) || null;
  return { status, url, error: status === "failed" ? JSON.stringify((d as { error?: unknown }).error || "render failed").slice(0, 200) : null };
}

// Start a talking clip from a SOURCE IMAGE url + our audio url. Avatar IV (v3) ONLY — the highest-
// quality path, and the one that matches the manual HeyGen workflow. We deliberately do NOT fall back
// to the legacy v2 talking_photo engine: that produced the "static photo, weak motion, poor lip-sync"
// look, and silently degrading hid the problem. If Avatar IV fails, we surface the real error so the
// caller fails LOUDLY (and we know to fix it) rather than shipping an inferior clip.
export async function startTalkingVideo(opts: { imageUrl: string; audioUrl: string; ratio?: string; motionPrompt?: string }): Promise<{ videoId: string; version: "v3"; variant: string }> {
  const [imageAssetId, audioAssetId] = await Promise.all([uploadAssetV3(opts.imageUrl), uploadAssetV3(opts.audioUrl)]);
  const { videoId, variant } = await generateV3({ imageAssetId, audioAssetId, ratio: opts.ratio, motionPrompt: opts.motionPrompt });
  return { videoId, version: "v3", variant };
}

export async function pollTalking(videoId: string, version: "v3" | "v2"): Promise<{ status: string; url: string | null; error: string | null }> {
  return version === "v3" ? statusV3(videoId) : videoStatus(videoId);
}
