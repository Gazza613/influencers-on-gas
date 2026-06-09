import { isAppAuthed, APP_COOKIE, safeEqual } from '../lib/appAuth.js'
import { rateLimit, clientIp } from '../lib/rateLimit.js'
import { tooManyAuthFails, recordAuthFail, clearAuthFails } from '../lib/authLimit.js'

export const config = { runtime: 'edge' }

// Gate status + password validation.
//  - POST {password}: validates the shared password (constant-time, brute-force
//    protected); on success sets an httpOnly cookie.
//  - GET (or POST with no password): reports whether the caller already has a
//    valid cookie, or whether the gate is disabled (dev only).
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-app-key',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const expected = process.env.APP_ACCESS_PASSWORD
  if (!expected) {
    // Dev: gate off. Production (on Vercel): fail closed if misconfigured.
    if (process.env.VERCEL) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: cors })
    return new Response(JSON.stringify({ ok: true, gate: 'off' }), { status: 200, headers: cors })
  }

  const ip = clientIp(req.headers)

  // Per-instance speed bump against floods.
  const rl = rateLimit(ip)
  if (!rl.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many requests.' }), {
      status: 429, headers: { ...cors, 'Retry-After': String(rl.retryAfter) },
    })
  }

  let provided = req.headers.get('x-app-key')
  if (!provided && req.method === 'POST') {
    try { provided = (await req.json())?.password } catch {}
  }

  // A password is being submitted → brute-force protection + constant-time check.
  if (provided) {
    if (await tooManyAuthFails(ip)) {
      return new Response(JSON.stringify({ ok: false, error: 'Too many attempts — try again in a few minutes.' }), { status: 429, headers: cors })
    }
    if (safeEqual(provided, expected)) {
      await clearAuthFails(ip)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          ...cors,
          'Set-Cookie': `${APP_COOKIE}=${encodeURIComponent(expected)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`,
        },
      })
    }
    await recordAuthFail(ip)
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: cors })
  }

  // No password submitted → just report current cookie-based status.
  if (isAppAuthed(req)) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors })
  return new Response(JSON.stringify({ ok: false }), { status: 401, headers: cors })
}
