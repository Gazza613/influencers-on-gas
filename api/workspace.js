import { getWorkspace, getVersion, applyChanges } from '../lib/workspace.js'
import { isAuthed } from '../lib/auth.js'
import { corsHeaders } from '../lib/cors.js'

export const config = { runtime: 'edge' }

// Guard rails so one request can't wipe/blow up the shared team store.
const MAX_KEYS_PER_REQ = 500
const MAX_VALUE_BYTES = 2_000_000 // 2 MB per stored value

// Shared team workspace sync.
//   GET  /api/workspace            → { data: { key: rawJson }, version }
//   GET  /api/workspace?v=1        → { version }   (cheap change check)
//   POST /api/workspace            → body { sets: {key: rawJson}, dels: [key] } → { version }
export default async function handler(req) {
  const cors = { ...corsHeaders(req, { methods: 'GET, POST, OPTIONS', headers: 'content-type, x-app-key' }), 'Cache-Control': 'no-store' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (!(await isAuthed(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      if (url.searchParams.get('v')) {
        return new Response(JSON.stringify({ version: await getVersion() }), { status: 200, headers: cors })
      }
      const ws = await getWorkspace()
      return new Response(JSON.stringify(ws), { status: 200, headers: cors })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const sets = (body.sets && typeof body.sets === 'object') ? body.sets : {}
      const dels = Array.isArray(body.dels) ? body.dels : []
      const setKeys = Object.keys(sets)
      if (setKeys.length + dels.length > MAX_KEYS_PER_REQ) {
        return new Response(JSON.stringify({ error: 'Too many keys in one request' }), { status: 413, headers: cors })
      }
      for (const k of setKeys) {
        const val = sets[k]
        if (typeof val === 'string' && val.length > MAX_VALUE_BYTES) {
          return new Response(JSON.stringify({ error: `Value too large for "${k}"` }), { status: 413, headers: cors })
        }
      }
      const version = await applyChanges({ sets, dels })
      return new Response(JSON.stringify({ version }), { status: 200, headers: cors })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors })
  }
}
