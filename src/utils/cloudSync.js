// Cloud sync layer over localStorage.
// The app stays local-first, but the SHARED keys (the team library) are mirrored
// to the server (/api/workspace → Upstash KV): pulled on load, pushed on change.
// Per-user keys (theme, UI prefs, auth, in-flight generations) stay local.

const API = '/api/workspace'
const VERSION_KEY = 'ws_version'
const SYNCED_KEY = 'ws_synced_keys' // keys known to exist on the server (to tell deletes from local-new)

function getSynced() {
  try { return new Set(JSON.parse(localStorage.getItem(SYNCED_KEY) || '[]')) } catch { return new Set() }
}
function setSynced(set) {
  try { localStorage.setItem(SYNCED_KEY, JSON.stringify([...set])) } catch {}
}

// Which localStorage keys are part of the shared team workspace.
export function isSharedKey(k) {
  return (
    k === 'influencer_ids' ||
    k.startsWith('hf_influencer_') ||
    k === 'photo_studio_history' ||
    k === 'brand_deals' ||
    k === 'inspiration_boards' ||
    k.startsWith('hf_video_history_')
  )
}

let suppress = false // true while we apply remote data, so it isn't echoed back

// ---- push (local → cloud) -------------------------------------------------
const dirty = new Set()
const removed = new Set()
let flushTimer = null

async function postBatch(sets, dels) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sets, dels }),
  })
  if (res.ok) {
    const { version } = await res.json()
    if (version != null) localStorage.setItem(VERSION_KEY, String(version))
    const synced = getSynced()
    for (const k of Object.keys(sets)) synced.add(k)
    for (const k of dels) synced.delete(k)
    setSynced(synced)
    return true
  }
  return false
}

// Chunk large pushes so a single request never gets too big.
async function pushInChunks(setsObj, delsArr) {
  const entries = Object.entries(setsObj)
  const CHUNK = 15
  for (let i = 0; i < entries.length; i += CHUNK) {
    await postBatch(Object.fromEntries(entries.slice(i, i + CHUNK)), [])
  }
  if (delsArr.length) await postBatch({}, delsArr)
}

export async function flushNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (dirty.size === 0 && removed.size === 0) return
  const sets = {}
  for (const k of dirty) { const v = localStorage.getItem(k); if (v != null) sets[k] = v }
  const dels = [...removed]
  dirty.clear(); removed.clear()
  try { await pushInChunks(sets, dels) } catch (e) { console.warn('[sync] push failed', e) }
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flushNow, 1500)
}

// Patch localStorage so shared-key writes get queued for the cloud.
export function installSyncInterceptor() {
  if (localStorage.__wsPatched) return
  const origSet = localStorage.setItem.bind(localStorage)
  const origRemove = localStorage.removeItem.bind(localStorage)
  localStorage.setItem = (k, v) => {
    origSet(k, v)
    if (!suppress && isSharedKey(k)) { dirty.add(k); removed.delete(k); scheduleFlush() }
  }
  localStorage.removeItem = (k) => {
    origRemove(k)
    if (!suppress && isSharedKey(k)) { removed.add(k); dirty.delete(k); scheduleFlush() }
  }
  localStorage.__wsPatched = true
  // Best-effort flush when the tab is hidden/closed so the last edits aren't lost.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow() })
}

// ---- pull (cloud → local) -------------------------------------------------
async function migrateLocalToCloud() {
  const sets = {}
  for (const k of Object.keys(localStorage)) {
    if (isSharedKey(k)) { const v = localStorage.getItem(k); if (v != null) sets[k] = v }
  }
  if (Object.keys(sets).length === 0) return
  await pushInChunks(sets, [])
}

// Returns { authed, migrated?, version? }. Writes cloud data into localStorage.
export async function pullWorkspaceIntoLocalStorage() {
  const localVersion = Number(localStorage.getItem(VERSION_KEY) || 0)
  let res
  try { res = await fetch(API, { headers: { Accept: 'application/json' } }) }
  catch { return { authed: true, offline: true, changed: false } } // network blip → keep local copy
  if (res.status === 401) return { authed: false, changed: false }
  if (!res.ok) return { authed: true, error: true, changed: false }

  const { data, version } = await res.json()
  const cloudKeys = Object.keys(data || {})

  if (cloudKeys.length === 0) {
    // Cloud is empty → seed it from this device's current library (one-time).
    await migrateLocalToCloud()
    return { authed: true, migrated: true, changed: false }
  }

  const localOnly = {}
  suppress = true
  try {
    for (const k of cloudKeys) {
      try { localStorage.setItem(k, data[k]) } catch (e) { console.warn('[sync] write failed', k, e) }
    }
    const cloudSet = new Set(cloudKeys)
    const synced = getSynced()
    for (const k of Object.keys(localStorage)) {
      if (!isSharedKey(k) || cloudSet.has(k)) continue
      if (synced.has(k)) {
        // Was on the server before, now gone → a real delete by a teammate.
        try { localStorage.removeItem(k) } catch {}
      } else {
        // Never made it to the server (e.g. created offline) → keep it and push it.
        const v = localStorage.getItem(k)
        if (v != null) localOnly[k] = v
      }
    }
  } finally { suppress = false }

  localStorage.setItem(VERSION_KEY, String(version))
  setSynced(new Set([...cloudKeys, ...Object.keys(localOnly)]))
  if (Object.keys(localOnly).length) {
    try { await pushInChunks(localOnly, []) } catch (e) { console.warn('[sync] local-only push failed', e) }
  }
  // "changed" = the cloud had a different version than what we last applied, so
  // the local data we just wrote is genuinely new (callers may reload to show it).
  return { authed: true, version, changed: Number(version) !== localVersion }
}

// Background sync used at startup: never blocks render. Pulls the shared library
// and reloads only if it actually changed the local data.
export async function backgroundSync() {
  try {
    const res = await pullWorkspaceIntoLocalStorage()
    if (res && res.changed) window.location.reload()
  } catch (e) { console.warn('[sync] background sync failed', e) }
}

// Cheap check: has the shared library changed on the server since our last sync?
export async function remoteChanged() {
  try {
    const res = await fetch(`${API}?v=1`)
    if (!res.ok) return false
    const { version } = await res.json()
    return Number(version) > Number(localStorage.getItem(VERSION_KEY) || 0)
  } catch { return false }
}
