import { getWorkspace, getVersion, applyChanges } from '../lib/workspace.js'
import { isAppAuthed } from '../lib/appAuth.js'

export const config = { runtime: 'edge' }

// Shared team workspace sync.
//   GET  /api/workspace            → { data: { key: rawJson }, version }
//   GET  /api/workspace?v=1        → { version }   (cheap change check)
//   POST /api/workspace            → body { sets: {key: rawJson}, dels: [key] } → { version }
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-app-key',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (!isAppAuthed(req)) {
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
      const version = await applyChanges({ sets: body.sets || {}, dels: body.dels || [] })
      return new Response(JSON.stringify({ version }), { status: 200, headers: cors })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors })
  }
}
