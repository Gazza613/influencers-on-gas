import { put } from '@vercel/blob'
import { isAuthed } from '../lib/auth.js'

// Node runtime (not edge) — @vercel/blob's put() is fully supported here.
// Copies a generated media URL into the team's own Vercel Blob store so the
// asset is owned by GAS rather than only hosted on Higgsfield's CDN.
// Gated by the app password AND by BLOB_READ_WRITE_TOKEN — if the Blob store
// isn't connected it returns the original URL unchanged, so generation never breaks.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-app-key')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await isAuthed(req))) return res.status(401).json({ error: 'Unauthorized' })

  // Find the Vercel Blob read-write token by its VALUE signature
  // (vercel_blob_rw_...), so it works no matter what the env var is named
  // (the store may prefix it, e.g. INFLUENCERS_MEDIA_READ_WRITE_TOKEN).
  const findBlobToken = () => {
    if (process.env.BLOB_READ_WRITE_TOKEN) return ['BLOB_READ_WRITE_TOKEN', process.env.BLOB_READ_WRITE_TOKEN]
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string' && v.startsWith('vercel_blob_rw_')) return [k, v]
    }
    return [null, null]
  }
  const [, token] = findBlobToken()

  const url = req.body?.url
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(200).json({ url: url || null })
  }
  // Archiving off (store not connected) or it's already ours → pass through.
  if (!token || url.includes('.blob.vercel-storage.com')) {
    return res.status(200).json({ url })
  }

  // Anti-SSRF: only ever fetch from trusted media hosts. Anything else (internal
  // IPs, metadata endpoints, arbitrary sites) is passed through, never fetched.
  const ALLOWED_MEDIA_HOSTS = ['cloudfront.net', 'higgsfield.ai', 'blob.core.windows.net']
  let host = ''
  try { const u = new URL(url); if (u.protocol === 'https:') host = u.hostname } catch {}
  const allowed = host && ALLOWED_MEDIA_HOSTS.some(h => host === h || host.endsWith('.' + h))
  if (!allowed) return res.status(200).json({ url })

  try {
    const src = await fetch(url)
    if (!src.ok || !src.body) return res.status(200).json({ url })
    const name = 'media/' + (new URL(url).pathname.split('/').pop() || `f_${Date.now()}`)
    const blob = await put(name, src.body, {
      access: 'public',
      token,
      contentType: src.headers.get('content-type') || undefined,
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    return res.status(200).json({ url: blob.url })
  } catch (e) {
    // Never break generation — fall back to the original URL on any failure.
    return res.status(200).json({ url, error: e.message })
  }
}
