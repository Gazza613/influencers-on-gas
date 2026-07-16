import { imageSize } from "image-size";
import { getValidHFAccessToken } from "../hf-token";
import { isSafePublicUrl } from "../safe-url";

// Server-side Higgsfield MCP client (ported from the proven Vite integration).
// Calls mcp.higgsfield.ai directly with the centralized OAuth bearer token.
const MCP_URL = "https://mcp.higgsfield.ai/mcp";

const TERMINAL = new Set(["completed", "done", "failed", "error", "cancelled", "rejected", "nsfw", "content_filtered", "not_found"]);

function parseSSE(text: string): unknown {
  let resultEvent: unknown = null;
  let lastNonNull: unknown = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const raw = t.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const d = JSON.parse(raw);
      if (d !== null) { lastNonNull = d; if (d.result !== undefined) resultEvent = d; }
    } catch {}
  }
  return resultEvent ?? lastNonNull;
}

type AnyObj = Record<string, unknown>;

function unwrapMCP(result: AnyObj | null | undefined): AnyObj | string | null {
  if (!result?.content) return result ?? null;
  for (const item of result.content as AnyObj[]) {
    if (item.text) { try { return JSON.parse(item.text as string); } catch { return item.text as string; } }
  }
  return result;
}

function extractJobIds(result: AnyObj): string[] {
  const data = unwrapMCP(result) as AnyObj | string | null;
  if (data && typeof data === "object") {
    const d = data as AnyObj;
    if (Array.isArray(d.results)) {
      const ids = (d.results as AnyObj[]).map((r) => (r?.id || r?.job_id) as string).filter((id) => id?.length >= 8);
      if (ids.length) return ids;
    }
    if (d.job_id) return [d.job_id as string];
    if (typeof d.id === "string" && d.id.length >= 8) return [d.id];
  }
  const str = typeof data === "string" ? data : JSON.stringify(data ?? "");
  return [...new Set(str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [])];
}

function extractImageUrls(result: AnyObj): string[] {
  const data = unwrapMCP(result) as AnyObj | string | null;
  if (data && typeof data === "object" && Array.isArray((data as AnyObj).results)) {
    const urls = ((data as AnyObj).results as AnyObj[])
      .map((r) => { const rr = r?.results as AnyObj | undefined; return (rr?.rawUrl || rr?.minUrl || r?.result_url) as string; })
      .filter(Boolean);
    if (urls.length) return [...new Set(urls)];
  }
  const str = typeof data === "string" ? data : JSON.stringify(data);
  const byExt = (str.match(/https:\/\/[^\s"\\]+\.(?:jpg|jpeg|png|webp)(?:[^\s"\\]*)?/g) || []).map((u) => u.replace(/[\\}"',]+$/, ""));
  if (byExt.length) return [...new Set(byExt)];
  const byCDN = (str.match(/https:\/\/[a-z0-9]+\.cloudfront\.net\/[^\s"'\\}]*/gi) || []).map((u) => u.replace(/[\\}"',]+$/, ""));
  return [...new Set(byCDN)];
}

async function rawPost(token: string, sessionId: string | null, body: AnyObj): Promise<{ parsed: AnyObj; sid: string | null }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Higgsfield MCP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const sid = res.headers.get("Mcp-Session-Id");
  const ct = res.headers.get("content-type") || "";
  const txt = await res.text();
  const parsed = (ct.includes("text/event-stream") || txt.trimStart().startsWith("data:") ? parseSSE(txt) : JSON.parse(txt)) as AnyObj;
  return { parsed, sid };
}

// Open an MCP session and return a bound tool-caller.
async function openSession() {
  const token = await getValidHFAccessToken();
  const init = await rawPost(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "GAS Studio", version: "1.0" } },
  });
  const sid = init.sid;
  const call = async (name: string, args: AnyObj): Promise<AnyObj> => {
    const { parsed } = await rawPost(token, sid, { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } });
    return (parsed?.result ?? parsed) as AnyObj;
  };
  return { call };
}

type Caller = (name: string, args: AnyObj) => Promise<AnyObj>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Poll one generation job until it yields an image URL (or terminal/no-url).
//
// sync:true is REQUIRED for us. Higgsfield's own response says so: "In text-only clients, use job_status with
// sync:true to poll for completion" - without it the status call returns immediately as still-running and we
// fall through to a bogus "no image back" even though the job succeeds. This bit the 4K masthead retheme.
async function pollJob(call: Caller, jobId: string, rounds = 60): Promise<string | null> {
  for (let round = 0; round < rounds; round++) {
    if (round) await sleep(3000);
    try {
      const data = unwrapMCP(await call("job_status", { jobId, sync: true })) as AnyObj;
      const item = (Array.isArray(data?.results) ? (data.results as AnyObj[])[0] : data) as AnyObj;
      const ro = (item?.results as AnyObj) || {};
      const url = (ro.rawUrl || ro.minUrl || item?.result_url || item?.url || extractImageUrls(data)[0]) as string | undefined;
      const status = String(item?.status || data?.status || "").toLowerCase();
      if (url) return url;
      if (TERMINAL.has(status)) return null;
    } catch { /* transient - retry */ }
  }
  return null;
}

// Launch one generate_image and resolve to { jobId, url }.
async function generateOneJob(call: Caller, base: AnyObj, prompt: string): Promise<{ jobId: string | null; url: string | null }> {
  const r = await call("generate_image", { params: { ...base, prompt } });
  const jobId = extractJobIds(r)[0] ?? null;
  let url: string | null = extractImageUrls(r)[0] ?? null;
  if (!url && jobId) url = await pollJob(call, jobId);
  return { jobId, url };
}

// Import an HTTPS media URL into Higgsfield storage → media_id.
async function importMedia(call: Caller, url: string, type: "image" | "audio" | "video" = "image"): Promise<string | null> {
  const data = unwrapMCP(await call("media_import_url", { url, type }));
  const str = typeof data === "string" ? data : JSON.stringify(data ?? "");
  const m = str.match(/"media_id"\s*:\s*"([^"]+)"/) || str.match(/"id"\s*:\s*"([0-9a-f-]{8,})"/i) || str.match(UUID_RE);
  return m ? m[1] || m[0] : null;
}

// Create a reusable face Element from a hero frame → element_id (used as <<<id>>>
// in later prompts to lock the same identity). Tries image_job, falls back to import.
async function createElement(call: Caller, jobId: string | null, url: string, name: string): Promise<string | null> {
  const tryCreate = async (medias: AnyObj[]): Promise<string | null> => {
    const data = unwrapMCP(await call("show_reference_elements", { action: "create", category: "auto", name, medias }));
    const str = typeof data === "string" ? data : JSON.stringify(data ?? "");
    const m = str.match(/"element_id"\s*:\s*"([0-9a-f-]{8,})"/i) || str.match(/"id"\s*:\s*"([0-9a-f-]{8,})"/i) || str.match(UUID_RE);
    return m ? m[1] || m[0] : null;
  };
  if (jobId) { try { const id = await tryCreate([{ type: "image_job", id: jobId }]); if (id) return id; } catch { /* fall through */ } }
  const mediaId = await importMedia(call, url).catch(() => null);
  if (mediaId) { try { return await tryCreate([{ type: "media_input", id: mediaId, url }]); } catch { /* give up */ } }
  return null;
}

function baseParams(model: string, aspectRatio: string): AnyObj {
  const base = { model, aspect_ratio: aspectRatio, count: 1 };
  // Each model takes a different quality param. Nano Banana (pro/2/base) use `resolution`
  // (1k/2k/4k, default 1k!) - sending `quality` is ignored and leaves them at 1k. GPT Image
  // uses `quality`. Default everything else to a 2k quality.
  if (model.startsWith("nano_banana")) return { ...base, resolution: "2k" };
  if (model === "gpt_image_2" || model === "gpt_image") return { ...base, quality: "high" };
  return { ...base, quality: "2k" };
}

// Generate ONE hero face. Returns { jobId, url } (url may be null on failure).
export async function generateHero(prompt: string, model = "gpt_image_2", aspectRatio = "9:16"): Promise<{ jobId: string | null; url: string | null }> {
  const { call } = await openSession();
  return generateOneJob(call, baseParams(model, aspectRatio), prompt);
}

// Create a reusable face Element from a hero frame → element_id (or null).
export async function createFaceElement(jobId: string | null, url: string, name: string): Promise<string | null> {
  const { call } = await openSession();
  try { return await createElement(call, jobId, url, name); } catch { return null; }
}

// Generate one same-person variation, locked to the Element if present (else plain).
export async function generateVariation(elementId: string | null, basePrompt: string, variation: string, model = "gpt_image_2", aspectRatio = "9:16"): Promise<string | null> {
  const { call } = await openSession();
  const prompt = elementId ? `<<<${elementId}>>> ${variation}` : `${basePrompt}. ${variation}`;
  const { url } = await generateOneJob(call, baseParams(model, aspectRatio), prompt);
  return url;
}

// Generate many prompts CONCURRENTLY in one session: launch every job up front, then
// poll them all in parallel. Wall-clock ≈ a single image, not the sum. Returns URLs
// aligned to `prompts` (null where a job failed). Used for fast casting + coverage sets.
// Bound concurrent generations so parallel formats don't overwhelm Higgsfield (which
// silently drops jobs under heavy concurrency). Module-level, per function invocation.
let _active = 0;
const _queue: (() => void)[] = [];
// How many image generations run at once. Higher = faster photoshoots/boards/creatives; the
// per-image retry + self-healing fallback covers the occasional dropped job at higher concurrency.
// Env-tunable so we can dial it without a deploy if Higgsfield starts throttling.
const MAX_CONCURRENT = Math.max(2, Math.min(10, Number(process.env.HF_MAX_CONCURRENT) || 7));
async function acquireSlot(): Promise<void> {
  if (_active < MAX_CONCURRENT) { _active++; return; }
  await new Promise<void>((res) => _queue.push(res));
  _active++;
}
function releaseSlot(): void { _active = Math.max(0, _active - 1); const next = _queue.shift(); if (next) next(); }

export async function generateBatch(prompts: string[], model = "gpt_image_2", aspectRatio = "9:16", extra: AnyObj = {}, fallbackModel: string | null = null): Promise<(string | null)[]> {
  return (await generateBatchDetailed(prompts, model, aspectRatio, extra, fallbackModel)).map((r) => r.url);
}

// Same as generateBatch but returns the failure REASON per prompt (raw Higgsfield response or
// error), so the UI can show why a shot did not render instead of a generic "no image".
// `fallbackModel`: if the primary model yields no image (e.g. an unknown model id, or an
// aspect it rejects), retry once on a known-good model so a model swap can never hard-break.
export async function generateBatchDetailed(prompts: string[], model = "gpt_image_2", aspectRatio = "9:16", extra: AnyObj = {}, fallbackModel: string | null = null): Promise<{ url: string | null; error: string | null; model: string }[]> {
  const run = async (p: string, mdl: string): Promise<{ url: string | null; error: string | null; model: string }> => {
    const base = { ...baseParams(mdl, aspectRatio), ...extra };
    const { call } = await openSession();
    const r = await call("generate_image", { params: { ...base, prompt: p } });
    let url: string | null = extractImageUrls(r)[0] ?? null;
    const jobId = extractJobIds(r)[0] ?? null;
    if (!url && jobId) url = await pollJob(call, jobId);
    if (url) return { url, error: null, model: mdl };
    const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
    return { url: null, error: `no image [${mdl} ${aspectRatio}]: ${raw}`.slice(0, 280), model: mdl };
  };
  const once = (p: string, mdl: string) => run(p, mdl).catch((e) => ({ url: null as string | null, error: `[${mdl}] ${String((e as Error)?.message || e)}`.slice(0, 280), model: mdl }));
  // Each prompt gets its OWN MCP session; concurrency is capped so jobs aren't dropped.
  // `model` in the result is the model that actually produced the image (or the last tried),
  // so callers meter the REAL model when the self-healing fallback kicks in.
  return Promise.all(prompts.map(async (p) => {
    await acquireSlot();
    try {
      let res = await once(p, model);
      if (!res.url) res = await once(p, model); // one transient retry on the primary model
      if (!res.url && fallbackModel && fallbackModel !== model) res = await once(p, fallbackModel); // self-heal to a known-good model
      return res;
    } finally { releaseSlot(); }
  }));
}

// Preflight the credit cost of a model WITHOUT generating (get_cost:true). Returns the
// raw unwrapped response so we can read whatever cost field Higgsfield provides.
export async function previewImageCost(model: string, prompt = "portrait of a woman, photorealistic", aspectRatio = "9:16"): Promise<unknown> {
  const { call } = await openSession();
  const base = baseParams(model, aspectRatio);
  return unwrapMCP(await call("generate_image", { params: { ...base, prompt, get_cost: true } }));
}

// Train a reusable Soul identity from 5-20 reference images. Returns the soul_id
// (training runs ~10 min server-side; poll soulStatus). show_characters action=train.
export async function trainSoul(opts: { name: string; images: string[]; type?: string }): Promise<string> {
  const { name, images, type = "soul_2" } = opts;
  const { call } = await openSession();
  const res = await call("show_characters", { action: "train", type, name, images });
  const data = unwrapMCP(res);
  const str = typeof data === "string" ? data : JSON.stringify(data ?? "");
  const m =
    str.match(/"soul_id"\s*:\s*"([^"]+)"/) ||
    str.match(/"(?:character_id|id)"\s*:\s*"([0-9a-f-]{8,})"/i) ||
    str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) throw new Error("No soul_id in train response: " + str.slice(0, 220));
  return m[1] || m[0];
}

// Poll a Soul's training status → 'ready' | 'training' | 'failed'.
export async function soulStatus(soulId: string): Promise<string> {
  const { call } = await openSession();
  const data = unwrapMCP(await call("show_characters", { action: "status", soul_id: soulId }));
  const str = typeof data === "string" ? data : JSON.stringify(data ?? "");
  const m = str.match(/"(?:status|state)"\s*:\s*"(ready|training|failed)"/i);
  if (m) return m[1].toLowerCase();
  if (/\bfailed\b/i.test(str)) return "failed";
  if (/\bready\b/i.test(str)) return "ready";
  return "training";
}

// Pull a credit number out of any account/plan response. Prefers "remaining"-type
// keys, then credit/balance/available, so we report what's left, not the allotment.
function parseCredits(data: unknown): number | null {
  const str = typeof data === "string" ? data : JSON.stringify(data ?? "");
  // Handles plain text ("Credits: 6658.93 | Plan: ultra") and JSON ("credits": 6658).
  const patterns = [
    /\bremaining[a-z_ ]*["']?\s*[:=]\s*["']?([0-9][0-9,.]*)/i,
    /\bcredits?\b["']?\s*[:=]\s*["']?([0-9][0-9,.]*)/i,
    /\bbalance[a-z_ ]*["']?\s*[:=]\s*["']?([0-9][0-9,.]*)/i,
    /\bavailable[a-z_ ]*["']?\s*[:=]\s*["']?([0-9][0-9,.]*)/i,
  ];
  for (const re of patterns) {
    const m = str.match(re);
    if (m) { const v = Math.round(Number(m[1].replace(/,/g, ""))); if (!Number.isNaN(v)) return v; }
  }
  return null;
}

// Live credit balance (ground truth). Discovers the account/credit tool dynamically
// (names vary) and parses flexibly. Returns rich debug (tool list + raw samples).
export async function getBalance(): Promise<{ remaining: number | null; raw?: unknown; tried?: string[]; samples?: { tool: string; raw: string }[] }> {
  const { call } = await openSession();
  // The `balance` tool returns e.g. "Credits: 6658.93 | Plan: ultra"; try it first.
  const candidates = ["balance", "show_plans_and_credits", "transactions"];

  const tried: string[] = [];
  const samples: { tool: string; raw: string }[] = [];
  for (const tool of candidates) {
    try {
      const data = unwrapMCP(await call(tool, {}));
      tried.push(tool);
      const str = typeof data === "string" ? data : JSON.stringify(data ?? "");
      samples.push({ tool, raw: str.slice(0, 220) });
      const n = parseCredits(data);
      if (n != null) return { remaining: n, raw: data, tried, samples };
    } catch (e) {
      samples.push({ tool, raw: "ERR " + String((e as Error)?.message || e).slice(0, 120) });
    }
  }
  return { remaining: null, tried, samples };
}

// Generic one-shot MCP tool call (diagnostics / model catalog lookups).
export async function callMcp(name: string, args: AnyObj): Promise<unknown> {
  const { call } = await openSession();
  return unwrapMCP(await call(name, args));
}

// Keep only URLs that actually load (drops broken/expired image URLs). One retry with a
// short wait covers CDN eventual-consistency right after generation.
export async function filterLoadable(urls: string[]): Promise<string[]> {
  const ok = async (u: string): Promise<boolean> => {
    for (let i = 0; i < 2; i++) {
      try {
        // HEAD is cheap (no body); fall back to GET if HEAD isn't allowed.
        let r = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(6000) });
        if (r.status === 405 || r.status === 501) r = await fetch(u, { method: "GET", signal: AbortSignal.timeout(8000) });
        if (r.ok) return true;
      } catch { /* retry */ }
      if (i === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  };
  const results = await Promise.all(urls.map(ok));
  return urls.filter((_, i) => results[i]);
}

// Import a public image URL into Higgsfield → media_id (for use as a generation reference).
export async function importMediaUrl(url: string): Promise<string | null> {
  if (!isSafePublicUrl(url)) return null; // SSRF guard: only fetch public https URLs
  const { call } = await openSession();
  return importMedia(call, url).catch(() => null);
}

// Native Higgsfield upscale (bytedance) → 2K/4K. Imports the URL, reads its dimensions,
// submits the upscale, polls for the result. Replaces the external Magnific upscaler.
export async function upscaleUrlTo(url: string, resolution: "2k" | "4k" = "4k", rounds = 60): Promise<string | null> {
  return (await upscaleUrlToDetailed(url, resolution, rounds)).url;
}

// As upscaleUrlTo but returns the failure REASON so callers can surface why an upscale failed.
export async function upscaleUrlToDetailed(url: string, resolution: "2k" | "4k" = "4k", rounds = 60): Promise<{ url: string | null; error: string | null }> {
  if (!isSafePublicUrl(url)) return { url: null, error: "unsafe or non-public image url" };
  let width = 0, height = 0;
  try {
    const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(15000) })).arrayBuffer());
    const d = imageSize(buf);
    width = d.width || 0; height = d.height || 0;
  } catch { /* dims unknown */ }
  const imageId = await importMediaUrl(url);
  if (!imageId) return { url: null, error: "could not import the image into Higgsfield (media_import_url returned no id)" };
  if (!width || !height) return { url: null, error: "could not read the image dimensions" };
  const { call } = await openSession();
  const r = await call("upscale_image", { params: { provider: "bytedance", image_id: imageId, width, height, resolution } });
  let out: string | null = extractImageUrls(r)[0] ?? null;
  const jobId = extractJobIds(r)[0] ?? null;
  if (!out && jobId) out = await pollJob(call, jobId, rounds);
  if (out) return { url: out, error: null };
  const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
  return { url: null, error: `upscale no image [src ${width}x${height} ${resolution}]: ${raw}`.slice(0, 300) };
}

// THE HUMANISER pass: re-render an image through Nano Banana Pro using ITSELF as the reference,
// changing ONLY the skin so it reads real (kills the plastic/airbrushed look the upscaler bakes in).
// Identity + composition are held by feeding the image as the @image1 reference. Best-effort.
export async function humaniseUrl(url: string, opts: { prompt: string; ratio?: string; resolution?: "2k" | "4k" }): Promise<string | null> {
  if (!isSafePublicUrl(url)) return null;
  const imageId = await importMediaUrl(url);
  if (!imageId) return null;
  const { call } = await openSession();
  const ar = opts.ratio === "1:1" ? "1:1" : opts.ratio === "16:9" ? "16:9" : (opts.ratio || "9:16");
  const params: AnyObj = {
    ...baseParams("nano_banana_pro", ar),
    prompt: `@image1 is the finished photograph. Reproduce it EXACTLY and identically: the same person and likeness, the same face, pose, framing and crop, the same wardrobe, lighting, colour and background, the same composition pixel-for-pixel. Change ONLY the skin so it reads as a real photograph and never plastic: ${opts.prompt} Do not restyle, recolour, reframe, beautify or move anything else.`,
    medias: [{ value: imageId, role: "image" }],
  };
  if (opts.resolution) params.resolution = opts.resolution;
  const r = await call("generate_image", { params });
  let out: string | null = extractImageUrls(r)[0] ?? null;
  const jobId = extractJobIds(r)[0] ?? null;
  if (!out && jobId) out = await pollJob(call, jobId, 60);
  return out;
}

// EDIT THIS SHOT (forensic image-to-image): reproduce a finished creative EXACTLY - same person, location,
// pose, framing, lighting and grade - and change ONLY the one thing the producer asks (e.g. "make her dress
// bright MTN-yellow"). This is the targeted iterate: keep everything you love, change one detail.
export async function editImageUrl(url: string, opts: { instruction: string; ratio?: string; resolution?: "2k" | "4k" }): Promise<string | null> {
  if (!isSafePublicUrl(url)) return null;
  const imageId = await importMediaUrl(url);
  if (!imageId) return null;
  const { call } = await openSession();
  const ar = opts.ratio === "1:1" ? "1:1" : opts.ratio === "16:9" ? "16:9" : (opts.ratio || "9:16");
  const params: AnyObj = {
    ...baseParams("nano_banana_pro", ar),
    prompt: `@image1 is the finished photograph. Reproduce it EXACTLY and identically: the SAME person and likeness, the same face, the same pose, framing and crop, the same LOCATION and background, the same lighting, colour grade and composition - pixel-for-pixel. Change ONLY this one thing, seamlessly and photorealistically: ${opts.instruction}. Everything else stays identical - do NOT move, restyle, reframe, relight, beautify or alter anything the edit did not ask for, and keep the exact same background/location. Keep it a real, natural photograph, never plastic or over-rendered.`,
    medias: [{ value: imageId, role: "image" }],
  };
  if (opts.resolution) params.resolution = opts.resolution;
  const r = await call("generate_image", { params });
  let out: string | null = extractImageUrls(r)[0] ?? null;
  const jobId = extractJobIds(r)[0] ?? null;
  if (!out && jobId) out = await pollJob(call, jobId, 60);
  return out;
}

// 3D-IFY A DEAL CARD (Gary's prompt, tightened). Turns a FLAT intake deal card into the premium 3D extruded
// badge the reference designs use, so a composited card sits as richly on the creative as MoMo's own devices.
//
// THIS IS AN ASSET-PREP STEP, NEVER A PER-RENDER ONE. The entire reason compositing real deal cards works is
// that no AI touches the price. Running this during a build would hand the price back to the model on every
// generate - exactly the garble ("Unlimited R20") we removed. So: convert ONCE, a human approves the text, the
// approved artwork is saved, and from then on we composite that fixed asset forever.
//
// Text fidelity is the only real failure mode, so it is called out hard.
export async function make3dDealCard(url: string, opts: { yaw?: number } = {}): Promise<{ url: string | null; error: string | null }> {
  if (!isSafePublicUrl(url)) return { url: null, error: "deal card url is not a safe public url" };
  try {
    const imageId = await importMediaUrl(url);
    if (!imageId) return { url: null, error: "could not import the deal card into Higgsfield" };
    const { call } = await openSession();
    const yaw = typeof opts.yaw === "number" ? opts.yaw : -10;
    const params: AnyObj = {
      ...baseParams("nano_banana_pro", "1:1"),
      prompt:
        `Use @image1 as the EXACT source artwork. Convert it into a premium 3D extruded badge while preserving ` +
        `the original design, colours, typography, layout, proportions, logos and all readable text exactly as ` +
        `supplied. Do not redesign the artwork. ` +
        `\n\nApply a 3D transform with X-axis rotation 0 degrees, Y-axis rotation ${yaw} degrees, Z-axis rotation ` +
        `0 degrees - a slight perspective angle, the badge still upright, front-facing enough and fully readable. ` +
        `Add realistic extrusion thickness, bevelled edges, subtle 3D depth, soft glossy highlights, a premium ` +
        `acrylic/plastic material finish, clean studio lighting and a soft realistic shadow. ` +
        `\n\nTEXT FIDELITY IS CRITICAL: reproduce EVERY character of the price, the data amount and the validity ` +
        `line EXACTLY as supplied - do not re-typeset, re-letter, re-space, re-word or alter any number, letter ` +
        `or symbol. If a character is unclear, keep it as it is. Keep the yellow bold. ` +
        `\n\nKeep the original colour palette accurate. Transparent or plain neutral background. Preserve ` +
        `spacing, corner radius and overall proportions. Do NOT change the text, add new text, remove elements, ` +
        `crop the card, warp typography, distort logos, add extra icons, add a scene background, or rotate on ` +
        `the Z axis.`,
      medias: [{ value: imageId, role: "image" }],
      resolution: "4k",
    };
    const r = await call("generate_image", { params });
    let out: string | null = extractImageUrls(r)[0] ?? null;
    const jobId = extractJobIds(r)[0] ?? null;
    if (!out && jobId) out = await pollJob(call, jobId, 100);
    if (out) return { url: out, error: null };
    if (jobId) return { url: null, error: "the 3D render started but did not finish in time - try again" };
    const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
    return { url: null, error: `no image back: ${raw}`.slice(0, 240) };
  } catch (e) {
    return { url: null, error: String((e as Error)?.message || e).slice(0, 200) };
  }
}

// FORENSIC RETHEME (Gary's exact ask): "select this image, change ONLY the bottom copy and the promo pill copy
// to the campaign theme, everything else forensically remains - including that yellow line under the callout."
//
// This is a surgical text/people edit of the REAL reference, not a rebuild. We hold EVERYTHING (people unless a
// change asks otherwise, background, the signature swish, the logo, the layout, the fonts, colours and every
// graphic detail like the yellow underline) and apply only the listed changes, matched to the design's own
// style so the new words look native. This is the "any image platform" behaviour Gary wants.
export async function forensicRetheme(url: string, opts: { changes: string[]; ratio?: string; resolution?: "2k" | "4k"; solidBackground?: boolean }): Promise<{ url: string | null; error: string | null }> {
  if (!isSafePublicUrl(url)) return { url: null, error: "reference url is not a safe public url" };
  const changeList = opts.changes.map((c) => c.trim()).filter(Boolean);
  if (!changeList.length) return { url: null, error: "no changes given" };
  try {
    const imageId = await importMediaUrl(url);
    if (!imageId) return { url: null, error: "could not import the reference into Higgsfield" };
    const { call } = await openSession();
    const ar = opts.ratio || "1:1";
    const changes = changeList.map((c, i) => `${i + 1}. ${c}`).join("  ");
    const params: AnyObj = {
      ...baseParams("nano_banana_pro", ar),
      prompt:
        // HARD RULE, STATED FIRST. Gary: "the subject only ever has 1 handset if a handset is used." Buried at
        // the end of a long prompt this kept losing - the model gave her a phone to look at AND one to hold up.
        `HARD RULE - ONE HANDSET ONLY: the ENTIRE image contains AT MOST ONE phone. If a person holds a phone, ` +
        `that is the ONLY phone in the whole frame - they do NOT also look at a second phone, hold one to their ` +
        `ear, rest one nearby, or have one floating. If @image1 already contains a phone, keep that ONE and never ` +
        `add another. Before you finish, count the phones: the answer must be one, or none. Two phones is a ` +
        `defect and the image is wrong. ` +
        `\n\n@image1 is a FINISHED MTN MoMo advert. Reproduce it EXACTLY and identically, pixel-for-pixel: the SAME ` +
        `people and faces, the SAME poses and framing, the SAME background and scene, the SAME signature curved ` +
        `light SWISH / glowing ribbons, the SAME layout and spacing, the SAME fonts, sizes, ` +
        `weights, colours and EVERY graphic detail - including any yellow underline, rule or banner. ` +
        // THE LOGO IS THE ONE EXCEPTION. We stamp the real lockup on afterwards (stampRealLogo). If the model
        // also draws one it lands at a slightly different size/position and we get TWO overlapping logos - the
        // garbled "MoMo/MoMo from MTN/from HTN" mess. So the model must leave that corner empty.
        `\n\nCRITICAL EXCEPTION - THE LOGO: do NOT draw, reproduce, redraw or include the MoMo logo or wordmark ` +
        `ANYWHERE in the image. Leave the area where the logo sits as clean, plain background or photograph with ` +
        `NO logo, NO badge, NO icon and NO lettering of any kind there. The real logo is composited on top ` +
        `afterwards, so any logo you draw is a defect. ` +
        // Disc creatives (masthead / section 1) sit on a SOLID funnel colour. "Change the people" otherwise
        // invites the model to invent a room behind them, which breaks the Webflow background match.
        (opts.solidBackground
          ? `\n\nTHE BACKGROUND IS A SOLID FLAT COLOUR: keep it EXACTLY that same solid colour, edge to edge, ` +
            `behind everything. Do NOT add a room, home, street, window, furniture, scenery or ANY environment ` +
            `behind the people - they stand against the flat colour with the yellow disc, exactly as in @image1.`
          : "") +
        `\n\nChange ONLY the following, and change NOTHING else at all: ${changes} ` +
        `\n\nFor any text you change, match the ORIGINAL's exact font, weight, size, position, alignment and ` +
        `colour so the new words look native to the design (MoMo headlines are usually a white line then a ` +
        `yellow line; keep any yellow underline beneath the headline exactly where it is). Do NOT move, restyle, ` +
        `relight, recolour, regenerate, add or remove anything the changes did not explicitly ask for. Keep it a ` +
        `real, natural photograph, never plastic or over-rendered, sharp and high-resolution. ` +
        // Anatomy + phone guardrail. Changing the people re-renders hands, and this model reliably grows a
        // second phone or a floating hand if it is not told not to (Gary: "double hands").
        `\n\nANATOMY - NON-NEGOTIABLE: every person has exactly one head, two arms and two hands, each hand ` +
        `properly ATTACHED to a visible arm, with natural fingers in correct proportion. There must be ZERO ` +
        `extra, floating, disembodied or duplicated hands, arms or fingers anywhere in the frame. THE PHONE: ` +
        `keep exactly ONE phone in the whole image - the same one @image1 has. A person does NOT hold a second ` +
        `phone, and does not hold one to their ear while holding another. Count the hands and the phones before ` +
        `you finish, and remove anything that does not belong to a real person in the scene.`,
      medias: [{ value: imageId, role: "image" }],
      resolution: opts.resolution || "4k",
    };
    const r = await call("generate_image", { params });
    let out: string | null = extractImageUrls(r)[0] ?? null;
    const jobId = extractJobIds(r)[0] ?? null;
    // A 4K retheme of a dense masthead is slow - poll for up to ~7.5 min (the route allows 800s).
    if (!out && jobId) out = await pollJob(call, jobId, 150);
    if (out) return { url: out, error: null };
    // Distinguish "the job ran but did not finish in time" from "the vendor rejected it". Conflating them is
    // what sent Gary a wall of raw MCP text instead of something he could act on.
    if (jobId) return { url: null, error: `The render started but did not finish in time (job ${jobId.slice(0, 8)}). Hit Rerun - it usually lands on a second pass.` };
    const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
    return { url: null, error: `no image back: ${raw}`.slice(0, 280) };
  } catch (e) {
    return { url: null, error: String((e as Error)?.message || e).slice(0, 200) };
  }
}

// FORENSIC BRAND-FURNITURE SWAP. Take a FINISHED reference advert and keep only what makes it MoMo's -
// Gary: "we are only locking in the swish, the logo, the callouts. You can change the scene."
//
// So the LOCK set is deliberately narrow: the light swish, the MoMo logo, and the callouts (deal cards + their
// text). Everything photographic - the person AND the scene around them - is free to change. That is the whole
// value: the Producer puts the right person in the right setting while the brand furniture stays exactly put.
//
// It is still a targeted EDIT of one finished layout, never a "generate in the style of" - which is the lesson
// from the fake-advert run, where too much freedom produced a ghost logo and garbled type.
//
// SKIN. Gary: "humaniser and skin tone needs to be better." The swap prompt pushes hard for real skin, and
// when humanise=true we then run the dedicated Humaniser pass over the result - the same tool that kills the
// plastic look on the influencer side. Returned as a separate stage url so the effect can be judged, not
// assumed.
export async function forensicSwap(url: string, opts: {
  person: string;
  scene?: string;
  ratio?: string;
  resolution?: "2k" | "4k";
  humanise?: boolean;
  /** "scene" = full-bleed slider, change person + scene. "disc" = masthead/section-1, keep the yellow disc
   *  and dark background, swap ONLY the person. The two constructions are fundamentally different: a slider is
   *  a photograph, a masthead is a cut-out figure on a disc, and putting a masthead subject in a scene destroys
   *  the disc, which is the whole signature. */
  construction?: "scene" | "disc";
}): Promise<{ url: string | null; rawUrl: string | null; error: string | null; humanised: boolean }> {
  if (!isSafePublicUrl(url)) return { url: null, rawUrl: null, error: "reference url is not a safe public url", humanised: false };
  const resolution = opts.resolution || "4k"; // clarity: the reference is high-res; match it, do not soften it
  const construction = opts.construction || "scene";
  const skin = `The person must be a REAL South African person photographed on a real camera: authentic skin with ` +
    `visible pores and natural texture and true, even skin tone - never plastic, never waxy, never airbrushed, ` +
    `never an over-smoothed 3D render. Sharp, clean, high-resolution, editorial quality. ` +
    // Anatomy + phone guardrails - from Gary's live notes: a detached arm on one slider, and a phone screen
    // showing a video call of another face.
    `ANATOMY MUST BE PERFECT AND THIS IS NON-NEGOTIABLE: exactly one head, two arms and two hands per person, ` +
    `every hand and finger natural, in proportion and properly ATTACHED to the body, correct number of fingers. ` +
    `There must be NO stray, extra, floating, disembodied or duplicated hand, arm or phone ANYWHERE in the frame. ` +
    `If the design already contains a phone element, KEEP ONLY THAT ONE - do not add a second phone or a second ` +
    `hand holding one. Count the hands: a person holding a phone has two hands total, no more. ` +
    `If a phone is held up, its bright SCREEN faces the viewer showing the MoMo app interface - NEVER the back ` +
    `of the phone, never the camera side, never a blank or dark screen, never a video call of another face.`;
  try {
    const imageId = await importMediaUrl(url);
    if (!imageId) return { url: null, rawUrl: null, error: "could not import the reference into Higgsfield", humanised: false };
    const { call } = await openSession();
    const ar = opts.ratio || "1:1";

    // DISC construction (masthead + section 1): the background is NOT a scene, it is the brand's yellow disc on
    // a dark field. Keep it. Swap only the person, as a cut-out figure standing in front of the disc.
    const discPrompt =
      `@image1 is a FINISHED MTN MoMo advert: a person in front of a big YELLOW DISC on a SOLID background ` +
      `colour, with floating 3D icon bubbles and a light swish around them. ` +
      `\n\nKEEP EXACTLY, unchanged - same shape, size, position and colour: the SOLID BACKGROUND COLOUR (do not ` +
      `change its colour, do not add a room, street, market or any scene), the YELLOW DISC, EVERY floating 3D ` +
      `icon bubble, and the swish. ` +
      `\n\nREMOVE these two things and leave those areas CLEAN (we add real ones afterwards): (a) the LOGO / ` +
      `badge in the top-left corner - leave the top-left corner as plain background, NO logo, NO text there; ` +
      `(b) the CALLOUT PILL / lozenge near the bottom with its words - leave the lower-centre clear of any pill, ` +
      `badge, banner or lettering. Do NOT draw ANY text, logo or callout anywhere - the picture must contain NO ` +
      `words at all. ` +
      `\n\nCHANGE the person to ${person(opts.person)}, at a similar size, position, pose and crop, lit to match, ` +
      `blended naturally into the SAME solid background - NOT cut out, no hard outline, no torn or ragged edge. ` +
      `Output a complete, seamless picture with the disc and bubbles intact but NO logo, NO pill and NO text. ` +
      `\n\nHANDS AND PHONES - READ CAREFULLY, this keeps going wrong: count every hand in the frame and make ` +
      `each one belong to a person and be properly ATTACHED to that person's arm. There must be ZERO extra, ` +
      `floating, disembodied or duplicated hands or fingers ANYWHERE - not near the held phone, not near any ` +
      `floating app-phone, not in the background. If the design has a floating phone showing the app, it floats ` +
      `on its OWN with NO hand holding it. A person holding a phone uses their own two hands and no more. Do a ` +
      `final check and remove any hand that is not clearly attached to a visible arm of a person in the scene. ${skin}`;

    // SCENE construction (slider): KEEP the reference advert and its signature SWISH; change the people (and
    // scene) faithfully to what was asked. We do NOT strip the design - Gary: "keep swish" - and we do NOT let
    // the model fuss over the logo/deal/headline text (it garbles those); we overlay real, clean versions of
    // those ourselves afterwards (finishSlider). So the model's only job is a great photograph of the right
    // people in the scene, with the swish and overall look intact.
    const scene = opts.scene?.trim() ? `, in a real setting: ${opts.scene.trim()}` : "";
    const scenePrompt =
      `@image1 is a FINISHED MTN MoMo advert. KEEP its overall look and, EXACTLY as they are, the signature ` +
      `curved light SWISH / glowing ribbon graphic and the background style. ` +
      `\n\nCHANGE ONLY the PEOPLE in it to ${person(opts.person)}${scene}, as a natural, cinematic photograph - ` +
      `believably placed, well lit, matching the reference's framing and mood. ` +
      `\n\nDo NOT worry about the logo, the deal card or the headline text - we overlay clean versions of those ` +
      `afterwards, so you do not need to reproduce or perfect any lettering; just make the photograph and keep ` +
      `the swish. ${skin}`;

    const params: AnyObj = {
      ...baseParams("nano_banana_pro", ar),
      prompt: construction === "disc" ? discPrompt : scenePrompt,
      medias: [{ value: imageId, role: "image" }],
      resolution,
    };
    const r = await call("generate_image", { params });
    let out: string | null = extractImageUrls(r)[0] ?? null;
    const jobId = extractJobIds(r)[0] ?? null;
    if (!out && jobId) out = await pollJob(call, jobId, 60);
    if (!out) {
      const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
      return { url: null, rawUrl: null, error: `no image back: ${raw}`.slice(0, 280), humanised: false };
    }

    // THE HUMANISER PASS. Refines ONLY the skin so the person reads real, holding the rest of the frame.
    if (opts.humanise) {
      const skinned = await humaniseUrl(out, {
        prompt: "real photographic skin with visible pores, fine texture and even, natural tone; remove any plastic, waxy or airbrushed look.",
        ratio: ar,
        resolution,
      }).catch(() => null);
      if (skinned) return { url: skinned, rawUrl: out, error: null, humanised: true };
    }
    return { url: out, rawUrl: out, error: null, humanised: false };
  } catch (e) {
    return { url: null, rawUrl: null, error: String((e as Error)?.message || e).slice(0, 200), humanised: false };
  }
}

function person(p: string): string {
  const t = p.trim();
  return t || "a real South African person";
}

// STRIP THE PERSON, KEEP THE SET. Gary's challenge: a pro should be able to remove the person from a finished
// masthead himself rather than asking the design team for a person-hidden export.
//
// So: erase the central figure and rebuild the disc/rays that were behind them, while keeping every other
// piece of furniture (bubbles, swish, callout, logo) exactly. If nano_banana holds the furniture through this,
// we can derive the "empty set" from any reference ourselves and composite a fresh person onto it - no layered
// file needed. If it drifts, the layered export is justified by evidence. Returns the error for the same
// reason the swap does - this is a test, not a black box.
export async function stripPerson(url: string, opts: { ratio?: string; resolution?: "2k" | "4k" } = {}): Promise<{ url: string | null; error: string | null }> {
  if (!isSafePublicUrl(url)) return { url: null, error: "reference url is not a safe public url" };
  try {
    const imageId = await importMediaUrl(url);
    if (!imageId) return { url: null, error: "could not import the reference into Higgsfield" };
    const { call } = await openSession();
    const ar = opts.ratio || "1:1";
    const params: AnyObj = {
      ...baseParams("nano_banana_pro", ar),
      prompt:
        `@image1 is a finished MTN MoMo advert: a person in the centre, standing on a yellow disc with blue ` +
        `rays, surrounded by floating 3D icon bubbles, a light swish, and a callout badge. ` +
        `\n\nREMOVE THE PERSON COMPLETELY. Rebuild whatever was behind them - the yellow disc and the blue rays - ` +
        `so the disc looks whole and natural with NObody in it, as if the person had never been there. ` +
        `\n\nKEEP EVERYTHING ELSE EXACTLY as it is, same shape, size, position, colour and wording: every floating ` +
        `icon bubble, the swish, the callout badge, the logo. Do not move, resize, restyle or regenerate any of ` +
        `that furniture. The result is the same advert with an empty disc where the person was.`,
      medias: [{ value: imageId, role: "image" }],
      resolution: opts.resolution || "4k",
    };
    const r = await call("generate_image", { params });
    let out: string | null = extractImageUrls(r)[0] ?? null;
    const jobId = extractJobIds(r)[0] ?? null;
    if (!out && jobId) out = await pollJob(call, jobId, 60);
    if (out) return { url: out, error: null };
    const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
    return { url: null, error: `no image back: ${raw}`.slice(0, 280) };
  } catch (e) {
    return { url: null, error: String((e as Error)?.message || e).slice(0, 200) };
  }
}

// Enumerate the Higgsfield MCP tools + their input schemas (discovery).
export async function listTools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]> {
  const token = await getValidHFAccessToken();
  const init = await rawPost(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "GAS Studio", version: "1.0" } },
  });
  const { parsed } = await rawPost(token, init.sid, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const res = (parsed?.result ?? parsed) as AnyObj;
  const tools = ((res?.tools as AnyObj[]) || []) as AnyObj[];
  return tools.map((t) => ({ name: String(t.name), description: t.description as string, inputSchema: t.inputSchema ?? t.input_schema }));
}

// Generate `count` reference frames from one identity prompt. Returns image URLs.
export async function generateImages(opts: { prompt: string; count?: number; model?: string; aspectRatio?: string }): Promise<string[]> {
  const { prompt, count = 4, model = "gpt_image_2", aspectRatio = "9:16" } = opts;
  const token = await getValidHFAccessToken();

  const init = await rawPost(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "GAS Studio", version: "1.0" } },
  });
  const sid = init.sid;
  const call = async (name: string, args: AnyObj) => {
    const { parsed } = await rawPost(token, sid, { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } });
    return (parsed?.result ?? parsed) as AnyObj;
  };

  const base = model === "gpt_image_2"
    ? { model, aspect_ratio: aspectRatio, count: 1, quality: "high" }
    : { model, aspect_ratio: aspectRatio, count: 1, quality: "2k" };

  // Launch `count` generations of the same identity prompt (varied seeds).
  const jobIds: string[] = [];
  const direct: string[] = [];
  for (let n = 0; n < count; n++) {
    const r = await call("generate_image", { params: { ...base, prompt } });
    direct.push(...extractImageUrls(r));
    jobIds.push(...extractJobIds(r));
  }
  if (direct.length >= count) return [...new Set(direct)].slice(0, count);
  if (!jobIds.length) throw new Error("Higgsfield returned no job IDs");

  const pending = new Set(jobIds);
  const urls: string[] = [...new Set(direct)];
  for (let round = 0; round < 60 && pending.size > 0 && urls.length < count; round++) {
    if (round) await new Promise((r) => setTimeout(r, 3000));
    for (const jobId of [...pending]) {
      try {
        const data = unwrapMCP(await call("job_status", { jobId })) as AnyObj;
        const item = (Array.isArray(data?.results) ? (data.results as AnyObj[])[0] : data) as AnyObj;
        const ro = (item?.results as AnyObj) || {};
        const url = (ro.rawUrl || ro.minUrl || item?.result_url || item?.url || extractImageUrls(data)[0]) as string | undefined;
        const status = String(item?.status || data?.status || "").toLowerCase();
        if (url) { pending.delete(jobId); if (!urls.includes(url)) urls.push(url); }
        else if (TERMINAL.has(status)) pending.delete(jobId);
      } catch {
        /* transient - retry next round */
      }
    }
  }
  if (!urls.length) throw new Error("Higgsfield generation timed out");
  return urls.slice(0, count);
}

// Generate 12 camera angles from one hero frame using Angles 2.0. Single call replaces
// multi-prompt photoshoot training set (60-80% cost reduction). Returns image URLs.
export async function generateAngles2_0(opts: { heroUrl: string; elementId: string | null; count?: number }): Promise<string[]> {
  const { heroUrl, elementId, count = 12 } = opts;
  const token = await getValidHFAccessToken();

  const init = await rawPost(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "GAS Studio", version: "1.0" } },
  });
  const sid = init.sid;
  const call = async (name: string, args: AnyObj) => {
    const { parsed } = await rawPost(token, sid, { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } });
    return (parsed?.result ?? parsed) as AnyObj;
  };

  // Angles 2.0: import hero as reference, derive 12 consistent angles in one pass.
  // Fallback to multi-prompt if tool unavailable (graceful degrade for now).
  try {
    const r = await call("angles_2_0", { 
      image_url: heroUrl,
      reference_element_id: elementId,
      count: Math.min(count, 12),
      quality: "high"
    });
    const urls = extractImageUrls(r);
    const jobIds = extractJobIds(r);
    
    if (urls.length >= Math.min(count, 12)) return urls.slice(0, count);
    if (!jobIds.length) throw new Error("Angles 2.0 returned no job IDs");

    const pending = new Set(jobIds);
    const collected: string[] = [...urls];
    for (let round = 0; round < 60 && pending.size > 0 && collected.length < count; round++) {
      if (round) await new Promise((r) => setTimeout(r, 3000));
      for (const jobId of [...pending]) {
        try {
          const data = unwrapMCP(await call("job_status", { jobId })) as AnyObj;
          const item = (Array.isArray(data?.results) ? (data.results as AnyObj[])[0] : data) as AnyObj;
          const ro = (item?.results as AnyObj) || {};
          const url = (ro.rawUrl || ro.minUrl || item?.result_url || item?.url || extractImageUrls(data)[0]) as string | undefined;
          const status = String(item?.status || data?.status || "").toLowerCase();
          if (url) { pending.delete(jobId); if (!collected.includes(url)) collected.push(url); }
          else if (TERMINAL.has(status)) pending.delete(jobId);
        } catch {
          /* transient - retry next round */
        }
      }
    }
    if (!collected.length) throw new Error("Angles 2.0 generation timed out");
    return collected.slice(0, count);
  } catch (e) {
    // If angles_2_0 tool not available, return empty to signal fallback to multi-prompt.
    if (String(e).includes("unknown tool") || String(e).includes("angles_2_0")) {
      return [];
    }
    throw e;
  }
}

// Generate images via Supercomputer (adaptive model routing for cost efficiency).
// Returns empty array if tool unavailable (signals fallback to gpt_image_2).
// Intended for creatives (image-only allowlist).
export async function generateWithSupercomputer(opts: { prompts: string[]; aspectRatio?: string; count?: number }): Promise<string[]> {
  const { prompts, aspectRatio = "9:16", count = prompts.length } = opts;
  const token = await getValidHFAccessToken();

  const init = await rawPost(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "GAS Studio", version: "1.0" } },
  });
  const sid = init.sid;
  const call = async (name: string, args: AnyObj) => {
    const { parsed } = await rawPost(token, sid, { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } });
    return (parsed?.result ?? parsed) as AnyObj;
  };

  try {
    // Supercomputer: adaptive model selection for creatives (image-only, best-cost inference).
    const base = { aspect_ratio: aspectRatio, count: 1, quality: "high" };
    const jobIds: string[] = [];
    const direct: string[] = [];
    for (const prompt of prompts.slice(0, count)) {
      const r = await call("supercomputer", { params: { ...base, prompt } });
      direct.push(...extractImageUrls(r));
      jobIds.push(...extractJobIds(r));
    }
    if (direct.length >= count) return [...new Set(direct)].slice(0, count);
    if (!jobIds.length) throw new Error("Supercomputer returned no job IDs");

    const pending = new Set(jobIds);
    const urls: string[] = [...new Set(direct)];
    for (let round = 0; round < 60 && pending.size > 0 && urls.length < count; round++) {
      if (round) await new Promise((r) => setTimeout(r, 3000));
      for (const jobId of [...pending]) {
        try {
          const data = unwrapMCP(await call("job_status", { jobId })) as AnyObj;
          const item = (Array.isArray(data?.results) ? (data.results as AnyObj[])[0] : data) as AnyObj;
          const ro = (item?.results as AnyObj) || {};
          const url = (ro.rawUrl || ro.minUrl || item?.result_url || item?.url || extractImageUrls(data)[0]) as string | undefined;
          const status = String(item?.status || data?.status || "").toLowerCase();
          if (url) { pending.delete(jobId); if (!urls.includes(url)) urls.push(url); }
          else if (TERMINAL.has(status)) pending.delete(jobId);
        } catch {
          /* transient - retry next round */
        }
      }
    }
    if (!urls.length) throw new Error("Supercomputer generation timed out");
    return urls.slice(0, count);
  } catch (e) {
    // If supercomputer tool not available, return empty to signal fallback to gpt_image_2.
    if (String(e).includes("unknown tool") || String(e).includes("supercomputer")) {
      return [];
    }
    throw e;
  }
}

// Generate video via Supercomputer (adaptive model routing for b-roll: Kling 3.0 / Seedance 2.0).
// Returns null if tool unavailable (signals fallback strategy).
// Intended for b-roll generation in the video assembly stage.
export async function generateWithSupercomputerVideo(opts: { prompt: string; imageRef?: string; duration?: number }): Promise<string | null> {
  const { prompt, imageRef, duration = 5 } = opts;
  const token = await getValidHFAccessToken();

  const init = await rawPost(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "GAS Studio", version: "1.0" } },
  });
  const sid = init.sid;
  const call = async (name: string, args: AnyObj) => {
    const { parsed } = await rawPost(token, sid, { jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } });
    return (parsed?.result ?? parsed) as AnyObj;
  };

  try {
    // Supercomputer for video: adaptive routing to best-cost model (Kling 3.0 / Seedance 2.0).
    const args: AnyObj = { prompt, duration };
    if (imageRef) args.image_url = imageRef; // Optional reference frame for consistency
    
    const r = await call("supercomputer_video", { ...args });
    const urls = extractImageUrls(r); // Video may return as file URL
    const jobIds = extractJobIds(r);
    
    // Direct result (rare - most vendor video is async).
    if (urls.length > 0) return urls[0];
    if (!jobIds.length) throw new Error("Supercomputer video returned no job IDs");

    // Poll job status for async video generation.
    const pending = new Set(jobIds);
    let url: string | null = null;
    for (let round = 0; round < 120 && pending.size > 0 && !url; round++) { // 120 × 5s = 10 min timeout for video
      if (round) await new Promise((r) => setTimeout(r, 5000)); // 5s between polls (video is slower)
      for (const jobId of [...pending]) {
        try {
          const data = unwrapMCP(await call("job_status", { jobId })) as AnyObj;
          const item = (Array.isArray(data?.results) ? (data.results as AnyObj[])[0] : data) as AnyObj;
          const ro = (item?.results as AnyObj) || {};
          const videoUrl = (ro.rawUrl || ro.videoUrl || item?.result_url || item?.video_url || item?.url || extractImageUrls(data)[0]) as string | undefined;
          const status = String(item?.status || data?.status || "").toLowerCase();
          if (videoUrl) { pending.delete(jobId); url = videoUrl; }
          else if (TERMINAL.has(status)) pending.delete(jobId);
        } catch {
          /* transient - retry next round */
        }
      }
    }
    if (!url) throw new Error("Supercomputer video generation timed out");
    return url;
  } catch (e) {
    // If supercomputer_video tool not available, return null to signal fallback strategy.
    if (String(e).includes("unknown tool") || String(e).includes("supercomputer")) {
      return null;
    }
    throw e;
  }
}

// Image-to-video for B-ROLL motion (Kling = face-safe; Seedance blocks human faces). Imports
// the still, submits generate_video, polls for the mp4. Resilient: tries a few param shapes and
// captures the reason (the exact generate_video schema isn't public) so a wrong field can't hang.
export async function generateVideoFromImage(opts: { imageUrl: string; prompt: string; ratio?: string; rounds?: number }): Promise<{ url: string | null; error: string | null }> {
  if (!isSafePublicUrl(opts.imageUrl)) return { url: null, error: "unsafe or non-public image url" };
  const mediaId = await importMediaUrl(opts.imageUrl);
  if (!mediaId) return { url: null, error: "could not import the still into Higgsfield" };
  const { call } = await openSession();
  const ar = opts.ratio === "1:1" ? "1:1" : opts.ratio === "16:9" ? "16:9" : "9:16";
  // SELF-DISCOVER the real video model ids from the live catalog (the server rejects guessed ids
  // like "kling3" and tells us to use models_explore). Prefer Kling (face-safe), then fall back to
  // any other video/i2v model, then the hardcoded guesses + env override.
  const discovered: string[] = [];
  for (const args of [{ action: "list", kind: "video" }, { action: "list" }]) {
    try {
      const data = unwrapMCP(await call("models_explore", args)) as AnyObj | null;
      const items = (Array.isArray((data as AnyObj)?.items) ? (data as AnyObj).items : (data as AnyObj)?.structuredContent && Array.isArray(((data as AnyObj).structuredContent as AnyObj).items) ? ((data as AnyObj).structuredContent as AnyObj).items : Array.isArray(data) ? data : []) as AnyObj[];
      for (const it of items) {
        const id = String(it?.id ?? it?.model ?? it?.slug ?? it?.key ?? "");
        const name = String(it?.name ?? it?.title ?? "");
        const kind = String(it?.kind ?? it?.type ?? "");
        if (id && (/kling|veo|seedance|wan|hailuo|video|i2v|image.?to.?video/i.test(`${id} ${name} ${kind}`))) discovered.push(id);
      }
      if (discovered.length) break;
    } catch { /* try next */ }
  }
  // Kling first (face-safe), then other discovered video models, then guesses.
  const kling = discovered.filter((m) => /kling/i.test(m));
  const models = [...new Set([...kling, ...discovered, process.env.HF_VIDEO_MODEL, "kling3_0", "kling3", "kling-2.5"].filter(Boolean) as string[])];
  const shapeFor = (model: string): AnyObj[] => [
    { model, prompt: opts.prompt, aspect_ratio: ar, duration: 5, input_images: [{ type: "image", id: mediaId }] },
    { model, prompt: opts.prompt, aspect_ratio: ar, duration: 5, medias: [{ value: mediaId, role: "image" }] },
    { model, prompt: opts.prompt, aspect_ratio: ar, duration: 5, image_id: mediaId },
    { model, prompt: opts.prompt, aspect_ratio: ar, start_image_id: mediaId },
  ];
  let lastErr = "";
  for (const model of models) {
    for (const params of shapeFor(model)) {
      try {
        const r = await call("generate_video", { params });
        const url: string | null = extractImageUrls(r)[0] ?? null; // immediate url (rare)
        if (url) return { url, error: null };
        const jobId = extractJobIds(r)[0] ?? null;
        // A jobId means this model + shape were ACCEPTED. Commit to it: poll once and return the
        // result. Do NOT keep trying other combos (that's what made the b-roll run for minutes).
        if (jobId) {
          const out = await pollJob(call, jobId, opts.rounds || 150); // ~150 x 3s ≈ 7.5 min (Kling can be slow)
          return out ? { url: out, error: null } : { url: null, error: `b-roll render started (${model}) but did not finish in time` };
        }
        const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
        lastErr = `[${model}] ${raw}`.slice(0, 220);
      } catch (e) { lastErr = `[${model}] ${String((e as Error)?.message || e)}`.slice(0, 220); }
    }
  }
  return { url: null, error: `b-roll video failed (${ar}): ${lastErr}`.slice(0, 280) };
}

// SUBMIT a b-roll video job and return immediately with the jobId (no polling). The caller polls
// with pollVideoJobOnce across short, durable steps so no single step blocks for minutes.
export async function submitVideoFromImage(opts: { imageUrl: string; prompt: string; ratio?: string; endImageUrl?: string; duration?: number; hero?: boolean }): Promise<{ jobId: string | null; model: string | null; url: string | null; error: string | null }> {
  if (!isSafePublicUrl(opts.imageUrl)) return { jobId: null, model: null, url: null, error: "unsafe or non-public image url" };
  const mediaId = await importMediaUrl(opts.imageUrl);
  if (!mediaId) return { jobId: null, model: null, url: null, error: "could not import the still into Higgsfield" };
  // END frame (optional): anchors the motion to finish on this frame - prevents the "drifts/walks
  // backwards" look and, when it's the NEXT scene's start frame, makes the cut seamless.
  const endId = opts.endImageUrl && isSafePublicUrl(opts.endImageUrl) ? await importMediaUrl(opts.endImageUrl).catch(() => null) : null;
  const { call } = await openSession();
  const ar = opts.ratio === "1:1" ? "1:1" : opts.ratio === "16:9" ? "16:9" : "9:16";
  // VERIFIED schemas (from models_explore, 2026-06-20): generate_video takes medias:[{value:media_id,
  // role}]. Kling 3.0 = model "kling3_0", roles start_image + end_image, sound on/off, duration 3-15.
  // B-roll is silent (sound off) - music + ambient are mixed in later (Higgsfield has no music/SFX).
  const medias = [{ value: mediaId, role: "start_image" }, ...(endId ? [{ value: endId, role: "end_image" }] : [])];
  const dur = Math.max(3, Math.min(15, Math.round(opts.duration || 5))); // Kling 3.0 allows 3-15s
  const start = (model: string, extra: AnyObj = {}): AnyObj => ({ model, prompt: opts.prompt, aspect_ratio: ar, duration: dur, count: 1, medias, ...extra });
  // Veo 3.1 (4K, native ambient audio). Veo durations are 4/6/8 - snap UP to the nearest that COVERS the
  // requested length so the clip is at least as long as the narration (max 8s). Tried FIRST; Kling fallback.
  const veoDur = [4, 6, 8].find((c) => c >= dur) ?? 8;
  const heroShape: AnyObj = { model: "veo3_1", prompt: opts.prompt, aspect_ratio: ar, duration: veoDur, count: 1, medias, sound: "on" };
  // kling3_0_turbo is PRIMARY for b-roll: standard kling3_0 renders slowly and was running past our poll
  // window ("did not finish in time"). Turbo is built for speed and finishes far more reliably; standard
  // kling3_0 stays as the fallback. The shapes list is a SUBMIT fallback, so the faster model must be
  // FIRST - a slow render never trips the next shape, it just times out.
  const shapes: AnyObj[] = [
    ...(opts.hero ? [heroShape] : []),
    ...(process.env.HF_VIDEO_MODEL ? [start(process.env.HF_VIDEO_MODEL)] : []),
    start("kling3_0_turbo", { sound: "off", resolution: "1080p" }),
    start("kling3_0", { sound: "off" }),
    start("cinematic_studio_video_v2", { sound: "off" }),
  ];
  let lastErr = "";
  for (const params of shapes) {
    try {
      const r = await call("generate_video", { params });
      const url = extractImageUrls(r)[0] ?? null; // immediate url (rare for video)
      if (url) return { jobId: null, model: String(params.model), url, error: null };
      const jobId = extractJobIds(r)[0] ?? null;
      if (jobId) return { jobId, model: String(params.model), url: null, error: null }; // accepted → caller polls
      const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
      lastErr = `[${params.model}] ${raw}`.slice(0, 220);
    } catch (e) { lastErr = `[${params.model}] ${String((e as Error)?.message || e)}`.slice(0, 220); }
  }
  return { jobId: null, model: null, url: null, error: `b-roll submit failed (${ar}): ${lastErr}`.slice(0, 280) };
}

// A-ROLL talking video: Higgsfield Seedance 2.0 takes a start image + an AUDIO clip and lip-syncs
// the avatar to it (our ElevenLabs VO), with a moving background - and works on a synthetic face
// (no consent gate). Submits and returns the jobId; caller polls with pollVideoJobOnce.
export async function submitTalkingVideo(opts: { imageUrl: string; audioUrl: string; ratio?: string; prompt?: string }): Promise<{ jobId: string | null; model: string | null; url: string | null; error: string | null }> {
  if (!isSafePublicUrl(opts.imageUrl) || !isSafePublicUrl(opts.audioUrl)) return { jobId: null, model: null, url: null, error: "unsafe or non-public url" };
  const { call } = await openSession();
  const imageId = await importMedia(call, opts.imageUrl, "image").catch(() => null);
  const audioId = await importMedia(call, opts.audioUrl, "audio").catch(() => null);
  if (!imageId) return { jobId: null, model: null, url: null, error: "could not import the still" };
  if (!audioId) return { jobId: null, model: null, url: null, error: "could not import the voiceover audio" };
  const ar = opts.ratio === "1:1" ? "1:1" : opts.ratio === "16:9" ? "16:9" : "9:16";
  // Seedance 2.0 = lip-sync to the supplied audio. medias: start_image + audio (per the tool spec).
  const shapes: AnyObj[] = [
    { model: "seedance_2_0", prompt: opts.prompt || "The person talks to camera, natural micro-expressions and gentle gestures; the whole scene is alive with moving background people and ambient motion.", aspect_ratio: ar, count: 1, medias: [{ value: imageId, role: "start_image" }, { value: audioId, role: "audio" }] },
    { model: "seedance_2_0", prompt: opts.prompt || "", aspect_ratio: ar, count: 1, medias: [{ value: imageId, role: "image" }, { value: audioId, role: "audio" }] },
  ];
  let lastErr = "";
  for (const params of shapes) {
    try {
      const r = await call("generate_video", { params });
      const url = extractImageUrls(r)[0] ?? null;
      if (url) return { jobId: null, model: "seedance_2_0", url, error: null };
      const jobId = extractJobIds(r)[0] ?? null;
      if (jobId) return { jobId, model: "seedance_2_0", url: null, error: null };
      const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
      lastErr = raw.slice(0, 220);
    } catch (e) { lastErr = String((e as Error)?.message || e).slice(0, 220); }
  }
  return { jobId: null, model: null, url: null, error: `talking-video submit failed: ${lastErr}`.slice(0, 280) };
}

// ONE quick status check for a submitted video job (returns fast). terminal=true means stop polling.
export async function pollVideoJobOnce(jobId: string): Promise<{ url: string | null; terminal: boolean }> {
  try {
    const { call } = await openSession();
    const data = unwrapMCP(await call("job_status", { jobId })) as AnyObj;
    const item = (Array.isArray(data?.results) ? (data.results as AnyObj[])[0] : data) as AnyObj;
    const ro = (item?.results as AnyObj) || {};
    const url = (ro.rawUrl || ro.minUrl || ro.videoUrl || item?.result_url || item?.video_url || item?.url || extractImageUrls(data)[0]) as string | undefined;
    const status = String(item?.status || data?.status || "").toLowerCase();
    if (url) return { url, terminal: true };
    if (TERMINAL.has(status)) return { url: null, terminal: true };
    return { url: null, terminal: false };
  } catch { return { url: null, terminal: false }; }
}

// GENERATE **AGAINST THE CLIENT'S OWN BEST-PERFORMING WORK**.
//
// Gary, and he was right: "you are not matching reference images that I gave you in the intake to get the
// desired look and feel on how we currently produce our creatives - why?"
//
// Because I wasn't passing them. The reference set was read ONCE at intake, paraphrased into a text
// description, and the generator only ever saw the text. A paraphrase cannot carry look and feel - it cannot
// carry the grading, the casting, the focal length, the way their people are lit.
//
// AND IT IS NOT THE PALETTE. I first assumed the colours had drifted, then measured it (lib/studio-verify.ts):
// our blue is 3.7 deltaE from theirs and our yellow 1.5 - both well inside "the same colour". The palette was
// never the problem. What a text paraphrase actually loses is everything a colour picker CANNOT capture: how
// they cast and light a person, the grade, the focal length, how much air sits around a subject. That is the
// gap, and only the images themselves can close it.
//
// So the reference creatives are now fed to the image model AS IMAGES, the same way the Humaniser feeds a
// frame back to itself: imported to media ids and addressed as @image1, @image2 ... in the prompt.
//
// STYLE, NOT CONTENT. The instruction is explicit that the references are there to be matched for LOOK and
// never copied for subject - otherwise the model helpfully reproduces the reference's person and we have
// generated the same advert again.
export async function generateStyled(opts: {
  prompt: string;
  references: string[];          // the client's own best-performing creatives
  aspectRatio?: string;
  model?: string;
  resolution?: "1k" | "2k" | "4k";
  /** "cutout" = an isolated person for compositing. "scene" = a full-bleed photograph. */
  mode?: "cutout" | "scene";
}): Promise<{ url: string | null; error: string | null; model: string }> {
  const model = opts.model || "nano_banana_pro";
  const ar = opts.aspectRatio || "1:1";
  const mode = opts.mode || "scene";
  const refs = opts.references.filter(isSafePublicUrl).slice(0, 3);

  // THE HARD NEGATIVE. This is the whole lesson from the first live run.
  //
  // I fed the model FINISHED ADVERTS as style references and asked it for a photograph. So it produced an
  // advert: it drew a MoMo logo, a yellow disc, a light streak, a headline, and a strip of invented legal
  // text - and the template then composited OUR real chrome on top of its fake chrome. Two logos, two rings,
  // garbled type reading "Data Deals for".
  //
  // My prompt did politely say "do not copy their composition". A polite request loses to eight finished
  // layouts. The instruction has to be a wall, and it has to lead.
  const NO_GRAPHICS =
    "ABSOLUTE CONSTRAINT, THIS OVERRIDES EVERYTHING ELSE: produce a PHOTOGRAPH and nothing but a photograph. " +
    "The output must contain NO text, NO letters, NO words, NO numbers, NO logos, NO watermarks, NO circles or " +
    "discs, NO rings or arcs, NO light trails or glowing swooshes, NO icons, NO badges, NO price tags, NO user " +
    "interface, NO borders, NO frames, NO graphic design of any kind. Nothing drawn, nothing added. If you are " +
    "shown reference images that contain any of those things, they are there ONLY so you can copy the " +
    "PHOTOGRAPHY - the light, the colour grade, the casting, the lens. Every graphic element in them is applied " +
    "afterwards by a designer and MUST NOT appear in what you make. A single letter or circle makes the image " +
    "unusable.";

  const framing = mode === "cutout"
    ? "Frame: a single person, waist-up, alone, centred, against a completely plain seamless neutral mid-grey " +
      "studio background with nothing behind them at all - no room, no props, no scenery. The background will " +
      "be removed, so it must be clean, even and empty."
    : "Frame: a real photographic moment in a real place. Keep the lower third of the frame calm and " +
      "uncluttered, and keep the top-right corner clear.";

  const build = (refCount: number) => {
    const names = Array.from({ length: refCount }, (_, i) => `@image${i + 1}`).join(", ");
    const style = refCount
      ? `${names} ${refCount > 1 ? "are" : "is"} the client's own advertising. Copy ONLY their PHOTOGRAPHIC ` +
        `qualities: the warmth and direction of the light, the colour grade, the depth of field, how the skin ` +
        `is rendered, how the people are cast and styled. Copy NOTHING else from them - not their subject, not ` +
        `their pose, not their location, and above all none of their graphics, type or logos.\n\n`
      : "";
    return `${NO_GRAPHICS}\n\n${style}${framing}\n\nPhotograph this:\n${opts.prompt}`;
  };

  try {
    const ids = refs.length
      ? (await Promise.all(refs.map((u) => importMediaUrl(u).catch(() => null)))).filter(Boolean) as string[]
      : [];

    const { call } = await openSession();
    const params: AnyObj = {
      ...baseParams(model, ar),
      prompt: build(ids.length),
    };
    if (ids.length) params.medias = ids.map((value) => ({ value, role: "image" }));
    if (opts.resolution) params.resolution = opts.resolution;

    const r = await call("generate_image", { params });
    let url: string | null = extractImageUrls(r)[0] ?? null;
    const jobId = extractJobIds(r)[0] ?? null;
    if (!url && jobId) url = await pollJob(call, jobId, 60);
    if (url) return { url, error: null, model };

    const raw = typeof r === "string" ? r : JSON.stringify(unwrapMCP(r) ?? r);
    return { url: null, error: `no image [${model} ${ar} +${ids.length} refs]: ${raw}`.slice(0, 280), model };
  } catch (e) {
    return { url: null, error: String((e as Error)?.message || e).slice(0, 200), model };
  }
}
