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

// Returns true if the request carries the correct shared password (cookie or
// x-app-key header), or if the gate is disabled.
export function isAppAuthed(req) {
  const expected = process.env.APP_ACCESS_PASSWORD
  if (!expected) return true // gate disabled
  const provided = readCookie(header(req, 'cookie'), APP_COOKIE) || header(req, 'x-app-key')
  return provided === expected
}
