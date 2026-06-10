// Pure helper functions + small hooks shared across the Influencers page.
// Extracted from Influencers.jsx — behavior unchanged.
import { useState, useEffect } from 'react'
import { gColor } from '../../utils/influencerUtils'
import { NICHES_F, NICHES_M, NICHES_ALL, AMBIENT_SOUND } from './constants'

export function useMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

export function getNiches(g)  { return g==='Female'?NICHES_F:g==='Male'?NICHES_M:NICHES_ALL }

export function audiencePh(g,n) {
  const nl = n && n!=='Other' ? n.toLowerCase() : null
  if (g==='Female') return `e.g. a woman, 18–34, interested in ${nl||'fashion & beauty'}`
  if (g==='Male')   return `e.g. a man, 20–35, interested in ${nl||'fitness & gaming'}`
  return `e.g. adults, 18–30, interested in ${nl||'lifestyle & entertainment'}`
}

export function pColor(v) {
  const l=(a,b,t)=>Math.round(a+(b-a)*t)
  if(v<=50){const t=v/50;return`rgb(${l(251,249,t)},${l(191,115,t)},${l(36,22,t)})`}
  const t=(v-50)/50;return`rgb(${l(249,239,t)},${l(115,68,t)},${l(22,68,t)})`
}

// Profile accent: use first palette color or fall back to gender color
export function accent(inf) { return inf?.palette?.[0] || gColor(inf?.gender) }

// Light-or-dark text on accent bg
export function accentText(hex) {
  if (!hex || hex.length < 7) return '#fff'
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
  return (0.299*r+0.587*g+0.114*b) < 145 ? '#fff' : '#1D1D1F'
}

export function completeness(inf) {
  const c = [
    inf.age?.toString().trim(),
    inf.niche,
    inf.location?.trim(),
    inf.backstory?.trim(),
    inf.audience?.trim(),
    inf.physicalDesc?.trim(),
    inf.hobbies?.trim(),
    inf.clothingStyle?.trim(),
    inf.dreamBrands?.trim(),
  ]
  return Math.round(c.filter(Boolean).length / c.length * 100)
}

// Video URL helpers (used in scripts)
export function ytId(u){ return u?.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/)?.[1]??null }
export function domain(u){ try{return new URL(u).hostname.replace('www.','')}catch{return'link'} }

export function inferAmbientSound(envKey, environment) {
  if (envKey && AMBIENT_SOUND[envKey]) return AMBIENT_SOUND[envKey]
  const e = (environment || envKey || '').toLowerCase()
  if (/restaurant|dining|bistro|brasserie|diner/.test(e)) return 'Ambient restaurant — low dining chatter, cutlery, warm bustle.'
  if (/beach|ocean|sea|shore|surf/.test(e)) return 'Ambient beach — waves, light breeze, distant seagulls.'
  if (/park|garden|nature|forest|woods/.test(e)) return 'Outdoor ambience — birds, light breeze, natural sounds.'
  if (/office|work|corporate|coworking/.test(e)) return 'Quiet office ambience — distant keyboard, low HVAC hum.'
  if (/car|vehicle|driving|road/.test(e)) return 'Ambient car interior — engine hum, road noise.'
  if (/bar|club|lounge|nightclub/.test(e)) return 'Ambient nightlife — low crowd murmur, distant music, gentle bass.'
  if (/pool|spa|resort|hotel/.test(e)) return 'Ambient resort — light water, gentle breeze, relaxed atmosphere.'
  if (/market|bazaar|store|shop/.test(e)) return 'Ambient market — light crowd, distant chatter.'
  if (/rooftop|terrace|balcony/.test(e)) return 'Outdoor rooftop ambience — light wind, distant city sounds.'
  if (/airport|station|transit/.test(e)) return 'Ambient transit sounds — light crowd, distant announcements.'
  return 'Natural ambient sound — location-appropriate background audio.'
}

export function fmtElapsed(e) {
  if (e < 60) return `${e}s`
  return `${Math.floor(e / 60)}:${String(e % 60).padStart(2, '0')}`
}

// Global video mute state — persists across hover sessions
export function getGlobalMuted() { try { return localStorage.getItem('hf_vid_muted') !== 'false' } catch { return true } }
export function saveGlobalMuted(v) {
  try { localStorage.setItem('hf_vid_muted', v ? 'true' : 'false') } catch {}
  window.dispatchEvent(new CustomEvent('hf-muted', { detail: v }))
}
export function useGlobalMuted() {
  const [muted, setMuted] = useState(getGlobalMuted)
  useEffect(() => {
    const handler = (e) => setMuted(e.detail)
    window.addEventListener('hf-muted', handler)
    return () => window.removeEventListener('hf-muted', handler)
  }, [])
  function toggle() { const next = !muted; setMuted(next); saveGlobalMuted(next) }
  return [muted, toggle]
}
