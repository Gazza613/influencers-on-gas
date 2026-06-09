import { getSession } from '../lib/auth.js'
import { recordGeneration } from '../lib/usage.js'

export const config = { runtime: 'edge' }

// Records a generation event for the signed-in user.
// POST { kind: 'image' | 'video', model, count, duration }
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })

  const s = await getSession(req)
  if (!s) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })

  try {
    const { kind, model, count, duration } = (await req.json().catch(() => ({})))
    if (kind && model) {
      await recordGeneration({
        email: s.email,
        kind,
        model,
        count: Math.min(20, Math.max(1, Number(count) || 1)),
        duration: Number(duration) || undefined,
      })
    }
  } catch {}
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors })
}
