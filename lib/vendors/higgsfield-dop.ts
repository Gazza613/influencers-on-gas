// FIRST-PARTY Higgsfield image-to-video via the DoP endpoint (NOT the MCP session path).
// The MCP path (openSession in higgsfield.ts) stalls/times out for b-roll; DoP is the dedicated
// image-to-video product with a real REST API + priority queue. Auth = first-party API key/secret
// (HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET), different from the refresh-token/MCP auth.
//
// CRITICAL: we SUBMIT non-blocking (withPolling:false) and poll the job-set in SHORT steps from the
// caller. The SDK's withPolling blocks one call for the whole render, which outlasts the serverless
// function window and makes the clip spin forever - never use it inside an Inngest step.
import { HiggsfieldClient, DoPModel, InputImage } from "@higgsfield/client";
import { isSafePublicUrl } from "@/lib/safe-url";

const BASE = "https://platform.higgsfield.ai";

export function dopConfigured(): boolean {
  return !!(process.env.HIGGSFIELD_KEY_ID && process.env.HIGGSFIELD_KEY_SECRET);
}

let _client: HiggsfieldClient | null = null;
function dopClient(): HiggsfieldClient | null {
  if (!dopConfigured()) return null;
  if (!_client) _client = new HiggsfieldClient({ apiKey: process.env.HIGGSFIELD_KEY_ID!, apiSecret: process.env.HIGGSFIELD_KEY_SECRET! });
  return _client;
}

// Submit ONLY - returns the job-set id to poll (no blocking).
export async function submitDopVideo(opts: { imageUrl: string; prompt: string; seconds?: number; seed?: number }): Promise<{ jobSetId: string | null; error: string | null }> {
  const client = dopClient();
  if (!client) return { jobSetId: null, error: "Higgsfield first-party API not configured (HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET)" };
  try {
    // Tier is env-tunable. DEFAULT = dop-turbo: it's the SPEED-optimal tier (2x faster generation AND
    // PRIORITY QUEUE, and ~30% cheaper than Standard). dop-lite is cheaper but has NO priority queue, so
    // it sits in the queue LONGER and at lower quality - only choose it if cost > speed. dop-standard is
    // best quality but pricier + slower. Set DOP_MODEL=dop-lite / dop-standard to A/B.
    const model = process.env.DOP_MODEL || DoPModel.TURBO;
    const params: Record<string, unknown> = {
      model,
      prompt: opts.prompt,
      input_images: [InputImage.fromUrl(opts.imageUrl)],
    };
    if (typeof opts.seed === "number") params.seed = opts.seed;
    if (opts.seconds) params.duration = Math.max(3, Math.min(15, Math.round(opts.seconds))); // VERIFY param name on first run
    const jobSet = await client.generate("/v1/image2video/dop", params, { withPolling: false });
    return { jobSetId: jobSet.id || null, error: jobSet.id ? null : "DoP submit returned no job-set id" };
  } catch (e) {
    return { jobSetId: null, error: String((e as Error)?.message || e).slice(0, 220) };
  }
}

// One non-blocking status check against the first-party API (poll this from short Inngest steps).
export async function pollDopOnce(jobSetId: string): Promise<{ url: string | null; terminal: boolean; status: string }> {
  try {
    const res = await fetch(`${BASE}/v1/job-sets/${jobSetId}`, {
      headers: { "hf-api-key": process.env.HIGGSFIELD_KEY_ID!, "hf-secret": process.env.HIGGSFIELD_KEY_SECRET! },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { jobs?: { status?: string; results?: { raw?: { url?: string }; min?: { url?: string } } | null }[] };
    const job = data.jobs?.[0];
    const status = String(job?.status || "unknown").toLowerCase();
    const url = job?.results?.raw?.url || job?.results?.min?.url || null;
    const terminal = !!url || ["completed", "failed", "nsfw", "canceled"].includes(status);
    return { url, terminal, status };
  } catch {
    return { url: null, terminal: false, status: "error" }; // transient - keep polling
  }
}

export function klingRestConfigured(): boolean {
  return !!(process.env.HIGGSFIELD_KEY_ID && process.env.HIGGSFIELD_KEY_SECRET);
}

// FIRST-PARTY REST image generation (verified 2026-07-06: /v1/text2image/nano-banana + input_images, a COMPLETED
// image in ~22s vs ~10 min on the MCP generate_image lane). input_images map to @image1, @image2 ... in prompt
// order, exactly like the MCP `medias`, so our identity/guide/wardrobe/world stack + @image tags carry over.
// Submit non-blocking; poll with pollDopOnce (same job-set shape). Falls back to MCP in the caller on any miss.
export async function submitImageRest(opts: { prompt: string; refUrls?: string[]; aspectRatio?: string }): Promise<{ jobSetId: string | null; error: string | null }> {
  if (!klingRestConfigured()) return { jobSetId: null, error: "Higgsfield first-party API not configured" };
  const ar = opts.aspectRatio === "1:1" ? "1:1" : opts.aspectRatio === "16:9" ? "16:9" : opts.aspectRatio === "3:4" ? "3:4" : opts.aspectRatio === "4:3" ? "4:3" : "9:16";
  const refs = (opts.refUrls || []).filter((u) => !!u && isSafePublicUrl(u)).slice(0, 8);
  if (!refs.length) return { jobSetId: null, error: "no reference images (nano-banana REST requires input_images)" };
  const path = process.env.IMAGE_REST_ENDPOINT || "/v1/text2image/nano-banana";
  const params: Record<string, unknown> = { prompt: opts.prompt, aspect_ratio: ar, input_images: refs.map((u) => ({ type: "image_url", image_url: u })) };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "hf-api-key": process.env.HIGGSFIELD_KEY_ID!, "hf-secret": process.env.HIGGSFIELD_KEY_SECRET!, "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; detail?: unknown };
    if (data?.id) return { jobSetId: data.id, error: null };
    return { jobSetId: null, error: `Image REST ${res.status}: ${JSON.stringify(data?.detail ?? data).slice(0, 200)}` };
  } catch (e) {
    return { jobSetId: null, error: String((e as Error)?.message || e).slice(0, 220) };
  }
}

// FIRST-PARTY REST Kling image-to-video (verified 2026-07-06: POST /v1/image2video/kling, model kling-v2-1,
// a COMPLETED 5s clip in ~81s vs ~40 min on the MCP session). Same first-party auth + the same job-set poll as
// DoP (use pollDopOnce). Kling 2.1 renders 5s or 10s, so the caller only routes clips <=10s here (longer
// stays on MCP Kling 3.0, which does up to 15s). Submit non-blocking; poll from short Inngest steps.
export async function submitKlingRest(opts: { imageUrl: string; prompt: string; seconds?: number }): Promise<{ jobSetId: string | null; model: string; error: string | null }> {
  const model = process.env.KLING_REST_MODEL || "kling-v2-1"; // or "kling-v2-1-master" (higher quality)
  if (!klingRestConfigured()) return { jobSetId: null, model, error: "Higgsfield first-party API not configured (HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET)" };
  if (!isSafePublicUrl(opts.imageUrl)) return { jobSetId: null, model, error: "unsafe or non-public image url" };
  const duration = opts.seconds && opts.seconds > 5 ? 10 : 5; // Kling 2.1 = 5s or 10s only
  const params: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    input_image: { type: "image_url", image_url: opts.imageUrl },
    duration,
    mode: process.env.KLING_REST_MODE || "pro",
    // Default OFF so Kling renders OUR exact motion prompt (camera lock / no-warp rules) rather than rewriting it.
    enhance_prompt: process.env.KLING_REST_ENHANCE === "1",
  };
  if (process.env.KLING_REST_CFG) params.cfg_scale = Number(process.env.KLING_REST_CFG);
  try {
    const res = await fetch(`${BASE}/v1/image2video/kling`, {
      method: "POST",
      headers: { "hf-api-key": process.env.HIGGSFIELD_KEY_ID!, "hf-secret": process.env.HIGGSFIELD_KEY_SECRET!, "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; detail?: unknown };
    if (data?.id) return { jobSetId: data.id, model, error: null };
    return { jobSetId: null, model, error: `Kling REST submit ${res.status}: ${JSON.stringify(data?.detail ?? data).slice(0, 200)}` };
  } catch (e) {
    return { jobSetId: null, model, error: String((e as Error)?.message || e).slice(0, 220) };
  }
}
