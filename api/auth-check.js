import { isAppAuthed, APP_COOKIE } from '../lib/appAuth.js'

export const config = { runtime: 'edge' }

// Gate status + password validation.
//  - POST {password}: validates the shared password; on success sets an httpOnly
//    cookie so all later API calls are authorized automatically.
//  - GET (or POST with no password): reports whether the caller is already
//    authorized (valid cookie) or whether the gate is disabled.
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
  if (!expected) return new Response(JSON.stringify({ ok: true, gate: 'off' }), { status: 200, headers: cors })

  let provided = req.headers.get('x-app-key')
  if (!provided && req.method === 'POST') {
    try { provided = (await req.json())?.password } catch {}
  }

  if (provided && provided === expected) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        ...cors,
        'Set-Cookie': `${APP_COOKIE}=${encodeURIComponent(expected)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`,
      },
    })
  }

  // No valid password submitted — report current cookie-based status.
  if (isAppAuthed(req)) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors })
  return new Response(JSON.stringify({ ok: false }), { status: 401, headers: cors })
}
