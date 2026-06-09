import { getSession, listUsers } from '../lib/auth.js'
import { getCostsReport } from '../lib/usage.js'

export const config = { runtime: 'edge' }

// Team-wide, plan-true cost report for the Costs dashboard. Any signed-in team
// member can view it. GET ?month=YYYY-MM (defaults to the current month).
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

  const session = await getSession(req)
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })

  try {
    const month = new URL(req.url).searchParams.get('month') || undefined
    const users = await listUsers()
    const report = await getCostsReport(users.map(u => u.email), month)
    return new Response(JSON.stringify(report), { status: 200, headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Request failed' }), { status: 500, headers: cors })
  }
}
