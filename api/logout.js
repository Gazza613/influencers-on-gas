import { APP_COOKIE } from '../lib/appAuth.js'

export const config = { runtime: 'edge' }

// Clears the team-password cookie so the next load shows the login screen again.
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      ...cors,
      'Set-Cookie': `${APP_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    },
  })
}
