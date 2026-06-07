import { Redis } from '@upstash/redis'

// Shared team workspace store. Mirrors the app's localStorage "shared" keys
// (influencers, photo/video history, brand deals, inspiration boards) into
// Upstash Redis so the whole team sees one library and nothing is lost when a
// browser is cleared.
//
//   ws:index      → Set of localStorage keys currently stored
//   ws:f:<key>    → the raw JSON string for that key
//   ws:version    → integer bumped on every change (for cheap "did anything change?" checks)

const INDEX = 'ws:index'
const FIELD = (k) => `ws:f:${k}`
const VERSION = 'ws:version'

let _redis = null
function redis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Workspace store not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN)')
  _redis = new Redis({ url, token })
  return _redis
}

export async function getVersion() {
  const v = await redis().get(VERSION)
  return Number(v) || 0
}

// Returns { data: { <key>: rawJsonString }, version }
export async function getWorkspace() {
  const r = redis()
  const keys = await r.smembers(INDEX)
  const version = Number(await r.get(VERSION)) || 0
  if (!keys || keys.length === 0) return { data: {}, version }

  const values = await r.mget(...keys.map(FIELD))
  const data = {}
  keys.forEach((k, i) => {
    const v = values[i]
    if (v !== null && v !== undefined) data[k] = typeof v === 'string' ? v : JSON.stringify(v)
  })
  return { data, version }
}

// sets: { <key>: rawJsonString }, dels: [<key>, ...] → returns new version
export async function applyChanges({ sets = {}, dels = [] } = {}) {
  const r = redis()
  const p = r.pipeline()
  let touched = 0

  for (const [k, v] of Object.entries(sets)) {
    p.set(FIELD(k), v)
    p.sadd(INDEX, k)
    touched++
  }
  for (const k of dels) {
    p.del(FIELD(k))
    p.srem(INDEX, k)
    touched++
  }
  if (touched > 0) p.incr(VERSION)
  await p.exec()
  return getVersion()
}
