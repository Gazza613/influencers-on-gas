import { put } from '@vercel/blob'
import { isAppAuthed } from '../lib/appAuth.js'

export const config = { runtime: 'edge' }

// Copies a generated media URL into the team's own Vercel Blob store, so the
// asset is owned by GAS rather than only hosted on Higgsfield's CDN.
// Gated by the app password AND by BLOB_READ_WRITE_TOKEN — if the Blob store
// isn't connected, it safely returns the original URL unchanged (archiving off),
// so generation never breaks.
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-app-key',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (!isAppAuthed(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })

  let url
  try { url = (await req.json())?.url } catch {}
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return new Response(JSON.stringify({ url: url || null }), { status: 200, headers: cors })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  // Archiving off, or it's already ours → pass through unchanged.
  if (!token || url.includes('.blob.vercel-storage.com')) {
    return new Response(JSON.stringify({ url }), { status: 200, headers: cors })
  }

  try {
    const src = await fetch(url)
    if (!src.ok || !src.body) return new Response(JSON.stringify({ url }), { status: 200, headers: cors })
    const name = 'media/' + (new URL(url).pathname.split('/').pop() || `f_${Date.now()}`)
    const blob = await put(name, src.body, {
      access: 'public',
      token,
      contentType: src.headers.get('content-type') || undefined,
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    return new Response(JSON.stringify({ url: blob.url }), { status: 200, headers: cors })
  } catch (e) {
    // Never break generation — fall back to the original URL on any failure.
    return new Response(JSON.stringify({ url, error: e.message }), { status: 200, headers: cors })
  }
}
