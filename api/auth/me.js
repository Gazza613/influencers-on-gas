import { getSession } from '../../lib/auth.js'
import { corsHeaders } from '../../lib/cors.js'

export const config = { runtime: 'edge' }

// Reports the currently signed-in user (email + role) or 401 if not signed in.
export default async function handler(req) {
  const cors = { ...corsHeaders(req, { methods: 'GET, OPTIONS' }), 'Cache-Control': 'no-store' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const s = await getSession(req)
  if (!s) return new Response(JSON.stringify({ authed: false }), { status: 401, headers: cors })
  return new Response(JSON.stringify({ authed: true, user: { email: s.email, role: s.role } }), { status: 200, headers: cors })
}
