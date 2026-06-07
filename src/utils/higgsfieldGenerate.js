import { getHFToken, refreshHFToken } from './higgsfieldAuth'

const MCP_URL = '/api/hf/mcp'
const PENDING_KEY = 'hf_pending_gens'

// Flip to true while diagnosing Higgsfield issues — verbose request/response logs
const HF_DEBUG = false
const hflog = (...a) => { if (HF_DEBUG) console.log('[HF]', ...a) }

let _sessionId = null

// Persistent media cache — survives page reloads so reference images are never re-uploaded
const MEDIA_CACHE_KEY = 'hf_media_cache'
const _mediaCache = (() => {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(MEDIA_CACHE_KEY) || '{}'))) }
  catch { return new Map() }
})()
function _mediaCacheSave() {
  try { localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(Object.fromEntries(_mediaCache))) }
  catch { /* quota full — cache in memory only */ }
}

function mediaFingerprint(dataUrl) {
  return `${dataUrl.length}:${dataUrl.slice(0, 48)}:${dataUrl.slice(-24)}`
}

// ── Pending generation persistence ──────────────────────────────
export function savePendingGen(influencerId, slot, jobIds) {
  const list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
  const filtered = list.filter(j => !(j.influencerId === influencerId && j.slot === slot))
  filtered.push({ influencerId, slot, jobIds, startedAt: Date.now() })
  localStorage.setItem(PENDING_KEY, JSON.stringify(filtered))
}

export function clearPendingGen(influencerId, slot) {
  const list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
  localStorage.setItem(PENDING_KEY, JSON.stringify(
    list.filter(j => !(j.influencerId === influencerId && j.slot === slot))
  ))
}

export function getPendingGens() {
  return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
}

// ── Pending VIDEO generation persistence ────────────────────────
const PENDING_VIDEO_KEY = 'hf_pending_videos'
const PENDING_PHOTO_KEY = 'hf_pending_photos_v2'
// Session token: saved to sessionStorage when a photo generation starts.
// The resume effect checks for it — if missing (fresh tab/reload without an in-flight gen)
// the pending entry is discarded so stale entries never block the Generate button.
const PHOTO_SESSION_KEY = 'hf_photo_gen_session'
export function markPhotoGenSession() { try { sessionStorage.setItem(PHOTO_SESSION_KEY, '1') } catch {} }
export function hasPhotoGenSession()  { try { return !!sessionStorage.getItem(PHOTO_SESSION_KEY) } catch { return false } }

export function savePendingVideo(influencerId, jobIds, count) {
  const list = JSON.parse(localStorage.getItem(PENDING_VIDEO_KEY) || '[]')
  const next = list.filter(j => j.influencerId !== influencerId)
  next.push({ influencerId, jobIds, count, startedAt: Date.now() })
  localStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(next))
}

export function clearPendingVideo(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_VIDEO_KEY) || '[]')
  localStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(
    list.filter(j => j.influencerId !== influencerId)
  ))
}

export function getPendingVideo(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_VIDEO_KEY) || '[]')
  return list.find(j => j.influencerId === influencerId) || null
}

export function savePendingPhoto(influencerId, jobIds) {
  const list = JSON.parse(localStorage.getItem(PENDING_PHOTO_KEY) || '[]')
  const next = list.filter(j => j.influencerId !== influencerId)
  next.push({ influencerId, jobIds, startedAt: Date.now() })
  localStorage.setItem(PENDING_PHOTO_KEY, JSON.stringify(next))
}
export function clearPendingPhoto(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_PHOTO_KEY) || '[]')
  localStorage.setItem(PENDING_PHOTO_KEY, JSON.stringify(list.filter(j => j.influencerId !== influencerId)))
}
export function getPendingPhoto(influencerId) {
  const list = JSON.parse(localStorage.getItem(PENDING_PHOTO_KEY) || '[]')
  return list.find(j => j.influencerId === influencerId) || null
}

export async function resumeVideoJob(jobIds, count, onProgress, onPartialResults, isCancelled) {
  await initSession()
  return pollVideoJobs(jobIds, count, onProgress, onPartialResults, isCancelled)
}

// Direct-to-Higgsfield call — bypasses the Vercel proxy so Higgsfield sees the browser's real
// IP instead of a Vercel datacenter IP. Used as fallback when the proxy call is IP-blocked.
async function mcpPostDirect(body) {
  const token = getHFToken()
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${token}`,
  }
  if (_sessionId) headers['Mcp-Session-Id'] = _sessionId

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch('https://mcp.higgsfield.ai/mcp', {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Higgsfield direct error ${res.status}: ${errText}`)
    }
    const sid = res.headers.get('Mcp-Session-Id')
    if (sid) _sessionId = sid
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/event-stream')) return await parseSSEStream(res, controller.signal)
    const rawText = await res.text()
    if (rawText.trimStart().startsWith('data:')) return parseSSEText(rawText)
    try { return JSON.parse(rawText) } catch { return rawText }
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('Higgsfield direct call timed out')
    throw e
  }
}

async function mcpPost(body, isRetry = false) {
  const token = getHFToken()
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${token}`,
  }
  if (_sessionId) headers['Mcp-Session-Id'] = _sessionId

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  let res
  try {
    res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('Higgsfield timed out — your session may have expired. Reconnect in Settings.')
    throw new Error('Connection error — check your internet connection or reconnect Higgsfield in Settings')
  }

  if (res.status === 401) {
    clearTimeout(timeout)
    if (isRetry) throw new Error('Higgsfield session expired — please reconnect in Settings')
    try {
      await refreshHFToken()
      _sessionId = null // force new session with fresh token
      return mcpPost(body, true)
    } catch {
      throw new Error('Higgsfield session expired — please reconnect in Settings')
    }
  }
  if (!res.ok) {
    clearTimeout(timeout)
    const errText = await res.text().catch(() => '')
    throw new Error(`Higgsfield API error ${res.status}: ${errText}`)
  }

  const sid = res.headers.get('Mcp-Session-Id')
  if (sid) _sessionId = sid

  const ct = res.headers.get('content-type') || ''
  hflog('[HF] content-type:', ct)

  // Keep the AbortController active through body reading — clearTimeout only in finally.
  // parseSSEStream's while(true) read loop can hang indefinitely if the server sends
  // 200 OK with an event-stream content-type but never emits any events.
  try {
    if (ct.includes('text/event-stream')) {
      return await parseSSEStream(res, controller.signal)
    }
    const rawText = await res.text()
    hflog('[HF] raw body:', rawText.slice(0, 600))
    if (rawText.trimStart().startsWith('data:')) return parseSSEText(rawText)
    try { return JSON.parse(rawText) } catch { return rawText }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Higgsfield timed out — your session may have expired. Reconnect in Settings.')
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

function parseSSEText(text) {
  let resultEvent = null
  let lastNonNull = null
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const raw = trimmed.slice(5).trim()
    if (!raw || raw === '[DONE]') continue
    try {
      const d = JSON.parse(raw)
      if (d !== null) {
        lastNonNull = d
        if (d.result !== undefined) resultEvent = d
      }
    } catch {}
  }
  return resultEvent ?? lastNonNull
}

// Stream SSE events in real-time — returns as soon as the first result event arrives,
// without waiting for the server to close the stream (which can take minutes for video jobs).
// signal: the AbortController signal from mcpPost — if it fires, the read loop exits.
async function parseSSEStream(response, signal) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastNonNull = null
  let resultEvent = null

  // Wake the reader loop when the abort signal fires
  const onAbort = () => reader.cancel().catch(() => {})
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const raw = trimmed.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          const d = JSON.parse(raw)
          if (d !== null) {
            lastNonNull = d
            if (d.result !== undefined) {
              resultEvent = d
              reader.cancel().catch(() => {})
              return resultEvent
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    if (resultEvent) return resultEvent
    // If the abort fired and we have no result yet, let the caller handle AbortError
    if (signal?.aborted) throw Object.assign(new Error('Higgsfield timed out'), { name: 'AbortError' })
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
  return resultEvent ?? lastNonNull
}

export async function initSession() {
  _sessionId = null
  await mcpPost({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'AI Influencer Studio', version: '1.0' },
    },
  })
}

async function callTool(name, args) {
  const res = await mcpPost({
    jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
    params: { name, arguments: args },
  })
  const result = res?.result ?? res
  hflog(`[HF] callTool(${name}) =>`, JSON.stringify(result)?.slice(0, 500))
  return result
}

function unwrapMCP(result) {
  if (!result?.content) return result
  for (const item of result.content) {
    if (item.text) {
      try { return JSON.parse(item.text) } catch { return item.text }
    }
  }
  return result
}

function extractJobIds(result) {
  const data = unwrapMCP(result)

  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data.results)) {
      const ids = data.results.map(r => r?.id || r?.job_id).filter(id => id?.length >= 8)
      if (ids.length) return ids
    }
    if (data.job_id) return [data.job_id]
    if (data.jobId) return [data.jobId]
    if (typeof data.id === 'string' && data.id.length >= 8) return [data.id]
  }

  // Plain-text response: extract UUIDs embedded in the description
  const str = typeof data === 'string' ? data : JSON.stringify(data ?? '')
  const uuids = str.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []
  hflog('[HF] extracted UUIDs from text:', uuids)
  return [...new Set(uuids)]
}

function extractVideoUrls(result) {
  const data = unwrapMCP(result)
  // Structured path — rawUrl / minUrl are CDN video links (no extension filter needed)
  if (Array.isArray(data?.results)) {
    const urls = data.results
      .map(r => r?.results?.rawUrl || r?.results?.minUrl || r?.result_url)
      .filter(Boolean)
    if (urls.length) return [...new Set(urls)]
  }
  // Plain-text fallback — scan for video extensions
  const str = typeof data === 'string' ? data : JSON.stringify(data)
  const raw = str.match(/https:\/\/[^\s"\\]+\.(?:mp4|webm|mov)(?:[^\s"\\]*)?/g) || []
  return [...new Set(raw.map(u => u.replace(/[\\}"']+$/, '')))]
}

function extractShareUrls(result) {
  const data = unwrapMCP(result)
  // Structured fields first
  if (Array.isArray(data?.results)) {
    const urls = data.results
      .map(r => r?.results?.shareUrl || r?.results?.share_url || r?.shareUrl || r?.share_url)
      .filter(Boolean)
    if (urls.length) return [...new Set(urls)]
  }
  // Text scan for the known share link pattern: higgsfield.ai/s/{shortId}
  const str = typeof data === 'string' ? data : JSON.stringify(data)
  const raw = str.match(/https:\/\/higgsfield\.ai\/s\/[A-Za-z0-9_-]+/g) || []
  return [...new Set(raw.map(u => u.replace(/[\\}"']+$/, '')))]
}

// True failure terminals — jobs that will never produce a URL
const VIDEO_FAIL_TERMINAL = new Set(['failed', 'error', 'cancelled', 'rejected', 'nsfw', 'content_filtered', 'not_found'])
// "Soft" terminals — job says done but URL may not be propagated yet; retry a few times
const VIDEO_SOFT_TERMINAL = new Set(['completed', 'done'])

async function pollVideoJobs(jobIds, total, onProgress, onPartialResults, isCancelled) {
  const pending = new Set(jobIds)
  const urls = []
  const shareUrls = []
  const softRetries = new Map() // jobId → count of rounds seen as soft-terminal with no URL

  for (let round = 0; round < 270; round++) { // 270 × 2s = 9 minutes max
    if (isCancelled?.()) throw new Error('CANCELLED')
    if (round > 0) await new Promise(r => setTimeout(r, 2000))
    if (isCancelled?.()) throw new Error('CANCELLED')

    for (const jobId of [...pending]) {
      if (isCancelled?.()) throw new Error('CANCELLED')
      try {
        const result = await callTool('job_status', { jobId })
        const data = unwrapMCP(result)
        if (round < 2) console.log(`[HF-VID] job_status ${jobId.slice(0, 8)}:`, JSON.stringify(data)?.slice(0, 400))

        const item = Array.isArray(data?.results) ? data.results[0] : data
        const resultsObj = Array.isArray(data?.results) ? item?.results : data?.results

        const url = resultsObj?.rawUrl || resultsObj?.minUrl || item?.result_url || item?.url
          || extractVideoUrls(result)[0] || null
        const shareUrl = resultsObj?.shareUrl || resultsObj?.share_url || item?.shareUrl || item?.share_url
          || extractShareUrls(result)[0] || null
        const status = (item?.status || data?.status || '').toLowerCase()

        if (url) {
          pending.delete(jobId)
          softRetries.delete(jobId)
          if (!urls.includes(url)) {
            urls.push(url)
            if (shareUrl) shareUrls.push(shareUrl)
            onProgress?.(Math.min(35 + (urls.length / total) * 60, 95))
            onPartialResults?.(urls.slice(0, total))
          }
        } else if (VIDEO_FAIL_TERMINAL.has(status)) {
          pending.delete(jobId)
          console.warn('[HF-VID] job', jobId.slice(0, 8), 'failed, status:', status)
        } else if (VIDEO_SOFT_TERMINAL.has(status)) {
          // Job says completed but no URL yet — CDN propagation lag or format mismatch.
          // Retry up to 8 more rounds (~16s) before giving up.
          const retries = (softRetries.get(jobId) || 0) + 1
          softRetries.set(jobId, retries)
          if (retries >= 8) {
            pending.delete(jobId)
            console.warn('[HF-VID] job', jobId.slice(0, 8), 'completed but URL never appeared after retries')
          } else {
            console.log(`[HF-VID] job ${jobId.slice(0, 8)} soft-terminal retry ${retries}/8`)
          }
        }
      } catch (e) {
        if (e.message === 'CANCELLED') throw e
        console.warn('[HF-VID] job_status error:', jobId.slice(0, 8), e.message)
      }
    }

    console.log(`[HF-VID] round ${round} → ${urls.length}/${total} URLs, ${pending.size} pending`)
    if (urls.length >= total) break
    if (pending.size === 0) break
  }

  if (urls.length > 0) {
    onProgress?.(100)
    return { urls: urls.slice(0, total), shareUrls: shareUrls.slice(0, total) }
  }
  if (pending.size === 0) throw new Error('Video generation failed — all jobs ended without output')
  throw new Error('Video generation timed out — check Higgsfield dashboard')
}

// Shared upload pipeline for any media kind. Caches by fingerprint so the same
// data URL is never uploaded twice. Returns the CDN URL (or media_id as fallback).
async function uploadMedia(dataUrl, { type, defaultContentType, getExt, prefix }) {
  const fp = mediaFingerprint(dataUrl)
  if (_mediaCache.has(fp)) {
    hflog(`[HF] media cache hit (${type}) — skipping upload`)
    return _mediaCache.get(fp)
  }

  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const contentType = blob.type || defaultContentType
  const ext = getExt(contentType)
  const filename = `${prefix}_${Date.now()}.${ext}`

  const uploadResult = await callTool('media_upload', { method: 'upload_url', filename, content_type: contentType })
  const uploadData = unwrapMCP(uploadResult)
  hflog('[HF] media_upload raw:', JSON.stringify(uploadData)?.slice(0, 500))

  const f0 = uploadData?.uploads?.[0] ?? uploadData?.files?.[0] ?? uploadData?.data?.[0]
  let uploadUrl = uploadData?.upload_url || uploadData?.url || f0?.upload_url || f0?.url
  let mediaId   = uploadData?.media_id  || uploadData?.id  || f0?.media_id  || f0?.id

  // Plain-text response — extract via regex
  if (!uploadUrl || !mediaId) {
    const text = typeof uploadData === 'string' ? uploadData : JSON.stringify(uploadData ?? '')
    const uuids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []
    if (uuids.length) mediaId = uuids[0]
    const urlMatch = text.match(/https:\/\/[^\s"'\\]+/)
    if (urlMatch) uploadUrl = urlMatch[0]
  }
  if (!uploadUrl || !mediaId) {
    throw new Error(`media_upload failed — got: ${JSON.stringify(uploadData)?.slice(0, 200) ?? 'null'}`)
  }

  const putRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } })
  if (!putRes.ok) throw new Error(`${type} upload failed: ${putRes.status}`)

  const confirmResult = await callTool('media_confirm', { media_id: mediaId, type })
  const confirmed = unwrapMCP(confirmResult)
  hflog('[HF] media_confirm raw:', JSON.stringify(confirmed)?.slice(0, 500))

  const cdnUrl = confirmed?.url || confirmed?.media_url || confirmed?.rawUrl || confirmed?.cdn_url
  if (cdnUrl) { _mediaCache.set(fp, cdnUrl); _mediaCacheSave(); return cdnUrl }

  if (typeof confirmed === 'string') {
    const urlMatch = confirmed.match(/https:\/\/[^\s"'\\]+/)
    if (urlMatch) { _mediaCache.set(fp, urlMatch[0]); _mediaCacheSave(); return urlMatch[0] }
  }

  const fallback = confirmed?.media_id || confirmed?.id || mediaId
  _mediaCache.set(fp, fallback); _mediaCacheSave()
  return fallback
}

const uploadAudioFile = dataUrl => uploadMedia(dataUrl, {
  type: 'audio',
  defaultContentType: 'audio/mpeg',
  getExt: ct => ct.includes('wav') ? 'wav' : (ct.includes('mp4') || ct.includes('m4a')) ? 'm4a' : 'mp3',
  prefix: 'audio',
})

export async function generateVideo({ prompt, aspectRatio = '9:16', duration = 8, count = 1, referenceImages = [], audioRef = null, startFrameUrl = null, model = 'seedance_2_0', resolution = '1080p', onProgress, onPartialResults, isCancelled, pendingKey = null }) {
  await initSession()
  onProgress?.(5)

  // start_image first (if any), then @image_N reference images, then audio
  const medias = []

  if (startFrameUrl) {
    try {
      const id = await uploadRefImage(startFrameUrl)
      medias.push({ value: id, role: 'start_image' })
    } catch (e) {
      console.warn('[HF] start frame upload failed, skipping:', e.message)
    }
  }

  // Upload all reference images in parallel — order preserved for correct @image_N mapping
  const imageMedias = (await Promise.all(
    referenceImages.filter(Boolean).map(async imgDataUrl => {
      try {
        return { value: await uploadRefImage(imgDataUrl), role: 'image' }
      } catch (e) {
        console.warn('[HF] video ref upload failed, skipping:', e.message)
        return null
      }
    })
  )).filter(Boolean)
  medias.push(...imageMedias)

  if (audioRef) {
    try {
      const audioId = await uploadAudioFile(audioRef)
      medias.push({ value: audioId, role: 'audio' })
    } catch (e) {
      console.warn('[HF] audio upload failed, skipping:', e.message)
    }
  }

  const params = {
    model,
    prompt,
    aspect_ratio: aspectRatio,
    duration,
    resolution,
    mode: 'std',
  }
  if (medias.length) params.medias = medias
  onProgress?.(25)

  // Higgsfield video API generates 1 per call — fire N sequential requests for count > 1
  // (parallel calls conflict over the shared MCP session)
  // Each call gets a unique invisible suffix so Higgsfield doesn't deduplicate identical params into the same job.
  const results = []
  for (let i = 0; i < count; i++) {
    const callParams = i === 0 ? params : { ...params, prompt: params.prompt + '​'.repeat(i) }
    let res = await callTool('generate_video', { params: callParams })

    // Higgsfield sometimes returns a preset-match notice instead of a job.
    const presetNoticeId = (() => {
      const str = JSON.stringify(unwrapMCP(res) ?? '')
      const m = str.match(/declined_preset_id[^a-f0-9]*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      return m ? m[1] : null
    })()
    if (presetNoticeId) {
      // Decline the preset — generate literally with the original model (seedance).
      // The proxy IP gets blocked by Higgsfield on this path, so fall back to a direct
      // browser call (user's real IP) if the proxy attempt returns "IP detected".
      console.log('[HF-VID] preset notice — declining, retrying literally:', presetNoticeId)
      const declineParams = { ...params, declined_preset_id: presetNoticeId }
      res = await callTool('generate_video', { params: declineParams })

      const proxyRaw = JSON.stringify(unwrapMCP(res) ?? '')
      if (proxyRaw.toLowerCase().includes('ip detected')) {
        console.log('[HF-VID] proxy IP blocked — retrying via direct browser call')
        try {
          const directBody = { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'generate_video', arguments: { params: declineParams } } }
          const directRaw = await mcpPostDirect(directBody)
          res = directRaw?.result ?? directRaw
        } catch (corsErr) {
          console.warn('[HF-VID] direct call failed:', corsErr.message)
          // Keep the IP-detected result — the error check below will surface it clearly
        }
      }
    }
    results.push(res)
  }
  onProgress?.(30)

  console.log('[HF-VID] generate_video raw[0]:', JSON.stringify(unwrapMCP(results[0]))?.slice(0, 600))

  // Check for hard error responses before treating response UUIDs as job IDs
  for (const res of results) {
    const raw = JSON.stringify(unwrapMCP(res) ?? '')
    const errMatch = raw.match(/Error starting generation[^\\"]{0,120}/)
    if (errMatch) {
      const msg = errMatch[0].replace(/\\n/g, ' ').trim()
      if (msg.toLowerCase().includes('ip detected')) {
        throw new Error('Higgsfield blocked this request (IP/account restriction). Try reconnecting Higgsfield in Settings, or wait a few minutes before retrying.')
      }
      throw new Error(msg)
    }
  }

  const directUrls = results.flatMap(r => extractVideoUrls(r))
  if (directUrls.length >= count) { onProgress?.(100); return { urls: directUrls.slice(0, count), shareUrls: [] } }

  const jobIds = results.flatMap(r => extractJobIds(r)).filter(Boolean)
  console.log('[HF-VID] job IDs:', jobIds)
  if (!jobIds.length) throw new Error(`No job IDs returned. Response: ${JSON.stringify(unwrapMCP(results[0]))?.slice(0, 300)}`)

  if (pendingKey) savePendingVideo(pendingKey, jobIds, count)
  try {
    const result = await pollVideoJobs(jobIds, count, onProgress, onPartialResults, isCancelled)
    onProgress?.(100)
    if (pendingKey) clearPendingVideo(pendingKey)
    return result
  } catch (e) {
    // Only clear the pending entry if this wasn't a navigation-triggered cancel.
    // A cancel from unmount leaves the entry in localStorage so the resume effect
    // on remount can pick up where polling left off.
    if (pendingKey && e.message !== 'CANCELLED') clearPendingVideo(pendingKey)
    throw e
  }
}

function extractImageUrls(result) {
  const data = unwrapMCP(result)

  // Structured: results[].results.rawUrl  (job_display format)
  if (Array.isArray(data?.results)) {
    const urls = data.results
      .map(r => r?.results?.rawUrl || r?.results?.minUrl || r?.result_url)
      .filter(Boolean)
    if (urls.length) return [...new Set(urls)]
  }

  const str = typeof data === 'string' ? data : JSON.stringify(data)

  // Primary: any https URL with a recognized image extension
  const byExt = (str.match(/https:\/\/[^\s"\\]+\.(?:jpg|jpeg|png|webp)(?:[^\s"\\]*)?/g) || [])
    .map(u => u.replace(/[\\}"',]+$/, ''))
  if (byExt.length) return [...new Set(byExt)]

  // Fallback: any https URL from Higgsfield's CloudFront CDN (no extension required)
  const byCDN = (str.match(/https:\/\/[a-z0-9]+\.cloudfront\.net\/[^\s"'\\}]*/gi) || [])
    .map(u => u.replace(/[\\}"',]+$/, ''))
  return [...new Set(byCDN)]
}

function countTerminalJobs(result) {
  const data = unwrapMCP(result)
  if (!Array.isArray(data?.results)) return 0
  return data.results.filter(r => {
    if (r?.results?.rawUrl || r?.results?.minUrl || r?.result_url) return true
    const s = (r?.status || r?.job_status || '').toLowerCase()
    return ['done', 'completed', 'failed', 'error', 'nsfw', 'content_filtered', 'rejected', 'cancelled'].includes(s)
  }).length
}

// When the user's style ref note mentions pose or scene/location, replace those text prompt
// sections with a direct reference to the style image so the text no longer fights the image.
function applyStyleNoteOverrides(prompts, styleNote, styleImg) {
  if (!styleNote) return prompts
  const note = styleNote.toLowerCase()

  const wantsPose  = /\bpose\b|posing/.test(note)
  const wantsScene = /alley|location|scene|background|setting|café|cafe|park|rooftop|studio|hallway|corridor|street|outdoor|indoor|beach|forest|city|room|bar|restaurant|environment/.test(note)

  if (!wantsPose && !wantsScene) return prompts

  return prompts.map(p => {
    if (wantsPose)
      p = p.replace(
        /(\n\nPose: )[\s\S]+?(\n\nWardrobe & details:)/,
        `$1Follow ${styleImg} for the pose and body positioning.$2`
      )
    if (wantsScene) {
      p = p.replace(
        /(\n\nScene: )[\s\S]+?(\n\nSubject:)/,
        `$1Follow ${styleImg} for the location, background, and setting.$2`
      )
      p = p.replace(
        /(\n\nLighting: )[\s\S]+?(\n\nCamera & capture:)/,
        `$1Follow ${styleImg} for the lighting conditions and mood.$2`
      )
    }
    return p
  })
}

// Poll image jobs via job_status (the correct programmatic polling tool).
// Sequential calls per job per round; job_status returns instantly and includes
// poll_after_seconds guidance. Replaces the old job_display-based approach.
async function pollImageJobStatus(jobId) {
  const result = await callTool('job_status', { jobId })
  const data = unwrapMCP(result)
  hflog('[HF] job_status', jobId.slice(0, 8), JSON.stringify(data)?.slice(0, 400))

  // job_status returns a single normalized generation shape: {id, status, results: {rawUrl, minUrl}}
  // Guard against array-wrapped shape too (same as job_display uses)
  const item = Array.isArray(data?.results) ? data.results[0] : data
  const resultsObj = Array.isArray(data?.results) ? item?.results : data?.results

  const url = resultsObj?.rawUrl || resultsObj?.minUrl || item?.result_url || item?.url
    || extractImageUrls(result)[0] || null
  const status = (item?.status || data?.status || '').toLowerCase()
  const pollAfter = data?.poll_after_seconds ?? 3
  return { url, status, pollAfter }
}

const IMAGE_TERMINAL = new Set(['completed', 'done', 'failed', 'error', 'cancelled', 'rejected', 'nsfw', 'content_filtered', 'not_found'])

export async function pollAllJobs(jobIds, total, onProgress, _staleTolerance = 8, isCancelled = null, onPartialResults = null) {
  const pending = new Set(jobIds)
  const urls = []

  for (let round = 0; round < 60 && pending.size > 0 && urls.length < total; round++) {
    if (isCancelled?.()) throw new Error('CANCELLED')
    if (round > 0) await new Promise(r => setTimeout(r, 3000))
    if (isCancelled?.()) throw new Error('CANCELLED')

    for (const jobId of [...pending]) {
      if (isCancelled?.()) throw new Error('CANCELLED')
      try {
        const { url, status } = await pollImageJobStatus(jobId)
        if (url) {
          pending.delete(jobId)
          if (!urls.includes(url)) {
            urls.push(url)
            onProgress?.(Math.min(22 + (urls.length / total) * 73, 95))
            onPartialResults?.(urls.slice(0, total))
          }
        } else if (IMAGE_TERMINAL.has(status)) {
          pending.delete(jobId)
          console.warn('[HF] job', jobId.slice(0, 8), 'terminal without URL, status:', status)
        }
      } catch (e) {
        if (e.message === 'CANCELLED') throw e
        console.warn('[HF] job_status error:', jobId.slice(0, 8), e.message)
      }
    }
  }

  if (urls.length > 0) { onProgress?.(100); return urls.slice(0, total) }
  if (jobIds.length === 0) throw new Error('No job IDs to poll')
  throw new Error('Generation timed out — check Higgsfield dashboard')
}

const uploadRefImage = dataUrl => uploadMedia(dataUrl, {
  type: 'image',
  defaultContentType: 'image/jpeg',
  getExt: ct => ct.includes('png') ? 'png' : 'jpeg',
  prefix: 'ref',
})

function modelBaseParams(model, aspectRatio) {
  if (model === 'soul_2') return { model, aspect_ratio: aspectRatio, quality: '2k' }
  // gpt_image_2 accepts both quality and resolution; callers may add resolution if needed
  if (model === 'gpt_image_2') return { model, aspect_ratio: aspectRatio, count: 1, quality: 'high' }
  return { model, aspect_ratio: aspectRatio, count: 1, resolution: '2k' }
}

export async function generateThreeImages({ prompts, aspectRatio = '9:16', model = 'gpt_image_2', faceRef = null, styleRef = null, physicalDesc = '', faceRefNote = '', styleRefNote = '', onProgress, onPartialResults }) {
  await initSession()
  onProgress?.(5)

  const medias = []
  let refInstruction = ''

  if (faceRef) {
    hflog('[HF] uploading face reference...')
    medias.push({ value: await uploadRefImage(faceRef), role: 'image' })
    onProgress?.(12)
  }
  if (styleRef) {
    hflog('[HF] uploading style reference...')
    medias.push({ value: await uploadRefImage(styleRef), role: 'image' })
    onProgress?.(15)
  }

  const hasDesc = !!(physicalDesc?.trim())
  const faceNote = faceRefNote?.trim()
  const styleNote = styleRefNote?.trim()

  // Build face instruction — user note takes priority; falls back to note-free defaults
  function buildFaceInstruction(imgTag) {
    if (faceNote)
      return `${imgTag}: use specifically "${faceNote}" from this reference.${hasDesc ? ' Use the text description for all other identity attributes.' : ''}`
    return hasDesc
      ? `${imgTag} is a facial geometry reference — match the face proportions (eye spacing, jaw width, nose bridge, face shape) but defer to the text description for skin tone, hair, eye color, and identity. Ignore ${imgTag}'s clothing, background, and lighting.`
      : `${imgTag} is the appearance reference — faithfully recreate this person's face, skin tone, hair, eye color, and overall look exactly as shown.`
  }

  // Build style instruction — user note takes priority; falls back to full extraction list
  function buildStyleInstruction(imgTag) {
    if (styleNote)
      return `${imgTag}: use specifically "${styleNote}" from this reference. Do not copy the face or identity of any person in ${imgTag}.`
    return `${imgTag} is a visual style reference — do NOT copy the face or identity of any person in ${imgTag}. Match the pose and body positioning, outfit aesthetic (silhouette, layering, fabric, styling), color palette, scene and background, lighting mood, and overall photographic vibe.`
  }

  if (faceRef && styleRef) {
    refInstruction = ` ${buildFaceInstruction('@image1')} ${buildStyleInstruction('@image2')}`
  } else if (faceRef) {
    refInstruction = ` ${buildFaceInstruction('@image1')}`
  } else if (styleRef) {
    refInstruction = ` ${buildStyleInstruction('@image1')} The subject's face and identity come entirely from the text description above.`
  }

  const baseParams = modelBaseParams(model, aspectRatio)
  if (medias.length) baseParams.medias = medias

  // If the style note targets pose or scene/location, replace those text sections
  // so the detailed text descriptions no longer fight the style image reference
  const styleImg = (faceRef && styleRef) ? '@image2' : '@image1'
  const finalPrompts = styleRef ? applyStyleNoteOverrides(prompts, styleNote, styleImg) : prompts

  const UUID_RE_3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const mediaUUIDs3 = new Set(
    (baseParams.medias || []).map(m => m.value).filter(v => typeof v === 'string' && UUID_RE_3.test(v))
  )

  async function launchAndCollect(promptList) {
    // Sequential — parallel calls conflict over the shared MCP session
    const results = []
    for (const prompt of promptList) {
      results.push(await callTool('generate_image', { params: { ...baseParams, prompt: prompt + refInstruction } }))
    }
    const directUrls = results.flatMap(r => extractImageUrls(r))
    if (directUrls.length >= promptList.length) return { urls: directUrls, jobIds: [] }
    // Take 1 job ID per call, filtering out known media UUIDs that Higgsfield echoes in responses
    const jobIds = results.map(r => {
      const all = extractJobIds(r)
      const filtered = all.filter(id => !mediaUUIDs3.has(id))
      return filtered[0] ?? all[all.length - 1]
    }).filter(Boolean)
    return { urls: directUrls, jobIds }
  }

  const { urls: directUrls, jobIds } = await launchAndCollect(finalPrompts)
  onProgress?.(22)

  if (directUrls.length >= finalPrompts.length) { onProgress?.(100); return directUrls.slice(0, finalPrompts.length) }

  if (!jobIds.length) throw new Error(`No job IDs found. Check browser console for details.`)
  hflog('[HF] job IDs:', jobIds)

  // With refs, generation takes ~60s longer and variance between jobs is higher
  const hasRef = !!(faceRef || styleRef)
  const staleTolerance = model === 'soul_2'
    ? (hasRef ? 30 : 20)   // Soul: 75s / 50s stale window
    : (hasRef ? 16 : 8)    // Others: 40s / 20s stale window
  const urls = await pollAllJobs(jobIds, finalPrompts.length, onProgress, staleTolerance, null, onPartialResults)

  if (urls.length === 0) throw new Error('No images were generated — try regenerating')
  if (urls.length < finalPrompts.length) {
    console.warn(`[HF] got ${urls.length}/${finalPrompts.length} — returning partial results`)
  }

  onProgress?.(100)
  return urls.slice(0, prompts.length)
}

// Single image generation — uploads base64 ref images properly before generating
export async function generateSingleImage({ prompt, aspectRatio = '16:9', resolution = '4k', referenceImage = null, outfitImage = null, onProgress, pendingKey = null, onJobIds = null, isCancelled = null }) {
  await initSession()
  onProgress?.(5)

  const baseParams = { ...modelBaseParams('gpt_image_2', aspectRatio), resolution }
  const medias = []
  let faceUploaded = false
  let outfitUploaded = false

  if (referenceImage) {
    try {
      hflog('[HF] uploading identity reference...')
      medias.push({ value: await uploadRefImage(referenceImage), role: 'image' })
      faceUploaded = true
      onProgress?.(12)
    } catch (e) {
      console.warn('[HF] reference upload failed, generating without it:', e.message)
    }
  }

  if (outfitImage) {
    try {
      hflog('[HF] uploading outfit reference...')
      medias.push({ value: await uploadRefImage(outfitImage), role: 'image' })
      outfitUploaded = true
      onProgress?.(18)
    } catch (e) {
      console.warn('[HF] outfit reference upload failed:', e.message)
    }
  }

  // Image tags are embedded inline in the prompt by buildPhotoStudioPrompt — no suffix needed
  const finalPrompt = prompt

  const params = { ...baseParams, prompt: finalPrompt }
  if (medias.length) params.medias = medias

  onProgress?.(20)
  const result = await callTool('generate_image', { params })

  const directUrls = extractImageUrls(result)
  if (directUrls.length > 0) { onProgress?.(100); return directUrls[0] }

  const UUID_RE_S = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const mediaUUIDsS = new Set(medias.map(m => m.value).filter(v => typeof v === 'string' && UUID_RE_S.test(v)))
  const allIds = extractJobIds(result)
  const filteredIds = allIds.filter(id => !mediaUUIDsS.has(id))
  const jobIds = filteredIds.length ? filteredIds : (allIds.length ? [allIds[allIds.length - 1]] : [])
  if (!jobIds.length) throw new Error(`No job IDs found. Response: ${JSON.stringify(unwrapMCP(result))?.slice(0, 300)}`)

  if (pendingKey) savePendingGen(pendingKey.influencerId, pendingKey.slot, jobIds)
  onJobIds?.(jobIds)
  try {
    const urls = await pollAllJobs(jobIds, 1, onProgress, 16, isCancelled)
    onProgress?.(100)
    return urls[0] ?? null
  } finally {
    if (pendingKey) clearPendingGen(pendingKey.influencerId, pendingKey.slot)
  }
}

// ── Photo Studio batch generation ────────────────────────────────────────────
// Uploads refs once, launches all N jobs in parallel, polls together, and streams
// results via onResult(url) as each image completes.
export async function generateNImages({ prompt, count = 1, aspectRatio = '9:16', resolution = '4k', referenceImage = null, outfitImage = null, closeUpImage1 = null, closeUpImage2 = null, propImages = [], onProgress, onResult, isCancelled, pendingKey = null }) {
  await initSession()
  onProgress?.(5)

  const medias = []
  // Upload all refs in parallel — order determines @image1..@imageN tags
  const refEntries = [
    { img: referenceImage, label: 'identity' },
    { img: outfitImage,    label: 'outfit'   },
    { img: closeUpImage1,  label: 'closeup1' },
    { img: closeUpImage2,  label: 'closeup2' },
    ...propImages.map((img, i) => ({ img, label: `prop${i + 1}` })),
  ].filter(e => e.img)

  const uploaded = await Promise.all(refEntries.map(async ({ img, label }) => {
    try {
      const value = await uploadRefImage(img)
      return { value, role: 'image' }
    } catch (e) {
      console.warn(`[HF] ${label} upload failed:`, e.message)
      return null
    }
  }))
  uploaded.filter(Boolean).forEach(m => medias.push(m))
  onProgress?.(18)

  const baseParams = { ...modelBaseParams('gpt_image_2', aspectRatio), resolution }
  if (medias.length) baseParams.medias = medias

  // Launch jobs sequentially — parallel calls conflict over the shared MCP session
  // (same reason video generation uses a sequential loop)
  const prompts = Array.isArray(prompt)
    ? prompt
    : Array.from({ length: count }, () => prompt)
  const jobResults = []
  for (const p of prompts) {
    jobResults.push(await callTool('generate_image', { params: { ...baseParams, prompt: p } }))
  }
  onProgress?.(22)

  // Handle any direct URLs (rare but possible)
  const directUrls = jobResults.flatMap(r => extractImageUrls(r))
  directUrls.slice(0, count).forEach(url => onResult?.(url))
  if (directUrls.length >= count) { onProgress?.(100); return }

  const jobIds = [...new Set(jobResults.flatMap(r => extractJobIds(r)))].filter(Boolean)
  hflog('[HF] image job IDs:', jobIds)
  if (!jobIds.length) throw new Error('No job IDs returned from generation')

  if (pendingKey && jobIds.length) { markPhotoGenSession(); savePendingPhoto(pendingKey, jobIds) }

  // Poll via job_status (programmatic polling tool, not job_display which is UI-only).
  // Sequential per job per round — parallel MCP calls conflict on the shared session.
  const pending = new Set(jobIds)
  let deliveredCount = directUrls.length

  for (let round = 0; round < 60 && pending.size > 0 && deliveredCount < count; round++) {
    if (isCancelled?.()) throw new Error('CANCELLED')
    if (round > 0) await new Promise(r => setTimeout(r, 3000))
    if (isCancelled?.()) throw new Error('CANCELLED')

    for (const jobId of [...pending]) {
      if (isCancelled?.()) throw new Error('CANCELLED')
      try {
        const { url, status } = await pollImageJobStatus(jobId)
        if (url) {
          pending.delete(jobId)
          if (deliveredCount < count) {
            deliveredCount++
            onResult?.(url)
            onProgress?.(Math.min(22 + (deliveredCount / count) * 73, 95))
          }
        } else if (IMAGE_TERMINAL.has(status)) {
          pending.delete(jobId)
          console.warn('[HF] job', jobId.slice(0, 8), 'terminal without URL, status:', status)
        }
      } catch (e) {
        if (e.message === 'CANCELLED') throw e
        console.warn('[HF] image poll error:', jobId.slice(0, 8), e.message)
      }
    }
  }

  if (deliveredCount > 0) { onProgress?.(100); return }
  throw new Error('Generation timed out — check Higgsfield dashboard')
}

// ── Pose preview generation ──────────────────────────────────────────────────
// Previews are stored as `standing_${poseId}` or `sitting_${poseId}` in
// influencer.posePreviews. Old keys without a prefix are treated as standing
// for backward compatibility.

const POSE_PREVIEW_DESCS_STANDING = {
  plandid:         'Body angled 25–30 degrees to the camera, weight shifted to back leg, eyes glancing slightly off to the side — relaxed and candid, caught half a second before noticing the camera.',
  candid:          'Mid-laugh at the apex — eyes lit up with genuine joy, head tilted slightly back, one hand raised naturally toward the mouth or chest, body animated and relaxed.',
  'cute-posed':    'Three-quarter turn toward camera, soft warm smile, one hand gently raised near the face or lightly touching the hair, shoulders relaxed and easy, chin slightly tilted down — approachable and poised.',
  walking:         'Mid-stride, weight naturally transferring from one foot to the other, arms swinging relaxed, hair slightly lifted from movement, gaze forward with calm confidence.',
  'mid-turn':      'Body turned 45 degrees away from camera, head turning back over the shoulder with a soft beginning smile, hair sweeping slightly from the turn — caught in the middle of the motion.',
  front:           'Body and head squared directly to the lens, weight shifted onto one hip with the opposite knee slightly bent, arms relaxed at sides, confident direct gaze straight into the camera.',
  'hip-pop':       'Standing, weight fully on one straight leg, the other knee bent causing the hip to drop on that side. One hand on the lower hip, fingers forward, elbow back. A visible gap of air between both arms and the torso. Full body head to toe.',
  triangle:        'Standing at 45 degrees to camera. Near arm raised to hip — elbow bent at 90 degrees, hand resting on hip bone, fingers forward, elbow back — creating a clear triangular gap between arm and body. Far arm relaxed. Gaze slightly downward.',
  'over-shoulder': 'Body turned 50 to 60 degrees away from the camera. Head rotated back over the near shoulder toward the lens — expression of soft surprise, lips gently parted. One hand near the back of the hair, the other mid-swing.',
  'long-line':     'Posture erect from crown to feet. Back foot carries all weight, front leg extended toward camera with knee slightly bent and foot pointed toward the lens. Hips shifted toward the standing leg. Back shoulder dropped down, creating a diagonal from front foot through dropped shoulder. Fingers fully relaxed.',
  'hands-pockets': 'Standing at 30 to 45 degrees to camera. Thumbs hooked into front pockets, shoulders dropped, back leg bearing slightly more weight. Head turned toward camera, chin slightly down and forward.',
  'crossed-arms':  'Standing at 30 degrees to camera. Arms crossed, right forearm resting over left, hands relaxed and not gripping. Elbows at mid-chest height. Chin slightly down and forward, jaw defined. Gaze direct and settled.',
  lean:            'One shoulder resting against a wall or door frame. Body at 60 to 70 degrees to camera, weight fully on wall-side shoulder. Near knee slightly bent, far leg crossed loosely at the ankle. Chin slightly down, gaze direct or into distance.',
}

export async function generatePosePreviews(influencer, onPoseComplete, { stance = 'standing' } = {}) {
  try {
    await initSession()
    const gender = influencer.gender === 'Male' ? 'man' : 'woman'
    const physDesc = (influencer.physicalDesc || '').trim()
    const subjectLine = physDesc ? `${gender}, ${physDesc}` : gender
    const baseParams = {
      model: 'gpt_image_2',
      aspect_ratio: '9:16',
      quality: 'high',
      resolution: '4k',
      count: 1,
    }
    const POSE_IDS = Object.keys(POSE_PREVIEW_DESCS_STANDING)
    const stancePrefix = stance

    const launched = await Promise.all(POSE_IDS.map(async (poseId) => {
      const stancedId = `${stancePrefix}_${poseId}`
      try {
        let medias = []

        if (stance === 'sitting') {
          // Use the standing preview as a pose reference so the body matches
          const standingUrl = influencer.posePreviews?.[`standing_${poseId}`]
            || influencer.posePreviews?.[poseId]
          // Always include the identity reference images
          for (const img of [influencer.mainImage, influencer.characterSheetImage].filter(Boolean)) {
            if (medias.length >= 2) break
            try {
              const value = (typeof img === 'string' && img.startsWith('data:'))
                ? await uploadRefImage(img) : img
              medias.push({ value, role: 'image' })
            } catch (e) { console.warn('[HF] pose preview ref upload failed:', e.message) }
          }
          if (standingUrl && medias.length < 3) {
            medias.push({ value: standingUrl, role: 'image' })
          }
          const poseDesc = POSE_PREVIEW_DESCS_STANDING[poseId]
          const prompt = `${subjectLine}. Pure white seamless studio backdrop. Clean flat even studio lighting, no shadows on background. The subject is seated on a white stool or low chair, chest-up framing, closer to camera. Same pose energy as: ${poseDesc} — adapted to a seated position. Photorealistic, 4K.`
          const params = { ...baseParams, prompt }
          if (medias.length) params.medias = medias
          const result = await callTool('generate_image', { params })
          const directUrls = extractImageUrls(result)
          if (directUrls.length > 0) return { stancedId, jobId: null, url: directUrls[0] }
          const ids = extractJobIds(result)
          return { stancedId, jobId: ids[0] || null, url: null }
        } else {
          // Standing: upload identity refs, generate full-body preview
          for (const img of [influencer.mainImage, influencer.characterSheetImage].filter(Boolean)) {
            if (medias.length >= 2) break
            try {
              const value = (typeof img === 'string' && img.startsWith('data:'))
                ? await uploadRefImage(img) : img
              medias.push({ value, role: 'image' })
            } catch (e) { console.warn('[HF] pose preview ref upload failed:', e.message) }
          }
          const prompt = `${subjectLine}. Pure white seamless studio backdrop. Clean flat even studio lighting, no shadows on background, no lighting equipment visible. Full body visible head to toe, standing. ${POSE_PREVIEW_DESCS_STANDING[poseId]} Photorealistic, 4K.`
          const params = { ...baseParams, prompt }
          if (medias.length) params.medias = medias
          const result = await callTool('generate_image', { params })
          const directUrls = extractImageUrls(result)
          if (directUrls.length > 0) return { stancedId, jobId: null, url: directUrls[0] }
          const ids = extractJobIds(result)
          return { stancedId, jobId: ids[0] || null, url: null }
        }
      } catch (e) {
        console.warn(`[HF] pose preview launch failed (${stancedId}):`, e.message)
        return { stancedId, jobId: null, url: null }
      }
    }))
    for (const { stancedId, url } of launched) {
      if (url) onPoseComplete(stancedId, url)
    }
    const pending = launched.filter(r => r.jobId)
    if (!pending.length) return
    const jobIds = pending.map(r => r.jobId)
    const delivered = new Set()
    for (let i = 0; i < 120; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 2500))
      try {
        const displays = await Promise.all(jobIds.map(id => callTool('job_display', { id })))
        const mergedResults = displays.flatMap(d => { const data = unwrapMCP(d); return Array.isArray(data?.results) ? data.results : [] })
        const display = { results: mergedResults }
        const data = unwrapMCP(display)
        if (!Array.isArray(data?.results)) continue
        for (const r of data.results) {
          const rId = r?.id || r?.job_id
          const url = r?.results?.rawUrl || r?.results?.minUrl || r?.result_url
          if (!url || !rId) continue
          const match = pending.find(p => p.jobId === rId)
          if (match && !delivered.has(match.stancedId)) {
            delivered.add(match.stancedId)
            onPoseComplete(match.stancedId, url)
          }
        }
        if (delivered.size >= pending.length) break
        if (countTerminalJobs(display) >= jobIds.length) break
      } catch (e) {
        console.warn('[HF] pose preview poll error:', e.message)
      }
    }
  } catch (e) {
    console.warn('[HF] generatePosePreviews failed:', e.message)
  }
}
