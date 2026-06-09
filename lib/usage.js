import { Redis } from '@upstash/redis'

// Per-user usage tracking + ESTIMATED spend. Counts each person's image/video
// generations (by model) and Claude usage in a KV hash, and accumulates an
// estimated Higgsfield-credit cost (duration-aware for video). Billing is
// centralized on ONE Higgsfield account, so this is an estimate of each
// person's share of the credits, not a separate per-user invoice.

let _redis = null
function redis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Usage store not configured (KV missing)')
  _redis = new Redis({ url, token })
  return _redis
}

// ── Plan basis & credit costs (tune to YOUR Higgsfield plan) ─────────────────
// Assumed plan: Ultra — $99/mo for 3,000 base credits ⇒ ≈ $0.033 per credit.
// If you're on a different tier, change CREDIT_USD to (monthly $ / monthly credits).
export const CREDIT_USD = 99 / 3000 // ≈ $0.033 per credit

// Video credit cost. Seedance bills by clip length (~5 credits/sec); Kling clips
// are 5s or 10s; Veo is a fixed ~8s clip. Numbers from Higgsfield's published
// per-generation rates (2026) — adjust if your dashboard shows different.
export function videoCredits(model, duration = 5) {
  const d = Number(duration) || 5
  switch (model) {
    case 'seedance_2_0':      return Math.round(d * 5)   // ≈25 cr / 5s · ≈75 / 15s
    case 'seedance_2_0_fast': return Math.round(d * 2.5)
    case 'kling3_0':
    case 'kling2_6':          return d >= 8 ? 14 : 7     // clip is 5s (≈7) or 10s (≈14)
    case 'veo3_1':            return 58                  // fixed ~8s clip
    default:                  return Math.round(d * 4)
  }
}

// Image credit cost. Seedream is free on Ultra; GPT Image 2 & Nano Banana Pro
// bill ≈2 credits each; Nano Banana (flash) ≈1.
export function imageCredits(model) {
  switch (model) {
    case 'seedream_v4_5':     return 0
    case 'nano_banana_flash': return 1
    case 'nano_banana_2':     return 2
    case 'gpt_image_2':       return 2
    default:                  return 1
  }
}

const norm = (e) => String(e || '').toLowerCase().trim()
const key = (email) => `usage:${norm(email)}`

// Generic counter — used for Claude calls/tokens, which don't consume HF credits.
export async function recordUsage(email, field, count = 1) {
  if (!email || !field || !count) return
  try { await redis().hincrby(key(email), field, count) } catch {}
}

// Record an image/video generation: bumps the per-model count AND the user's
// running estimated-credit total (duration-aware for video).
export async function recordGeneration({ email, kind, model, count = 1, duration }) {
  if (!email || !model || !count) return
  const r = redis()
  const prefix = kind === 'video' ? 'vid' : 'img'
  const per = kind === 'video' ? videoCredits(model, duration) : imageCredits(model)
  try {
    await r.hincrby(key(email), `${prefix}:${String(model).slice(0, 40)}`, count)
    if (per * count) await r.hincrby(key(email), 'credits', per * count)
  } catch {}
}

function summarize(h) {
  let images = 0, videos = 0, claudeCalls = 0, claudeTokens = 0
  const credits = Number(h?.credits) || 0
  for (const [f, vRaw] of Object.entries(h || {})) {
    const v = Number(vRaw) || 0
    if (f.startsWith('img:')) images += v
    else if (f.startsWith('vid:')) videos += v
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
