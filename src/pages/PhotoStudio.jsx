import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { generateNImages, generatePosePreviews, generateSingleImage, savePendingPhoto, clearPendingPhoto, getPendingPhoto, pollAllJobs, hasPhotoGenSession } from '../utils/higgsfieldGenerate'
import { isHFConnected } from '../utils/higgsfieldAuth'
import { buildCharSheetPrompt, buildCharSheetPromptWithClaude } from '../utils/charSheetPrompt'
import { useInfluencers, useBrandDeals } from '../store'
import WardrobeDrawer from '../components/WardrobeDrawer'
import {
  LOCATIONS, TIMES, EXPRESSIONS, PROP_SUGGESTIONS,
  getPoses, buildPhotoStudioPrompt, randomParams, getOutfitPresets,
} from '../utils/photoStudioPrompt'
import LOC_PREVIEWS from '../utils/locationPreviews'

const _CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_2z5tOA1YxOBG2p6w9RhgcS5yRLO/'
const CAMILA_POSE_PREVIEWS = {
  // ── standing (old unkeyed = standing, kept for backward compat) ──
  plandid:              _CDN + 'hf_20260522_054355_b1116afe-201b-4196-9fac-c5a050bcf3c1_min.webp',
  candid:               _CDN + 'hf_20260522_054359_3e6e2867-a9c1-4868-8864-ffba29ae7dd5_min.webp',
  'cute-posed':         _CDN + 'hf_20260522_054402_efe190c0-8b41-45d9-aa4f-291acea3553b_min.webp',
  walking:              _CDN + 'hf_20260522_054405_caba3a88-29c8-4d6a-badb-a5a41ac4a68d_min.webp',
  'mid-turn':           _CDN + 'hf_20260522_054409_61435301-4c43-47a7-9e96-000af76d8087_min.webp',
  front:                _CDN + 'hf_20260522_054412_10aebce1-ac36-4760-ba5e-3384064337b8_min.webp',
  // ── standing (new poses) ────────────────────────────────────────
  'standing_hip-pop':       _CDN + 'hf_20260522_091846_163b7e7f-7dba-4180-84d5-64474525b5bc_min.webp',
  'standing_triangle':      _CDN + 'hf_20260522_091852_1c022663-8785-430b-96b7-23bd7b581070_min.webp',
  'standing_over-shoulder': _CDN + 'hf_20260522_091855_7d1ddec7-5b2b-4e82-a199-f46217f9134b_min.webp',
  'standing_long-line':     _CDN + 'hf_20260522_091859_1cfe895d-2a25-4c7c-9ae3-682131d88f8f_min.webp',
  'standing_hands-pockets': _CDN + 'hf_20260522_091902_940e1886-4277-413f-b723-b6197054178b_min.webp',
  'standing_crossed-arms':  _CDN + 'hf_20260522_091906_f4e2eb5b-e98c-425f-9a92-7877bffc8308_min.webp',
  'standing_lean':          _CDN + 'hf_20260522_091910_1d77437c-faa6-4c58-ad66-7d70f76ad598_min.webp',
  'standing_facing-away':   _CDN + 'hf_20260525_104324_b8023a2b-2392-44af-9dae-551cd7640b48_min.webp',
  'facing-away':            _CDN + 'hf_20260525_104324_b8023a2b-2392-44af-9dae-551cd7640b48_min.webp',
  'standing_handheld':      _CDN + 'hf_20260525_162420_0c4075a9-320e-4e4d-9d07-432cbb1d7331_min.webp',
  handheld:                 _CDN + 'hf_20260525_162420_0c4075a9-320e-4e4d-9d07-432cbb1d7331_min.webp',
  'sitting_handheld':       _CDN + 'hf_20260525_162424_8cea7208-5b08-4257-9e3c-1b37080b5747_min.webp',
  // ── sitting (all 13 poses) ──────────────────────────────────────
  'sitting_front':          _CDN + 'hf_20260522_094317_7d152fc0-327b-4e40-9408-0ff5b724ceca_min.webp',
  'sitting_plandid':        _CDN + 'hf_20260522_094321_65619df3-4085-4636-869a-846c522caad5_min.webp',
  'sitting_candid':         _CDN + 'hf_20260522_094329_ba5f6a22-96c1-4a34-8c35-bac23c72b930_min.webp',
  'sitting_cute-posed':     _CDN + 'hf_20260522_094333_a2ad4f32-9195-4e54-a24b-f2648a50584f_min.webp',
  'sitting_hip-pop':        _CDN + 'hf_20260522_094337_bfae16bb-94d1-4bfa-b33a-3fb6bcdfd80f_min.webp',
  'sitting_triangle':       _CDN + 'hf_20260522_094340_6dbce45e-9c94-4347-8a0f-d0cf716ff0ed_min.webp',
  'sitting_over-shoulder':  _CDN + 'hf_20260522_094347_f0c06504-1e70-4790-af57-5947c0253c0f_min.webp',
  'sitting_mid-turn':       _CDN + 'hf_20260522_094351_8bb7b8c9-6f8e-43fe-8b51-a343c6662209_min.webp',
  'sitting_long-line':      _CDN + 'hf_20260522_094356_a991fe9d-c7c5-43cc-883f-bbcd492783dc_min.webp',
  'sitting_hands-pockets':  _CDN + 'hf_20260522_090014_a06c7211-8f3e-4dfb-b804-6dea19ddf0ec.png',
  'sitting_crossed-arms':   _CDN + 'hf_20260522_092707_c94f521e-3d8d-451d-bc15-4bc8a8ba610f_min.webp',
  'sitting_lean':           _CDN + 'hf_20260522_092711_4bc1ddb0-63dd-4cf2-9b9d-6d8007f43cdc_min.webp',
}

const HISTORY_KEY = 'photo_studio_history'
const MAX_HISTORY = 500
const GEN_DURATION_MS = 90000

// Only portrait + square for Instagram
const ASPECTS = ['9:16', '1:1']

// Location gradient backgrounds — evokes the scene atmosphere
const LOC_VISUAL = {
  'coffee-shop':  { gradient: 'linear-gradient(160deg,#2C1A0E 0%,#7B4F2E 60%,#C9873E 100%)', textColor: '#F5DEB3' },
  'city-street':  { gradient: 'linear-gradient(160deg,#0D1B2A 0%,#1B3352 55%,#2E5F8A 100%)', textColor: '#A8C8E8' },
  'beach':        { gradient: 'linear-gradient(180deg,#0077B6 0%,#00B4D8 45%,#ADE8F4 70%,#F0E4C8 100%)', textColor: '#023E8A' },
  'rooftop':      { gradient: 'linear-gradient(160deg,#0A0015 0%,#1A0033 50%,#3D006B 100%)', textColor: '#C084FC' },
  'bedroom':      { gradient: 'linear-gradient(160deg,#F8EBE0 0%,#F2D4C4 50%,#E8BBA8 100%)', textColor: '#92573C' },
  'bathroom':     { gradient: 'linear-gradient(160deg,#EFF6FF 0%,#DBEAFE 50%,#BFDBFE 100%)', textColor: '#1D4ED8' },
  'mall':         { gradient: 'linear-gradient(160deg,#0F0B1E 0%,#1E1042 55%,#3B1F7A 100%)', textColor: '#C4B5FD' },
  'gym':          { gradient: 'linear-gradient(160deg,#0A0A0A 0%,#1A1A1A 50%,#2A1A1A 100%)', textColor: '#FC8181' },
  'park':         { gradient: 'linear-gradient(160deg,#052E16 0%,#14532D 50%,#166534 100%)', textColor: '#86EFAC' },
  'restaurant':   { gradient: 'linear-gradient(160deg,#3B0A00 0%,#7C2D12 55%,#C2410C 100%)', textColor: '#FDBA74' },
  'hotel':        { gradient: 'linear-gradient(160deg,#1C1410 0%,#3D2B1F 55%,#6B4C35 100%)', textColor: '#D4A96A' },
  'studio':       { gradient: 'linear-gradient(160deg,#111111 0%,#1F1F1F 50%,#2D2D2D 100%)', textColor: '#D1D5DB' },
}

// Time of day overlays on the location card
const TIME_VISUAL = {
  morning:       { overlay: 'rgba(186,230,253,0.18)', badge: '🌅 Morning',    badgeBg: 'rgba(186,230,253,0.22)' },
  afternoon:     { overlay: 'rgba(253,224,71,0.14)',  badge: '☀️ Afternoon',  badgeBg: 'rgba(253,224,71,0.22)'  },
  'golden-hour': { overlay: 'rgba(251,146,60,0.28)',  badge: '🌇 Golden Hour',badgeBg: 'rgba(251,146,60,0.28)'  },
  night:         { overlay: 'rgba(10,10,35,0.55)',    badge: '🌙 Night',      badgeBg: 'rgba(50,50,100,0.35)'   },
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  }
}


// Module-level tracker — only one photo history popup visible at a time
let _clearActivePhotoPopup = null

function PhotoHistoryThumb({ item, isSelected, onToggle, onUseAsStartFrame }) {
  const [hovered, setHovered] = useState(false)
  const thumbRef = useRef()
  const leaveTimer = useRef()
  const [popup, setPopup] = useState(null)
  const [lightbox, setLightbox] = useState(false)
  const thumbW = item.aspectRatio === '9:16' ? 60 : 96

  function clearPopup() {
    clearTimeout(leaveTimer.current)
    setHovered(false)
    setPopup(null)
  }

  function handleEnter() {
    clearTimeout(leaveTimer.current)
    if (_clearActivePhotoPopup && _clearActivePhotoPopup !== clearPopup) _clearActivePhotoPopup()
    _clearActivePhotoPopup = clearPopup
    setHovered(true)
    if (!thumbRef.current) return
    const r = thumbRef.current.getBoundingClientRect()
    const isPortrait = item.aspectRatio === '9:16'
    const popW = isPortrait ? 160 : 240
    const popH = isPortrait ? popW * 16 / 9 : popW * 0.75
    const left = Math.max(8, Math.min(r.left + r.width / 2 - popW / 2, window.innerWidth - popW - 8))
    const top = r.top > popH + 12 ? r.top - popH - 6 : r.bottom + 6
    setPopup({ left, top, width: popW })
  }

  function handleLeave() {
    leaveTimer.current = setTimeout(() => {
      clearPopup()
      if (_clearActivePhotoPopup === clearPopup) _clearActivePhotoPopup = null
    }, 200)
  }

  return (
    <>
      <div
        ref={thumbRef}
        onClick={onToggle}
        onDoubleClick={() => setLightbox(true)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{
          flexShrink: 0, width: thumbW, height: 96,
          borderRadius: 9, overflow: 'hidden', cursor: 'pointer',
          position: 'relative',
          outline: isSelected ? '2.5px solid #8B5CF6' : hovered ? '2px solid rgba(139,92,246,0.4)' : '2px solid transparent',
          outlineOffset: 2,
        }}
      >
        <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {isSelected && <div style={{ position: 'absolute', inset: 0, background: 'rgba(139,92,246,0.18)' }} />}

        {/* Checkmark — top right */}
        <div style={{
          position: 'absolute', top: 5, right: 5,
          width: 16, height: 16, borderRadius: '50%',
          background: isSelected ? '#8B5CF6' : 'rgba(0,0,0,0.45)',
          border: `2px solid ${isSelected ? '#8B5CF6' : 'rgba(255,255,255,0.7)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: isSelected || hovered ? 1 : 0,
          transition: 'opacity 0.12s',
        }}>
          {isSelected && (
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        {/* Animate — bottom left, on hover or selected */}
        {(hovered || isSelected) && onUseAsStartFrame && (
          <button
            onClick={e => { e.stopPropagation(); onUseAsStartFrame(item.url); clearPopup() }}
            style={{
              position: 'absolute', bottom: 5, left: 5,
              fontSize: 8, fontWeight: 700, letterSpacing: '0.05em',
              color: '#fff',
              background: 'linear-gradient(135deg,#EC4899,#8B5CF6)',
              border: 'none', borderRadius: 5, padding: '3px 6px',
              cursor: 'pointer', zIndex: 3,
              boxShadow: '0 1px 6px rgba(139,92,246,0.45)',
              fontFamily: 'inherit',
            }}
          >Animate</button>
        )}
      </div>

      {popup && createPortal(
        <div
          onMouseEnter={() => { clearTimeout(leaveTimer.current); setHovered(true) }}
          onMouseLeave={handleLeave}
          style={{
            position: 'fixed', zIndex: 9998,
            left: popup.left, top: popup.top, width: popup.width,
            borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
            background: 'var(--surface)', cursor: 'zoom-in',
          }}
          onClick={() => { setLightbox(true); clearPopup() }}
        >
          <div style={{ position: 'relative' }}>
            <img src={item.url} alt="" style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
            <button
              onClick={e => {
                e.stopPropagation()
                const date = item.createdAt ? new Date(item.createdAt).toISOString().slice(0,10) : 'photo'
                downloadImage(item.url, `photo-${date}.jpg`)
              }}
              style={{
                position: 'absolute', bottom: 8, right: 8,
                width: 30, height: 30, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >↓</button>
          </div>
        </div>,
        document.body
      )}

      {lightbox && createPortal(
        <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <button onClick={() => setLightbox(false)} style={{ position: 'fixed', top: 20, right: 20, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>×</button>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.9)', background: '#000', maxWidth: 'min(680px, 90vw)', cursor: 'default' }}>
            <img src={item.url} alt="" style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: '82vh' }} />
            <div style={{ padding: '10px 12px', display: 'flex', gap: 8, background: 'var(--surface)' }}>
              <button
                onClick={() => { const date = item.createdAt ? new Date(item.createdAt).toISOString().slice(0,10) : 'photo'; downloadImage(item.url, `photo-${date}.jpg`) }}
                style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff' }}
              >↓ Download</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function OutfitCard({ image, label, active, onClick }) {
  const cardRef = useRef()
  const leaveTimer = useRef()
  const [popup, setPopup] = useState(null)

  function handleEnter() {
    clearTimeout(leaveTimer.current)
    if (!cardRef.current || !image) return
    const r = cardRef.current.getBoundingClientRect()
    const popW = 600
    const popH = Math.round(popW * 9 / 16) + 30
    const left = Math.max(8, Math.min(r.left + r.width / 2 - popW / 2, window.innerWidth - popW - 8))
    const top = r.top - popH - 8
    setPopup({ left, top, width: popW })
  }

  function handleLeave() {
    leaveTimer.current = setTimeout(() => setPopup(null), 100)
  }

  return (
    <>
      <button
        ref={cardRef}
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}
      >
        <div style={{
          width: 64, height: 86, borderRadius: 10, overflow: 'hidden',
          border: `2px solid ${active ? '#8B5CF6' : 'var(--border)'}`,
          boxShadow: active ? '0 0 0 2px rgba(139,92,246,0.25)' : 'none',
          background: image ? 'transparent' : 'var(--bg-tertiary)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {image
            ? <img src={image} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" opacity="0.5"><circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
          }
        </div>
        <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? '#8B5CF6' : 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.2, minHeight: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {label}
        </span>
      </button>

      {popup && image && createPortal(
        <div
          onMouseEnter={() => clearTimeout(leaveTimer.current)}
          onMouseLeave={handleLeave}
          style={{
            position: 'fixed', zIndex: 99999,
            left: popup.left, top: popup.top, width: popup.width,
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)',
            background: 'var(--surface)',
          }}
        >
          <img src={image} alt={label} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
          <div style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        </div>,
        document.body
      )}
    </>
  )
}

const PROP_SHEET_DURATION_MS = 130000

function PropGeneratingSlot({ apiProgress, claudeStatus }) {
  const [smoothPct, setSmoothPct] = useState(0)
  const [elapsed,   setElapsed]   = useState(0)
  const startRef  = useRef(Date.now())
  const rafRef    = useRef()
  const timerRef  = useRef()

  useEffect(() => {
    const tick = () => {
      const ms = Date.now() - startRef.current
      setSmoothPct(p => Math.max(p, 92 * (1 - Math.exp(-3 * ms / PROP_SHEET_DURATION_MS))))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
    return () => { cancelAnimationFrame(rafRef.current); clearInterval(timerRef.current) }
  }, [])

  useEffect(() => {
    if (apiProgress > 0) setSmoothPct(p => Math.max(p, apiProgress))
  }, [apiProgress])

  const displayPct = Math.round(Math.max(smoothPct, apiProgress || 0))
  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  const statusLabel = claudeStatus === 'analyzing' ? 'Asking Claude…'
    : claudeStatus === 'done' ? '✓ Claude analyzed'
    : displayPct < 15 ? 'Starting…' : 'Generating…'

  return (
    <div style={{ width: 100, height: 100, borderRadius: 12, border: '1.5px solid rgba(139,92,246,0.35)', background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'spin 0.75s linear infinite' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8B5CF6' }}>{displayPct}%</div>
      <div style={{ fontSize: 8, fontWeight: 600, color: claudeStatus === 'done' ? '#34C759' : claudeStatus === 'analyzing' ? '#8B5CF6' : 'var(--text-tertiary)', textAlign: 'center', letterSpacing: '0.2px', padding: '0 6px' }}>{statusLabel}</div>
      <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{elapsedLabel}</div>
      {/* Progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'var(--border)' }}>
        <div style={{ height: '100%', width: `${displayPct}%`, background: 'linear-gradient(90deg,#EC4899,#8B5CF6)', transition: 'width 0.4s linear' }} />
      </div>
    </div>
  )
}

function PSec({ children }) {
  return (
    <div
      style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-subtle)', transition: 'box-shadow 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
    >{children}</div>
  )
}

function PSHeader({ n, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        {sub && <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', fontStyle: 'italic', letterSpacing: '0.1px' }}>({sub})</div>}
      </div>
    </div>
  )
}

function loadSettings(id) {
  try { return JSON.parse(localStorage.getItem(`ps_settings_${id || 'default'}`) || '{}') } catch { return {} }
}

const PS_DEFAULTS = { location: 'coffee-shop', timeOfDay: 'afternoon', pose: 'front', outfitPreset: 'current', stance: 'standing', aspectRatio: '9:16', resolution: '4k', outputCount: 1, expression: 'natural', gaze: 'at-camera', propText: '', wardrobeText: '', hairstyleText: '' }

export default function PhotoStudioPanel({ influencer, onGoToWardrobe, onUseAsStartFrame, restoreKey = 0 }) {
  const [, setInfluencers] = useInfluencers()
  const [brandDeals] = useBrandDeals()
  const _s = loadSettings(influencer?.id)
  const [location,     setLocation]     = useState(_s.location     ?? PS_DEFAULTS.location)
  const [timeOfDay,    setTimeOfDay]    = useState(_s.timeOfDay    ?? PS_DEFAULTS.timeOfDay)
  const [pose,         setPose]         = useState(_s.pose         ?? PS_DEFAULTS.pose)
  const vibe = 'candid'
  const [outfitPreset, setOutfitPreset] = useState(_s.outfitPreset ?? PS_DEFAULTS.outfitPreset)
  const [stance,       setStance]       = useState(_s.stance       ?? PS_DEFAULTS.stance)
  const [aspectRatio,  setAspectRatio]  = useState(_s.aspectRatio  ?? PS_DEFAULTS.aspectRatio)
  const [resolution,   setResolution]   = useState(_s.resolution   ?? PS_DEFAULTS.resolution)
  const [outputCount,  setOutputCount]  = useState(_s.outputCount  ?? PS_DEFAULTS.outputCount)
  const [expression,   setExpression]   = useState(_s.expression   ?? PS_DEFAULTS.expression)
  const [gaze,         setGaze]         = useState(_s.gaze         ?? PS_DEFAULTS.gaze)
  const [propText,     setPropText]     = useState(_s.propText      ?? PS_DEFAULTS.propText)
  const [wardrobeText,   setWardrobeText]   = useState(_s.wardrobeText   ?? PS_DEFAULTS.wardrobeText)
  const [hairstyleText,  setHairstyleText]  = useState(_s.hairstyleText  ?? PS_DEFAULTS.hairstyleText)
  const [generating,    setGenerating]   = useState(false)
  const [lockedCount,   setLockedCount]  = useState(1)
  const [smoothPct,     setSmoothPct]    = useState(0)
  const [currentImgs,   setCurrentImgs]  = useState([])
  const [error,        setError]        = useState(null)
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
  })

  const [elapsedSecs, setElapsedSecs] = useState(0)

  const cancelRef           = useRef(false)
  const startRef            = useRef(null)
  const rafRef              = useRef(null)
  const elapsedRef          = useRef(null)
  const fileInputRef        = useRef(null)
  const generatingForIdRef  = useRef(null)
  const currentInfluencerIdRef = useRef(influencer?.id)
  const settingsRef         = useRef({})
  const prevInfluencerIdRef = useRef(influencer?.id)

  const [overrideRef,  setOverrideRef]  = useState(null)
  const [propSlots,       setPropSlots]       = useState(() => { try { const s = JSON.parse(localStorage.getItem(`ps_props_${influencer?.id}`) || 'null'); if (Array.isArray(s) && s.length >= 2) return s } catch {} return [null, null] })
  const [propDragOver,    setPropDragOver]    = useState(null)
  const [brandPickerSlot, setBrandPickerSlot] = useState(null)
  const [propGenerating,   setPropGenerating]   = useState({}) // { [idx]: bool }
  const [propProgress,     setPropProgress]     = useState({}) // { [idx]: 0-100 }
  const [propClaudeStatus, setPropClaudeStatus] = useState({}) // { [idx]: 'analyzing'|'done'|null }
  const propFileRef    = useRef(null)
  const propSlotRef    = useRef(0)
  const [expandedImg,  setExpandedImg]  = useState(null)
  const [dragOver,     setDragOver]     = useState(false)
  const [rightMode,    setRightMode]    = useState('location') // 'location' | 'pose'
  const [poseGenerating, setPoseGenerating] = useState(false)
  const [selectedHistIds, setSelectedHistIds] = useState(new Set())
  const [confirmClear, setConfirmClear] = useState(null)
  const [propInfoTip, setPropInfoTip] = useState(false)
  const [hairstyleLocked, setHairstyleLocked] = useState(() => !!loadSettings(influencer?.id).hairstyleText)

  useEffect(() => {
    setSelectedHistIds(new Set())
    setConfirmClear(null)
  }, [influencer?.id])
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const [wardrobePending, setWardrobePending] = useState(() => {
    try { return localStorage.getItem(`wd_result_${influencer?.id}`) || null } catch { return null }
  })

  function handleWardrobeResult(url) {
    const key = `wd_result_${influencer?.id}`
    if (url) {
      try { localStorage.setItem(key, url) } catch {}
      setWardrobePending(url)
    } else {
      try { localStorage.removeItem(key) } catch {}
      setWardrobePending(null)
    }
  }

  // Keep settingsRef current so the switch useEffect can save before restoring
  settingsRef.current = { location, timeOfDay, pose, vibe, outfitPreset, stance, aspectRatio, resolution, outputCount, expression, gaze, propText, wardrobeText, hairstyleText }

  // Persist settings per-influencer (only when settings change, NOT when influencer switches)
  useEffect(() => {
    if (!influencer?.id) return
    try {
      localStorage.setItem(`ps_settings_${influencer.id}`, JSON.stringify(settingsRef.current))
    } catch {}
  }, [location, timeOfDay, pose, vibe, outfitPreset, stance, aspectRatio, resolution, outputCount, expression, gaze, propText, wardrobeText, hairstyleText]) // eslint-disable-line

  useEffect(() => {
    try {
      const id = influencer?.id
      if (!id) return
      const filled = propSlots.some(Boolean)
      filled ? localStorage.setItem(`ps_props_${id}`, JSON.stringify(propSlots)) : localStorage.removeItem(`ps_props_${id}`)
    } catch {}
  }, [propSlots, influencer?.id])

  // Cancel any in-flight generation when the component unmounts (navigation away).
  // This leaves hf_pending_photos intact so the resume effect can pick it up on remount.
  useEffect(() => () => { cancelRef.current = true }, [])

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Preload all location + pose preview images so switching is instant
  useEffect(() => {
    Object.values(LOC_PREVIEWS).forEach(url => { const i = new Image(); i.src = url })
  }, [])

  useEffect(() => {
    if (!influencer?.posePreviews) return
    Object.values(influencer.posePreviews).forEach(url => { const i = new Image(); i.src = url })
  }, [influencer?.posePreviews])

  useEffect(() => {
    // Save current settings for the outgoing influencer before switching
    const prevId = prevInfluencerIdRef.current
    if (prevId && prevId !== influencer?.id) {
      try { localStorage.setItem(`ps_settings_${prevId}`, JSON.stringify(settingsRef.current)) } catch {}
    }
    prevInfluencerIdRef.current = influencer?.id
    currentInfluencerIdRef.current = influencer?.id
    const id = influencer?.id
    // Restore per-influencer settings
    const s = loadSettings(id)
    setLocation(s.location       ?? PS_DEFAULTS.location)
    setTimeOfDay(s.timeOfDay     ?? PS_DEFAULTS.timeOfDay)
    setPose(s.pose               ?? PS_DEFAULTS.pose)
    setOutfitPreset(s.outfitPreset ?? PS_DEFAULTS.outfitPreset)
    setStance(s.stance           ?? PS_DEFAULTS.stance)
    setAspectRatio(s.aspectRatio ?? PS_DEFAULTS.aspectRatio)
    setResolution(s.resolution   ?? PS_DEFAULTS.resolution)
    setOutputCount(s.outputCount ?? PS_DEFAULTS.outputCount)
    setExpression(s.expression   ?? PS_DEFAULTS.expression)
    setGaze(s.gaze               ?? PS_DEFAULTS.gaze)
    setPropText(s.propText       ?? PS_DEFAULTS.propText)
    setWardrobeText(s.wardrobeText    ?? PS_DEFAULTS.wardrobeText)
    setHairstyleText(s.hairstyleText ?? PS_DEFAULTS.hairstyleText)
    setCurrentImgs([])
    setError(null)
    setWardrobeOpen(false)
    const pending = id ? (localStorage.getItem(`wd_result_${id}`) || null) : null
    setWardrobePending(pending)
    try {
      const ps = JSON.parse(localStorage.getItem(`ps_props_${id}`) || 'null')
      setPropSlots(Array.isArray(ps) ? [...ps, null, null, null].slice(0, 3) : [null, null, null])
    } catch {
      setPropSlots([null, null, null])
    }
  }, [influencer?.id])

  // Resume a photo generation that was interrupted by navigation.
  // Only runs if the generation started in THIS browser session (sessionStorage marker).
  // This prevents stale localStorage entries from blocking the Generate button on fresh loads.
  useEffect(() => {
    if (!hasPhotoGenSession()) return          // fresh load — nothing in-flight
    const pending = getPendingPhoto(influencer?.id)
    if (!pending) return
    if (Date.now() - pending.startedAt > 5 * 60 * 1000) { clearPendingPhoto(influencer?.id); return }
    cancelRef.current = false
    generatingForIdRef.current = influencer?.id  // so isActivelyGenerating = true and button shows correctly
    setGenerating(true)
    setSmoothPct(30)
    const batchId = `resume-${Date.now()}`
    pollAllJobs(pending.jobIds, pending.jobIds.length, setSmoothPct, 16, () => cancelRef.current)
      .then(urls => {
        if (!cancelRef.current) {
          urls.forEach(url => { setCurrentImgs(prev => prev.includes(url) ? prev : [...prev, url]); addToHistory(url, batchId) })
        }
      })
      .catch(e => { if (!cancelRef.current) setError(e.message) })
      .finally(() => {
        if (!cancelRef.current) clearPendingPhoto(influencer?.id)
        generatingForIdRef.current = null
        setGenerating(false)
        setSmoothPct(0)
      })
    return () => { cancelRef.current = true }
  }, [influencer?.id]) // eslint-disable-line

  // Restore photo settings saved by History tab "Reuse Settings"
  useEffect(() => {
    try {
      const key = `ps_restore_pending_${influencer?.id}`
      const raw = localStorage.getItem(key)
      if (!raw) return
      localStorage.removeItem(key)
      const s = JSON.parse(raw)
      if (s.location)     setLocation(s.location)
      if (s.timeOfDay)    setTimeOfDay(s.timeOfDay)
      if (s.pose)         setPose(s.pose)
      if (s.stance)       setStance(s.stance)
      if (s.expression)   setExpression(s.expression)
      if (s.gaze)         setGaze(s.gaze)
      if (s.outfitPreset) setOutfitPreset(s.outfitPreset)
      if (s.wardrobeText !== undefined) setWardrobeText(s.wardrobeText)
      if (s.hairstyleText !== undefined) setHairstyleText(s.hairstyleText)
      if (s.propText !== undefined)     setPropText(s.propText)
      if (s.aspectRatio)  setAspectRatio(s.aspectRatio)
      if (s.resolution)   setResolution(s.resolution)
      if (s.outputCount)  setOutputCount(s.outputCount)
    } catch {}
  }, [influencer?.id, restoreKey]) // eslint-disable-line

  useEffect(() => {
    if (generating) {
      startRef.current = Date.now()
      setSmoothPct(0)
      setElapsedSecs(0)
      const tick = () => {
        const ms = Date.now() - startRef.current
        setSmoothPct(Math.min(92 * (1 - Math.exp(-3 * ms / GEN_DURATION_MS)), 92))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      elapsedRef.current = setInterval(() => {
        setElapsedSecs(Math.floor((Date.now() - startRef.current) / 1000))
      }, 500)
    } else {
      cancelAnimationFrame(rafRef.current)
      clearInterval(elapsedRef.current)
      setSmoothPct(0)
      setElapsedSecs(0)
    }
    return () => { cancelAnimationFrame(rafRef.current); clearInterval(elapsedRef.current) }
  }, [generating])

  function addToHistory(url, batchId) {
    const item = { histId: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, url, batchId, influencerId: influencer?.id, influencerName: influencer?.name, location, timeOfDay, pose, vibe, aspectRatio, createdAt: Date.now(),
      settings: { location, timeOfDay, pose, stance, expression, gaze, outfitPreset, wardrobeText, hairstyleText, propText, aspectRatio, resolution, outputCount }
    }
    setHistory(prev => {
      const next = [item, ...prev].slice(0, MAX_HISTORY)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
        window.dispatchEvent(new CustomEvent('photo_studio_history_updated'))
      } catch {}
      return next
    })
  }

  async function generatePropSheet(idx) {
    const slot = propSlots[idx]
    if (!slot?.image) return
    if (!isHFConnected()) { alert('Connect Higgsfield in Settings first'); return }

    // Resolve target slot index upfront so the spinner shows there, not on the source
    const existingTarget = propSlots.findIndex((s, i) => i > idx && !s)
    const targetIdx = existingTarget !== -1 ? existingTarget : propSlots.length
    if (existingTarget === -1) setPropSlots(prev => [...prev, null]) // reserve slot

    setPropGenerating(p => ({ ...p, [targetIdx]: true }))
    setPropProgress(p => ({ ...p, [targetIdx]: 0 }))
    try {
      let prompt = null
      const claudeKey = localStorage.getItem('claude_api_key')
      if (claudeKey) {
        try {
          setPropProgress(p => ({ ...p, [targetIdx]: 5 }))
          setPropClaudeStatus(s => ({ ...s, [targetIdx]: 'analyzing' }))
          prompt = await buildCharSheetPromptWithClaude(slot.image, propText || 'product', '', claudeKey)
          setPropClaudeStatus(s => ({ ...s, [targetIdx]: 'done' }))
          setTimeout(() => setPropClaudeStatus(s => ({ ...s, [targetIdx]: null })), 3000)
        } catch (e) {
          setPropClaudeStatus(s => ({ ...s, [targetIdx]: null }))
        }
      }
      if (!prompt) prompt = buildCharSheetPrompt(propText || 'product', '')
      setPropProgress(p => ({ ...p, [targetIdx]: 15 }))
      const sheetUrl = await generateSingleImage({
        prompt,
        aspectRatio: '16:9',
        referenceImage: slot.image,
        onProgress: pct => setPropProgress(p => ({ ...p, [targetIdx]: pct })),
      })
      if (sheetUrl) setPropSlots(prev => {
        const next = [...prev]
        const pairId = `pair-${Date.now()}`
        // Tag source with pairId, set target with same pairId + same mode
        if (next[idx]) next[idx] = { ...next[idx], pairId }
        next[targetIdx] = { image: sheetUrl, mode: next[idx]?.mode || slot.mode || 'holding', pairId }
        return next
      })
    } catch (e) {
      if (!e.message?.includes('CANCELLED')) alert('Generation failed: ' + e.message)
    } finally {
      setPropGenerating(p => ({ ...p, [targetIdx]: false }))
      setPropProgress(p => ({ ...p, [targetIdx]: 0 }))
      setPropClaudeStatus(s => ({ ...s, [targetIdx]: null }))
    }
  }

  async function generate() {
    // Use the ref for the guard — it's synchronously accurate unlike the `generating` state
    // which can be stale/stuck (e.g. from a resume effect in React Strict Mode dev).
    if (!influencer || generatingForIdRef.current === influencer?.id) return
    cancelRef.current = false
    generatingForIdRef.current = influencer?.id
    clearPendingPhoto(influencer?.id)  // clear any stale pending entry before starting fresh
    setLockedCount(outputCount)
    setGenerating(true)
    setError(null)
    setCurrentImgs([])
    setSelectedHistIds(new Set())

    let anySuccess = false
    try {
      const selectedWardrobe = wardrobeSlots.find(s => s.id === outfitPreset)
      const resolvedPreset = selectedWardrobe ? selectedWardrobe.name : outfitPreset

      let outfitImage = null
      if (!wardrobeText) {
        if (outfitPreset === 'current' && influencer?.characterSheetImage) {
          outfitImage = influencer.characterSheetImage
        } else if (selectedWardrobe?.image) {
          outfitImage = selectedWardrobe.image
        }
      }

      const faceRef      = overrideRef || influencer?.mainImage || null
      const closeUp1     = influencer?.closeUpImage1 || null
      const closeUp2     = influencer?.closeUpImage2 || null
      let tagIdx = 0
      const faceTag      = faceRef    ? `@image${++tagIdx}` : null
      const wardrobeTag  = outfitImage ? `@image${++tagIdx}` : null
      const closeUp1Tag  = closeUp1   ? `@image${++tagIdx}` : null
      const closeUp2Tag  = closeUp2   ? `@image${++tagIdx}` : null
      const allPropImages = propSlots.filter(s => s?.image).map(s => ({ img: s.image, mode: s.mode || 'holding' }))
      const propTags = allPropImages.map(() => `@image${++tagIdx}`)
      const propRefs = allPropImages.map(({ mode }, i) => ({ tag: propTags[i], mode }))

      const promptArgs = { influencer, location, timeOfDay, pose, vibe, wardrobeText, hairstyleText, outfitPreset: resolvedPreset, stance, aspectRatio, expression, gaze, propText, propRefs, faceTag, wardrobeTag, closeUp1Tag, closeUp2Tag }
      const prompt = Array.from({ length: outputCount }, (_, i) => buildPhotoStudioPrompt({ ...promptArgs, variationIdx: i }))

      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      try {
        await generateNImages({
          prompt, count: outputCount, aspectRatio, resolution,
          referenceImage: faceRef,
          outfitImage,
          closeUpImage1: closeUp1,
          closeUpImage2: closeUp2,
          propImages: allPropImages.map(({ img }) => img),
          onProgress: pct => setSmoothPct(prev => Math.max(prev, pct)),
          onResult: url => {
            anySuccess = true
            const genForId = influencer?.id
            if (currentInfluencerIdRef.current === genForId) {
              setCurrentImgs(prev => prev.includes(url) ? prev : [...prev, url])
            }
            addToHistory(url, batchId)
          },
          isCancelled: () => cancelRef.current,
          pendingKey: influencer?.id,
        })
      } catch (e) {
        if (!cancelRef.current) console.warn('[Photo Studio] generation failed:', e.message)
      }

      if (!cancelRef.current) clearPendingPhoto(influencer?.id)
      if (!anySuccess && !cancelRef.current) setError('Generation failed — try again')
    } finally {
      generatingForIdRef.current = null
      setGenerating(false)
    }
  }

  function doRandomize() {
    const p = randomParams()
    setLocation(p.location)
    setTimeOfDay(p.timeOfDay)
    setPose(p.pose)

    setOutfitPreset(p.outfitPreset || 'current')
    setStance(p.stance || 'standing')
    setExpression(p.expression || 'natural')
    setWardrobeText('')
    setPropText('')
  }

  function doReset() {
    setLocation(null)
    setTimeOfDay('morning')
    setPose('front')
    setStance('standing')
    setOutfitPreset('current')
    setWardrobeText('')
    setExpression('natural')
    setPropText('')
    setPropSlots([null, null, null])
    setAspectRatio('9:16')
    setResolution('4k')
    setRightMode('location')
    setCurrentImgs([])
    setError(null)
  }

  const isCustomLoc  = !!location && !LOCATIONS.some(l => l.id === location)
  const isActivelyGenerating = generating && generatingForIdRef.current === influencer?.id
  const locInfo      = LOCATIONS.find(l => l.id === location) || LOCATIONS[0]
  const locVis       = LOC_VISUAL[location]  || LOC_VISUAL['coffee-shop']
  const timeVis      = TIME_VISUAL[timeOfDay] || TIME_VISUAL['afternoon']
  const wardrobeSlots = (influencer?.wardrobeSlots || []).filter(s => s.name)
  const infHistory   = history.filter(h => h.influencerId === influencer?.id)
  const refImage     = overrideRef || influencer?.mainImage || null
  const locPreviewUrl = LOC_PREVIEWS[`${location}-${timeOfDay}`] || null
  // Pose preview: stance-keyed first; unkeyed fallback only for standing (old previews are standing images);
  // then global Camila defaults (which have stance-keyed entries for both stances).
  const posePreviewUrl = influencer?.posePreviews?.[`${stance}_${pose}`]
    || (stance === 'standing' && influencer?.posePreviews?.[pose])
    || CAMILA_POSE_PREVIEWS[`${stance}_${pose}`]
    || (stance === 'standing' && CAMILA_POSE_PREVIEWS[pose]) || null
  const rightPreviewUrl = rightMode === 'pose' ? posePreviewUrl : locPreviewUrl
  // Poses filtered by gender + stance
  const currentPoses = getPoses(influencer?.gender)
  // Whether this stance already has generated previews
  const hasStancePreviews = Object.keys(influencer?.posePreviews || {}).some(k =>
    k.startsWith(`${stance}_`) || (stance === 'standing' && !k.includes('_'))
  )

  const outputDims =
    aspectRatio === '9:16' ? { maxWidth: 320, aspectRatio: '9/16' } :
    aspectRatio === '16:9' ? { maxWidth: 480, aspectRatio: '16/9' } :
                             { maxWidth: 480, aspectRatio: '1/1'   }

  const chipStyle = (active) => ({
    padding: '6px 13px', borderRadius: 980, fontSize: 12, fontWeight: active ? 600 : 500,
    border: `1.5px solid ${active ? '#8B5CF6' : 'var(--border)'}`,
    background: active ? 'rgba(139,92,246,0.10)' : 'var(--bg)',
    color: active ? '#8B5CF6' : 'var(--text-secondary)',
    cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
  })

  const rowLabel = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 7, display: 'block',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Preview bar ── */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Preview</span>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>

        {/* Left: influencer photo — 9:16 */}
        <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
          <div
            onClick={() => refImage && setExpandedImg(refImage)}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (!file || !file.type.startsWith('image/')) return
              const reader = new FileReader()
              reader.onload = ev => setOverrideRef(ev.target.result)
              reader.readAsDataURL(file)
            }}
            style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', background: 'var(--bg-tertiary)', aspectRatio: '9/16', cursor: refImage ? 'zoom-in' : 'default', outline: dragOver ? '2.5px dashed #8B5CF6' : '2.5px solid transparent', outlineOffset: 2, transition: 'outline-color 0.15s' }}
          >
            {refImage ? (
              <>
                <img src={refImage} alt={influencer?.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.6))', padding: '22px 12px 10px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>{influencer?.name}</span>
                </div>
              </>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  {influencer?.name?.[0]?.toUpperCase()}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No photo yet</span>
              </div>
            )}
            {/* Drag overlay */}
            {dragOver && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(139,92,246,0.8)', padding: '8px 14px', borderRadius: 9 }}>Drop to replace</span>
              </div>
            )}
            {/* Download — top right */}
            {refImage && (
              <button
                onClick={e => { e.stopPropagation(); downloadImage(refImage, `${influencer?.name || 'photo'}.jpg`) }}
                style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 7, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, border: 'none', cursor: 'pointer', zIndex: 2 }}
              >↓</button>
            )}
            {/* Change — bottom right */}
            <button
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
              style={{ position: 'absolute', bottom: 10, right: 10, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', zIndex: 2 }}
            >Change</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
            const f = e.target.files?.[0]; if (!f) return
            const reader = new FileReader(); reader.onload = ev => setOverrideRef(ev.target.result); reader.readAsDataURL(f)
            e.target.value = ''
          }} />
        </div>

        {/* Right: location/pose preview — pure static preview, no generation UI */}
        <div
          onClick={() => { if (rightPreviewUrl) setExpandedImg(rightPreviewUrl) }}
          style={{ width: 260, flexShrink: 0, borderRadius: 12, overflow: 'hidden', position: 'relative', aspectRatio: '9/16', background: locVis.gradient, transition: 'background 0.4s ease', cursor: rightPreviewUrl ? 'zoom-in' : 'default' }}
        >
          <style>{`@keyframes locFadeIn{from{opacity:0}to{opacity:1}}`}</style>

          {rightPreviewUrl ? (
            <>
              <img key={rightPreviewUrl} src={rightPreviewUrl} alt={posePreviewUrl ? pose : locInfo.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', animation: 'locFadeIn 0.25s ease' }} />
              {rightMode === 'location' && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.65))', padding: '28px 12px 12px', zIndex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 5 }}>{locInfo.icon} {locInfo.label}</div>
                  <div style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 980, fontSize: 10, fontWeight: 600, background: timeVis.badgeBg, color: '#fff', backdropFilter: 'blur(6px)' }}>{timeVis.badge}</div>
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); downloadImage(rightPreviewUrl, `${influencer?.name || 'photo'}-${pose}.jpg`) }}
                style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 7, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, border: 'none', cursor: 'pointer', zIndex: 2 }}>↓</button>
            </>
          ) : (
            /* Layer 4 — gradient + label fallback (no preview image, not generating) */
            <>
              <div style={{ position: 'absolute', inset: 0, background: isCustomLoc ? 'linear-gradient(160deg,#1e1b4b 0%,#312e81 40%,#4c1d95 100%)' : timeVis.overlay, transition: 'background 0.4s ease' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '16px 20px', zIndex: 1 }}>
                {isCustomLoc ? (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px', marginBottom: 10, lineHeight: 1.35, wordBreak: 'break-word' }}>{location.trim()}</div>
                    <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 980, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.15)', color: '#fff', backdropFilter: 'blur(6px)' }}>{timeVis.badge}</div>
                    <div style={{ marginTop: 16, fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 500, letterSpacing: '0.3px' }}>Custom location</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 8 }}>{locInfo.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: locVis.textColor, letterSpacing: '-0.2px', marginBottom: 9 }}>{locInfo.label}</div>
                    <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 980, fontSize: 11, fontWeight: 600, background: timeVis.badgeBg, color: locVis.textColor, backdropFilter: 'blur(6px)' }}>{timeVis.badge}</div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

      </div>

      {/* Fullscreen modal */}
      {expandedImg && (
        <div
          onClick={() => setExpandedImg(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <button onClick={() => setExpandedImg(null)} style={{ position: 'fixed', top: 18, right: 18, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✕</button>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'default' }}>
            <img src={expandedImg} alt="" onClick={() => setExpandedImg(null)} style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', cursor: 'zoom-out', display: 'block' }} />
            <button
              onClick={() => downloadImage(expandedImg, 'photo.jpg')}
              style={{ padding: '10px 28px', borderRadius: 980, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(139,92,246,0.4)' }}
            >↓ Download</button>
          </div>
        </div>
      )}

      {/* ── Step 1: Location ── */}
      <PSec>
        <PSHeader n={1} title="Location" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {LOCATIONS.map(l => (
            <button key={l.id} onClick={() => { setLocation(l.id); setRightMode('location') }} style={chipStyle(location === l.id)}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Or type any location… Eiffel Tower, Tokyo alley, ski resort"
          value={LOCATIONS.some(l => l.id === location) ? '' : (location || '')}
          onChange={e => setLocation(e.target.value || null)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', borderRadius: 10, fontSize: 12,
            border: `1.5px solid ${!LOCATIONS.some(l => l.id === location) && location ? '#8B5CF6' : 'var(--border)'}`,
            background: 'var(--bg)', color: 'var(--text-primary)',
            outline: 'none', fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
        />
      </PSec>

      {/* ── Step 2: Time of Day ── */}
      <PSec>
        <PSHeader n={2} title="Time of Day" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TIMES.map(t => (
            <button key={t.id} onClick={() => { setTimeOfDay(t.id); setRightMode('location') }} style={chipStyle(timeOfDay === t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </PSec>

      {/* ── Step 3: Pose ── */}
      <PSec>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Pose</div>
          </div>
          {!hasStancePreviews && (
            <button
              onClick={async () => {
                if (poseGenerating || !influencer) return
                setPoseGenerating(true)
                await generatePosePreviews(influencer, (stancedId, url) => {
                  setInfluencers(prev => prev.map(i =>
                    i.id === influencer.id
                      ? { ...i, posePreviews: { ...(i.posePreviews || {}), [stancedId]: url } }
                      : i
                  ))
                }, { stance })
                setPoseGenerating(false)
              }}
              disabled={poseGenerating}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 980, fontSize: 11, fontWeight: 600,
                border: '1px solid rgba(139,92,246,0.35)', background: 'rgba(139,92,246,0.08)',
                color: '#8B5CF6', cursor: poseGenerating ? 'default' : 'pointer',
                opacity: poseGenerating ? 0.6 : 1, fontFamily: 'inherit',
              }}
            >
              {poseGenerating ? (
                <>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', animation: 'spin 0.7s linear infinite' }} />
                  Generating…
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </>
              ) : 'Generate Previews'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {currentPoses.filter(p => !(stance === 'sitting' && (p.id === 'walking' || p.id === 'facing-away'))).map(p => (
            <button key={p.id} onClick={() => { setPose(p.id); setRightMode('pose') }} style={chipStyle(pose === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Or describe any pose… arms crossed looking out a window, spinning around"
          value={currentPoses.some(p => p.id === pose) ? '' : (pose || '')}
          onChange={e => setPose(e.target.value || 'front')}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', borderRadius: 10, fontSize: 12, marginBottom: 12,
            border: `1.5px solid ${!currentPoses.some(p => p.id === pose) && pose && pose !== 'front' ? '#8B5CF6' : 'var(--border)'}`,
            background: 'var(--bg)', color: 'var(--text-primary)',
            outline: 'none', fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
        />
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
          {['standing', 'sitting'].map(s => (
            <button key={s} onClick={() => setStance(s)} style={{
              padding: '5px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              background: stance === s ? '#8B5CF6' : 'var(--bg)',
              color: stance === s ? '#fff' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', transition: 'all 0.12s',
              textTransform: 'capitalize',
            }}>{s}</button>
          ))}
        </div>
      </PSec>

      {/* ── Step 4: Expression ── */}
      <PSec>
        <PSHeader n={4} title="Expression" />
        {pose === 'facing-away' ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 10, lineHeight: 1.5 }}>
            Not applicable — face is not visible when posing away from the camera.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {EXPRESSIONS.map(ex => (
                <button key={ex.id} onClick={() => setExpression(ex.id)} style={chipStyle(expression === ex.id)}>
                  {ex.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Or describe any expression… biting her lip, wide-eyed surprise, stoic"
              value={EXPRESSIONS.some(ex => ex.id === expression) ? '' : (expression || '')}
              onChange={e => setExpression(e.target.value || 'natural')}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px', borderRadius: 10, fontSize: 12, marginBottom: 12,
                border: `1.5px solid ${!EXPRESSIONS.some(ex => ex.id === expression) && expression && expression !== 'natural' ? '#8B5CF6' : 'var(--border)'}`,
                background: 'var(--bg)', color: 'var(--text-primary)',
                outline: 'none', fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
            />
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
              {[{ id: 'at-camera', label: 'Looking at Camera' }, { id: 'looking-away', label: 'Looking Away' }].map(g => (
                <button key={g.id} onClick={() => setGaze(g.id)} style={{
                  padding: '5px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  background: gaze === g.id ? '#8B5CF6' : 'var(--bg)',
                  color: gaze === g.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                }}>{g.label}</button>
              ))}
            </div>
          </>
        )}
      </PSec>

      {/* ── Step 6: Outfit ── */}
      <PSec>
        <PSHeader n={5} title="Outfit" />

        {/* 6A — Wardrobe reference images */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Wardrobe</div>
            <button
              onClick={() => setWardrobeOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 980, fontSize: 10, fontWeight: 600,
                border: '1px solid rgba(139,92,246,0.35)', background: 'rgba(139,92,246,0.08)',
                color: '#8B5CF6', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <OutfitCard
              image={influencer?.characterSheetImage || null}
              label="Current"
              active={outfitPreset === 'current' && !wardrobeText}
              onClick={() => { setOutfitPreset('current'); setWardrobeText('') }}
            />
            {wardrobeSlots.filter(s => s.image).map(s => {
              const active = outfitPreset === s.id && !wardrobeText
              return (
                <OutfitCard
                  key={s.id}
                  image={s.image}
                  label={s.name}
                  active={active}
                  onClick={() => { setOutfitPreset(active ? 'current' : s.id); setWardrobeText('') }}
                />
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>

        {/* 6B — Style presets (gender-aware) */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Preset Style</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {getOutfitPresets(influencer?.gender).map(({ id, label }) => {
              const active = outfitPreset === id && !wardrobeText
              return (
                <button key={id} onClick={() => { setOutfitPreset(active ? 'current' : id); setWardrobeText('') }} style={chipStyle(active)}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>

        {/* 6C — Custom text */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Custom</div>
          <textarea
            value={wardrobeText}
            onChange={e => { setWardrobeText(e.target.value); if (e.target.value) setOutfitPreset('current') }}
            placeholder="Describe your outfit here…"
            rows={2}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 9,
              border: `1.5px solid ${wardrobeText ? '#8B5CF6' : 'var(--border)'}`,
              background: 'var(--bg)', fontSize: 13, color: 'var(--text-primary)',
              lineHeight: 1.5, resize: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s',
            }}
          />
        </div>

        {/* 6D — Hairstyle lock */}
        <div>
          <button
            onClick={() => {
              const next = !hairstyleLocked
              setHairstyleLocked(next)
              if (!next) setHairstyleText('')
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 9, width: '100%',
              background: hairstyleLocked ? 'rgba(139,92,246,0.08)' : 'var(--bg-tertiary)',
              border: `1.5px solid ${hairstyleLocked ? 'rgba(139,92,246,0.35)' : 'var(--border)'}`,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={hairstyleLocked ? '#8B5CF6' : 'var(--text-tertiary)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {hairstyleLocked
                ? <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
                : <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>
              }
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: hairstyleLocked ? '#8B5CF6' : 'var(--text-tertiary)', flex: 1, textAlign: 'left' }}>
              {hairstyleLocked ? 'Hairstyle locked' : 'Lock hairstyle'}
            </span>
            <span style={{ fontSize: 10, color: hairstyleLocked ? 'rgba(139,92,246,0.6)' : 'var(--text-tertiary)', fontStyle: 'italic' }}>
              {hairstyleLocked ? 'overrides all refs' : 'optional'}
            </span>
          </button>
          {hairstyleLocked && (
            <input
              autoFocus
              type="text"
              value={hairstyleText}
              onChange={e => setHairstyleText(e.target.value)}
              placeholder="e.g. sleek high ponytail, messy bun, beach waves, straight and blunt"
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 8,
                padding: '9px 12px', borderRadius: 9, fontSize: 13,
                border: '1.5px solid rgba(139,92,246,0.4)',
                background: 'var(--bg)', color: 'var(--text-primary)',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          )}
        </div>
      </PSec>

      {/* ── Step 6: Props ── */}
      <PSec>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>6</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Props</div>
            <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', fontStyle: 'italic', letterSpacing: '0.1px' }}>(optional)</div>
          </div>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={() => setPropInfoTip(true)} onMouseLeave={() => setPropInfoTip(false)}>
            <div style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--text-tertiary)', color: 'var(--text-tertiary)', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', userSelect: 'none' }}>i</div>
            {propInfoTip && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 200, width: 220, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, pointerEvents: 'none' }}>
                A product or item you want the influencer to hold or wear in the photo. Upload an image of the product and it will be worked into the shot.
              </div>
            )}
          </div>
        </div>
        <input ref={propFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return
          const dataUrl = await readImageFile(file)
          const idx = propSlotRef.current
          setPropSlots(prev => prev.map((s, i) => i === idx ? { image: dataUrl, mode: s?.mode || 'holding' } : s))
          e.target.value = ''
        }} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {propSlots.map((slot, idx) => (
            <div
              key={idx}
              style={{ flexShrink: 0, width: 100, position: 'relative' }}
              onDragOver={e => { e.preventDefault(); setPropDragOver(idx) }}
              onDragLeave={() => setPropDragOver(null)}
              onDrop={async e => {
                e.preventDefault(); setPropDragOver(null)
                const file = e.dataTransfer.files?.[0]; if (!file || !file.type.startsWith('image/')) return
                const dataUrl = await readImageFile(file)
                setPropSlots(prev => prev.map((s, i) => i === idx ? { image: dataUrl, mode: 'holding' } : s))
              }}
            >
              {slot?.image ? (
                /* Filled slot: image + mode strip inside box + generate button below */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ position: 'relative', borderRadius: 12, border: slot.pairId ? '1.5px solid rgba(139,92,246,0.6)' : '1.5px solid rgba(139,92,246,0.35)', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                    {/* Paired indicator */}
                    {slot.pairId && (
                      <div style={{ position: 'absolute', top: 5, left: 5, zIndex: 2, background: 'rgba(139,92,246,0.8)', borderRadius: 4, padding: '2px 5px', fontSize: 8, fontWeight: 700, color: '#fff', backdropFilter: 'blur(2px)', letterSpacing: '0.3px' }}>PAIRED</div>
                    )}
                    {/* ✕ — hidden on last remaining slot */}
                    {propSlots.length > 1 && (
                      <button
                        onClick={() => setPropSlots(prev => {
                          const removedPairId = prev[idx]?.pairId
                          return prev
                            .filter((_, i) => i !== idx)
                            .map(s => s && removedPairId && s.pairId === removedPairId ? { ...s, pairId: undefined } : s)
                        })}
                        style={{ position: 'absolute', top: 5, right: 5, zIndex: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                      >✕</button>
                    )}
                    {/* Image — click to fullscreen */}
                    <div style={{ position: 'relative' }}>
                      <img
                        src={slot.image}
                        alt={`Prop ${idx + 1}`}
                        onClick={() => setExpandedImg(slot.image)}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.cursor = 'zoom-in' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                        style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block', transition: 'transform 0.2s' }}
                      />
                      {propGenerating[idx] && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.75s linear infinite' }} />
                          <div style={{ color: '#fff', fontSize: 10, fontWeight: 600 }}>{Math.round(propProgress[idx] || 0)}%</div>
                        </div>
                      )}
                    </div>
                    {/* Holding / Wearing strip — inside the box */}
                    <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
                      {['holding', 'wearing'].map(m => (
                        <button key={m}
                          onClick={() => setPropSlots(prev => prev.map((s, i) => {
                            if (!s) return s
                            // Update this slot and any paired slot together
                            if (i === idx || (slot.pairId && s.pairId === slot.pairId)) return { ...s, mode: m }
                            return s
                          }))}
                          style={{ flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600, fontFamily: 'inherit', background: (slot.mode || 'holding') === m ? '#8B5CF6' : 'transparent', color: (slot.mode || 'holding') === m ? '#fff' : 'var(--text-tertiary)', border: 'none', cursor: 'pointer', transition: 'all 0.12s', textTransform: 'capitalize' }}
                        >{m}</button>
                      ))}
                    </div>
                  </div>
                  {/* Generate Product Sheet — below the box */}
                  <button
                    onClick={() => generatePropSheet(idx)}
                    disabled={!!propGenerating[idx]}
                    style={{ width: '100%', padding: '5px 0', borderRadius: 8, fontSize: 10, fontWeight: 600, fontFamily: 'inherit', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: propGenerating[idx] ? 'var(--text-tertiary)' : '#8B5CF6', cursor: propGenerating[idx] ? 'default' : 'pointer', transition: 'all 0.12s' }}
                  >{propGenerating[idx] ? `${Math.round(propProgress[idx] || 0)}%…` : 'Generate Product Sheet'}</button>
                </div>
              ) : propGenerating[idx] ? (
                <PropGeneratingSlot apiProgress={propProgress[idx] || 0} claudeStatus={propClaudeStatus[idx] || null} />
              ) : (
                <>
                  {propSlots.length > 1 && (
                    <button
                      onClick={() => setPropSlots(prev => {
                        const removedPairId = prev[idx]?.pairId
                        return prev
                          .filter((_, i) => i !== idx)
                          .map(s => s && removedPairId && s.pairId === removedPairId ? { ...s, pairId: undefined } : s)
                      })}
                      style={{ position: 'absolute', top: -5, right: -5, zIndex: 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--bg)', border: '1.5px solid var(--border)', color: 'var(--text-secondary)', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                    >✕</button>
                  )}
                <div
                  style={{
                    width: 100, height: 100, borderRadius: 12,
                    border: `1.5px dashed ${propDragOver === idx ? '#8B5CF6' : 'var(--border)'}`,
                    background: propDragOver === idx ? 'rgba(139,92,246,0.06)' : 'var(--bg-tertiary)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {/* Upload half */}
                  <div
                    onClick={() => { propSlotRef.current = idx; propFileRef.current?.click() }}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.2px' }}>Upload</span>
                  </div>
                  {/* Brand deal half */}
                  {(brandDeals?.some(d => d.characterSheet || d.image) || influencer?.brandDeals?.some(d => d.characterSheet || d.image)) && (
                    <>
                      <div style={{ height: 1, background: 'var(--border)' }} />
                      <div
                        onClick={() => setBrandPickerSlot(idx)}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#8B5CF6', letterSpacing: '0.2px' }}>Brand Deal</span>
                      </div>
                    </>
                  )}
                </div>
                </>
              )}
            </div>
          ))}

          {/* Add slot button */}
          <button
            onClick={() => setPropSlots(prev => [...prev, null])}
            style={{ flexShrink: 0, width: 100, alignSelf: 'flex-start', aspectRatio: '1/1', borderRadius: 12, border: '1.5px dashed var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Add</span>
          </button>
        </div>

        {/* Prop text input — suppress "holding" suggestions when a holding prop image is set */}
        <input
          type="text"
          value={propText}
          onChange={e => setPropText(e.target.value)}
          placeholder={
            propSlots.some(s => s?.image && (s.mode || 'holding') === 'holding')
              ? 'e.g. additional scene notes…'
              : (PROP_SUGGESTIONS[location] || 'e.g. holding a coffee cup')
          }
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
            border: `1.5px solid ${propText ? '#8B5CF6' : 'var(--border)'}`,
            background: 'var(--bg)', fontSize: 12, color: 'var(--text-primary)',
            fontFamily: 'inherit', outline: 'none',
            transition: 'border-color 0.15s',
          }}
        />
      </PSec>

      {/* ── Brand Deal Picker Modal ── */}
      {brandPickerSlot !== null && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setBrandPickerSlot(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 20, padding: 24, width: 340, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px', marginBottom: 16 }}>Pick a Brand Deal</div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: influencer?.name ? `${influencer.name}'s deals` : 'Profile deals', items: (influencer?.brandDeals || []).filter(d => d.characterSheet || d.image) },
                { label: 'Brand Deals page', items: (brandDeals || []).filter(d => d.characterSheet || d.image) },
              ].filter(g => g.items.length > 0).map(group => (
                <div key={group.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{group.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {group.items.map(deal => (
                      <button
                        key={deal.id}
                        onClick={() => {
                          const img = deal.characterSheet || deal.image
                          const idx = brandPickerSlot
                          setPropSlots(prev => prev.map((s, i) => i === idx ? { image: img, mode: 'holding' } : s))
                          if (!propText.trim()) setPropText(`holding ${deal.brand} product`)
                          setBrandPickerSlot(null)
                        }}
                        style={{ background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 0, cursor: 'pointer', overflow: 'hidden', textAlign: 'left', transition: 'border-color 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#8B5CF6'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        <img src={deal.characterSheet || deal.image} alt={deal.brand} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                        <div style={{ padding: '7px 10px' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.brand}</div>
                          {deal.category && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{deal.category}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Step 8: Format ── */}
      <PSec>
        <PSHeader n={7} title="Format" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {[{id:'9:16',w:10,h:16},{id:'16:9',w:16,h:10}].map(a => (
            <button key={a.id} onClick={() => setAspectRatio(a.id)} style={{ ...chipStyle(aspectRatio === a.id), display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ display: 'inline-block', width: a.w, height: a.h, border: `1.5px solid ${aspectRatio === a.id ? '#8B5CF6' : 'var(--text-secondary)'}`, borderRadius: 2, flexShrink: 0 }} />
              {a.id}
            </button>
          ))}
          <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
          {['2k', '4k'].map(r => (
            <button key={r} onClick={() => setResolution(r)} style={chipStyle(resolution === r)}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 7 }}>
          Output · {outputCount} {outputCount === 1 ? 'image' : 'images'}
        </div>
        <input
          type="range" min={1} max={10} value={outputCount}
          onChange={e => setOutputCount(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#8B5CF6', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
          <span>1</span><span>10</span>
        </div>
      </PSec>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        {isActivelyGenerating ? (
          <button
            onClick={() => {
              cancelRef.current = true
              generatingForIdRef.current = null
              clearPendingPhoto(influencer?.id)  // permanently cancel — no resume
              setGenerating(false)
              setCurrentImgs([])
            }}
            style={{
              padding: '12px 18px', borderRadius: 11, fontSize: 13, fontWeight: 600,
              border: '1.5px solid rgba(255,59,48,0.35)', background: 'rgba(255,59,48,0.08)',
              color: '#FF3B30', cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
            }}
          >Cancel</button>
        ) : (
          <button onClick={doRandomize} disabled={isActivelyGenerating} style={{
            padding: '12px 18px', borderRadius: 11, fontSize: 13, fontWeight: 600,
            border: '1.5px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text-primary)', cursor: 'pointer',
            transition: 'all 0.12s', fontFamily: 'inherit',
          }}>🎲 Random</button>
        )}
        <button
          onClick={generate}
          disabled={isActivelyGenerating || !influencer}
          style={{
            flex: 1, padding: '12px 18px', borderRadius: 11, fontSize: 14, fontWeight: 700,
            background: (isActivelyGenerating || !influencer) ? 'rgba(139,92,246,0.12)' : 'linear-gradient(135deg,#EC4899,#8B5CF6)',
            color: (isActivelyGenerating || !influencer) ? '#8B5CF6' : '#fff',
            border: isActivelyGenerating ? '1.5px solid rgba(139,92,246,0.3)' : 'none',
            cursor: (isActivelyGenerating || !influencer) ? 'default' : 'pointer',
            opacity: !influencer ? 0.4 : 1, transition: 'all 0.12s', fontFamily: 'inherit',
          }}
        >
          {isActivelyGenerating ? 'Generating…' : 'Generate Photo'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', fontSize: 13, color: '#FF3B30', lineHeight: 1.4 }}>
          {error}
        </div>
      )}

      {/* ── Multi-image output (batch > 1) ── */}
      {(isActivelyGenerating || currentImgs.length > 0) && (isActivelyGenerating ? lockedCount : currentImgs.length) > 1 && (
        <>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          maxWidth: (() => {
            const n = isActivelyGenerating ? lockedCount : currentImgs.length
            const w = aspectRatio === '9:16' ? 220 : 340
            return `${n * w + Math.max(0, n - 1) * 10}px`
          })(),
          margin: '0 auto',
          width: '100%',
        }}>
          {Array.from({ length: isActivelyGenerating ? lockedCount : currentImgs.length }, (_, i) => {
            const url = currentImgs[i]
            const isReady = !!url
            return (
              <div key={i} onClick={() => isReady && setExpandedImg(url)} style={{
                flex: 1, minWidth: 0,
                borderRadius: 12, overflow: 'hidden',
                aspectRatio: aspectRatio.replace(':', '/'),
                position: 'relative',
                background: isReady ? 'var(--bg-tertiary)' : 'linear-gradient(160deg,#0f0720 0%,#1a0d35 55%,#0d0820 100%)',
                border: isReady ? 'none' : '1.5px solid rgba(139,92,246,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isReady ? 'zoom-in' : 'default',
              }}>
                {isReady ? (
                  <>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button onClick={async(e)=>{e.stopPropagation();try{const res=await fetch(url);const blob=await res.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`photo-studio-${i+1}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000)}catch{const a=document.createElement('a');a.href=url;a.download=`photo-studio-${i+1}.jpg`;a.click()}}} style={{ position: 'absolute', bottom: 8, right: 8, padding: '5px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>↓</button>
                    {onUseAsStartFrame && (
                      <button onClick={()=>onUseAsStartFrame(url)} style={{ position: 'absolute', bottom: 8, left: 8, padding: '5px 10px', borderRadius: 7, background: 'linear-gradient(135deg,rgba(236,72,153,0.85),rgba(139,92,246,0.85))', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        → Video
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,transparent 30%,rgba(139,92,246,0.07) 50%,transparent 70%)', animation: 'ps-shimmer 2.6s ease-in-out infinite', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: 16 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 10 }}>Generating…</div>
                      <div style={{ width: 80, height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', margin: '0 auto 8px' }}>
                        <div style={{ height: '100%', width: `${smoothPct}%`, background: 'linear-gradient(90deg,#EC4899,#8B5CF6)', borderRadius: 2, transition: 'width 0.4s linear' }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(139,92,246,0.7)', fontVariantNumeric: 'tabular-nums' }}>
                        {elapsedSecs < 60 ? `${elapsedSecs}s` : `${Math.floor(elapsedSecs/60)}m ${elapsedSecs%60}s`}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {!isActivelyGenerating && currentImgs.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={() => setCurrentImgs([])} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', fontFamily: 'inherit' }}>Clear</button>
          </div>
        )}
        </>
      )}

      {/* ── History strip ── */}
      {(isActivelyGenerating || infHistory.length > 0) && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          {/* Header row — fixed single line, no wrap */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
              History · {infHistory.length}
            </span>

            {infHistory.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {/* Select / Deselect all — always visible */}
                <button
                  onClick={() => {
                    if (selectedHistIds.size === infHistory.length) setSelectedHistIds(new Set())
                    else setSelectedHistIds(new Set(infHistory.map(h => h.histId || h.url)))
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                    background: selectedHistIds.size === infHistory.length ? 'rgba(139,92,246,0.1)' : 'var(--bg-tertiary)',
                    color: selectedHistIds.size === infHistory.length ? '#8B5CF6' : 'var(--text-tertiary)',
                    border: selectedHistIds.size === infHistory.length ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{selectedHistIds.size === infHistory.length ? 'Deselect all' : 'Select all'}</button>

                {/* Download — only when something selected */}
                {selectedHistIds.size > 0 && (
                  <button
                    onClick={async () => {
                      const items = infHistory.filter(h => selectedHistIds.has(h.histId || h.url))
                      await Promise.all(items.map((item, i) =>
                        downloadImage(item.url, `photo-${new Date(item.createdAt).toISOString().slice(0,10)}-${i+1}.jpg`)
                      ))
                    }}
                    style={{
                      padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                      background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >↓ {selectedHistIds.size}</button>
                )}

                {/* Delete selected / Clear all */}
                <button
                  onClick={() => {
                    const ids = selectedHistIds.size > 0 ? selectedHistIds : new Set(infHistory.map(h => h.histId || h.url))
                    const count = ids.size
                    setConfirmClear({
                      label: selectedHistIds.size > 0 ? `Delete ${count} photo${count !== 1 ? 's' : ''}` : `Clear all ${count} photo${count !== 1 ? 's' : ''}`,
                      onConfirm: () => {
                        const next = history.filter(h => !ids.has(h.histId || h.url))
                        setHistory(next)
                        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
                        const deletedUrls = new Set(infHistory.filter(h => ids.has(h.histId || h.url)).map(h => h.url))
                        setCurrentImgs(prev => prev.filter(u => !deletedUrls.has(u)))
                        setSelectedHistIds(new Set())
                        setConfirmClear(null)
                      },
                    })
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                    background: selectedHistIds.size > 0 ? 'rgba(255,59,48,0.08)' : 'var(--bg-tertiary)',
                    color: selectedHistIds.size > 0 ? '#FF3B30' : 'var(--text-tertiary)',
                    border: selectedHistIds.size > 0 ? '1px solid rgba(255,59,48,0.2)' : '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{selectedHistIds.size > 0 ? `Delete (${selectedHistIds.size})` : 'Clear all'}</button>
              </div>
            )}
          </div>

          {/* Thumb strip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingBottom: 8 }}>
            {/* Loading placeholders for images still generating */}
            {isActivelyGenerating && Array.from({ length: Math.max(0, lockedCount - currentImgs.length) }, (_, i) => (
              <div key={`gen-${i}`} style={{
                width: aspectRatio === '9:16' ? 60 : 96, height: 96, borderRadius: 8,
                background: 'linear-gradient(160deg,#0f0720 0%,#1a0d35 55%,#0d0820 100%)',
                border: '1.5px solid rgba(139,92,246,0.22)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,transparent 30%,rgba(139,92,246,0.07) 50%,transparent 70%)', animation: 'ps-shimmer 2.6s ease-in-out infinite' }} />
              </div>
            ))}

            {infHistory.map((item, idx) => (
              <PhotoHistoryThumb
                key={item.histId || idx}
                item={item}
                isSelected={selectedHistIds.has(item.histId || item.url)}
                onUseAsStartFrame={onUseAsStartFrame}
                onToggle={() => setSelectedHistIds(prev => {
                  const next = new Set(prev)
                  const id = item.histId || item.url
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Wardrobe drawer ── */}
      {wardrobeOpen && (
        <WardrobeDrawer
          influencer={influencer}
          pendingResult={wardrobePending}
          onResult={handleWardrobeResult}
          onClose={() => setWardrobeOpen(false)}
          onSave={slot => {
            setInfluencers(prev => prev.map(i =>
              i.id === influencer.id
                ? { ...i, wardrobeSlots: [...(i.wardrobeSlots || []), slot] }
                : i
            ))
            setWardrobeOpen(false)
          }}
        />
      )}

      {confirmClear && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmClear(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: '28px 32px', maxWidth: 340, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{confirmClear.label}?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmClear(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmClear.onConfirm} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#FF3B30', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
