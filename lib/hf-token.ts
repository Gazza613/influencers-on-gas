import { Redis } from "@upstash/redis";

// Centralized Higgsfield OAuth token manager (ported from the proven Vite app).
// The team never authenticates Higgsfield - the owner authorized once (HF_REFRESH_TOKEN
// / HF_CLIENT_ID seed) and the live, ROTATING tokens are kept in KV (Upstash). Access
// tokens last ~24h; refresh tokens rotate, so KV is the source of truth.
const HF_BASE = "https://mcp.higgsfield.ai";
const ACCESS_KEY = "hf:access_token";
const EXPIRES_KEY = "hf:access_expires_at";
const REFRESH_KEY = "hf:refresh_token";
const CLIENT_KEY = "hf:client_id";
const LOCK_KEY = "hf:refresh_lock";
const BUFFER_MS = 5 * 60 * 1000;

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Higgsfield token store not configured (KV missing)");
  _redis = new Redis({ url, token });
  return _redis;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doRefresh(r: Redis): Promise<string> {
  const refreshToken = (await r.get<string>(REFRESH_KEY)) || process.env.HF_REFRESH_TOKEN;
  const clientId = (await r.get<string>(CLIENT_KEY)) || process.env.HF_CLIENT_ID;
  if (!refreshToken || !clientId) throw new Error("Higgsfield not seeded (HF_REFRESH_TOKEN / HF_CLIENT_ID)");

  const res = await fetch(`${HF_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`Higgsfield token refresh failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const tok = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string };
  if (!tok.access_token) throw new Error("Higgsfield refresh returned no access_token");

  const expiresAt = Date.now() + (tok.expires_in || 3600) * 1000;
  const writes: Promise<unknown>[] = [
    r.set(ACCESS_KEY, tok.access_token),
    r.set(EXPIRES_KEY, expiresAt),
    r.set(CLIENT_KEY, clientId),
  ];
  if (tok.refresh_token) writes.push(r.set(REFRESH_KEY, tok.refresh_token)); // rotation
  await Promise.all(writes);
  return tok.access_token;
}

export async function getValidHFAccessToken(): Promise<string> {
  const r = redis();
  const [token, expiresAt] = await Promise.all([r.get<string>(ACCESS_KEY), r.get<number>(EXPIRES_KEY)]);
  if (token && expiresAt && Date.now() < Number(expiresAt) - BUFFER_MS) return token;

  const gotLock = await r.set(LOCK_KEY, "1", { nx: true, ex: 30 });
  if (!gotLock) {
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const [t, e] = await Promise.all([r.get<string>(ACCESS_KEY), r.get<number>(EXPIRES_KEY)]);
      if (t && e && Date.now() < Number(e) - BUFFER_MS) return t;
    }
  }
  try {
    return await doRefresh(r);
  } finally {
    if (gotLock) await r.del(LOCK_KEY);
  }
}
