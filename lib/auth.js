import { Redis } from '@upstash/redis'

// Per-user authentication for the team. Accounts live in Upstash KV with
// PBKDF2-hashed passwords (never plaintext). Sessions are random tokens stored
// in KV (instant revocation on logout / user removal). Only @gasmarketing.co.za
// emails are allowed. Works in both edge and node runtimes (Web Crypto + KV).

export const EMAIL_DOMAIN = '@gasmarketing.co.za'
const SESSION_COOKIE = 'session'
const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days
const PBKDF2_ITER = 100000

let _redis = null
function redis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('User store not configured (KV missing)')
  _redis = new Redis({ url, token })
  return _redis
}

// ── helpers ──────────────────────────────────────────────────────
const buf2hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
function hex2buf(hex) {
  const a = new Uint8Array(hex.length / 2)
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16)
  return a
}
function timingSafe(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}
function headerVal(req, name) {
  if (typeof req.headers?.get === 'function') return req.headers.get(name)
  return req.headers?.[name] || req.headers?.[name.toLowerCase()] || null
}

// ── password hashing (PBKDF2 via Web Crypto) ─────────────────────
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hex2buf(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256)
  return { salt: buf2hex(salt), hash: buf2hex(bits) }
}
async function verifyPassword(password, saltHex, hashHex) {
  const { hash } = await hashPassword(password, saltHex)
  return timingSafe(hash, hashHex)
}

// ── users ────────────────────────────────────────────────────────
export function isAllowedEmail(email) {
  return typeof email === 'string' && email.toLowerCase().trim().endsWith(EMAIL_DOMAIN)
}
const normEmail = (e) => String(e || '').toLowerCase().trim()
const userKey = (email) => `user:${normEmail(email)}`
const userSessionsKey = (email) => `user_sessions:${normEmail(email)}`

export async function getUser(email) {
  return (await redis().get(userKey(email))) || null
}

export async function listUsers() {
  const r = redis()
  const emails = await r.smembers('users:index')
  if (!emails?.length) return []
  const users = await Promise.all(emails.map(e => r.get(userKey(e))))
  return users.filter(Boolean)
    .map(u => ({ email: u.email, role: u.role, createdAt: u.createdAt, lastLogin: u.lastLogin || null, createdBy: u.createdBy || null }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

export async function createUser({ email, password, role = 'user', createdBy }) {
  email = normEmail(email)
  if (!isAllowedEmail(email)) throw new Error(`Only ${EMAIL_DOMAIN} email addresses are allowed`)
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters')
  const r = redis()
  if (await r.get(userKey(email))) throw new Error('A user with that email already exists')
  const { salt, hash } = await hashPassword(password)
  const user = { email, salt, hash, role, createdAt: Date.now(), createdBy: createdBy || null, lastLogin: null }
  await r.set(userKey(email), user)
  await r.sadd('users:index', email)
  return { email, role, createdAt: user.createdAt }
}

export async function deleteUser(email) {
  email = normEmail(email)
  const r = redis()
  // Kill all of the user's active sessions immediately.
  try {
    const tokens = await r.smembers(userSessionsKey(email))
    if (tokens?.length) await Promise.all(tokens.map(t => r.del(`session:${t}`)))
  } catch {}
  await r.del(userSessionsKey(email))
  await r.del(userKey(email))
  await r.srem('users:index', email)
}

// Validate email+password. Returns the user (without secrets) or null.
export async function checkPassword(email, password) {
  const u = await getUser(email)
  if (!u) return null
  const ok = await verifyPassword(password, u.salt, u.hash)
  if (!ok) return null
  try { await redis().set(userKey(email), { ...u, lastLogin: Date.now() }) } catch {}
  return { email: u.email, role: u.role }
}

// Bootstrap: first-ever login by the env-configured super admin creates the
// account. Set SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD env vars.
export async function maybeBootstrapSuperAdmin(email, password) {
  email = normEmail(email)
  const saEmail = normEmail(process.env.SUPER_ADMIN_EMAIL)
  const saPass = process.env.SUPER_ADMIN_PASSWORD
  if (!saEmail || !saPass) return null
  if (email !== saEmail || password !== saPass) return null
  if (await getUser(email)) return null // already exists
  await createUser({ email, password, role: 'super_admin', createdBy: 'bootstrap' })
  return { email, role: 'super_admin' }
}

// ── sessions ─────────────────────────────────────────────────────
function randomToken() { return buf2hex(crypto.getRandomValues(new Uint8Array(32))) }

export async function createSession(email, role) {
  const r = redis()
  const token = randomToken()
  await r.set(`session:${token}`, { email: normEmail(email), role, createdAt: Date.now() }, { ex: SESSION_TTL })
  await r.sadd(userSessionsKey(email), token)
  await r.expire(userSessionsKey(email), SESSION_TTL)
  return token
}

// Returns { email, role } or null.
export async function getSession(req) {
  const token = readCookie(headerVal(req, 'cookie'), SESSION_COOKIE)
  if (!token) return null
  try { return (await redis().get(`session:${token}`)) || null } catch { return null }
}

export async function destroySession(req) {
  const token = readCookie(headerVal(req, 'cookie'), SESSION_COOKIE)
  if (!token) return
  try {
    const s = await redis().get(`session:${token}`)
    await redis().del(`session:${token}`)
    if (s?.email) await redis().srem(userSessionsKey(s.email), token)
  } catch {}
}

export async function isAuthed(req) { return !!(await getSession(req)) }
export async function isAdmin(req) {
  const s = await getSession(req)
  return s?.role === 'super_admin'
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Strict`
}
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}
