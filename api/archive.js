import { put } from '@vercel/blob'
import { isAppAuthed } from '../lib/appAuth.js'

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
  if (!isAppAuthed(req)) return res.status(401).json({ error: 'Unauthorized' })

  // Diagnostic: { debug: true } lists which BLOB-related env var names exist
  // (names only, never values) so we can confirm the token name after connecting.
  if (req.body?.debug) {
    return res.status(200).json({ blobVars: Object.keys(process.env).filter(k => k.includes('BLOB')) })
  }

  const url = req.body?.url
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(200).json({ url: url || null })
  }

  // The connected Blob store may expose the token under a prefixed name
  // (e.g. UGC_ON_GAS_BLOB_READ_WRITE_TOKEN), so find any *BLOB_READ_WRITE_TOKEN.
  const tokenKey = process.env.BLOB_READ_WRITE_TOKEN
    ? 'BLOB_READ_WRITE_TOKEN'
    : Object.keys(process.env).find(k => k.endsWith('BLOB_READ_WRITE_TOKEN'))
  const token = tokenKey ? process.env[tokenKey] : null
  // Archiving off (store not connected) or it's already ours → pass through.
  if (!token || url.includes('.blob.vercel-storage.com')) {
    return res.status(200).json({ url })
  }

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
