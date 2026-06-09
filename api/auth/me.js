import { getSession } from '../../lib/auth.js'

export const config = { runtime: 'edge' }

// Reports the currently signed-in user (email + role) or 401 if not signed in.
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const s = await getSession(req)
  if (!s) return new Response(JSON.stringify({ authed: false }), { status: 401, headers: cors })
  return new Response(JSON.stringify({ authed: true, user: { email: s.email, role: s.role } }), { status: 200, headers: cors })
}
