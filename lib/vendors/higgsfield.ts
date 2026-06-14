import { getValidHFAccessToken } from "../hf-token";

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
async function pollJob(call: Caller, jobId: string, rounds = 60): Promise<string | null> {
  for (let round = 0; round < rounds; round++) {
    if (round) await sleep(3000);
    try {
      const data = unwrapMCP(await call("job_status", { jobId })) as AnyObj;
      const item = (Array.isArray(data?.results) ? (data.results as AnyObj[])[0] : data) as AnyObj;
      const ro = (item?.results as AnyObj) || {};
      const url = (ro.rawUrl || ro.minUrl || item?.result_url || item?.url || extractImageUrls(data)[0]) as string | undefined;
      const status = String(item?.status || data?.status || "").toLowerCase();
      if (url) return url;
      if (TERMINAL.has(status)) return null;
    } catch { /* transient — retry */ }
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
async function importMedia(call: Caller, url: string): Promise<string | null> {
  const data = unwrapMCP(await call("media_import_url", { url, type: "image" }));
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
  return model === "gpt_image_2"
    ? { model, aspect_ratio: aspectRatio, count: 1, quality: "high" }
    : { model, aspect_ratio: aspectRatio, count: 1, quality: "2k" };
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
export async function generateBatch(prompts: string[], model = "gpt_image_2", aspectRatio = "9:16"): Promise<(string | null)[]> {
  const base = baseParams(model, aspectRatio);
  // Each prompt gets its OWN MCP session so generations run truly in parallel
  // (a shared session serializes requests). Wall-clock ≈ one image, not the sum.
  return Promise.all(prompts.map(async (p) => {
    try {
      const { call } = await openSession();
      const r = await call("generate_image", { params: { ...base, prompt: p } });
      let url: string | null = extractImageUrls(r)[0] ?? null;
      const jobId = extractJobIds(r)[0] ?? null;
      if (!url && jobId) url = await pollJob(call, jobId);
      return url;
    } catch { return null; }
  }));
}

// Train a reusable Soul identity from 5–20 reference images. Returns the soul_id
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
        /* transient — retry next round */
      }
    }
  }
  if (!urls.length) throw new Error("Higgsfield generation timed out");
  return urls.slice(0, count);
}
