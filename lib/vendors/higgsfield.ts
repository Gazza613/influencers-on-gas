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
