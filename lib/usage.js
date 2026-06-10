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
// The shared account is on the Higgsfield **Ultra** plan: $310/mo for 9,000
// credits, reloading on the 11th of each month. On this plan all IMAGE models are
// unlimited ($0 marginal) and only VIDEO models draw credits. The dashboard LEADS
// with the live balance/ledger from Higgsfield; these constants drive the cost
// model (cycle spend + per-member/-project allocation). CREDIT_USD is the real
// marginal cost of a credit observed from Higgsfield top-up packs (~$0.045).
export const BASE_USD = 310          // fixed Ultra subscription per cycle
export const MONTHLY_CREDITS = 9000  // credits included per cycle
export const CREDIT_USD = 0.045      // marginal $ per credit (top-up rate)
export const RESET_DAY = 11          // credits reload on the 11th
// Blended allocation weight for an image (videos are weighted by their credits).
// Images are $0 marginal but still take a small share of the fixed fee so every
// job/member/client carries a real cost. Tune this to rebalance image vs video.
export const IMAGE_WEIGHT = 1
export const PLAN = { name: 'Ultra', monthlyUsd: BASE_USD, monthlyCredits: MONTHLY_CREDITS, resetDay: RESET_DAY }

// ── Billing cycle ────────────────────────────────────────────────────────────
// Reporting follows the Higgsfield credit-reset cycle, not the calendar month.
// The Ultra plan started on 2026-06-10 and the first 9,000-credit reload lands on
// 2026-07-11; credits reload on the 11th every month after that. The very first
// cycle therefore runs subscription-start → first reload (a little over a month);
// every later cycle is a clean 11th → 11th. Update these two anchors if the
// plan/billing date ever changes.
const SUB_START_MS = Date.UTC(2026, 5, 10)   // 2026-06-10 — cycle 1 start
const FIRST_RESET_MS = Date.UTC(2026, 6, 11) // 2026-07-11 — first credit reload
const addMonthsUTC = (ms, n) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()) }

// The cycle containing `date`. Its key is the start date (YYYY-MM-DD).
export function cyclePeriod(date = new Date()) {
  const t = (date instanceof Date ? date : new Date(date)).getTime()
  let startMs, endMs
  if (t < FIRST_RESET_MS) {
    startMs = SUB_START_MS; endMs = FIRST_RESET_MS        // cycle 1 (subscription run-up)
  } else {
    let k = 0
    while (addMonthsUTC(FIRST_RESET_MS, k + 1) <= t) k++  // monthly on the 11th thereafter
    startMs = addMonthsUTC(FIRST_RESET_MS, k); endMs = addMonthsUTC(FIRST_RESET_MS, k + 1)
  }
  const start = new Date(startMs), end = new Date(endMs)
  const key = start.toISOString().slice(0, 10)
  const fmt = (dt) => dt.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const label = `${fmt(start)} – ${fmt(new Date(endMs - 86400000))}`
  return { key, label, start, end }
}

// Cycles from the current one back to cycle 1, most recent first (dashboard selector).
export function recentCycles(count = 6) {
  const out = []
  let probe = Date.now()
  for (let i = 0; i < count; i++) {
    const c = cyclePeriod(new Date(probe))
    out.push({ key: c.key, label: c.label })
    if (c.start.getTime() <= SUB_START_MS) break // reached cycle 1
    probe = c.start.getTime() - 86400000          // step into the previous cycle
  }
  return out
}

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
  const month = cyclePeriod().key // billing-cycle key (11th → 10th)
  const day = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
  try {
    await r.hincrby(key(email), `${prefix}:${m}`, count)
    await r.hincrby(key(email), `mc:${month}:${prefix}:${m}`, count)
    await r.hincrby(key(email), `d${prefix}:${day}`, count) // daily image/video counts for charts

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
// Aggregates ONE BILLING CYCLE across the whole team: per-model counts, per-user
// activity, the exact credit draw-down vs the 9,000 budget, the real cycle bill,
// and a blended per-member cost allocation (fixed fee spread by credit-weight).
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export async function getCostsReport(emails, cycleKey) {
  const cycle = cyclePeriod(cycleKey ? new Date(cycleKey) : new Date())
  const month = cycle.key
  const list = emails || []
  const hashes = await Promise.all(list.map(async (e) => ({ email: norm(e), h: (await redis().hgetall(key(e))) || {} })))

  const perModel = {}        // model -> count (this cycle)
  const perModelCredits = {} // model -> exact credits (this cycle)
  const rawUsers = []
  let creditsUsed = 0
  let totalGenerations = 0, totalImages = 0, totalVideos = 0
  const dayMap = {}          // YYYY-MM-DD -> { images, videos } (this cycle)
  const cycleAgg = {}        // cycleKey   -> { images, videos } (all cycles)
  const mcrPrefix = `mcr:${month}:`
  const startKey = cycle.key
  const endKey = cycle.end.toISOString().slice(0, 10)
  const inCycle = (d) => d >= startKey && d < endKey

  for (const { email, h } of hashes) {
    const uCredits = Number(h[`credits:${month}`]) || 0
    creditsUsed += uCredits
    let uGen = 0, uImages = 0, uVideos = 0
    for (const [f, vRaw] of Object.entries(h)) {
      const v = Number(vRaw) || 0
      if (f.startsWith('dimg:')) { const d = f.slice(5); if (inCycle(d)) (dayMap[d] = dayMap[d] || { images: 0, videos: 0 }).images += v; continue }
      if (f.startsWith('dvid:')) { const d = f.slice(5); if (inCycle(d)) (dayMap[d] = dayMap[d] || { images: 0, videos: 0 }).videos += v; continue }
      if (f.startsWith(mcrPrefix)) {
        const rest = f.slice(mcrPrefix.length)
        const model = rest.slice(rest.indexOf(':') + 1)
        perModelCredits[model] = (perModelCredits[model] || 0) + v
        continue
      }
      if (f.startsWith('mc:')) {
        const rest = f.slice(3)                        // "2026-06-10:img:gpt_image_2"
        const c1 = rest.indexOf(':')
        const ck = rest.slice(0, c1)                   // cycle key
        const rest2 = rest.slice(c1 + 1)               // "img:gpt_image_2"
        const sep = rest2.indexOf(':')
        const prefix = rest2.slice(0, sep)
        const model = rest2.slice(sep + 1)
        const agg = (cycleAgg[ck] = cycleAgg[ck] || { images: 0, videos: 0 })
        if (prefix === 'img') agg.images += v; else agg.videos += v
        if (ck === month) {
          perModel[model] = (perModel[model] || 0) + v
          uGen += v; totalGenerations += v
          if (prefix === 'img') { totalImages += v; uImages += v } else { totalVideos += v; uVideos += v }
        }
        continue
      }
    }
    if (uGen > 0 || uCredits > 0) {
      rawUsers.push({ email, generations: uGen, images: uImages, videos: uVideos, credits: uCredits })
    }
  }

  // Chart series: per-day (this cycle), per-cycle (date-keyed cycles only — ignores
  // legacy calendar-month test data), and cumulative to date.
  const daily = Object.entries(dayMap).map(([date, x]) => ({ date, images: x.images, videos: x.videos })).sort((a, b) => a.date < b.date ? -1 : 1)
  const cycleSeries = Object.entries(cycleAgg).filter(([k]) => k.length === 10)
    .map(([k, x]) => ({ key: k, label: cyclePeriod(new Date(k)).label, images: x.images, videos: x.videos })).sort((a, b) => a.key < b.key ? -1 : 1)
  const toDate = cycleSeries.reduce((a, c) => ({ images: a.images + c.images, videos: a.videos + c.videos }), { images: 0, videos: 0 })

  const models = Object.entries(perModel).map(([model, count]) => {
    const info = modelInfo(model)
    const credits = info.unlimited ? 0 : (perModelCredits[model] || count * (info.credits || 15))
    return { model, label: info.label, kind: info.kind, unlimited: info.unlimited, count, credits, estUsd: round2(credits * CREDIT_USD) }
  }).sort((a, b) => b.credits - a.credits || b.count - a.count)

  // Cycle bill = fixed fee + any credit overage beyond the 9,000 included.
  const overageCredits = Math.max(0, creditsUsed - MONTHLY_CREDITS)
  const estOverageUsd = round2(overageCredits * CREDIT_USD)
  const cycleSpendUsd = round2(BASE_USD + estOverageUsd)

  // Blended allocation: weight = video credits + IMAGE_WEIGHT per image. Spread the
  // whole cycle bill across the team by weight so every member carries a real $.
  const teamWeight = rawUsers.reduce((s, u) => s + u.credits + u.images * IMAGE_WEIGHT, 0)
  const users = rawUsers.map(u => {
    const weight = u.credits + u.images * IMAGE_WEIGHT
    return {
      ...u,
      weight,
      creditValueUsd: round2(u.credits * CREDIT_USD),
      allocatedUsd: teamWeight > 0 ? round2((weight / teamWeight) * cycleSpendUsd) : 0,
    }
  }).sort((a, b) => b.allocatedUsd - a.allocatedUsd || b.credits - a.credits)

  // Days until the next reset (the upcoming 11th).
  const now = new Date()
  const daysToReset = Math.max(0, Math.ceil((cycle.end.getTime() - now.getTime()) / 86400000))

  return {
    plan: { ...PLAN, creditUsd: CREDIT_USD, baseUsd: BASE_USD, imageWeight: IMAGE_WEIGHT },
    cycle: { key: cycle.key, label: cycle.label, start: cycle.start.toISOString(), end: cycle.end.toISOString(), resetDate: cycle.end.toISOString(), daysToReset },
    cycles: recentCycles(6),
    creditsUsed,
    creditsBudget: MONTHLY_CREDITS,
    overageCredits,
    estOverageUsd,
    cycleSpendUsd,
    billUsd: cycleSpendUsd,
    models,
    users,
    totals: { generations: totalGenerations, images: totalImages, videos: totalVideos, videoCredits: creditsUsed },
    daily,        // [{ date, images, videos }] within the selected cycle
    cycleSeries,  // [{ key, label, images, videos }] across cycles
    toDate,       // { images, videos } cumulative across all tracked cycles
  }
}
