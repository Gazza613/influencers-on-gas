// Shared CORS headers for the edge API.
//
// The app is SAME-ORIGIN with its API (served from the same domain), and
// same-origin requests don't need CORS headers at all — so restricting these to
// an allow-list never affects normal use. It only governs genuine CROSS-origin
// callers, which we limit to our own known domains. This replaces the previous
// reflect-any-Origin + Allow-Credentials:true combination (a misconfiguration).
export const ALLOWED_ORIGINS = [
  'https://influencers.gasmarketing.co.za',
  'https://influencers-on-gas.vercel.app',
  'http://localhost:5173', // local dev (Vite)
]
const ALLOWED = new Set(ALLOWED_ORIGINS)

export function corsHeaders(req, { methods = 'GET, POST, OPTIONS', headers = 'content-type' } = {}) {
  const origin = req?.headers?.get?.('origin') || ''
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': headers,
    Vary: 'Origin',
  }
  // Only echo the origin + allow credentials for trusted origins.
  if (ALLOWED.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Credentials'] = 'true'
  }
  return h
}
