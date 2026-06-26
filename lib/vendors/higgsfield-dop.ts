// FIRST-PARTY Higgsfield image-to-video via the DoP endpoint (NOT the MCP session path).
// The MCP path (openSession in higgsfield.ts) has been stalling/timing out for b-roll; DoP is the
// dedicated image-to-video product with a real REST API + priority queue, so it should render
// reliably where MCP-Kling hangs. Auth is the first-party API key/secret (different from the
// refresh-token/MCP auth) — set HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET to enable.
import { HiggsfieldClient, DoPModel, InputImage } from "@higgsfield/client";

export function dopConfigured(): boolean {
  return !!(process.env.HIGGSFIELD_KEY_ID && process.env.HIGGSFIELD_KEY_SECRET);
}

let _client: HiggsfieldClient | null = null;
function dopClient(): HiggsfieldClient | null {
  if (!dopConfigured()) return null;
  if (!_client) _client = new HiggsfieldClient({ apiKey: process.env.HIGGSFIELD_KEY_ID!, apiSecret: process.env.HIGGSFIELD_KEY_SECRET! });
  return _client;
}

// Animate a still into a clip via DoP. withPolling lets the SDK poll to completion and return the
// finished JobSet (DoP turbo is fast + priority-queued, so this resolves in a few minutes). Returns
// the clip url or a clear error — the caller keeps MCP-Kling as the fallback.
export async function submitDopVideo(opts: { imageUrl: string; prompt: string; seconds?: number; seed?: number }): Promise<{ url: string | null; error: string | null }> {
  const client = dopClient();
  if (!client) return { url: null, error: "Higgsfield first-party API not configured (set HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET)" };
  try {
    const params: Record<string, unknown> = {
      model: DoPModel.TURBO, // 2x speed + priority queue; DoPModel.STANDARD for top quality
      prompt: opts.prompt,
      input_images: [InputImage.fromUrl(opts.imageUrl)],
    };
    if (typeof opts.seed === "number") params.seed = opts.seed;
    // DoP duration param name — VERIFY against the live API on first run; clamp to DoP's 3–15s range.
    if (opts.seconds) params.duration = Math.max(3, Math.min(15, Math.round(opts.seconds)));
    const jobSet = await client.generate("/v1/image2video/dop", params, { withPolling: true });
    const job = jobSet.jobs?.[0];
    const url = job?.results?.raw?.url || job?.results?.min?.url || null;
    return { url, error: url ? null : `DoP returned no url (status ${job?.status || "unknown"})` };
  } catch (e) {
    return { url: null, error: String((e as Error)?.message || e).slice(0, 220) };
  }
}
