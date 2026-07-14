import { getSecret } from "../connections";

// fal.ai - OmniHuman 1.5: image + audio → a fully-animated talking influencer, lip-synced to the
// SUPPLIED audio (so it uses OUR locked ElevenLabs voice, unlike Veo which makes its own voice).
// Best-in-class lip-sync + character animation for a-roll. Uses fal's standard queue API.
const FAL_QUEUE = "https://queue.fal.run";
// Only honour the env override if it actually looks like a fal model id (contains "/"). Guards
// against an API key being pasted into FAL_OMNIHUMAN_MODEL by mistake (keys are "id:secret").
const _envModel = process.env.FAL_OMNIHUMAN_MODEL;
const OMNIHUMAN_MODEL = _envModel && _envModel.includes("/") && !_envModel.includes(":") ? _envModel : "fal-ai/bytedance/omnihuman/v1.5";

async function key(): Promise<string | null> {
  return (await getSecret("fal")) || process.env.FAL_KEY || process.env.FAL_API_KEY || null;
}

export async function falConnected(): Promise<boolean> {
  return !!(await key());
}

// Verify the connected key + that the OmniHuman model is reachable, WITHOUT spending: an empty
// submit returns a 422/400 validation error if auth is good, or 401/403 if the key is wrong.
export async function verifyFal(): Promise<{ connected: boolean; ok: boolean; status: number | null; detail: string }> {
  const k = await key();
  if (!k) return { connected: false, ok: false, status: null, detail: "fal.ai is not connected - paste your key under Connect Tools." };
  try {
    // Send structurally-valid but unfetchable URLs - proves the route + auth without generating
    // (fal can't fetch them, so it validation-fails for free; an empty body falsely 404s).
    const res = await fetch(`${FAL_QUEUE}/${OMNIHUMAN_MODEL}`, { method: "POST", headers: { Authorization: `Key ${k}`, "Content-Type": "application/json" }, body: JSON.stringify({ image_url: "https://example.com/_falcheck.jpg", audio_url: "https://example.com/_falcheck.mp3" }), signal: AbortSignal.timeout(20000) });
    const txt = (await res.text()).slice(0, 220);
    if (res.status === 401 || res.status === 403) return { connected: true, ok: false, status: res.status, detail: `fal.ai rejected the request (${res.status}). Common causes: no payment method/credits on the fal account, an inactive/restricted key, or a wrong key value. fal said: ${txt || "(no message)"}` };
    if (res.status === 404) return { connected: true, ok: false, status: 404, detail: `Model path not found: ${OMNIHUMAN_MODEL}. Set FAL_OMNIHUMAN_MODEL to the correct id.` };
    if (res.ok || res.status === 422 || res.status === 400) return { connected: true, ok: true, status: res.status, detail: res.ok ? "✅ Key valid + OmniHuman reachable (a no-op test job was accepted and will fail validation harmlessly)." : `✅ Key valid + OmniHuman (${OMNIHUMAN_MODEL}) reachable.` };
    return { connected: true, ok: false, status: res.status, detail: `Unexpected response ${res.status}: ${txt}` };
  } catch (e) { return { connected: true, ok: false, status: null, detail: `Could not reach fal.ai: ${String((e as Error)?.message || e).slice(0, 160)}` }; }
}

// Submit an OmniHuman job; returns the queue handles for durable polling (or an error if fal isn't
// connected / the submit failed - caller can then fall back to another engine).
export async function submitOmniHuman(opts: { imageUrl: string; audioUrl: string; prompt?: string }): Promise<{ statusUrl: string | null; responseUrl: string | null; error: string | null }> {
  const k = await key();
  if (!k) return { statusUrl: null, responseUrl: null, error: "fal.ai not connected" };
  try {
    const res = await fetch(`${FAL_QUEUE}/${OMNIHUMAN_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${k}`, "Content-Type": "application/json" },
      // 720p is faster AND higher quality than 1080p per fal's docs. turbo_mode trades fidelity for
      // speed - DEFAULT OFF now (the producer wants hyper-realism over speed). Set FAL_OMNIHUMAN_TURBO=1
      // to trade back for speed. Both env-tunable (FAL_OMNIHUMAN_RES / FAL_OMNIHUMAN_TURBO).
      body: JSON.stringify({
        image_url: opts.imageUrl,
        audio_url: opts.audioUrl,
        resolution: process.env.FAL_OMNIHUMAN_RES || "720p",
        turbo_mode: process.env.FAL_OMNIHUMAN_TURBO === "1",
        ...(opts.prompt ? { prompt: opts.prompt.slice(0, 1500) } : {}),
      }),
      signal: AbortSignal.timeout(30000),
    });
    const txt = await res.text();
    if (!res.ok) return { statusUrl: null, responseUrl: null, error: `omnihuman submit ${res.status}: ${txt.slice(0, 180)}` };
    const data = JSON.parse(txt) as { status_url?: string; response_url?: string; request_id?: string };
    // fal's queue request URLs use the APP namespace ("fal-ai/bytedance"), not the full model path -
    // so build the fallback from the first two id segments. (We prefer fal's returned URLs anyway.)
    const appNs = OMNIHUMAN_MODEL.split("/").slice(0, 2).join("/");
    const base = `${FAL_QUEUE}/${appNs}/requests/${data.request_id || ""}`;
    const statusUrl = data.status_url || (data.request_id ? `${base}/status` : null);
    const responseUrl = data.response_url || (data.request_id ? base : null);
    if (!statusUrl || !responseUrl) return { statusUrl: null, responseUrl: null, error: `omnihuman: no request handle: ${txt.slice(0, 160)}` };
    return { statusUrl, responseUrl, error: null };
  } catch (e) {
    return { statusUrl: null, responseUrl: null, error: String((e as Error)?.message || e).slice(0, 180) };
  }
}

// One quick status check for durable step.sleep polling. Returns the video url + billed duration
// (seconds) when COMPLETED, so Cost Control can meter OmniHuman at its true per-second rate.
export async function pollOmniHumanOnce(statusUrl: string, responseUrl: string): Promise<{ url: string | null; terminal: boolean; seconds: number | null }> {
  const k = await key();
  if (!k) return { url: null, terminal: true, seconds: null };
  try {
    const sres = await fetch(statusUrl, { headers: { Authorization: `Key ${k}` }, cache: "no-store" });
    if (!sres.ok) return { url: null, terminal: false, seconds: null };
    const status = String(((await sres.json()) as { status?: string }).status || "").toUpperCase();
    if (status === "COMPLETED") {
      const rres = await fetch(responseUrl, { headers: { Authorization: `Key ${k}` }, cache: "no-store" });
      if (!rres.ok) return { url: null, terminal: true, seconds: null };
      const r = (await rres.json()) as { video?: { url?: string; duration?: number }; url?: string; duration?: number; output?: { video?: { url?: string } } };
      const seconds = Number(r.duration ?? r.video?.duration) || null;
      return { url: r.video?.url || r.output?.video?.url || r.url || null, terminal: true, seconds };
    }
    if (status === "FAILED" || status === "ERROR") return { url: null, terminal: true, seconds: null };
    return { url: null, terminal: false, seconds: null };
  } catch { return { url: null, terminal: false, seconds: null }; }
}

// BACKGROUND REMOVAL — the cut-out.
//
// MoMo's masthead and section-1 creatives are a cut-out subject composited on the yellow disc. The subject is
// GENERATED, so it arrives with a background that has to come off cleanly.
//
// Edge quality is not cosmetic here. It is the fraud-differentiator: Stanford's credibility work found visual
// design drives ~46% of trust judgements, and in a market where the thing our ad most resembles is a scam, a
// ragged 0px magic-wand edge reads as counterfeit. BiRefNet gives a genuine alpha matte with soft hair edges,
// which a chroma key cannot.
const REMBG_MODEL = process.env.FAL_REMBG_MODEL || "fal-ai/birefnet/v2";

export async function removeBackground(imageUrl: string): Promise<{ url: string | null; error: string | null }> {
  const k = await key();
  if (!key) return { url: null, error: "fal is not connected" };
  try {
    const res = await fetch(`https://fal.run/${REMBG_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, output_format: "png" }), // PNG: alpha survives
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await res.json().catch(() => ({}))) as { image?: { url?: string }; detail?: unknown };
    const url = data?.image?.url || null;
    if (url) return { url, error: null };
    return { url: null, error: `background removal ${res.status}: ${JSON.stringify(data?.detail ?? data).slice(0, 160)}` };
  } catch (e) {
    return { url: null, error: String((e as Error)?.message || e).slice(0, 180) };
  }
}
