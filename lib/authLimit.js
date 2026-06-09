import { Redis } from '@upstash/redis'

// Cross-instance brute-force protection for the password gate. Counts failed
// attempts per IP in Upstash KV (shared across all serverless instances, unlike
// the in-memory rate limiter). Resilient: if KV is unavailable it does NOT block
// real users — the password itself is still the gate.

let _redis = null
function redis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  _redis = new Redis({ url, token })
  return _redis
}

const MAX_FAILS = 10      // allowed wrong guesses per window
const WINDOW_S = 15 * 60  // 15-minute lockout window
const key = (ip) => `auth:fail:${ip || 'unknown'}`

export async function tooManyAuthFails(ip) {
  const r = redis(); if (!r) return false
  try { return Number(await r.get(key(ip))) >= MAX_FAILS } catch { return false }
}

export async function recordAuthFail(ip) {
  const r = redis(); if (!r) return
  try {
    const n = await r.incr(key(ip))
    if (n === 1) await r.expire(key(ip), WINDOW_S)
  } catch {}
}

export async function clearAuthFails(ip) {
  const r = redis(); if (!r) return
  try { await r.del(key(ip)) } catch {}
}
