import { destroySession, clearSessionCookie } from '../../lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  try { await destroySession(req) } catch {}
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, 'Set-Cookie': clearSessionCookie() } })
}
