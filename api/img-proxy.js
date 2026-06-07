// Allowlisted domains — only proxy images from known trusted sources
const ALLOWED_HOSTS = [
  'cdn.higgsfield.ai',
  'media.higgsfield.ai',
  'storage.higgsfield.ai',
  'files.higgsfield.ai',
  'oaidalleapiprodscus.blob.core.windows.net',
  'oaidallexprodscus.blob.core.windows.net',
]

function isSafeUrl(raw) {
  try {
    const u = new URL(decodeURIComponent(raw))
    if (u.protocol !== 'https:') return false
    return ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch { return false }
}

function safeFilename(name) {
  return (name || 'image.jpg')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)
}

import { rateLimit, clientIp } from '../lib/rateLimit.js'

export default async function handler(req, res) {
  const rl = rateLimit(clientIp(req.headers))
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    res.status(429).send('Too many requests — slow down a moment and try again.'); return
  }

  const { url, name } = req.query
  if (!url) { res.status(400).send('Missing url'); return }
  if (!isSafeUrl(url)) { res.status(403).send('URL not allowed'); return }

  try {
    const upstream = await fetch(decodeURIComponent(url))
    if (!upstream.ok) { res.status(upstream.status).send('Upstream error'); return }

    const ct = upstream.headers.get('content-type') || 'image/jpeg'
    if (!ct.startsWith('image/') && !ct.startsWith('video/')) {
      res.status(400).send('Not an image or video'); return
    }

    const buf = await upstream.arrayBuffer()
    res.setHeader('Content-Type', ct)
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(name)}"`)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.end(Buffer.from(buf))
  } catch (e) {
    res.status(500).send('Proxy error')
  }
}
