import { Redis } from '@upstash/redis'

// Per-user usage tracking. Counts each person's image/video generations (by
// model) and Claude calls/tokens in a KV hash, and turns them into an ESTIMATED
// spend using the tunable credit table below. (Billing is centralized, so this
// is an estimate, not a provider bill.)

let _redis = null
function redis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Usage store not configured (KV missing)')
  _redis = new Redis({ url, token })
  return _redis
}

// ── tunable estimate table (adjust to your Higgsfield plan) ──────
// Higgsfield credits per generation. Images are ~free on the Ultra plan.
export const VIDEO_CREDITS = { seedance_2_0: 25, seedance_2_0_fast: 12, kling3_0: 7, kling2_6: 7, veo3_1: 58, _default: 15 }
export const IMAGE_CREDITS = { gpt_image_2: 0, seedream_v4_5: 0, nano_banana_2: 0, nano_banana_flash: 0, soul_2: 0, _default: 0 }
export const CREDIT_USD = 0.033 // ≈ Ultra $99 / 3000 credits

const norm = (e) => String(e || '').toLowerCase().trim()
const key = (email) => `usage:${norm(email)}`

export async function recordUsage(email, field, count = 1) {
  if (!email || !field || !count) return
  try { await redis().hincrby(key(email), field, count) } catch {}
}

function summarize(h) {
  let images = 0, videos = 0, claudeCalls = 0, claudeTokens = 0, credits = 0
  for (const [f, vRaw] of Object.entries(h || {})) {
    const v = Number(vRaw) || 0
    if (f.startsWith('img:')) { images += v; credits += v * (IMAGE_CREDITS[f.slice(4)] ?? IMAGE_CREDITS._default) }
    else if (f.startsWith('vid:')) { videos += v; credits += v * (VIDEO_CREDITS[f.slice(4)] ?? VIDEO_CREDITS._default) }
    else if (f === 'claude:calls') claudeCalls = v
    else if (f === 'claude:tokens') claudeTokens = v
  }
  return { images, videos, claudeCalls, claudeTokens, credits, estUsd: Math.round(credits * CREDIT_USD * 100) / 100 }
}

export async function getUsage(email) {
  let h = {}
  try { h = (await redis().hgetall(key(email))) || {} } catch {}
  return summarize(h)
}

export async function getUsageFor(emails) {
  const out = {}
  await Promise.all((emails || []).map(async (e) => { out[norm(e)] = await getUsage(e) }))
  return out
}
