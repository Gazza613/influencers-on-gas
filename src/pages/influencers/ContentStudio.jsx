import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { generateId } from '../../store'
import WardrobeDrawer from '../../components/WardrobeDrawer'
import { compressImage } from '../../utils/imageUtils'
import { generateVideo, getPendingVideo, clearPendingVideo, resumeVideoJob } from '../../utils/higgsfieldGenerate'
import { VIDEO_MODELS, CS_ENVIRONMENTS, CS_ENV_PRESETS, CS_CAMERAS, CS_VIBES, VOICE_PRESETS, CAMERA_META, VIBE_META, VIDEO_MAX_WORDS } from './constants'
import { fmtElapsed, inferAmbientSound, ytId } from './helpers'
import { annotateDialogue, parseAdditionalNotes } from './prompts'
import { Sec, CSStepHeader, CSChips } from './components/common'
import { SaveScriptModal } from './components/Scripts'
import { VideoStripThumb } from './components/Media'

function CSProductSlot({ value, onChange, dragOver, setDragOver, fileRef, label }) {
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(onChange).catch(console.error)
    r.readAsDataURL(file)
  }
  const size = 160
  return (
    <div style={{width:size,flexShrink:0}}>
      {value ? (
        <div style={{position:'relative'}}>
          <img src={value} style={{
            width:size,height:size,objectFit:'contain',borderRadius:14,display:'block',
            border:'1.5px solid var(--border)',background:'var(--bg-tertiary)',
          }}/>
          <button onClick={()=>onChange(null)} style={{
            position:'absolute',top:-7,right:-7,width:22,height:22,borderRadius:'50%',
            background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:13,border:'none',
            display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
          }}>×</button>
          <div style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',marginTop:6}}>{label}</div>
        </div>
      ) : (
        <div
          onClick={()=>fileRef.current.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}
          style={{
            width:size,height:size,borderRadius:14,cursor:'pointer',
            border: dragOver ? '2px solid #8B5CF6' : '1.5px dashed var(--border)',
            background: dragOver ? 'rgba(139,92,246,0.07)' : 'var(--bg-tertiary)',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,
            transition:'all 0.15s',
          }}
        >
          <div style={{fontSize:30,opacity:0.2,lineHeight:1,fontWeight:300}}>+</div>
          <div style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',lineHeight:1.4,padding:'0 10px'}}>{label}</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e=>{const f=e.target.files[0];if(f)handleFile(f);e.target.value=''}}/>
    </div>
  )
}

// ─────────────────────────────────────────────
// Parse additional notes into action beats (injected into ACTION block) and direction notes (DIRECTION section)



// Wardrobe card with hover popup — matches PhotoStudio OutfitCard exactly
function WardrobeChipWithHover({ slot, active, onClick }) {
  const cardRef = useRef()
  const leaveTimer = useRef()
  const [popup, setPopup] = useState(null)

  function handleEnter() {
    clearTimeout(leaveTimer.current)
    if (!cardRef.current || !slot.image) return
    const r = cardRef.current.getBoundingClientRect()
    const popW = 600
    const popH = Math.round(popW * 9 / 16) + 30
    const left = Math.max(8, Math.min(r.left + r.width / 2 - popW / 2, window.innerWidth - popW - 8))
    const top = r.top - popH - 8
    setPopup({ left, top, width: popW })
  }
  function handleLeave() { leaveTimer.current = setTimeout(() => setPopup(null), 100) }

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
          background: slot.image ? 'transparent' : 'var(--bg-tertiary)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {slot.image
            ? <img src={slot.image} alt={slot.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" opacity="0.5"><circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
          }
        </div>
        <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? '#8B5CF6' : 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.2, minHeight: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {slot.name}
        </span>
      </button>

      {popup && slot.image && createPortal(
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
          <img src={slot.image} alt={slot.name} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
          <div style={{ padding: '5px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{slot.name}</div>
        </div>,
        document.body
      )}
    </>
  )
}

export function ContentStudio({ influencer, onUpdate, onSaveToScripts, onGenerated, restoreKey = 0, pendingStartFrame = null, onStartFrameConsumed }) {
  const allImages = [
    { key: 'mainImage',          label: 'Main',          url: influencer.mainImage },
    { key: 'characterSheetImage',label: 'Character Sheet',url: influencer.characterSheetImage },
    { key: 'closeUpImage1',      label: 'Close Up',      url: influencer.closeUpImage1 },
    { key: 'closeUpImage2',      label: 'Feature Sheet', url: influencer.closeUpImage2 },
    ...(influencer.wardrobeSlots||[]).filter(s=>s.image).map(s=>({ key: s.id, label: s.name, url: s.image })),
  ].filter(img=>img.url)

  const [productRef1, setProductRef1] = useState(() => { try { return localStorage.getItem(`hf_product_ref_1_${influencer.id}`) || null } catch { return null } })
  const [productRef2, setProductRef2] = useState(() => { try { return localStorage.getItem(`hf_product_ref_2_${influencer.id}`) || null } catch { return null } })
  const [productRef3, setProductRef3] = useState(() => { try { return localStorage.getItem(`hf_product_ref_3_${influencer.id}`) || null } catch { return null } })
  const [productWorn, setProductWorn] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').productWorn ?? false } catch { return false } })
  const [dealPopup, setDealPopup] = useState(null)
  const [dealViewSheet, setDealViewSheet] = useState({})
  const [dragOver1, setDragOver1] = useState(false)
  const [dragOver2, setDragOver2] = useState(false)
  const [dragOver3, setDragOver3] = useState(false)
  const productFileRef1 = useRef()
  const productFileRef2 = useRef()
  const productFileRef3 = useRef()
  const [dialogue, setDialogue] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').dialogue ?? '' } catch { return '' } })
  const [envKey, setEnvKey] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').envKey ?? '' } catch { return '' } })
  const [environment, setEnvironment] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}')
      const ek = s.envKey ?? ''
      return ek ? (CS_ENV_PRESETS[ek] || ek) : (s.envCustom ?? '')
    } catch { return '' }
  })
  const [camera, setCamera] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').camera ?? 'Handheld' } catch { return 'Handheld' } })
  const [vibe, setVibe] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').vibe ?? '' } catch { return '' } })
  const [voicePreset, setVoicePreset] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').voicePreset ?? '' } catch { return '' } })
  const [voiceCustom, setVoiceCustom] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').voiceCustom ?? '' } catch { return '' } })
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [audioDataUrl, setAudioDataUrl] = useState(null)
  const [audioFileName, setAudioFileName] = useState('')
  const [audioDuration, setAudioDuration] = useState(null)
  const audioFileRef = useRef()
  const [duration, setDuration] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').duration ?? 15 } catch { return 15 } })
  const [aspect, setAspect] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').aspect ?? '9:16' } catch { return '9:16' } })
  const [outputs, setOutputs] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').outputs ?? 1 } catch { return 1 } })
  const [resolution, setResolution] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').resolution ?? '1080p' } catch { return '1080p' } })
  const [shotMode, setShotMode] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').shotMode ?? 'oner' } catch { return 'oner' } })
  const [videoModel, setVideoModel] = useState(() => { try { const s = JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').model; return VIDEO_MODELS.find(m => m.id === s) ? s : 'seedance_2_0' } catch { return 'seedance_2_0' } })
  const [saved, setSaved] = useState(false)
  const [saveModal, setSaveModal] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [lockedOutputs, setLockedOutputs] = useState(1)
  const [genProgress, setGenProgress] = useState(0)
  const [genError, setGenError] = useState(null)
  const [genResults, setGenResults] = useState(() => { try { return JSON.parse(localStorage.getItem(`hf_gen_results_${influencer.id}`) || '[]') } catch { return [] } })
  const [genShareUrls, setGenShareUrls] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState(() => { try { return localStorage.getItem(`hf_last_prompt_${influencer.id}`) || null } catch { return null } })
  const [promptRecomputeTick, setPromptRecomputeTick] = useState(0)
  const [copied, setCopied] = useState(false)
  const [displayProgress, setDisplayProgress] = useState(0)
  const displayProgressRef = useRef(0)
  const genCardRef = useRef(null)
  const cancelRef = useRef(false)
  const genEpochRef = useRef(0) // incremented at the start of every new generation; lets each loop self-invalidate without sharing cancelRef
  // Cancel in-flight generation on unmount so hf_pending_videos survives for resume on remount
  useEffect(() => () => { cancelRef.current = true; clearInterval(elapsedRef.current) }, [])
  const onGeneratedRef = useRef(onGenerated)
  useEffect(() => { onGeneratedRef.current = onGenerated }, [onGenerated])
  const [startFrameUrl, setStartFrameUrl] = useState(() => { try { return localStorage.getItem(`hf_start_frame_${influencer.id}`) || null } catch { return null } })
  const clearStartFrame = () => { setStartFrameUrl(null); try { localStorage.removeItem(`hf_start_frame_${influencer.id}`) } catch {} }
  useEffect(() => {
    if (!pendingStartFrame) return
    setStartFrameUrl(pendingStartFrame)
    try { localStorage.setItem(`hf_start_frame_${influencer.id}`, pendingStartFrame) } catch {}
    onStartFrameConsumed?.()
  }, [pendingStartFrame])
  const [fullscreenUrl, setFullscreenUrl] = useState(null)
  const [regenSlot, setRegenSlot] = useState(null)
  const [history, setHistory] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(`hf_video_history_${influencer.id}`) || '[]')
      return raw.map(e => { const c = { ...e }; delete c.productRef1; delete c.productRef2; delete c.productRef3; return c })
    } catch { return [] }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [refTip, setRefTip] = useState(false)
  const [selectedVidIds, setSelectedVidIds] = useState(new Set())
  const [confirmVidClear, setConfirmVidClear] = useState(null)
  const restoringRef = useRef(false)

  const CS_DEFAULTS = { vibe: '', duration: 15, aspect: '9:16', outputs: 1, resolution: '1080p', shotMode: 'oner', camera: 'Handheld', envKey: '', envCustom: '', voicePreset: '', voiceCustom: '', model: 'seedance_2_0' }
  function loadCsSettings(id) { try { return JSON.parse(localStorage.getItem(`cs_settings_${id}`) || '{}') } catch { return {} } }

  useEffect(() => {
    restoringRef.current = true
    setSelectedVidIds(new Set())
    setConfirmVidClear(null)
    const s = loadCsSettings(influencer.id)
    setVibe(s.vibe            ?? CS_DEFAULTS.vibe)
    setDuration(s.duration    ?? CS_DEFAULTS.duration)
    setAspect(s.aspect        ?? CS_DEFAULTS.aspect)
    setOutputs(s.outputs      ?? CS_DEFAULTS.outputs)
    setResolution(s.resolution ?? CS_DEFAULTS.resolution)
    setShotMode(s.shotMode    ?? CS_DEFAULTS.shotMode)
    setVideoModel(VIDEO_MODELS.find(m => m.id === s.model) ? s.model : CS_DEFAULTS.model)
    setCamera(s.camera        ?? CS_DEFAULTS.camera)
    const ek = s.envKey ?? CS_DEFAULTS.envKey
    setEnvKey(ek)
    setEnvironment(ek ? (CS_ENV_PRESETS[ek] || ek) : (s.envCustom ?? CS_DEFAULTS.envCustom))
    setVoicePreset(s.voicePreset ?? CS_DEFAULTS.voicePreset)
    setVoiceCustom(s.voiceCustom ?? CS_DEFAULTS.voiceCustom)
    setDialogue(s.dialogue ?? '')
    setVideoTimeOfDay(s.videoTimeOfDay ?? 'afternoon')
    setProductWorn(s.productWorn ?? false)
    try {
      const raw = JSON.parse(localStorage.getItem(`hf_video_history_${influencer.id}`) || '[]')
      // Scrub any base64 product refs that were saved by older versions — they bloat localStorage
      const cleaned = raw.map(e => { const c = { ...e }; delete c.productRef1; delete c.productRef2; delete c.productRef3; return c })
      setHistory(cleaned)
      try { localStorage.setItem(`hf_video_history_${influencer.id}`, JSON.stringify(cleaned)) } catch {}
    } catch {}
    try { setStartFrameUrl(localStorage.getItem(`hf_start_frame_${influencer.id}`) || null) } catch {} // read only — never writes
    restoringRef.current = false
  }, [influencer.id])

  const [advanced, setAdvanced] = useState(() => {
    try { return localStorage.getItem('cs_advanced_open') === '1' } catch { return false }
  })
  const [videoTimeOfDay, setVideoTimeOfDay] = useState(() => { try { return JSON.parse(localStorage.getItem(`cs_settings_${influencer.id}`) || '{}').videoTimeOfDay ?? 'afternoon' } catch { return 'afternoon' } })
  const [selectedWardrobeId, setSelectedWardrobeId] = useState(() => { try { return localStorage.getItem(`hf_wardrobe_id_${influencer.id}`) || '' } catch { return '' } })
  const wardrobeSlots = (influencer.wardrobeSlots || []).filter(s => s.image)
  const selectedWardrobe = wardrobeSlots.find(s => s.id === selectedWardrobeId) || null
  const [csWardrobeOpen, setCsWardrobeOpen] = useState(false)
  const [csWardrobePending, setCsWardrobePending] = useState(() => {
    try { return localStorage.getItem(`wd_result_${influencer?.id}`) || null } catch { return null }
  })

  function handleCsWardrobeResult(url) {
    const key = `wd_result_${influencer?.id}`
    if (url) {
      try { localStorage.setItem(key, url) } catch {}
      setCsWardrobePending(url)
    } else {
      try { localStorage.removeItem(key) } catch {}
      setCsWardrobePending(null)
    }
  }
  const [selectedHomeId, setSelectedHomeId] = useState(() => { try { return localStorage.getItem(`hf_home_id_${influencer.id}`) || '' } catch { return '' } })
  const homeSlots = (influencer.homeSlots || []).filter(s => s.image)
  const selectedHome = homeSlots.find(s => s.id === selectedHomeId) || null

  // Reset wardrobe drawer state when the active influencer changes
  useEffect(() => {
    const id = influencer?.id
    const pending = id ? (localStorage.getItem(`wd_result_${id}`) || null) : null
    setCsWardrobePending(pending)
    setCsWardrobeOpen(false)
  }, [influencer?.id])

  // Reset UI state when switching influencers so the old generation's state doesn't bleed in
  useEffect(() => {
    cancelRef.current = true
    clearInterval(elapsedRef.current)
    setGenerating(false)
    setGenProgress(0)
    setElapsed(0)
    setGenResults((() => { try { return JSON.parse(localStorage.getItem(`hf_gen_results_${influencer.id}`) || '[]') } catch { return [] } })())
    setGenError(null)
  }, [influencer.id]) // eslint-disable-line

  // One-time migration: if hf_gen_results_* has URLs not yet in generationHistory, add them.
  // This recovers videos that were generated but lost because the user switched influencers mid-generation.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`hf_gen_results_${influencer.id}`) || '[]')
      if (!saved.length) return
      const existingUrls = new Set((influencer.generationHistory || []).map(e => e.url))
      const toAdd = [...new Set(saved.filter(url => url && !existingUrls.has(url)))]
      if (!toAdd.length) return
      const now = Date.now()
      onUpdate({ generationHistory: [
        ...toAdd.map((url, i) => ({ id: generateId(), type: 'video', label: toAdd.length > 1 ? `Video ${i+1}` : 'Video', url, date: now })),
        ...(influencer.generationHistory || [])
      ].slice(0, 300) })
    } catch {}
  }, [influencer.id]) // eslint-disable-line

  // Resume any video generation that was running when the user left the page
  useEffect(() => {
    const pending = getPendingVideo(influencer.id)
    if (!pending) return
    const savedOnGenerated = onGeneratedRef.current  // capture before async — stays tied to this influencer even if user switches
    // Ignore if started more than 10 minutes ago (likely stale)
    if (Date.now() - pending.startedAt > 10 * 60 * 1000) { clearPendingVideo(influencer.id); return }
    // Bump epoch BEFORE resetting cancelRef so any still-running generate() loop self-cancels
    const myEpoch = ++genEpochRef.current
    cancelRef.current = false
    setGenerating(true)
    setGenProgress(30)
    // Restore elapsed from persisted start time so the timer doesn't reset to 0
    const savedStart = Number(localStorage.getItem(`hf_gen_start_${influencer.id}`)) || pending.startedAt
    const alreadyElapsed = Math.floor((Date.now() - savedStart) / 1000)
    setElapsed(alreadyElapsed)
    clearInterval(elapsedRef.current)
    elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - savedStart) / 1000)), 1000)
    resumeVideoJob(pending.jobIds, pending.count, setGenProgress, partials => { if (!cancelRef.current && genEpochRef.current === myEpoch) persistGenResults([...partials]) }, () => cancelRef.current || genEpochRef.current !== myEpoch)
      .then(result => {
        if (!cancelRef.current && genEpochRef.current === myEpoch) { persistGenResults(result.urls); setGenShareUrls(result.shareUrls || []) }
        const histUrls = [...new Set(result.urls.filter(Boolean))]
        if (histUrls.length && genEpochRef.current === myEpoch) savedOnGenerated?.(histUrls, currentSettingsSnapshot())
      })
      .catch(e => { if (!cancelRef.current && genEpochRef.current === myEpoch) setGenError(e.message) })
      .finally(() => { clearPendingVideo(influencer.id); try { localStorage.removeItem(`hf_gen_start_${influencer.id}`) } catch {} clearInterval(elapsedRef.current); if (genEpochRef.current === myEpoch) setGenerating(false) })
  }, [influencer.id]) // eslint-disable-line

  // Smooth fake progress during the render wait (33% → 88% over 8 minutes)
  useEffect(() => {
    if (!generating) { setDisplayProgress(0); displayProgressRef.current = 0; return }
    const id = setInterval(() => {
      setDisplayProgress(cur => {
        const real = genProgress
        // Before submission: track real progress exactly
        if (real < 33) { displayProgressRef.current = real; return real }
        // After at least one result: track real
        if (real > 34) { displayProgressRef.current = real; return real }
        // Rendering wait — creep toward 88% over 480s (8 min), 1 tick = 1s
        const crept = Math.min(displayProgressRef.current + (88 - 33) / 480, 88)
        displayProgressRef.current = crept
        return crept
      })
    }, 1000)
    return () => clearInterval(id)
  }, [generating, genProgress])

  // Scroll to generating area when generation starts
  useEffect(() => {
    if (generating && genCardRef.current) {
      setTimeout(() => genCardRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }), 100)
    }
  }, [generating])

  // Cmd+Enter to generate
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canAct && !generating) {
        e.preventDefault()
        generate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Persist product refs — base64 images keyed per influencer
  useEffect(() => { try { productRef1 ? localStorage.setItem(`hf_product_ref_1_${influencer.id}`, productRef1) : localStorage.removeItem(`hf_product_ref_1_${influencer.id}`) } catch {} }, [productRef1, influencer.id])
  useEffect(() => { try { productRef2 ? localStorage.setItem(`hf_product_ref_2_${influencer.id}`, productRef2) : localStorage.removeItem(`hf_product_ref_2_${influencer.id}`) } catch {} }, [productRef2, influencer.id])
  useEffect(() => { try { productRef3 ? localStorage.setItem(`hf_product_ref_3_${influencer.id}`, productRef3) : localStorage.removeItem(`hf_product_ref_3_${influencer.id}`) } catch {} }, [productRef3, influencer.id])

  // Apply pending settings restore (set by History tab "Reuse Settings" button)
  useEffect(() => {
    try {
      const key = `hf_restore_pending_${influencer.id}`
      const raw = localStorage.getItem(key)
      if (raw) { localStorage.removeItem(key); restoreHistory(JSON.parse(raw)) }
    } catch {}
  }, [influencer.id, restoreKey])

  function assignProduct(url) {
    if (!productRef1) { setProductRef1(url) }
    else if (!productRef2) { setProductRef2(url) }
    else if (!productRef3) { setProductRef3(url) }
    else { setProductRef1(url) }
  }

  // Persist video settings per-influencer whenever they change (skip during restore to avoid writing stale state)
  useEffect(() => {
    if (restoringRef.current) return
    try {
      localStorage.setItem(`cs_settings_${influencer.id}`, JSON.stringify({ vibe, duration, aspect, outputs, resolution, shotMode, camera, envKey, envCustom: CS_ENV_PRESETS[envKey] ? '' : environment, voicePreset, voiceCustom, dialogue, videoTimeOfDay, productWorn, model: videoModel }))
    } catch {}
  }, [influencer.id, vibe, duration, aspect, outputs, resolution, shotMode, camera, envKey, environment, voicePreset, voiceCustom, dialogue, videoTimeOfDay, productWorn, videoModel])

  // Persist last prompt per influencer
  useEffect(() => {
    if (!lastGeneratedPrompt) return
    try { localStorage.setItem(`hf_last_prompt_${influencer.id}`, lastGeneratedPrompt) } catch {}
  }, [lastGeneratedPrompt, influencer.id])

  // Save gen results synchronously so navigating away mid-result never loses them
  function persistGenResults(urls) {
    setGenResults(urls)
    if (urls.length > 0) {
      try { localStorage.setItem(`hf_gen_results_${influencer.id}`, JSON.stringify(urls)) } catch {}
    }
  }

  function currentSettingsSnapshot() {
    return { dialogue, environment, envKey, camera, vibe, voicePreset, voiceCustom, additionalNotes, duration, aspect, outputs, shotMode, productRef1, productRef2, productRef3, productWorn }
  }

  function buildPrompt() {
    const name = influencer.name
    const phys = influencer.physicalDesc || `${name}, natural confident energy`
    const isMale = influencer.gender === 'Male'
    const she = isMale ? 'he' : 'she'
    const She = isMale ? 'He' : 'She'
    const her = isMale ? 'him' : 'her'
    const his = isMale ? 'his' : 'her'

    // Build ordered image tag map — influencer refs first, then products
    // Higgsfield assigns @image_N in the order refs are passed to generate_video
    const prodImgs = [
      productRef1 && { role: 'product1', url: productRef1 },
      productRef2 && { role: 'product2', url: productRef2 },
      productRef3 && { role: 'product3', url: productRef3 },
    ].filter(Boolean)
    const tagMap = {}
    if (startFrameUrl) {
      // Start frame mode: @image_1 = start frame (identity + outfit baked in), @image_2+ = products
      tagMap['identity'] = '@image_1'
      prodImgs.forEach((prod, i) => { tagMap[prod.role] = `@image_${i + 2}` })
    } else {
      const infImgs = [
        influencer.mainImage && { role: 'identity', url: influencer.mainImage },
        selectedWardrobe
          ? { role: 'wardrobe',  url: selectedWardrobe.image }
          : influencer.characterSheetImage && { role: 'charsheet', url: influencer.characterSheetImage },
        influencer.closeUpImage1 && { role: 'closeup1', url: influencer.closeUpImage1 },
        influencer.closeUpImage2 && { role: 'closeup2', url: influencer.closeUpImage2 },
      ].filter(Boolean)
      const homeImgEntry = selectedHome ? [{ role: 'home', url: selectedHome.image }] : []
      ;[...infImgs, ...homeImgEntry, ...prodImgs].forEach((img, i) => { tagMap[img.role] = `@image_${i + 1}` })
    }

    // Shot count — oner = always 1, multi = auto from duration
    const shotCount = shotMode === 'oner' ? 1 : duration <= 5 ? 1 : duration <= 8 ? 2 : duration <= 12 ? 3 : 4

    // Camera style → STYLE field
    const styleMap = {
      'Handheld':     'Self-filmed handheld. @image_1 holds the camera at arm\'s length, 24mm, walk-pace bob and drift throughout. Never fully static. NO shallow DOF, NO bokeh, NO blur, natural front-cam color.',
      'Tripod':       'Locked tripod, 28mm. Static frame, nothing moves except the subject. Everything in focus front to back. NO shallow DOF, NO bokeh, NO blur, clean natural color.',
      'Talking Head': 'Locked tripod, 50mm portrait lens. Medium shot — framed from mid-chest up. Subject is seated, hands visible resting on desk surface in foreground. Static frame, nothing moves except the subject. Even studio lighting, soft and controlled. Everything in focus. NO shallow DOF, NO bokeh, NO blur, clean neutral color.',
      'Wide':         '28mm, locked wide shot, full body visible in environment, natural light, everything in focus front to back. NO shallow DOF, NO bokeh, NO blur.',
      'Overhead':     'Overhead bird\'s-eye camera, locked, looking straight down at the subject. 35mm equivalent, everything in focus, clean and graphic. NO shallow DOF, NO bokeh, NO blur.',
    }
    const cameraMovement = { 'Handheld':'handheld moving','Tripod':'locked','Talking Head':'locked','Wide':'locked','Overhead':'locked' }
    const stylePreset = styleMap[camera] || styleMap['Handheld']
    const move = cameraMovement[camera] || 'locked'

    const isTalkingHead = camera === 'Talking Head'
    const isHandheld = camera === 'Handheld'
    const wearMode = !!(productRef1 && productWorn)

    // Environment — in start frame mode the scene is locked to the start frame, not the text field
    const todLabel = { morning: 'morning', afternoon: 'afternoon', 'golden hour': 'golden hour', night: 'night' }[videoTimeOfDay] || ''
    const todSuffix = todLabel ? `, ${todLabel}` : ''
    const envDesc = startFrameUrl
      ? 'Continue from start frame — environment and lighting match @image_1 exactly throughout.'
      : tagMap.home
        ? `${tagMap.home} for the location and environment setting.${environment ? ' ' + environment : ''}${todSuffix}`
        : `${environment || (isTalkingHead ? 'in a studio' : 'indoors')}${todSuffix}`

    // Mood arc
    const moodMap = {
      'Natural':   "Delivery is unhurried and conversational — pauses land where they would in real speech, never performed. Micro-expressions are small and honest: a slight mouth pull before a punchline, a brief brow soften on the reveal. Gestures are loose and incidental, not choreographed. Eye contact with the camera is easy, breaks naturally, comes back. Energy stays flat and warm across the whole clip.",
      'Energetic': `Delivery is fast and forward — ${she} pushes through lines with minimal pause, pace never drops. Eyebrows lift on emphasis words. Gestures are sharp and frequent: quick hand flicks, small head tilts that land on key beats. Body is slightly forward the whole time. Expression resets fast between lines — no lingering. Clip ends on full energy, nothing winds down.`,
      'Luxury':    `Delivery is slow and deliberate — every word has weight, pauses are long and intentional. Micro-expressions are subtle: a slow smirk rather than a smile, heavy-lidded confidence, no wide eyes. Gestures are minimal and controlled — small wrist movements, nothing above the shoulder. ${She} never rushes. Eye contact is held longer than comfortable, then released slowly.`,
      'Playful':   `Delivery has rhythm and bounce — slight sing-song cadence, small upticks at the ends of phrases. Quick genuine smiles that reach the eyes, eyebrow raises on key words. Light shoulder movement on emphasis. Pauses are short and teasing, like ${she}'s about to say something and makes you wait one beat. Gestures are small and spirited — pointing, light wrist flick.`,
      'Tutorial':  `Delivery is clear and even-paced — deliberate without being slow, every word lands cleanly. Direct sustained eye contact with the camera, nods on key points. Gestures are demonstrative: ${she} points at or tilts the product on relevant beats, uses open-palm gestures when explaining. Expression stays calm and assured throughout. No uptalk — every sentence lands flat and final.`,
      'Dramatic':  "Delivery is slow-building — early lines are quiet and measured, pace tightens toward the end. Strategic pauses that hold one beat longer than expected. Eyes stay on camera longer than normal, expression shifts are controlled and deliberate. Gestures are restrained — hands stay low, movement is minimal until the payoff line. The reveal lands with full stillness.",
      'Cozy':      `Delivery is soft and low-energy — ${she} sounds like ${she}'s talking to one person, not a camera. Slight smile throughout, never fades completely. Minimal gestures, hands stay relaxed. Pauses feel comfortable, not empty. Eye contact is warm and personal. Pace is slow enough that every word registers. Expression stays gentle from first frame to last.`,
      'Confident': "Delivery is even and controlled — no uptalk, no filler energy, every line lands flat and sure. Holds eye contact with the camera without excess blinking. Gestures are purposeful and limited — one clean move per beat, nothing nervous or decorative. Expression is neutral-warm: not performing happiness, just completely at ease. Pace stays consistent, never rushes the reveal.",
    }
    const moodArc = vibe ? (moodMap[vibe] || vibe) : 'Delivery is genuine and present throughout. Micro-expressions are honest and small. Gestures are natural and uncontrived.'

    // Color logic — keyed to chip selection (envKey) so free-form text still gets a grade
    const colorMap = {
      'Bedroom':'Warm soft palette, amber tones, clean skin highlight.',
      'Bathroom':'Neutral clean tones, slight coolness, face is brightest element.',
      'Kitchen':'Fresh neutral palette, clean whites, warm skin.',
      'Coffee Shop':'Warm caramel tones, soft and inviting.',
      'Mall / Store':'Bright clean palette, commercial whites, product pops.',
      'Street':'Golden-warm with cool sky fill, high-contrast.',
      'Gym':'High contrast, cool-neutral, energetic.',
      'Studio':'Clean neutral, controlled, product-forward.',
    }
    const colorLogic = envKey ? (colorMap[envKey] || 'Clean neutral, warm skin tones.') : 'Clean neutral, warm skin tones.'

    // Full dialogue — annotated with performance notation from the guide
    const fullDialogue = dialogue.trim()
    const prod1Tag = tagMap.product1 || null

    // Parse notes first so action beats can be woven into annotateDialogue
    const { actionBeats, directionNotes } = parseAdditionalNotes(additionalNotes, duration)

    const annotatedDialogue = annotateDialogue(fullDialogue, prod1Tag, duration, isHandheld, wearMode, actionBeats, she, her, his)
    // For multi-shot: distribute raw sentences across shots
    const dialogueLines = fullDialogue ? fullDialogue.split(/(?<=[.!?])\s+/).filter(s=>s.trim()) : []

    // Product logic rules (belt+suspenders reference alongside PRODUCT section)
    const productRules = []
    if (tagMap.product1) productRules.push(`${tagMap.product1} is always the same object — same color, label position, and size. Never substituted.${wearMode ? ` ${tagMap.product1} is WORN — never held. ${She} naturally interacts with it once or twice — a brief touch or glance — without overdoing it.` : ''}`)
    if (tagMap.product2) productRules.push(`${tagMap.product2} is always the same object — never substituted.`)
    if (tagMap.product3) productRules.push(`${tagMap.product3} is always the same object — never substituted.`)

    // PRODUCT section — dedicated block placed between WARDROBE and ENVIRONMENT
    const prodEntries = [
      tagMap.product1 && { tag: tagMap.product1, n: 1 },
      tagMap.product2 && { tag: tagMap.product2, n: 2 },
      tagMap.product3 && { tag: tagMap.product3, n: 3 },
    ].filter(Boolean)
    let productSection = ''
    if (prodEntries.length > 0) {
      const pLines = ['PRODUCT:']
      pLines.push('')
      prodEntries.forEach(({ tag, n }) => {
        pLines.push(`${tag} — product reference ${n}. Use as the exact source for this product's color, shape, label text and orientation, and proportions.`)
      })
      pLines.push('')
      const allProdTags = prodEntries.map(e => e.tag).join(' and ')
      pLines.push(`The product must appear identical in every frame — same label text and orientation, same colors, same proportions throughout. Never substituted, recolored, or modified. ${allProdTags} ${prodEntries.length > 1 ? 'contribute' : 'contributes'} ONLY the product — never the face, identity, wardrobe, environment, or color grade.`)
      if (wearMode) pLines.push(`Exception: ${tagMap.product1} is WORN — ${she} interacts with it naturally once or twice — a brief touch or glance — without overdoing it.`)
      productSection = pLines.join('\n')
    }

    // Build shots
    const shotDurs = shotCount === 1 ? [duration]
      : shotCount === 2 ? [2, duration - 2]
      : shotCount === 3 ? [2, Math.round((duration-2)/2), duration - 2 - Math.round((duration-2)/2)]
      : [2, 3, Math.floor((duration-5)/2), Math.ceil((duration-5)/2)]

    const framing = camera === 'Wide' ? 'WS' : camera === 'Overhead' ? 'overhead' : camera === 'Talking Head' ? 'MS' : 'MCU'
    const lens = camera === 'Handheld' ? '24mm' : camera === 'Wide' ? '28mm' : camera === 'Overhead' ? '35mm' : camera === 'Talking Head' ? '50mm' : '28mm'

    const shots = []
    let t = 0
    for (let i = 0; i < shotCount; i++) {
      const sd = shotDurs[i]
      const te = t + sd
      const ts = `0:${String(t).padStart(2,'0')} to 0:${String(te).padStart(2,'0')}`

      if (shotMode === 'oner') {
        const startPin = startFrameUrl ? `Video opens at 0:00 as @image_1 exactly. ` : ''
        const actionBody = fullDialogue
          ? annotatedDialogue
          : startFrameUrl ? '' : `@image_1 faces camera. Eyes on lens at 0:00.`
        const onerTail = fullDialogue ? ` Natural conversational gestures as ${she} speaks. End cleanly with the character holding a final pose, no talking or lip movement.` : ''
        shots.push(`ACTION:\n0:00 to 0:${String(duration).padStart(2,'0')} — ${framing}, ${lens}, ${move}. One continuous take.\n\n${startPin}${actionBody}${onerTail}`.trimEnd())
      } else if (i === 0) {
        const startPin = startFrameUrl ? `Video opens at 0:00 as @image_1 exactly. ` : ''
        const hookBody = dialogueLines[0] ? annotateDialogue(dialogueLines[0], prod1Tag, duration, isHandheld, wearMode, [], she, her, his) : (startFrameUrl ? '' : `@image_1 faces camera. Eyes on lens at 0:00.`)
        shots.push(`SHOT 1 — ${ts}, ${framing}, ${lens}, ${move}.\n${startPin}${hookBody}`.trimEnd())
      } else {
        const line = dialogueLines[i] || ''
        const gesture = prod1Tag && i === 1
          ? (wearMode ? `${she} touches ${prod1Tag} and angles toward camera to show it` : `${she} tilts ${prod1Tag} toward camera slightly`)
          : 'one hand lifts — palm-up, natural half-shrug'
        const lineStr = line ? `"${line.trim()}" [beat — eyes stay on camera.] ` : '[holds the moment.] '
        const closingTail = fullDialogue && i === shotCount - 1 ? ' End cleanly with the character holding a final pose, no talking or lip movement.' : ''
        const voiceTail = fullDialogue ? ' Voice unhurried. Tone genuine.' : ''
        shots.push(`SHOT ${i+1} — ${ts}, ${framing}, ${lens}, ${move}.\n@image_1 continues. ${gesture}. ${lineStr}${voiceTail}${closingTail}`.trimEnd())
      }
      t = te
    }

    // SUBJECT — identity + detail enhancement from close-up refs
    const genderHint = influencer.gender === 'Male' ? 'Male presenter. ' : influencer.gender === 'Female' ? 'Female presenter. ' : ''
    const subjectParts = startFrameUrl
      ? [`${genderHint}@image_1 is the start frame — begin the video from this exact frame. Identity (face, bone structure, skin tone, hair) is locked to @image_1 throughout. Match exactly.`]
      : [`${genderHint}@image_1 is the identity — face, bone structure, skin tone, hair. Match exactly.`]
    if (!startFrameUrl && tagMap.closeup1) subjectParts.push(`${tagMap.closeup1} for close-up facial detail — eye color, skin texture, pores.`)
    if (!startFrameUrl && tagMap.closeup2) subjectParts.push(`${tagMap.closeup2} for feature-level accuracy — lip shape, brow arch, skin tone.`)

    // WARDROBE — in start frame mode the outfit is baked into @image_1
    const wardrobeLine = startFrameUrl
      ? `Continue outfit from @image_1 exactly — same silhouette, fabric, color, styling throughout. Zero variation.`
      : tagMap.wardrobe
        ? `Match outfit from ${tagMap.wardrobe} exactly — silhouette, fabric, color, styling, zero variation. Outfit comes from ${tagMap.wardrobe} only, not @image_1.`
        : tagMap.charsheet
          ? `Match ${tagMap.charsheet} exactly — same outfit silhouette, fabric, color, styling throughout. Zero variation.`
          : ((influencer.wardrobeSlots||[]).filter(s=>s.name).map(s=>s.name).join(', ') || 'Casual, stylish, consistent throughout.')

    const allPresets = [...(VOICE_PRESETS.female || []), ...(VOICE_PRESETS.male || [])]
    const deliveryLine = audioDataUrl
      ? 'Lip-sync driven by @audio_1.'
      : voiceCustom.trim()
      ? `Voice: ${voiceCustom.trim()}`
      : voicePreset
      ? `Voice: ${allPresets.find(v => v.id === voicePreset)?.voice || ''}`
      : fullDialogue ? 'Natural voice, genuine and present.' : `No dialogue. ${inferAmbientSound(envKey, environment)}`

    // Append any unfired beats to their target shot
    const shotsWithBeats = shots.map((shot, i) => {
      let unfired
      if (shotMode === 'oner') {
        unfired = actionBeats.filter(b => !b.fired)
      } else {
        const shotStart = shotDurs.slice(0, i).reduce((a, b) => a + b, 0)
        const shotEnd = shotStart + shotDurs[i]
        unfired = actionBeats.filter(b => {
          const sec = b.fraction * duration
          return sec >= shotStart && sec < shotEnd && !b.fired
        })
      }
      unfired.forEach(b => { b.fired = true })
      if (!unfired.length) return shot
      const beatStr = shotMode === 'oner'
        ? unfired.map(b => `${b.text}.`).join(' ')
        : unfired.map(b => `At ${b.timestamp} — ${b.text}.`).join(' ')
      return shot + '\n' + beatStr
    })

    return `FORMAT: ${duration}s / ${shotCount === 1 ? '1 SHOT — continuous oner, ZERO CUTS' : `${shotCount} SHOTS`} / direct address

SUBJECT: ${subjectParts.join(' ')}

WARDROBE: ${wardrobeLine}
${productSection ? '\n' + productSection + '\n' : ''}
ENVIRONMENT: ${envDesc}

MOOD: ${moodArc}

COLOR LOGIC: ${colorLogic}

STYLE: ${stylePreset}

DELIVERY: ${deliveryLine}
${directionNotes ? `\nDIRECTION: ${directionNotes}` : ''}
LOGIC RULE: @image_1 face is fixed — same bone structure, eye color, skin tone, jawline, zero drift. Only one @image_1 in frame at any time.${shotMode==='oner' ? ' ZERO CUTS — single uninterrupted take 0:00 to ' + duration + 's. No jump cuts, no zoom, no camera switch, no temporal skip. @image_1 moves continuously — never freezes.' : ' Wardrobe identical across all shots.'}${tagMap.wardrobe ? ` Outfit matches ${tagMap.wardrobe} throughout — do not take outfit from @image_1.` : ''}${!isHandheld ? ' No phone or smartphone visible in frame at any time — no device in hand, on any surface, or in the background.' : ''} No music. No captions. No text overlays.${productRules.length ? ' ' + productRules.join(' ') : ''}

---

${shotsWithBeats.join('\n\n')}`
  }

  function openSaveModal() {
    const canSave = dialogue.trim() || environment || vibe || genResults.length > 0
    if (!canSave) return
    setSaveModal(true)
  }

  function saveScript({ title }) {
    const refs = [
      { url: influencer.mainImage,           label: 'Main Photo' },
      { url: selectedWardrobe?.image || influencer.characterSheetImage, label: selectedWardrobe ? selectedWardrobe.name : 'Character Sheet' },
      { url: influencer.closeUpImage1,       label: 'Close-up' },
      { url: influencer.closeUpImage2,       label: 'Feature Sheet' },
      { url: selectedHome?.image,            label: 'Home' },
      { url: productRef1,                    label: 'Product 1' },
      { url: productRef2,                    label: 'Product 2' },
      { url: productRef3,                    label: 'Product 3' },
    ].filter(r => r.url)
    const newScript = {
      id: Math.random().toString(36).slice(2),
      title,
      status: 'Unposted',
      prompt: buildPrompt(),
      script: dialogue.trim(),
      videoUrls: [...new Set(genResults)],
      refs,
      postedUrl: '',
      meta: {
        camera, vibe, duration, aspect, envKey,
        environment: CS_ENV_PRESETS[envKey] || environment,
        shotMode,
        hasProduct: !!(productRef1||productRef2||productRef3),
        voicePreset,
        voiceCustom,
        voiceLabel: ([...(VOICE_PRESETS.female||[]),...(VOICE_PRESETS.male||[])].find(v=>v.id===voicePreset)?.label) || voiceCustom || '',
        wardrobeName: selectedWardrobe?.name || '',
        additionalNotes: additionalNotes.trim(),
      },
    }
    onUpdate({ scripts: [newScript, ...(influencer.scripts||[])] })
    setSaved(true)
    setSaveModal(null)
    setTimeout(() => setSaved(false), 2200)
    if (onSaveToScripts) {
      setTimeout(() => onSaveToScripts(newScript.id), 1400)
    }
  }

  function buildRefs() {
    return [
      influencer.mainImage,
      selectedWardrobe?.image || influencer.characterSheetImage,
      influencer.closeUpImage1,
      influencer.closeUpImage2,
      selectedHome?.image,
      productRef1,
      productRef2,
      productRef3,
    ].filter(Boolean)
  }

  function saveToHistory() {
    const builtPrompt = buildPrompt()
    // Strip base64 product refs — they can be several MB each and blow the localStorage quota.
    // The wardrobe system already persists those images; history only needs script/settings.
    const entry = { dialogue, environment, envKey, camera, vibe, voicePreset, voiceCustom, additionalNotes, duration, aspect, outputs, shotMode, productWorn, prompt: builtPrompt, ts: Date.now() }
    const histKey = `hf_video_history_${influencer.id}`
    const tryWrite = (entries) => {
      try {
        localStorage.setItem(histKey, JSON.stringify(entries))
        setHistory(entries)
        return true
      } catch { return false }
    }
    try {
      const prev = JSON.parse(localStorage.getItem(histKey) || '[]')
        .map(e => { const c = { ...e }; delete c.productRef1; delete c.productRef2; delete c.productRef3; return c })
      const full = [entry, ...prev.filter(e => e.ts !== entry.ts)].slice(0, 5)
      if (tryWrite(full)) return
      // Quota hit — retry with fewer entries, then without the prompt string
      if (tryWrite(full.slice(0, 2))) return
      const slim = full.slice(0, 2).map(e => { const c = { ...e }; delete c.prompt; return c })
      tryWrite(slim)
    } catch { /* never crash generate() over a history write */ }
  }

  function restoreHistory(entry) {
    setDialogue(entry.dialogue || '')
    setEnvironment(entry.environment || '')
    setEnvKey(entry.envKey || '')
    setCamera(entry.camera || 'Handheld')
    setVibe(entry.vibe || '')
    setVoicePreset(entry.voicePreset || '')
    setVoiceCustom(entry.voiceCustom || '')
    setAdditionalNotes(entry.additionalNotes || '')
    setDuration(entry.duration || 8)
    setAspect(entry.aspect || '9:16')
    setOutputs(entry.outputs || 1)
    setShotMode(entry.shotMode || 'oner')
    if (entry.productRef1) setProductRef1(entry.productRef1)
    if (entry.productRef2) setProductRef2(entry.productRef2)
    if (entry.productRef3) setProductRef3(entry.productRef3)
    setProductWorn(!!entry.productWorn)
    if (entry.prompt) {
      setLastGeneratedPrompt(entry.prompt)
    } else {
      // No saved prompt — recompute after restored state settles
      setPromptRecomputeTick(t => t + 1)
    }
    setShowHistory(false)
  }

  // Runs after state from restoreHistory has settled — buildPrompt() sees the correct values
  useEffect(() => {
    if (promptRecomputeTick === 0) return
    setLastGeneratedPrompt(buildPrompt())
  }, [promptRecomputeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(t) {
    setDialogue(t.dialogue)
    setEnvKey(t.envKey)
    setEnvironment(t.envKey ? (CS_ENV_PRESETS[t.envKey] || t.envKey) : (t.environment || ''))
    setCamera(t.camera)
    setVibe(t.vibe)
    setDuration(t.duration)
    setShotMode(t.shotMode)
  }

  function cancelGeneration() {
    cancelRef.current = true
    clearInterval(elapsedRef.current)
    clearPendingVideo(influencer.id)
    try { localStorage.removeItem(`hf_gen_start_${influencer.id}`) } catch {}
    try { localStorage.removeItem(`hf_gen_results_${influencer.id}`) } catch {}
    setGenerating(false)
    setGenProgress(0)
    setGenResults([])
    setElapsed(0)
  }

  async function generate() {
    const myEpoch = ++genEpochRef.current  // invalidates any prior generate() or resume loop immediately
    cancelRef.current = false
    const savedOnGenerated = onGeneratedRef.current  // capture before async — stays tied to this influencer even if user switches
    setLockedOutputs(outputs)
    setGenerating(true)
    setGenError(null)
    setGenResults([])
    setGenShareUrls([])
    try { localStorage.removeItem(`hf_gen_results_${influencer.id}`) } catch {}
    setGenProgress(0)
    setElapsed(0)
    try { saveToHistory() } catch { /* never block generation over history */ }
    setLastGeneratedPrompt(buildPrompt())
    const start = Date.now()
    try { localStorage.setItem(`hf_gen_start_${influencer.id}`, String(start)) } catch {}
    elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    try {
      const result = await generateVideo({
        prompt: buildPrompt(),
        aspectRatio: aspect,
        duration,
        count: outputs,
        referenceImages: startFrameUrl
          ? [startFrameUrl, productRef1, productRef2, productRef3].filter(Boolean)
          : buildRefs(),
        startFrameUrl: null,  // start frame is passed as @image_1 via referenceImages; start_image role would duplicate it
        audioRef: audioDataUrl || null,
        model: videoModel,
        resolution,
        onProgress: setGenProgress,
        onPartialResults: partials => { if (!cancelRef.current && genEpochRef.current === myEpoch) persistGenResults([...partials]) },
        isCancelled: () => cancelRef.current || genEpochRef.current !== myEpoch,
        pendingKey: influencer.id,
      })
      if (!cancelRef.current && genEpochRef.current === myEpoch) {
        persistGenResults(result.urls)
        setGenShareUrls(result.shareUrls || [])
      }
      const histUrls = [...new Set(result.urls.filter(Boolean))]
      if (histUrls.length && genEpochRef.current === myEpoch) savedOnGenerated?.(histUrls, currentSettingsSnapshot())
    } catch (e) {
      if (!cancelRef.current && genEpochRef.current === myEpoch) setGenError(e.message)
    } finally {
      clearInterval(elapsedRef.current)
      try { localStorage.removeItem(`hf_gen_start_${influencer.id}`) } catch {}
      if (genEpochRef.current === myEpoch) setGenerating(false)
    }
  }

  async function regenerateSlot(slotIdx) {
    setRegenSlot(slotIdx)
    try {
      const result = await generateVideo({
        prompt: buildPrompt(),
        aspectRatio: aspect,
        duration,
        count: 1,
        referenceImages: buildRefs(),
        audioRef: audioDataUrl || null,
        model: videoModel,
        resolution,
        onProgress: () => {},
        isCancelled: () => false,
      })
      if (result.urls?.[0]) setGenResults(prev => { const n=[...prev]; n[slotIdx]=result.urls[0]; try { localStorage.setItem(`hf_gen_results_${influencer.id}`, JSON.stringify(n)) } catch {}; return n })
    } catch (e) {
      setGenError(e.message)
    } finally {
      setRegenSlot(null)
    }
  }

  const canAct = startFrameUrl || dialogue.trim() || environment || vibe

  function doVideoRandomize() {
    const vibeOpts = CS_VIBES
    const envKeys  = Object.keys(CS_ENV_PRESETS)
    const camOpts  = CS_CAMERAS
    const rv = vibeOpts[Math.floor(Math.random() * vibeOpts.length)]
    const ek = envKeys[Math.floor(Math.random() * envKeys.length)]
    const rc = camOpts[Math.floor(Math.random() * camOpts.length)]
    setVibe(rv); localStorage.setItem('hf_vibe', rv)
    setEnvKey(ek); setEnvironment(CS_ENV_PRESETS[ek]); localStorage.setItem('hf_env_key', ek)
    setCamera(rc); localStorage.setItem('hf_camera', rc)
  }

  function clearAll() {
    setDialogue(''); localStorage.setItem('hf_dialogue', '')
    setEnvKey(''); setEnvironment(''); localStorage.setItem('hf_env_key', ''); localStorage.setItem('hf_env_custom', '')
    setVibe(''); localStorage.setItem('hf_vibe', '')
    setCamera('Handheld'); localStorage.setItem('hf_camera', 'Handheld')
    setVoicePreset(''); setVoiceCustom(''); localStorage.setItem('hf_voice_preset', ''); localStorage.setItem('hf_voice_custom', '')
    setAdditionalNotes('')
    setProductRef1(null); setProductRef2(null); setProductRef3(null)
    setProductWorn(false); localStorage.setItem('hf_product_worn', '0')
    setAudioDataUrl(null); setAudioFileName(''); setAudioDuration(null)
    setGenResults([]); try { localStorage.removeItem(`hf_gen_results_${influencer.id}`) } catch {}
    setGenError(null)
  }

  const videos = (influencer.scripts||[]).filter(s=>s.videoUrl)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>

      {/* Save Script modal */}
      {saveModal && (
        <SaveScriptModal
          onSave={saveScript}
          onClose={()=>setSaveModal(null)}
        />
      )}

      {/* Influencer reference banner — hidden in start-frame mode */}
      {allImages.length > 0 && !startFrameUrl ? (
        <div style={{
          display:'flex',alignItems:'center',gap:10,padding:'9px 13px',borderRadius:10,
          background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.15)',
        }}>
          <div style={{display:'flex'}}>
            {allImages.slice(0,3).map((img,i)=>(
              <img key={img.key} src={img.url} style={{
                width:26,height:26,borderRadius:'50%',objectFit:'cover',
                border:'2px solid var(--surface)',marginLeft:i>0?-8:0,flexShrink:0,
              }}/>
            ))}
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:6}}>
            <span>
              <span style={{fontWeight:600,color:'var(--text-primary)'}}>{influencer.name}'s images</span>{' '}
              are auto-included as identity references
            </span>
            <div style={{position:'relative',flexShrink:0}}
              onMouseEnter={()=>setRefTip(true)}
              onMouseLeave={()=>setRefTip(false)}
            >
              <div style={{
                width:14,height:14,borderRadius:'50%',border:'1.5px solid var(--text-tertiary)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:8,fontWeight:700,color:'var(--text-tertiary)',cursor:'default',lineHeight:1,
              }}>i</div>
              {refTip && (
                <div style={{
                  position:'absolute',top:'calc(100% + 8px)',right:0,
                  zIndex:999,background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:12,padding:'12px 12px 10px',boxShadow:'0 8px 28px rgba(0,0,0,0.4)',
                  pointerEvents:'none',
                }}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--text-primary)',marginBottom:10,whiteSpace:'nowrap'}}>Reference images</div>
                  <div style={{display:'flex',gap:8}}>
                    {[
                      {key:'mainImage',          label:'Main',            url:influencer.mainImage},
                      {key:'characterSheetImage',label:'Character Sheet', url:influencer.characterSheetImage},
                      {key:'closeUpImage1',      label:'Close Up',        url:influencer.closeUpImage1},
                      {key:'closeUpImage2',      label:'Feature Sheet',   url:influencer.closeUpImage2},
                    ].filter(img=>img.url).map(img=>(
                      <div key={img.key} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                        <img src={img.url} alt={img.label} style={{
                          width:54,height:76,objectFit:'cover',objectPosition:'top',
                          borderRadius:7,border:'1px solid var(--border)',flexShrink:0,
                        }}/>
                        <span style={{fontSize:9,color:'var(--text-tertiary)',fontWeight:600,width:54,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{img.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    position:'absolute',top:-5,right:6,transform:'rotate(45deg)',
                    width:9,height:9,background:'var(--surface)',
                    border:'1px solid var(--border)',borderBottom:'none',borderRight:'none',
                  }}/>
                </div>
              )}
            </div>
          </div>
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
            {history.length > 0 && (
              <button onClick={()=>setShowHistory(v=>!v)} style={{
                display:'flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:7,
                fontSize:11,fontWeight:600,color:'var(--text-tertiary)',
                background:'transparent',border:'1px solid var(--border)',
              }}>
                <span>🕐</span>
                <span>Recent</span>
                <span style={{fontSize:9,opacity:0.55}}>{showHistory?'▲':'▼'}</span>
              </button>
            )}
            <button onClick={clearAll} disabled={generating} style={{
              padding:'4px 9px',borderRadius:7,
              fontSize:11,fontWeight:600,color:'var(--text-tertiary)',
              background:'transparent',border:'1px solid var(--border)',
            }}>Clear</button>
          </div>
        </div>
      ) : (
        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <button onClick={clearAll} disabled={generating} style={{
            padding:'4px 9px',borderRadius:7,
            fontSize:11,fontWeight:600,color:'var(--text-tertiary)',
            background:'transparent',border:'1px solid var(--border)',
          }}>Clear</button>
        </div>
      )}

      {/* Start frame */}
      {startFrameUrl && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:10,background:'rgba(236,72,153,0.06)',border:'1px solid rgba(236,72,153,0.2)'}}>
          <img src={startFrameUrl} alt="Start frame" style={{width:36,height:48,objectFit:'cover',objectPosition:'top',borderRadius:6,border:'1px solid rgba(236,72,153,0.3)',flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:700,color:'#EC4899',marginBottom:2}}>Start Frame</div>
            <div style={{fontSize:11,color:'var(--text-tertiary)'}}>Video begins from this photo</div>
          </div>
          <button onClick={clearStartFrame} style={{width:24,height:24,borderRadius:'50%',border:'none',background:'rgba(236,72,153,0.12)',color:'#EC4899',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
        </div>
      )}

      {/* Prompt history dropdown */}
      {showHistory && history.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {history.map((h,i)=>(
            <button key={i} onClick={()=>restoreHistory(h)} style={{
              textAlign:'left',padding:'10px 12px',borderRadius:10,width:'100%',
              background:'var(--bg-tertiary)',border:'1.5px solid var(--border)',
              transition:'border-color 0.15s',
            }}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                {[h.productRef1, h.productRef2, h.productRef3].filter(Boolean).map((img,pi)=>(
                  <img key={pi} src={img} style={{
                    width:26,height:26,borderRadius:6,objectFit:'contain',flexShrink:0,
                    border:'1px solid var(--border)',background:'var(--bg)',
                  }}/>
                ))}
                <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
                  {h.dialogue?.trim().slice(0,50) || '(no dialogue)'}
                </div>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {[h.camera, h.vibe, `${h.duration}s`, h.aspect, h.shotMode==='oner'?'1 shot':'multi'].filter(Boolean).map(tag=>(
                  <span key={tag} style={{
                    padding:'2px 8px',borderRadius:980,fontSize:10,fontWeight:600,
                    background:'rgba(139,92,246,0.08)',color:'var(--text-secondary)',
                  }}>{tag}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 1: Script */}
      <Sec>
        <CSStepHeader n={1} title="Script" sub={`What should ${influencer.name} say?`}/>
        <textarea
          value={dialogue}
          onChange={e => setDialogue(e.target.value)}
          placeholder={`Write what ${influencer.name} should say...`}
          rows={4}
          style={{
            width:'100%',padding:'12px 14px',borderRadius:10,
            border:'1.5px solid var(--border)',background:'var(--bg)',
            fontSize:14,color:'var(--text-primary)',resize:'vertical',
            lineHeight:1.65,boxSizing:'border-box',fontFamily:'inherit',
          }}
        />
        {dialogue.trim() && (() => {
          const words = dialogue.trim().split(/\s+/).length
          const max = VIDEO_MAX_WORDS[duration] || 25
          const over = words > max
          const approaching = !over && words > max * 0.85
          return (
            <div style={{
              display:'flex',justifyContent:'flex-end',marginTop:5,
              fontSize:11,fontWeight:600,
              color: over ? '#FF3B30' : approaching ? '#F59E0B' : 'var(--text-tertiary)',
            }}>
              {words} words
            </div>
          )
        })()}
      </Sec>

      {/* Step 2: Products */}
      <Sec>
        <CSStepHeader n={2} title="Products" sub="Drag in up to 3 product images (optional)"/>
        <div style={{display:'flex',gap:10}}>
          <CSProductSlot value={productRef1} onChange={v=>{setProductRef1(v);if(!v){setProductWorn(false);localStorage.setItem('hf_product_worn','0')}}} dragOver={dragOver1} setDragOver={setDragOver1} fileRef={productFileRef1} label="Product 1"/>
          <CSProductSlot value={productRef2} onChange={setProductRef2} dragOver={dragOver2} setDragOver={setDragOver2} fileRef={productFileRef2} label="Product 2"/>
          <CSProductSlot value={productRef3} onChange={setProductRef3} dragOver={dragOver3} setDragOver={setDragOver3} fileRef={productFileRef3} label="Product 3"/>
        </div>
        {productRef1 && (
          <div style={{marginTop:12,display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)'}}>Product interaction</span>
            {['Held','Worn'].map(opt => {
              const active = opt === 'Worn' ? productWorn : !productWorn
              return (
                <button key={opt} onClick={()=>{const w=opt==='Worn';setProductWorn(w);localStorage.setItem('hf_product_worn',w?'1':'0')}} style={{
                  padding:'5px 13px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
                  background: active ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                  color: active ? '#8B5CF6' : 'var(--text-secondary)',
                  border: active ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                  transition:'all 0.15s',
                }}>{opt}</button>
              )
            })}
          </div>
        )}
        {(influencer.brandDeals||[]).filter(d=>d.image||d.characterSheet).length>0&&(
          <div style={{marginTop:14}}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>From brand deals</div>
            {/* Single horizontal scroll row — stays clean with any number of deals */}
            <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:6,paddingTop:2,
              scrollbarWidth:'none', msOverflowStyle:'none',
            }}>
              <style>{`.deal-strip::-webkit-scrollbar{display:none}`}</style>
              {(influencer.brandDeals||[]).filter(d=>d.image||d.characterSheet).map(deal=>{
                const hasSheet = !!deal.characterSheet && !!deal.image
                const useSheet = hasSheet ? (dealViewSheet[deal.id] === true) : !!deal.characterSheet
                const activeUrl = useSheet ? (deal.characterSheet||deal.image) : deal.image
                return (
                  <div key={deal.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5,flexShrink:0}}>
                    <div
                      style={{cursor:'pointer'}}
                      onMouseEnter={e=>{
                        const r = e.currentTarget.getBoundingClientRect()
                        const POPUP_W = 284
                        const spaceRight = window.innerWidth - r.right - 10
                        const left = spaceRight >= POPUP_W ? r.right + 10 : r.left - POPUP_W - 10
                        const top = Math.min(Math.max(r.top - 20, 8), window.innerHeight - 280)
                        setDealPopup({id:deal.id,url:activeUrl,brand:deal.brand,useSheet,hasSheet,left,top})
                      }}
                      onMouseLeave={()=>setDealPopup(null)}
                      onClick={()=>assignProduct(activeUrl)}
                    >
                      <img src={activeUrl} style={{width:64,height:80,objectFit:'cover',objectPosition:'top',borderRadius:9,border:'1.5px solid var(--border)',display:'block'}} alt={deal.brand}/>
                    </div>
                    <div style={{fontSize:9,color:'var(--text-tertiary)',width:64,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center'}}>{deal.brand}</div>
                    {hasSheet && (
                      <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid var(--border)'}}>
                        {[{label:'Orig',val:false},{label:'Sheet',val:true}].map(({label,val})=>{
                          const active = useSheet === val
                          return (
                            <button key={label} onClick={()=>setDealViewSheet(p=>({...p,[deal.id]:val}))} style={{
                              padding:'3px 7px',border:'none',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:9,lineHeight:1.4,
                              background: active ? 'linear-gradient(135deg,rgba(236,72,153,0.18),rgba(139,92,246,0.18))' : 'var(--bg-tertiary)',
                              color: active ? '#8B5CF6' : 'var(--text-secondary)',
                              transition:'all 0.12s',
                            }}>{label}</button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Fixed-position deal popup — escapes all parent overflow clipping */}
        {dealPopup && createPortal(
          <div style={{
            position:'fixed',
            left: dealPopup.left,
            top: dealPopup.top,
            zIndex:9999, pointerEvents:'none',
            background:'var(--surface)',border:'1px solid var(--border)',
            borderRadius:14,padding:12,boxShadow:'0 12px 40px rgba(0,0,0,0.5)',
            display:'flex',flexDirection:'column',gap:8,alignItems:'center',
            width:260,
          }}>
            <img src={dealPopup.url} style={{maxWidth:260,maxHeight:200,width:'auto',height:'auto',objectFit:'contain',borderRadius:9,display:'block'}}/>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-primary)'}}>{dealPopup.brand}</div>
            <div style={{fontSize:10,color:'var(--text-tertiary)'}}>{dealPopup.useSheet && dealPopup.hasSheet ? 'Character sheet' : 'Original image'}</div>
          </div>,
          document.body
        )}
      </Sec>

      {/* Advanced Settings toggle */}
      <button
        onClick={() => setAdvanced(v => { const next = !v; try { localStorage.setItem('cs_advanced_open', next ? '1' : '0') } catch {} return next })}
        style={{
          display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          padding:'10px',borderRadius:10,fontSize:12,fontWeight:600,
          background: advanced ? 'rgba(139,92,246,0.07)' : 'var(--bg-tertiary)',
          color: advanced ? '#8B5CF6' : 'var(--text-secondary)',
          border: advanced ? '1.5px solid rgba(139,92,246,0.3)' : '1.5px solid var(--border)',
          cursor:'pointer',transition:'all 0.15s',
        }}
      >
        <span>{advanced ? '▲' : '▼'}</span>
        <span>Advanced Settings</span>
      </button>

      {/* Advanced options — collapsible */}
      {advanced && (<>

        {/* Time of Day */}
        <Sec>
          <CSStepHeader n={3} title="Time of Day" sub="Lighting and atmosphere of the scene."/>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {[['morning','🌅'],['afternoon','☀️'],['golden hour','🌇'],['night','🌙']].map(([val, icon]) => {
              const on = videoTimeOfDay === val
              return (
                <button key={val} onClick={() => setVideoTimeOfDay(val)} style={{
                  padding:'7px 14px', borderRadius:980, fontSize:12, fontWeight:600,
                  background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                  color: on ? '#8B5CF6' : 'var(--text-secondary)',
                  border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                  transition:'all 0.15s', cursor:'pointer', fontFamily:'inherit',
                }}>{icon} {val.charAt(0).toUpperCase() + val.slice(1)}</button>
              )
            })}
          </div>
        </Sec>

        {/* Wardrobe */}
        <Sec>
          <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:14}}>
            <div style={{width:22,height:22,borderRadius:'50%',flexShrink:0,background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',marginTop:1}}>4</div>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',lineHeight:1.2}}>Wardrobe</div>
                <button
                  onClick={() => setCsWardrobeOpen(true)}
                  style={{
                    display:'flex',alignItems:'center',gap:4,flexShrink:0,
                    padding:'3px 9px',borderRadius:980,fontSize:11,fontWeight:600,
                    border:'1px solid rgba(139,92,246,0.35)',background:'rgba(139,92,246,0.08)',
                    color:'#8B5CF6',cursor:'pointer',fontFamily:'inherit',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Outfit
                </button>
              </div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>Pin a wardrobe look as the outfit reference for this video.</div>
            </div>
          </div>
          {startFrameUrl ? (
            <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'10px 12px',background:'var(--bg-tertiary)',borderRadius:10,lineHeight:1.5}}>
              Not applicable — outfit is already set by the start frame.
            </div>
          ) : (
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <WardrobeChipWithHover
                slot={{ name: 'Current', image: influencer.characterSheetImage }}
                active={!selectedWardrobeId}
                onClick={() => { setSelectedWardrobeId(''); localStorage.setItem(`hf_wardrobe_id_${influencer.id}`, '') }}
              />
              {wardrobeSlots.map(s => {
                const on = selectedWardrobeId === s.id
                return (
                  <WardrobeChipWithHover key={s.id} slot={s} active={on}
                    onClick={() => { setSelectedWardrobeId(s.id); localStorage.setItem(`hf_wardrobe_id_${influencer.id}`, s.id) }}
                  />
                )
              })}
            </div>
          )}
        </Sec>

        {/* Location */}
        <Sec>
          <CSStepHeader n={5} title="Location" sub="Where is the scene? Pick a preset, use a home setting, or write your own."/>
          {startFrameUrl ? (
            <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'10px 12px',background:'var(--bg-tertiary)',borderRadius:10,lineHeight:1.5}}>
              Not applicable — location is already set by the start frame.
            </div>
          ) : (<>

          {/* Home setting picker */}
          {homeSlots.length > 0 && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Home Setting</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom: selectedHome ? 10 : 0}}>
                <button
                  onClick={() => { setSelectedHomeId(''); localStorage.setItem(`hf_home_id_${influencer.id}`, '') }}
                  style={{
                    padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                    background: !selectedHomeId ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: !selectedHomeId ? '#8B5CF6' : 'var(--text-secondary)',
                    border: !selectedHomeId ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',
                  }}
                >None</button>
                {homeSlots.map(s => {
                  const on = selectedHomeId === s.id
                  return (
                    <button key={s.id}
                      onClick={() => { setSelectedHomeId(s.id); localStorage.setItem(`hf_home_id_${influencer.id}`, s.id) }}
                      style={{
                        padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                        background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                        color: on ? '#8B5CF6' : 'var(--text-secondary)',
                        border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                        transition:'all 0.15s',
                      }}
                    >{s.name}</button>
                  )
                })}
              </div>
              {selectedHome && (
                <div style={{display:'flex',gap:12,alignItems:'center',padding:'10px 12px',background:'var(--bg-tertiary)',borderRadius:10,marginBottom:10}}>
                  <img src={selectedHome.image} alt={selectedHome.name} style={{width:72,height:54,objectFit:'cover',borderRadius:8,flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>{selectedHome.name}</div>
                    <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>Sent as location reference · scene will be set in this environment</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <CSChips
            options={CS_ENVIRONMENTS}
            value={envKey}
            onChange={k => {
              setEnvKey(k)
              setEnvironment(k ? (CS_ENV_PRESETS[k] || k) : '')
              localStorage.setItem('hf_env_key', k)
              localStorage.setItem('hf_env_custom', '')
            }}
          />
          <input
            value={envKey ? '' : environment}
            onChange={e => {
              setEnvironment(e.target.value)
              setEnvKey('')
              localStorage.setItem('hf_env_key', '')
              localStorage.setItem('hf_env_custom', e.target.value)
            }}
            placeholder="or type a custom location — e.g. In a Dubai mall"
            style={{
              width:'100%',padding:'10px 12px',borderRadius:10,marginTop:10,
              border:'1.5px solid var(--border)',background:'var(--bg)',
              fontSize:13,color:'var(--text-primary)',boxSizing:'border-box',fontFamily:'inherit',
            }}
          />
          </>)}
        </Sec>

        {/* Camera */}
        <Sec>
          <CSStepHeader n={6} title="Camera" sub="How should the shot be framed?"/>
          <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
            {CS_CAMERAS.map(c => {
              const meta = CAMERA_META[c] || { label: c, desc: '' }
              const on = camera === c
              return (
                <button key={c} onClick={() => {setCamera(c);localStorage.setItem('hf_camera',c)}} style={{
                  padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                  background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                  color: on ? '#8B5CF6' : 'var(--text-secondary)',
                  border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                  transition:'all 0.15s',
                }}>{meta.label}</button>
              )
            })}
          </div>
        </Sec>

        {/* Vibe */}
        <Sec>
          <CSStepHeader n={7} title="Vibe" sub="What's the overall mood and energy?"/>
          <CSChips options={CS_VIBES} value={vibe} onChange={v=>{setVibe(v);localStorage.setItem('hf_vibe',v)}}/>
          {vibe && VIBE_META[vibe] && (
            <div style={{
              marginTop:10,padding:'8px 12px',borderRadius:9,
              background:'var(--bg-tertiary)',fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,
            }}>{VIBE_META[vibe]}</div>
          )}
        </Sec>

        {/* Voice */}
        <Sec>
          <CSStepHeader n={8} title="Voice" sub="Upload your audio or pick a voice style."/>

          <input ref={audioFileRef} type="file" accept="audio/*" style={{display:'none'}} onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => {
              const dataUrl = ev.target.result
              const audio = new window.Audio()
              audio.onloadedmetadata = () => {
                setAudioDuration(audio.duration)
                setAudioDataUrl(dataUrl)
                setAudioFileName(file.name)
              }
              audio.src = dataUrl
            }
            reader.readAsDataURL(file)
            e.target.value = ''
          }}/>
          {audioDataUrl ? (
            <div style={{
              display:'flex',alignItems:'center',gap:12,padding:'14px 16px',marginBottom:14,
              borderRadius:12,background:'rgba(139,92,246,0.08)',border:'1.5px solid rgba(139,92,246,0.3)',
            }}>
              <div style={{
                width:40,height:40,borderRadius:10,flexShrink:0,
                background:'linear-gradient(135deg,rgba(236,72,153,0.2),rgba(139,92,246,0.2))',
                border:'1px solid rgba(139,92,246,0.3)',
                display:'flex',alignItems:'center',justifyContent:'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{audioFileName}</div>
                {audioDuration != null && audioDuration > 13.5
                  ? <div style={{fontSize:11,fontWeight:600,color:'#FF3B30',marginTop:2}}>⚠ {audioDuration.toFixed(1)}s — max 13s. Trim your audio before uploading.</div>
                  : <div style={{fontSize:11,color:'rgba(139,92,246,0.8)',marginTop:2}}>{audioDuration != null ? `${audioDuration.toFixed(1)}s · ` : ''}Lip-sync via @audio_1 — voice presets ignored</div>
                }
              </div>
              <button onClick={() => { setAudioDataUrl(null); setAudioFileName(''); setAudioDuration(null) }} style={{
                fontSize:12,fontWeight:600,color:'var(--text-tertiary)',background:'var(--bg-tertiary)',
                border:'1px solid var(--border)',padding:'5px 10px',borderRadius:7,cursor:'pointer',flexShrink:0,
              }}>Remove</button>
            </div>
          ) : (
            <button onClick={() => audioFileRef.current?.click()} style={{
              width:'100%',marginBottom:14,padding:'16px',borderRadius:12,
              border:'2px dashed rgba(139,92,246,0.35)',background:'rgba(139,92,246,0.04)',
              cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',gap:14,
              boxSizing:'border-box',
            }}>
              <div style={{
                width:40,height:40,borderRadius:10,flexShrink:0,
                background:'linear-gradient(135deg,rgba(236,72,153,0.12),rgba(139,92,246,0.12))',
                border:'1px solid rgba(139,92,246,0.2)',
                display:'flex',alignItems:'center',justifyContent:'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 18.5a6.5 6.5 0 0 0 6.5-6.5V8a6.5 6.5 0 0 0-13 0v4a6.5 6.5 0 0 0 6.5 6.5z"/>
                  <line x1="12" y1="18.5" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>
                </svg>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#8B5CF6'}}>Upload your own audio</div>
                <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>mp3, wav, m4a — your voice drives the lip-sync</div>
              </div>
            </button>
          )}

          {!audioDataUrl && (() => {
            const gender = (influencer.gender || '').toLowerCase()
            const presets = gender === 'male' ? VOICE_PRESETS.male : VOICE_PRESETS.female
            return (
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>
                    Voice style
                  </div>
                  <select
                    value={voicePreset}
                    onChange={e => { setVoicePreset(e.target.value); setVoiceCustom(''); localStorage.setItem('hf_voice_preset',e.target.value); localStorage.setItem('hf_voice_custom','') }}
                    style={{
                      width:'100%',padding:'9px 12px',borderRadius:10,boxSizing:'border-box',
                      border:'1.5px solid var(--border)',background:'var(--bg)',
                      fontSize:13,color: voicePreset ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      fontFamily:'inherit',cursor:'pointer',appearance:'auto',
                    }}
                  >
                    <option value="">No preference</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.label} — {p.sub}</option>
                    ))}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>
                    Or describe it
                  </div>
                  <input
                    value={voiceCustom}
                    onChange={e => { setVoiceCustom(e.target.value); setVoicePreset(''); localStorage.setItem('hf_voice_custom',e.target.value); localStorage.setItem('hf_voice_preset','') }}
                    placeholder="e.g. Young American woman, energetic and lively"
                    style={{
                      width:'100%',padding:'9px 12px',borderRadius:10,boxSizing:'border-box',
                      border:'1.5px solid var(--border)',background:'var(--bg)',
                      fontSize:13,color:'var(--text-primary)',fontFamily:'inherit',
                    }}
                  />
                </div>
              </div>
            )
          })()}
        </Sec>

        {/* Shot type */}
        <Sec>
          <CSStepHeader n={9} title="Shot Type" sub="How many cuts in the video?"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[
              {id:'oner', label:'1 Shot', sub:'Zero cuts — one continuous take'},
              {id:'multi', label:'Multi-shot', sub:'Auto-splits by duration'},
            ].map(m=>{
              const on = shotMode===m.id
              return (
                <button key={m.id} onClick={()=>{setShotMode(m.id);localStorage.setItem('hf_shot_mode',m.id)}} style={{
                  padding:'12px 14px',borderRadius:12,textAlign:'left',
                  background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.12),rgba(139,92,246,0.12))' : 'var(--bg-tertiary)',
                  border: on ? '1.5px solid rgba(139,92,246,0.45)' : '1.5px solid transparent',
                  transition:'all 0.15s',
                }}>
                  <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                    <div style={{
                      width:8,height:8,borderRadius:'50%',flexShrink:0,
                      background: on ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--border)',
                      boxShadow: on ? '0 0 6px rgba(139,92,246,0.5)' : 'none',
                      transition:'all 0.15s',
                    }}/>
                    <span style={{fontSize:13,fontWeight:700,color: on ? 'var(--text-primary)' : 'var(--text-secondary)'}}>{m.label}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-tertiary)',paddingLeft:15}}>{m.sub}</div>
                </button>
              )
            })}
          </div>
        </Sec>

        {/* Additional Notes */}
        <Sec>
          <CSStepHeader n={10} title="Additional Notes" sub="Hard requirements that go directly into the prompt."/>
          <textarea
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
            placeholder='e.g. "She holds up the bracelet close to the camera at the start."'
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            rows={3}
            style={{
              width:'100%',padding:'11px 13px',borderRadius:10,boxSizing:'border-box',
              border:'1.5px solid var(--border)',background:'var(--bg)',
              fontSize:13,color:'var(--text-primary)',resize:'vertical',
              lineHeight:1.6,fontFamily:'inherit',
            }}
          />
        </Sec>

        {/* Settings */}
        <Sec>
          <CSStepHeader n={11} title="Settings"/>

          <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'flex-start'}}>

            <div style={{flex:'1 1 160px',minWidth:140}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)'}}>Duration</div>
                <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{duration}s</div>
              </div>
              <input type="range" min={4} max={15} step={1} value={duration} onChange={e=>{const v=Number(e.target.value);setDuration(v);localStorage.setItem('hf_duration',v)}}
                style={{width:'100%',accentColor:'#8B5CF6',cursor:'pointer',height:4}}/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:10,color:'var(--text-tertiary)'}}>4s</span>
                <span style={{fontSize:10,color:'var(--text-tertiary)'}}>15s</span>
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>Format</div>
              <div style={{display:'flex',gap:6}}>
                {[
                  {r:'9:16',  label:'📱 Reels'},
                  {r:'16:9',  label:'🖥 Long-form'},
                ].map(({r, label}) => (
                  <button key={r} onClick={()=>{setAspect(r);localStorage.setItem('hf_aspect',r)}} style={{
                    padding:'7px 12px',borderRadius:9,fontSize:11,fontWeight:600,
                    background: aspect===r ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: aspect===r ? '#8B5CF6' : 'var(--text-secondary)',
                    border: aspect===r ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',whiteSpace:'nowrap',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>Resolution</div>
              <div style={{display:'flex',gap:6}}>
                {['480p','720p','1080p'].map(r => (
                  <button key={r} onClick={()=>{setResolution(r);localStorage.setItem('hf_resolution',r)}} style={{
                    padding:'7px 12px',borderRadius:9,fontSize:11,fontWeight:600,
                    background: resolution===r ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: resolution===r ? '#8B5CF6' : 'var(--text-secondary)',
                    border: resolution===r ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',whiteSpace:'nowrap',
                  }}>{r}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>Outputs</div>
              <div style={{display:'flex',gap:6}}>
                {[1,2,3].map(n=>(
                  <button key={n} onClick={()=>{setOutputs(n);localStorage.setItem('hf_outputs',n)}} style={{
                    width:40,height:40,borderRadius:9,fontSize:14,fontWeight:700,
                    background: outputs===n ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: outputs===n ? '#8B5CF6' : 'var(--text-secondary)',
                    border: outputs===n ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',display:'flex',alignItems:'center',justifyContent:'center',
                  }}>{n}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>Video Model</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {VIDEO_MODELS.map(m => (
                  <button key={m.id} onClick={()=>setVideoModel(m.id)} title={m.note} style={{
                    padding:'7px 12px',borderRadius:9,fontSize:11,fontWeight:600,
                    background: videoModel===m.id ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: videoModel===m.id ? '#8B5CF6' : 'var(--text-secondary)',
                    border: videoModel===m.id ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',whiteSpace:'nowrap',cursor:'pointer',
                  }}>{m.label}</button>
                ))}
              </div>
              <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:6,lineHeight:1.4}}>
                {VIDEO_MODELS.find(m=>m.id===videoModel)?.note}
              </div>
              {audioDataUrl && videoModel !== 'seedance_2_0' && (
                <div style={{fontSize:10.5,color:'#FF9F0A',marginTop:6,fontWeight:600,lineHeight:1.4}}>
                  ⚠️ Audio lipsync is only verified on Seedance 2.0 — on this model it's experimental and may be ignored.
                </div>
              )}
            </div>

          </div>
        </Sec>

      </>)}

      {/* Error */}
      {genError && (
        <div style={{
          padding:'12px 14px',borderRadius:10,
          background:'rgba(255,59,48,0.06)',border:'1px solid rgba(255,59,48,0.2)',
          fontSize:13,color:'#FF3B30',lineHeight:1.5,
        }}>
          <strong>Generation failed:</strong> {genError}
          {/timed out|still processing/i.test(genError) && (
            <span style={{marginLeft:8,fontWeight:600}}>→ The clip may still be rendering on Higgsfield — wait a moment and check your videos, or try a shorter clip / the Seedance 2.0 model.</span>
          )}
          {/authorization|re-seed/i.test(genError) && (
            <span style={{marginLeft:8,fontWeight:600}}>→ Higgsfield authorization issue — your admin may need to re-seed the token.</span>
          )}
        </div>
      )}

      {/* Generating + Results — unified N-card display */}
      {(generating || genResults.length > 0) && (
        <div ref={genCardRef}>
          {/* Progress area — only while generating */}
          {generating && (
            <div style={{marginBottom:10}}>
              {/* Main status card */}
              <div style={{
                padding:'14px 16px',borderRadius:14,marginBottom:8,
                background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.15)',
              }}>
                {/* Top row: pulse dot + stage label + timer + cancel */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{
                      width:7,height:7,borderRadius:'50%',flexShrink:0,
                      background:'linear-gradient(135deg,#EC4899,#8B5CF6)',
                      boxShadow:'0 0 8px rgba(139,92,246,0.7)',
                      animation:'cs-pulse 1.4s ease-in-out infinite',
                    }}/>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>
                      {genProgress < 10 ? 'Connecting...'
                        : genProgress < 28 ? 'Uploading references...'
                        : genProgress < 35 ? `Submitting to ${VIDEO_MODELS.find(m=>m.id===videoModel)?.label || 'model'}...`
                        : genProgress >= 95 ? 'Almost there...'
                        : lockedOutputs > 1 && genResults.length > 0
                          ? `Rendering · ${genResults.length}/${lockedOutputs} ready`
                          : 'Rendering...'}
                    </span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:3}}>
                      <span style={{fontSize:16,fontWeight:800,color:'#8B5CF6',fontVariantNumeric:'tabular-nums'}}>{fmtElapsed(elapsed)}</span>
                      <span style={{fontSize:10,color:'var(--text-tertiary)'}}>/ ~8 min</span>
                    </div>
                    <button onClick={cancelGeneration} style={{
                      padding:'4px 10px',borderRadius:7,fontSize:11,fontWeight:600,
                      background:'rgba(255,59,48,0.08)',color:'#FF3B30',
                      border:'1px solid rgba(255,59,48,0.2)',cursor:'pointer',
                    }}>Cancel</button>
                  </div>
                </div>

                {/* Smooth progress bar */}
                <div style={{height:4,borderRadius:4,background:'var(--bg-tertiary)',overflow:'hidden',marginBottom:10}}>
                  <div style={{
                    height:'100%',borderRadius:4,
                    background:'linear-gradient(90deg,#EC4899,#8B5CF6)',
                    width:`${Math.round(displayProgress)}%`,
                    transition:'width 1.2s ease',
                  }}/>
                </div>

              </div>

            </div>
          )}

          {/* Video cards */}
          <div style={{
            display:'flex',
            flexDirection:'row',
            flexWrap:'wrap',
            gap:10,
            maxWidth: aspect==='9:16'
              ? `${lockedOutputs * 220 + Math.max(0, lockedOutputs - 1) * 10}px`
              : `${lockedOutputs * 340 + Math.max(0, lockedOutputs - 1) * 10}px`,
            margin:'0 auto',
            width:'100%',
          }}>
            {Array.from({length: generating ? lockedOutputs : genResults.length}, (_,i) => {
              const url = genResults[i]
              const isReady = !!url
              return (
                <div key={i} style={{
                  flex:1,minWidth:0,
                  borderRadius:14,overflow:'hidden',
                  border: isReady ? '1.5px solid var(--border)' : 'none',
                  background: isReady ? '#000' : 'transparent',
                }}>
                  {isReady ? (
                    <>
                      {/* Video */}
                      <div style={{
                        position:'relative',cursor:'pointer',background:'#000',overflow:'hidden',
                      }} onClick={()=>setFullscreenUrl(url)}>
                        <video src={url} controls playsInline style={{
                          display:'block',background:'#000',
                          width:'100%',height:'auto',
                          aspectRatio: aspect==='9:16' ? '9/16' : '16/9',
                          pointerEvents:'none',
                        }}/>
                        <div style={{
                          position:'absolute',top:8,right:8,
                          background:'rgba(0,0,0,0.55)',borderRadius:6,padding:'3px 7px',
                          fontSize:10,color:'rgba(255,255,255,0.7)',fontWeight:500,
                          pointerEvents:'none',
                        }}>⛶ expand</div>
                      </div>

                      {/* Action bar */}
                      <div style={{display:'flex',gap:7,padding:'9px 10px',background:'var(--bg)'}}>
                        <button onClick={async()=>{
                          try{
                            const res=await fetch(url)
                            const blob=await res.blob()
                            const a=document.createElement('a')
                            a.href=URL.createObjectURL(blob)
                            a.download=`video-${i+1}.mp4`
                            a.click()
                            setTimeout(()=>URL.revokeObjectURL(a.href),60000)
                          }catch{
                            const a=document.createElement('a');a.href=url;a.download=`video-${i+1}.mp4`;a.click()
                          }
                        }} style={{
                          flex:1,padding:'8px',borderRadius:8,fontSize:12,fontWeight:600,textAlign:'center',
                          background:'var(--bg-tertiary)',color:'var(--text-secondary)',
                          border:'1.5px solid var(--border)',cursor:'pointer',fontFamily:'inherit',
                        }}>Download</button>
                        {!generating && (
                          <button onClick={()=>regenerateSlot(i)} disabled={regenSlot!==null} style={{
                            padding:'8px 10px',borderRadius:8,fontSize:12,fontWeight:600,
                            background: regenSlot===i ? 'rgba(139,92,246,0.1)' : 'var(--bg-tertiary)',
                            color: regenSlot===i ? '#8B5CF6' : 'var(--text-tertiary)',
                            border:'1.5px solid var(--border)',flexShrink:0,
                          }}>
                            {regenSlot===i ? '...' : '↺'}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Loading card — matches Photo Studio style */
                    <div style={{
                      aspectRatio: aspect==='9:16' ? '9/16' : '16/9',
                      background:'var(--bg-tertiary)',
                      border:'1.5px solid var(--border)',
                      borderRadius:14,
                      display:'flex',flexDirection:'column',
                      alignItems:'center',justifyContent:'center',
                      gap:10,padding:16,
                    }}>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',textAlign:'center'}}>
                        {lockedOutputs > 1 ? `Generating ${i+1} of ${lockedOutputs}…` : 'Generating…'}
                      </div>
                      <div style={{width:'80%',height:3,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
                        <div style={{
                          height:'100%',
                          width:`${Math.round(displayProgress)}%`,
                          background:'linear-gradient(90deg,#EC4899,#8B5CF6)',
                          borderRadius:2,
                          transition:'width 0.4s linear',
                        }}/>
                      </div>
                      <div style={{fontSize:11,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>
                        {fmtElapsed(elapsed)}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {!generating && genResults.length > 0 && (
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
              <button
                onClick={() => { setGenResults([]); try { localStorage.removeItem(`hf_gen_results_${influencer.id}`) } catch {} }}
                style={{ fontSize:11, fontWeight:600, color:'var(--text-tertiary)', background:'none', border:'none', cursor:'pointer', padding:'4px 2px', fontFamily:'inherit' }}
              >Clear</button>
            </div>
          )}
        </div>
      )}

      {/* Action footer */}
      <div style={{
        marginTop:4,
        borderTop:'1px solid var(--border-subtle)',
      }}>
        {/* Collapsible prompt panel */}
        {showPrompt && (
          <div style={{
            borderBottom:'1px solid var(--border-subtle)',
            background:'var(--bg)',
          }}>
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 14px 6px',
            }}>
              <span style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.6px'}}>
                Last generated prompt
              </span>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <button
                  onClick={()=>{ navigator.clipboard.writeText(lastGeneratedPrompt||'').then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) }) }}
                  style={{
                    padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:600,
                    background: copied ? 'rgba(34,197,94,0.12)' : 'var(--bg-tertiary)',
                    color: copied ? '#22C55E' : 'var(--text-secondary)',
                    border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border)',
                    cursor:'pointer', transition:'all 0.15s',
                  }}
                >{copied ? '✓ Copied' : 'Copy'}</button>
                <button onClick={()=>setShowPrompt(false)} style={{
                  width:24, height:24, borderRadius:6, border:'none', cursor:'pointer',
                  background:'var(--bg-tertiary)', color:'var(--text-tertiary)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:14,
                }}>×</button>
              </div>
            </div>
            {lastGeneratedPrompt
              ? <pre style={{
                  margin:0, padding:'6px 14px 12px',
                  fontSize:11.5, lineHeight:1.7, color:'var(--text-secondary)',
                  whiteSpace:'pre-wrap', wordBreak:'break-word',
                  fontFamily:'inherit', maxHeight:240, overflowY:'auto',
                }}>{lastGeneratedPrompt}</pre>
              : <div style={{padding:'10px 14px 14px',fontSize:12,color:'var(--text-tertiary)'}}>
                  Generate a video first to inspect its prompt.
                </div>
            }
          </div>
        )}

        {/* Action row — [Random/Cancel] [Generate Video] [Save] [Inspect] */}
        <div style={{padding:'10px', display:'flex', gap:8, alignItems:'center'}}>
          {generating ? (
            <button
              onClick={() => {
                cancelRef.current = true
                clearPendingVideo(influencer.id)
                clearInterval(elapsedRef.current)
                setGenerating(false)
                setGenProgress(0)
                setElapsed(0)
              }}
              style={{
                padding:'12px 18px', borderRadius:12, fontSize:13, fontWeight:600,
                border:'1.5px solid rgba(255,59,48,0.35)', background:'rgba(255,59,48,0.08)',
                color:'#FF3B30', cursor:'pointer', transition:'all 0.15s', fontFamily:'inherit',
              }}
            >Cancel</button>
          ) : (
            <button onClick={doVideoRandomize} style={{
              padding:'12px 18px', borderRadius:12, fontSize:13, fontWeight:600,
              border:'1.5px solid var(--border)', background:'var(--bg-tertiary)',
              color:'var(--text-primary)', cursor:'pointer',
              transition:'all 0.12s', fontFamily:'inherit',
            }}>🎲 Random</button>
          )}
          <button
            onClick={generate}
            disabled={!canAct || generating}
            style={{
              flex:1, padding:'12px 18px', borderRadius:12, fontSize:14, fontWeight:700,
              background: generating ? 'rgba(139,92,246,0.12)' : (canAct ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--bg-tertiary)'),
              color: generating ? '#8B5CF6' : (canAct ? '#fff' : 'var(--text-tertiary)'),
              border: generating ? '1.5px solid rgba(139,92,246,0.3)' : 'none',
              cursor: (generating || !canAct) ? 'default' : 'pointer',
              transition:'all 0.2s', letterSpacing:'-0.2px', fontFamily:'inherit',
              boxShadow: (!generating && canAct) ? '0 4px 24px rgba(139,92,246,0.35)' : 'none',
            }}
          >
            {generating
              ? (genResults.length > 0 ? `${genResults.length}/${lockedOutputs} ready · ${fmtElapsed(elapsed)}` : `Generating… ${fmtElapsed(elapsed)}`)
              : `✦ Generate${outputs > 1 ? ` ${outputs} Videos` : ' Video'}`}
            {!generating && <span style={{fontSize:10,opacity:0.5,marginLeft:8,fontWeight:400}}>⌘↵</span>}
          </button>
          {/* Save — appears only after generation completes */}
          {genResults.length > 0 && (
            <button
              onClick={()=>openSaveModal(null)}
              title={saved ? 'Saved' : 'Save script + videos'}
              style={{
                flexShrink:0, width:44, height:44, borderRadius:12, cursor:'pointer',
                background: saved ? 'rgba(52,199,89,0.12)' : 'var(--bg-tertiary)',
                border: saved ? '1.5px solid rgba(52,199,89,0.35)' : '1.5px solid var(--border)',
                color: saved ? '#34C759' : 'var(--text-secondary)',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all 0.2s',
              }}
            >
              {saved
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              }
            </button>
          )}
          {/* Inspect — appears while generating or after */}
          {(generating || genResults.length > 0) && (
            <button
              onClick={()=>setShowPrompt(v=>!v)}
              title="Inspect prompt"
              style={{
                flexShrink:0, width:44, height:44, borderRadius:12, cursor:'pointer',
                background: showPrompt ? 'rgba(139,92,246,0.12)' : 'var(--bg-tertiary)',
                border: showPrompt ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid var(--border)',
                color: showPrompt ? '#8B5CF6' : 'var(--text-tertiary)',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all 0.15s', position:'relative',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              {lastGeneratedPrompt && !showPrompt && (
                <div style={{position:'absolute',top:7,right:7,width:5,height:5,borderRadius:'50%',background:'#8B5CF6'}}/>
              )}
            </button>
          )}
        </div>

        {/* ── Video history strip — below Generate button ── */}
        {(() => {
          const vids = (influencer.generationHistory || []).filter(e => e.type === 'video').slice(0, 40)
          const skeletons = generating ? lockedOutputs : 0
          return (
            <div style={{ padding: '0 10px 10px' }}>
              <style>{`@keyframes hf-pulse{0%,100%{opacity:0.45}50%{opacity:1}}@keyframes hf-spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flexShrink: 0 }}>History · {vids.length}</span>
                {generating && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#8B5CF6', background: 'rgba(139,92,246,0.1)', padding: '2px 8px', borderRadius: 6, textTransform: 'none', letterSpacing: 0 }}>
                    {genResults.length > 0 ? `${genResults.length}/${lockedOutputs} ready` : `Generating${lockedOutputs > 1 ? ` ${lockedOutputs} videos` : ''}…`}
                  </span>
                )}
                {!generating && vids.length > 0 && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setSelectedVidIds(selectedVidIds.size === vids.length ? new Set() : new Set(vids.map(v => v.id)))}
                      style={{
                        padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                        background: selectedVidIds.size === vids.length ? 'rgba(139,92,246,0.1)' : 'var(--bg-tertiary)',
                        color: selectedVidIds.size === vids.length ? '#8B5CF6' : 'var(--text-tertiary)',
                        border: selectedVidIds.size === vids.length ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{selectedVidIds.size === vids.length ? 'Deselect all' : 'Select all'}</button>
                    {selectedVidIds.size > 0 && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          const items = vids.filter(v => selectedVidIds.has(v.id))
                          await Promise.all(items.map(async (item, i) => {
                            const filename = `video-${new Date(item.date).toISOString().slice(0,10)}-${i+1}.mp4`
                            try {
                              const res = await fetch(item.url)
                              const blob = await res.blob()
                              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
                            } catch {
                              const a = document.createElement('a'); a.href = item.url; a.download = filename; a.target = '_blank'; a.click()
                            }
                          }))
                        }}
                        style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
                      >↓ {selectedVidIds.size}</button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const ids = selectedVidIds.size > 0 ? selectedVidIds : new Set(vids.map(v => v.id))
                        const count = ids.size
                        setConfirmVidClear({
                          label: selectedVidIds.size > 0 ? `Delete ${count} video${count !== 1 ? 's' : ''}` : `Clear all ${count} video${count !== 1 ? 's' : ''}`,
                          onConfirm: () => {
                            onUpdate({ generationHistory: (influencer.generationHistory || []).filter(ev => !ids.has(ev.id)) })
                            setSelectedVidIds(new Set())
                            setConfirmVidClear(null)
                          },
                        })
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                        background: selectedVidIds.size > 0 ? 'rgba(255,59,48,0.08)' : 'var(--bg-tertiary)',
                        color: selectedVidIds.size > 0 ? '#FF3B30' : 'var(--text-tertiary)',
                        border: selectedVidIds.size > 0 ? '1px solid rgba(255,59,48,0.2)' : '1px solid var(--border)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{selectedVidIds.size > 0 ? `Delete (${selectedVidIds.size})` : 'Clear all'}</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Array.from({ length: skeletons }).map((_, i) => (
                  <div key={`skel-${i}`} style={{ width: 60, borderRadius: 9, overflow: 'hidden', outline: '2px solid rgba(139,92,246,0.28)', outlineOffset: -2 }}>
                    <div style={{ width: '100%', height: 90, background: 'rgba(139,92,246,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hf-pulse 1.6s ease-in-out infinite' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', animation: 'hf-spin 0.75s linear infinite' }}/>
                    </div>
                    <div style={{ padding: '4px 6px', fontSize: 9, color: 'rgba(139,92,246,0.5)', fontWeight: 700, background: 'var(--surface)', letterSpacing: 1 }}>···</div>
                  </div>
                ))}
                {vids.map((entry, i) => (
                  <VideoStripThumb
                    key={entry.id || i}
                    entry={entry}
                    isSelected={selectedVidIds.has(entry.id)}
                    onToggle={() => setSelectedVidIds(prev => { const n = new Set(prev); n.has(entry.id) ? n.delete(entry.id) : n.add(entry.id); return n })}
                    onReuse={(e) => { const s = e.settings ?? e; if (s && (s.vibe || s.dialogue || s.environment)) restoreHistory(s) }}
                    onDelete={() => onUpdate({ generationHistory: (influencer.generationHistory || []).filter(e2 => e2.id !== entry.id) })}
                  />
                ))}
                {!vids.length && !generating && (
                  <div style={{ width: '100%', padding: '18px 0 6px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                    No videos yet — generate your first above
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Video gallery */}
      {videos.length > 0 && (
        <Sec>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:14}}>Videos</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {videos.map(v=>(
              <div key={v.id} style={{
                display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderRadius:12,
                background:'var(--bg)',border:'1.5px solid var(--border)',
              }}>
                {ytId(v.videoUrl) ? (
                  <img src={`https://img.youtube.com/vi/${ytId(v.videoUrl)}/mqdefault.jpg`} alt=""
                    style={{width:100,height:60,objectFit:'cover',borderRadius:8,flexShrink:0}}/>
                ) : (
                  <div style={{width:100,height:60,borderRadius:8,background:'rgba(139,92,246,0.1)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:22,opacity:0.4}}>▶</span>
                  </div>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{v.title}</div>
                  {v.script && <div style={{fontSize:12,color:'var(--text-tertiary)',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{v.script}</div>}
                </div>
                <a href={v.videoUrl} target="_blank" rel="noreferrer" style={{
                  padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:600,
                  background:'var(--bg-tertiary)',color:'var(--text-secondary)',textDecoration:'none',flexShrink:0,
                }}>Watch →</a>
              </div>
            ))}
          </div>
        </Sec>
      )}
      {/* Fullscreen video overlay */}
      {fullscreenUrl && (
        <div
          onClick={() => setFullscreenUrl(null)}
          style={{
            position:'fixed',inset:0,zIndex:2000,
            background:'rgba(0,0,0,0.95)',
            display:'flex',alignItems:'center',justifyContent:'center',
          }}
        >
          <button
            onClick={() => setFullscreenUrl(null)}
            style={{
              position:'absolute',top:20,right:20,
              width:40,height:40,borderRadius:'50%',
              background:'rgba(255,255,255,0.15)',
              color:'#fff',fontSize:20,fontWeight:300,
              display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',border:'none',zIndex:1,
            }}
          >×</button>
          <video
            src={fullscreenUrl}
            controls
            autoPlay
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: aspect === '9:16' ? 'min(90vw, 480px)' : '92vw',
              maxHeight:'92vh',
              borderRadius:12,
              boxShadow:'0 24px 80px rgba(0,0,0,0.8)',
            }}
          />
        </div>
      )}

      {/* ── Wardrobe drawer ── */}
      {csWardrobeOpen && (
        <WardrobeDrawer
          influencer={influencer}
          pendingResult={csWardrobePending}
          onResult={handleCsWardrobeResult}
          onClose={() => setCsWardrobeOpen(false)}
          onSave={slot => {
            onUpdate({ wardrobeSlots: [...(influencer.wardrobeSlots || []), slot] })
            setCsWardrobeOpen(false)
          }}
        />
      )}

      {confirmVidClear && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmVidClear(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: '28px 32px', maxWidth: 340, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{confirmVidClear.label}?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmVidClear(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmVidClear.onConfirm} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#FF3B30', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
