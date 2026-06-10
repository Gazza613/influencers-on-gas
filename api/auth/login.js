import { checkPassword, createSession, sessionCookie, isAllowedEmail, maybeBootstrapSuperAdmin, recordLogin, EMAIL_DOMAIN } from '../../lib/auth.js'
import { rateLimit, clientIp } from '../../lib/rateLimit.js'
import { tooManyAuthFails, recordAuthFail, clearAuthFails } from '../../lib/authLimit.js'
import { corsHeaders } from '../../lib/cors.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const cors = corsHeaders(req, { methods: 'POST, OPTIONS' })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })

  const ip = clientIp(req.headers)
  const rl = rateLimit(ip)
  if (!rl.ok) return new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429, headers: { ...cors, 'Retry-After': String(rl.retryAfter) } })
  if (await tooManyAuthFails(ip)) {
    return new Response(JSON.stringify({ error: 'Too many attempts — try again in a few minutes.' }), { status: 429, headers: cors })
  }

  let email, password
  try { const b = await req.json(); email = b?.email; password = b?.password } catch {}
  if (!email || !password) return new Response(JSON.stringify({ error: 'Email and password required.' }), { status: 400, headers: cors })

  if (!isAllowedEmail(email)) {
    return new Response(JSON.stringify({ error: `Only ${EMAIL_DOMAIN} email addresses can sign in.` }), { status: 403, headers: cors })
  }

  let user
  try {
    user = await maybeBootstrapSuperAdmin(email, password)
    if (!user) user = await checkPassword(email, password)
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Sign-in is temporarily unavailable.' }), { status: 503, headers: cors })
  }

  if (!user) {
    await recordAuthFail(ip)
    return new Response(JSON.stringify({ error: 'Incorrect email or password.' }), { status: 401, headers: cors })
  }

  await clearAuthFails(ip)
  await recordLogin(user.email, ip)
  const token = await createSession(user.email, user.role)
  return new Response(JSON.stringify({ ok: true, user: { email: user.email, role: user.role } }), {
    status: 200,
    headers: { ...cors, 'Set-Cookie': sessionCookie(token) },
  })
}
