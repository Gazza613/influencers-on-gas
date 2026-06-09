import { Redis } from '@upstash/redis'

// Per-user usage tracking + PLAN-TRUE cost model.
//
// Billing is centralized on ONE Higgsfield Ultra account ($310/mo, 9,000
// credits/mo, billed monthly). On this plan all IMAGE models are UNLIMITED
// (zero marginal cost), while all VIDEO models consume credits. So "spend" =
// the fixed $310 plan + any credit overage, and video is the real cost driver.

let _redis = null
function redis() {
  if (_redis) return _redis
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Usage store not configured (KV missing)')
  _redis = new Redis({ url, token })
  return _redis
}

// ── Plan & credit rate ───────────────────────────────────────────────────────
// The shared account is currently on the credit-based "Creator" plan (confirmed
// live via Higgsfield's `balance` tool). The dashboard LEADS with the live
// balance/ledger from Higgsfield; these constants only drive the secondary
// per-user ESTIMATES. CREDIT_USD is the real marginal cost of a credit observed
// from Higgsfield's top-up packs (~$179.35 / 4,000 ≈ $0.045).
export const PLAN = { name: 'Creator', monthlyUsd: 0, monthlyCredits: 0 }
export const CREDIT_USD = 0.045

// ── Model catalog ────────────────────────────────────────────────────────────
// unlimited:true ⇒ included on the plan, $0 marginal (all image models).
// `credits` is the per-generation credit draw for credit-consuming models — for
// video this is a per-5s baseline that videoCredits() scales by clip length.
export const MODELS = {
  // video — all consume credits on this plan
  seedance_2_0:      { kind: 'video', label: 'Seedance 2.0',      unlimited: false, credits: 25 }, // ~5 cr/sec
  seedance_2_0_fast: { kind: 'video', label: 'Seedance 2.0 Fast', unlimited: false, credits: 12 },
  kling3_0:          { kind: 'video', label: 'Kling 3.0',         unlimited: false, credits: 7 },  // 5s≈7 · 10s≈14
  kling2_6:          { kind: 'video', label: 'Kling 2.6',         unlimited: false, credits: 7 },
  veo3_1:            { kind: 'video', label: 'Veo 3.1',           unlimited: false, credits: 58 }, // fixed ~8s
  // image — all unlimited on this plan
  gpt_image_2:       { kind: 'image', label: 'GPT Image 2',       unlimited: true,  credits: 0 },
  nano_banana_2:     { kind: 'image', label: 'Nano Banana Pro',   unlimited: true,  credits: 0 },
  nano_banana_flash: { kind: 'image', label: 'Nano Banana 2',     unlimited: true,  credits: 0 },
  seedream_v4_5:     { kind: 'image', label: 'Seedream 4.5',      unlimited: true,  credits: 0 },
}
export function modelInfo(model) {
  return MODELS[model] || { kind: 'video', label: model || 'unknown', unlimited: false, credits: 15 }
}

// Duration-aware credit cost (only matters for credit-consuming video models).
export function videoCredits(model, duration = 5) {
  const info = modelInfo(model)
  if (info.unlimited) return 0
  const d = Number(duration) || 5
  switch (model) {
    case 'veo3_1':   return 58            // fixed ~8s clip
    case 'kling3_0':
    case 'kling2_6': return d >= 8 ? 14 : 7   // clip is 5s (≈7) or 10s (≈14)
    default:         return Math.round(d * ((info.credits || 15) / 5)) // seedance: ~5 cr/sec
  }
}
export function imageCredits(model) {
  const info = modelInfo(model)
  return info.unlimited ? 0 : (info.credits || 1)
}

const norm = (e) => String(e || '').toLowerCase().trim()
const key = (email) => `usage:${norm(email)}`
const curMonth = () => new Date().toISOString().slice(0, 7) // YYYY-MM

// Generic counter — used for Claude calls/tokens (no HF credits).
export async function recordUsage(email, field, count = 1) {
  if (!email || !field || !count) return
  try { await redis().hincrby(key(email), field, count) } catch {}
}

// Record an image/video generation. Bumps all-time + monthly per-model counts
// and (for credit-consuming models) all-time + monthly credit totals.
export async function recordGeneration({ email, kind, model, count = 1, duration }) {
  if (!email || !model || !count) return
  const r = redis()
  const prefix = kind === 'video' ? 'vid' : 'img'
  const m = String(model).slice(0, 40)
  const credits = (kind === 'video' ? videoCredits(model, duration) : imageCredits(model)) * count
  const month = curMonth()
  try {
    await r.hincrby(key(email), `${prefix}:${m}`, count)
    await r.hincrby(key(email), `mc:${month}:${prefix}:${m}`, count)
    if (credits) {
      await r.hincrby(key(email), 'credits', credits)
      await r.hincrby(key(email), `credits:${month}`, credits)
      await r.hincrby(key(email), `mcr:${month}:${prefix}:${m}`, credits) // exact per-model monthly credits
    }
  } catch {}
}

// All-time summary for a single user (used by the Team panel rows).
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

// ── Plan-true cost report (for the Costs dashboard) ──────────────────────────
// Aggregates THIS MONTH across the whole team: per-model counts, per-user
// activity, exact credit draw-down vs the monthly budget, and the real bill.
export async function getCostsReport(emails, month) {
  month = month || curMonth()
  const list = emails || []
  const hashes = await Promise.all(list.map(async (e) => ({ email: norm(e), h: (await redis().hgetall(key(e))) || {} })))

  const perModel = {}        // model -> count (this month)
  const perModelCredits = {} // model -> exact credits (this month)
  const users = []
  let creditsUsed = 0
  let totalGenerations = 0, totalImages = 0, totalVideos = 0
  const mcPrefix = `mc:${month}:`
  const mcrPrefix = `mcr:${month}:`

  for (const { email, h } of hashes) {
    const uCredits = Number(h[`credits:${month}`]) || 0
    creditsUsed += uCredits
    let uGen = 0
    for (const [f, vRaw] of Object.entries(h)) {
      const v = Number(vRaw) || 0
      if (f.startsWith(mcrPrefix)) {
        const rest = f.slice(mcrPrefix.length)
        const model = rest.slice(rest.indexOf(':') + 1)
        perModelCredits[model] = (perModelCredits[model] || 0) + v
        continue
      }
      if (!f.startsWith(mcPrefix)) continue
      const rest = f.slice(mcPrefix.length)          // "vid:veo3_1" | "img:gpt_image_2"
      const sep = rest.indexOf(':')
      const prefix = rest.slice(0, sep)
      const model = rest.slice(sep + 1)
      perModel[model] = (perModel[model] || 0) + v
      uGen += v
      totalGenerations += v
      if (prefix === 'img') totalImages += v; else totalVideos += v
    }
    if (uGen > 0 || uCredits > 0) {
      users.push({ email, generations: uGen, credits: uCredits, estUsd: Math.round(uCredits * CREDIT_USD * 100) / 100 })
    }
  }

  const models = Object.entries(perModel).map(([model, count]) => {
    const info = modelInfo(model)
    const credits = info.unlimited ? 0 : (perModelCredits[model] || count * (info.credits || 15))
    return { model, label: info.label, kind: info.kind, unlimited: info.unlimited, count, credits, estUsd: Math.round(credits * CREDIT_USD * 100) / 100 }
  }).sort((a, b) => b.count - a.count)

  users.sort((a, b) => b.credits - a.credits || b.generations - a.generations)

  const overageCredits = Math.max(0, creditsUsed - PLAN.monthlyCredits)
  const estOverageUsd = Math.round(overageCredits * CREDIT_USD * 100) / 100

  return {
    plan: { ...PLAN, creditUsd: CREDIT_USD },
    month,
    creditsUsed,
    creditsBudget: PLAN.monthlyCredits,
    overageCredits,
    estOverageUsd,
    billUsd: Math.round((PLAN.monthlyUsd + estOverageUsd) * 100) / 100,
    models,
    users,
    totals: { generations: totalGenerations, images: totalImages, videos: totalVideos },
  }
}
