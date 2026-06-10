// localStorage-backed helpers for generation params + pending wardrobe state.
// Extracted from Influencers.jsx — behavior unchanged.

// Generation param storage — so Regenerate replays the exact same prompt + ratio
const GP_KEY = 'hf_gen_params'
export function saveGenParams(influencerId, slot, params) {
  const d = JSON.parse(localStorage.getItem(GP_KEY) || '{}')
  d[`${influencerId}::${slot}`] = params
  localStorage.setItem(GP_KEY, JSON.stringify(d))
}
export function getGenParams(influencerId, slot) {
  const d = JSON.parse(localStorage.getItem(GP_KEY) || '{}')
  return d[`${influencerId}::${slot}`] || null
}

// Creation params — stores faceRef/styleRef/model/etc. saved when influencer was first created
const CREATION_PARAMS_KEY = 'hf_creation_params'
export function getCreationParams(influencerId) {
  const d = JSON.parse(localStorage.getItem(CREATION_PARAMS_KEY) || '{}')
  return d[influencerId] || null
}

export function saveWardrobePending(influencerId, data) {
  try { localStorage.setItem(`hf_wardrobe_pending_${influencerId}`, JSON.stringify({ ...data, startedAt: Date.now() })) } catch {}
}
export function getWardrobePending(influencerId) {
  try {
    const d = JSON.parse(localStorage.getItem(`hf_wardrobe_pending_${influencerId}`) || 'null')
    if (!d) return null
    if (Date.now() - d.startedAt > 15 * 60 * 1000) { clearWardrobePending(influencerId); return null }
    return d
  } catch { return null }
}
export function clearWardrobePending(influencerId) {
  try { localStorage.removeItem(`hf_wardrobe_pending_${influencerId}`) } catch {}
}
