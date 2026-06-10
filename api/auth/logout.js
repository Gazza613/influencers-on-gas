import { destroySession, clearSessionCookie } from '../../lib/auth.js'
import { corsHeaders } from '../../lib/cors.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const cors = corsHeaders(req, { methods: 'POST, OPTIONS' })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  try { await destroySession(req) } catch {}
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, 'Set-Cookie': clearSessionCookie() } })
}
