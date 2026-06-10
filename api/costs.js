import { getSession, listUsers } from '../lib/auth.js'
import { getCostsReport } from '../lib/usage.js'
import { corsHeaders } from '../lib/cors.js'

export const config = { runtime: 'edge' }

// Team-wide, plan-true cost report for the Costs dashboard. Any signed-in team
// member can view it. GET ?cycle=YYYY-MM-DD (billing-cycle start, the 11th;
// defaults to the current cycle).
export default async function handler(req) {
  const cors = { ...corsHeaders(req, { methods: 'GET, OPTIONS' }), 'Cache-Control': 'no-store' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const session = await getSession(req)
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })

  try {
    const cycle = new URL(req.url).searchParams.get('cycle') || undefined
    const users = await listUsers()
    const report = await getCostsReport(users.map(u => u.email), cycle)
    return new Response(JSON.stringify(report), { status: 200, headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Request failed' }), { status: 500, headers: cors })
  }
}
