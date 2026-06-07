import { Redis } from '@upstash/redis'

// Centralized Higgsfield token manager.
// The team never authenticates Higgsfield — the owner authorizes once and the
// live tokens are kept here. Access tokens last ~24h; refresh tokens ROTATE, so
// the current state must live in a mutable store (Vercel KV / Upstash Redis).
// Bootstrap: on first use (empty KV) we fall back to the HF_REFRESH_TOKEN /
// HF_CLIENT_ID env "seed", refresh once, and from then on KV is the source of
// truth (the rotated refresh token is written back to KV).

const HF_BASE = 'https://mcp.higgsfield.ai'
const ACCESS_KEY = 'hf:access_token'
const EXPIRES_KEY = 'hf:access_expires_at' // epoch ms
const REFRESH_KEY = 'hf:refresh_token'
const CLIENT_KEY = 'hf:client_id'
const LOCK_KEY = 'hf:refresh_lock'
const BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before the access token expires

let _redis = null
function redis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error('Higgsfield token store not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN)')
  }
  _redis = new Redis({ url, token })
  return _redis
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function doRefresh(r) {
  const refreshToken = (await r.get(REFRESH_KEY)) || process.env.HF_REFRESH_TOKEN
  const clientId = (await r.get(CLIENT_KEY)) || process.env.HF_CLIENT_ID
  if (!refreshToken || !clientId) {
    throw new Error('Higgsfield not seeded — set HF_REFRESH_TOKEN and HF_CLIENT_ID env vars once')
  }

  const res = await fetch(`${HF_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Higgsfield token refresh failed (${res.status}): ${t.slice(0, 200)}`)
  }
  const tok = await res.json()
  if (!tok.access_token) throw new Error('Higgsfield refresh returned no access_token')

  const expiresAt = Date.now() + (tok.expires_in || 3600) * 1000
  const writes = [
    r.set(ACCESS_KEY, tok.access_token),
    r.set(EXPIRES_KEY, expiresAt),
    r.set(CLIENT_KEY, clientId), // persist seed into KV so it survives env changes
  ]
  // Refresh tokens rotate — always store the newest one returned.
  if (tok.refresh_token) writes.push(r.set(REFRESH_KEY, tok.refresh_token))
  await Promise.all(writes)
  return tok.access_token
}

// Returns a currently-valid Higgsfield access token, refreshing (with a lock to
// avoid concurrent double-rotation) when the cached one is missing or near expiry.
export async function getValidHFAccessToken() {
  const r = redis()
  const [token, expiresAt] = await Promise.all([r.get(ACCESS_KEY), r.get(EXPIRES_KEY)])
  if (token && expiresAt && Date.now() < Number(expiresAt) - BUFFER_MS) return token

  // Need a refresh — only one instance should do it (rotation invalidates the old token).
  const gotLock = await r.set(LOCK_KEY, '1', { nx: true, ex: 30 })
  if (!gotLock) {
    // Someone else is refreshing; wait for them to publish a fresh token.
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const [t, e] = await Promise.all([r.get(ACCESS_KEY), r.get(EXPIRES_KEY)])
      if (t && e && Date.now() < Number(e) - BUFFER_MS) return t
    }
    // Lock holder appears stuck — fall through and refresh ourselves.
  }
  try {
    return await doRefresh(r)
  } finally {
    if (gotLock) await r.del(LOCK_KEY)
  }
}
