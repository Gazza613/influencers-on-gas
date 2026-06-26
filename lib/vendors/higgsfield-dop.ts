// FIRST-PARTY Higgsfield image-to-video via the DoP endpoint (NOT the MCP session path).
// The MCP path (openSession in higgsfield.ts) stalls/times out for b-roll; DoP is the dedicated
// image-to-video product with a real REST API + priority queue. Auth = first-party API key/secret
// (HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET), different from the refresh-token/MCP auth.
//
// CRITICAL: we SUBMIT non-blocking (withPolling:false) and poll the job-set in SHORT steps from the
// caller. The SDK's withPolling blocks one call for the whole render, which outlasts the serverless
// function window and makes the clip spin forever — never use it inside an Inngest step.
import { HiggsfieldClient, DoPModel, InputImage } from "@higgsfield/client";

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

// Submit ONLY — returns the job-set id to poll (no blocking).
export async function submitDopVideo(opts: { imageUrl: string; prompt: string; seconds?: number; seed?: number }): Promise<{ jobSetId: string | null; error: string | null }> {
  const client = dopClient();
  if (!client) return { jobSetId: null, error: "Higgsfield first-party API not configured (HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET)" };
  try {
    // Tier is env-tunable. DEFAULT = dop-turbo: it's the SPEED-optimal tier (2x faster generation AND
    // PRIORITY QUEUE, and ~30% cheaper than Standard). dop-lite is cheaper but has NO priority queue, so
    // it sits in the queue LONGER and at lower quality — only choose it if cost > speed. dop-standard is
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
    return { url: null, terminal: false, status: "error" }; // transient — keep polling
  }
}
