// Lightweight shared-password gate for the whole app.
// The team enters one password (APP_ACCESS_PASSWORD) once; it's stored as an
// httpOnly cookie and checked on every credential-spending API route so the
// owner's Anthropic / Higgsfield credentials can't be used by outsiders.
//
// If APP_ACCESS_PASSWORD is not set, the gate is OFF (fail-open) — convenient
// for local dev. Always set it in production (and only then turn off Vercel
// Authentication).

export const APP_COOKIE = 'app_key'

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}

// Works for both edge (Request: headers.get) and node (req.headers object).
function header(req, name) {
  if (typeof req.headers?.get === 'function') return req.headers.get(name)
  return req.headers?.[name] || req.headers?.[name.toLowerCase()] || null
}

// Constant-time string comparison to avoid leaking the password via response
// timing. (Length is allowed to differ — negligible for a shared secret.)
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Returns true if the request carries the correct shared password (cookie or
// x-app-key header). Fails OPEN only in local dev (no password configured);
// in production (on Vercel) a missing password fails CLOSED so an accidental
// env-var deletion locks the door rather than opening it.
export function isAppAuthed(req) {
  const expected = process.env.APP_ACCESS_PASSWORD
  if (!expected) return !process.env.VERCEL // dev: open · prod: closed
  const provided = readCookie(header(req, 'cookie'), APP_COOKIE) || header(req, 'x-app-key') || ''
  return safeEqual(provided, expected)
}
