// Lightweight in-memory "speed bump" against bot floods.
//
// Goal: be completely invisible to real people — even someone aggressively
// spam-clicking "generate" — while tripping on automated abuse (a script firing
// hundreds of requests). State lives in memory per running server instance and
// resets when that instance recycles. That's intentional: this is a speed bump
// to blunt obvious abuse cheaply, not a bank vault. For bulletproof,
// cross-instance limiting you'd add a shared store (e.g. Upstash/Vercel KV) —
// not needed for a hobby project.

const hits = new Map() // ip -> number[] of recent request timestamps (ms)

// Two tiers, both generous on purpose:
//  - burst guard: stops an instant flood (a human can't click this fast)
//  - sustained guard: stops a steady hammer while easily covering heavy
//    legit use (image/video polling, multiple jobs at once)
const RULES = [
  { windowMs: 3000,  max: 30  }, // up to 30 requests in any 3 seconds
  { windowMs: 60000, max: 300 }, // up to 300 requests in any 60 seconds
]

const LONGEST = Math.max(...RULES.map(r => r.windowMs))

// Returns { ok: true } to allow, or { ok: false, retryAfter } (seconds) to block.
export function rateLimit(ip) {
  const now = Date.now()
  const key = ip || 'unknown'
  let times = (hits.get(key) || []).filter(t => now - t < LONGEST)

  for (const rule of RULES) {
    const inWindow = times.filter(t => now - t < rule.windowMs).length
    if (inWindow >= rule.max) {
      hits.set(key, times)
      return { ok: false, retryAfter: Math.ceil(rule.windowMs / 1000) }
    }
  }

  times.push(now)
  hits.set(key, times)

  // Opportunistic cleanup so the Map can't grow without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every(t => now - t >= LONGEST)) hits.delete(k)
    }
  }

  return { ok: true }
}

// Pull the visitor's IP from the headers Vercel sets. Works with both an edge
// `Headers` object and a Node `req.headers` plain object.
export function clientIp(headers) {
  const get = (name) => {
    if (!headers) return ''
    if (typeof headers.get === 'function') return headers.get(name) || ''
    return headers[name] || headers[name.toLowerCase()] || ''
  }
  const xff = get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return get('x-real-ip') || 'unknown'
}
