import { getValidHFAccessToken } from '../lib/hfToken.js'

export const config = { runtime: 'edge' }

// Returns the centralized Higgsfield access token to the browser ONLY for the
// rare direct-to-Higgsfield fallback (used when the Vercel datacenter IP is
// blocked). This endpoint must stay behind Vercel Password Protection so only
// the authenticated team can reach it.
export default async function handler(req) {
  const origin = req.headers.get('origin') || '*'
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'true',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  try {
    const accessToken = await getValidHFAccessToken()
    return new Response(JSON.stringify({ access_token: accessToken }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 503,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
}
