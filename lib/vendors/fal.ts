import { getSecret } from "../connections";

// fal.ai — OmniHuman 1.5: image + audio → a fully-animated talking influencer, lip-synced to the
// SUPPLIED audio (so it uses OUR locked ElevenLabs voice, unlike Veo which makes its own voice).
// Best-in-class lip-sync + character animation for a-roll. Uses fal's standard queue API.
const FAL_QUEUE = "https://queue.fal.run";
const OMNIHUMAN_MODEL = process.env.FAL_OMNIHUMAN_MODEL || "fal-ai/bytedance/omnihuman/v1.5";

async function key(): Promise<string | null> {
  return (await getSecret("fal")) || process.env.FAL_KEY || process.env.FAL_API_KEY || null;
}

export async function falConnected(): Promise<boolean> {
  return !!(await key());
}

// Submit an OmniHuman job; returns the queue handles for durable polling (or an error if fal isn't
// connected / the submit failed — caller can then fall back to another engine).
export async function submitOmniHuman(opts: { imageUrl: string; audioUrl: string; prompt?: string }): Promise<{ statusUrl: string | null; responseUrl: string | null; error: string | null }> {
  const k = await key();
  if (!k) return { statusUrl: null, responseUrl: null, error: "fal.ai not connected" };
  try {
    const res = await fetch(`${FAL_QUEUE}/${OMNIHUMAN_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: opts.imageUrl, audio_url: opts.audioUrl, ...(opts.prompt ? { prompt: opts.prompt.slice(0, 1500) } : {}) }),
      signal: AbortSignal.timeout(30000),
    });
    const txt = await res.text();
    if (!res.ok) return { statusUrl: null, responseUrl: null, error: `omnihuman submit ${res.status}: ${txt.slice(0, 180)}` };
    const data = JSON.parse(txt) as { status_url?: string; response_url?: string; request_id?: string };
    const base = `${FAL_QUEUE}/${OMNIHUMAN_MODEL}/requests/${data.request_id || ""}`;
    const statusUrl = data.status_url || (data.request_id ? `${base}/status` : null);
    const responseUrl = data.response_url || (data.request_id ? base : null);
    if (!statusUrl || !responseUrl) return { statusUrl: null, responseUrl: null, error: `omnihuman: no request handle: ${txt.slice(0, 160)}` };
    return { statusUrl, responseUrl, error: null };
  } catch (e) {
    return { statusUrl: null, responseUrl: null, error: String((e as Error)?.message || e).slice(0, 180) };
  }
}

// One quick status check for durable step.sleep polling. Returns the video url when COMPLETED.
export async function pollOmniHumanOnce(statusUrl: string, responseUrl: string): Promise<{ url: string | null; terminal: boolean }> {
  const k = await key();
  if (!k) return { url: null, terminal: true };
  try {
    const sres = await fetch(statusUrl, { headers: { Authorization: `Key ${k}` }, cache: "no-store" });
    if (!sres.ok) return { url: null, terminal: false };
    const status = String(((await sres.json()) as { status?: string }).status || "").toUpperCase();
    if (status === "COMPLETED") {
      const rres = await fetch(responseUrl, { headers: { Authorization: `Key ${k}` }, cache: "no-store" });
      if (!rres.ok) return { url: null, terminal: true };
      const r = (await rres.json()) as { video?: { url?: string }; url?: string; output?: { video?: { url?: string } } };
      return { url: r.video?.url || r.output?.video?.url || r.url || null, terminal: true };
    }
    if (status === "FAILED" || status === "ERROR") return { url: null, terminal: true };
    return { url: null, terminal: false };
  } catch { return { url: null, terminal: false }; }
}
