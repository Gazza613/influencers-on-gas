import { useState, useRef, useEffect } from 'react'
import { generateSingleImage, initSession, pollAllJobs } from '../utils/higgsfieldGenerate'
import { generateId } from '../store'

export function buildWardrobePrompt(influencer, { outfit, hair, customText }) {
  const phys = influencer.physicalDesc ? `The subject: ${influencer.physicalDesc}. ` : ''
  const identity = `IDENTITY LOCK — replicate exactly from reference: facial bone structure, face shape, jaw, nose bridge and tip, lip shape, eye shape and color, eyebrow arch and thickness, skin tone, skin texture and pores, all freckles, moles, marks, scars, natural asymmetries. Zero facial drift — this must be unmistakably the same person.`
  const layout = `Output must be the exact same 4-panel character turnaround sheet as the reference image. Single row of four equally sized full-body panels with these labels in clean sans-serif capitals above each: "FRONT VIEW" | "SIDE VIEW" | "BACK VIEW" | "THREE-QUARTER VIEW". Keep identical body poses, stance, arm positions, proportions, and panel layout from the reference. Do NOT change poses, labels, panel structure, background (pure white seamless), or lighting.`
  const changeParts = [
    outfit && `outfit — ${outfit}`,
    hair && `hairstyle — ${hair}`,
    customText?.trim() || '',
  ].filter(Boolean)
  const changes = `Change only: ${changeParts.join('; ') || 'casual stylish outfit, natural hairstyle'}.`
  return `Professional full-body character turnaround sheet. ${phys}Pure white seamless background throughout. Soft neutral studio lighting, perfectly flat and even across all four panels — no shadows, no color cast.\n\n${layout}\n\n${identity}\n\n${changes}\n\nPhotorealistic RAW photograph quality, ultra-sharp micro detail. Shot on Hasselblad X2D 100C.`
}

export const jobsKey   = id => `wd_jobs_${id}`

export function saveJobs(id, jobIds) {
  try { localStorage.setItem(jobsKey(id), JSON.stringify({ jobIds, startedAt: Date.now() })) } catch {}
}
export function loadJobs(id) {
  try {
    const d = JSON.parse(localStorage.getItem(jobsKey(id)) || 'null')
    if (!d) return null
    if (Date.now() - d.startedAt > 15 * 60 * 1000) { localStorage.removeItem(jobsKey(id)); return null }
    return d
  } catch { return null }
}
export function clearJobs(id) { try { localStorage.removeItem(jobsKey(id)) } catch {} }

// WardrobeDrawer receives pendingResult from its parent (parent owns localStorage persistence)
// onResult(url) — parent saves to localStorage; onResult(null) — parent clears it
export default function WardrobeDrawer({ influencer, pendingResult, onResult, onClose, onSave }) {
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [hair, setHair] = useState('')
  const [footwear, setFootwear] = useState('')
  const [customText, setCustomText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(pendingResult || null)
  const [saveName, setSaveName] = useState('Custom Look')
  const cancelRef = useRef(false)
  const drawerRef = useRef()

  // Sync result when pendingResult prop changes (e.g. parent restores from localStorage)
  useEffect(() => {
    if (pendingResult && !result) setResult(pendingResult)
  }, [pendingResult])

  const refImage = influencer?.mainImage || null
  const canGenerate = refImage && !generating && !result && (
    customText.trim() || top.trim() || bottom.trim() || hair.trim() || footwear.trim()
  )

  // On mount: resume any in-flight generation (jobs saved to localStorage before tab switch)
  useEffect(() => {
    const pending = loadJobs(influencer?.id)
    if (!pending) return
    cancelRef.current = false
    setGenerating(true)
    setProgress(30)
    initSession()
      .then(() => pollAllJobs(pending.jobIds, 1, setProgress, 16, () => cancelRef.current))
      .then(urls => {
        if (!cancelRef.current && urls[0]) {
          clearJobs(influencer?.id)
          onResult(urls[0])
          setResult(urls[0])
          setSaveName('Custom Look')
        }
      })
      .catch(e => { if (!cancelRef.current) setError(e.message) })
      .finally(() => {
        clearJobs(influencer?.id)
        if (!cancelRef.current) { setGenerating(false); setProgress(0) }
      })
  }, [influencer?.id])

  useEffect(() => {
    function onDown(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  function cancelGeneration() {
    cancelRef.current = true
    clearJobs(influencer?.id)
    setGenerating(false)
    setProgress(0)
  }

  async function generate() {
    if (!canGenerate) return
    cancelRef.current = false
    setGenerating(true)
    setProgress(0)
    setError(null)
    try {
      const outfitParts = [top, bottom, footwear].filter(Boolean).join(', ')
      const prompt = buildWardrobePrompt(influencer, { outfit: outfitParts, hair, customText: customText || null })
      const url = await generateSingleImage({
        prompt, aspectRatio: '16:9', referenceImage: refImage,
        onProgress: setProgress,
        onJobIds: jobIds => saveJobs(influencer?.id, jobIds),
        isCancelled: () => cancelRef.current,
      })
      if (!cancelRef.current && url) {
        clearJobs(influencer?.id)
        onResult(url)   // parent persists to localStorage
        setResult(url)
        setSaveName('Custom Look')
      }
    } catch (e) {
      clearJobs(influencer?.id)
      if (!cancelRef.current && e.message !== 'CANCELLED') setError(e.message)
    } finally {
      if (!cancelRef.current) { setGenerating(false); setProgress(0) }
    }
  }

  function save() {
    if (!result) return
    onSave({ id: generateId(), name: saveName.trim() || 'Custom Look', image: result })
    onResult(null)  // parent clears localStorage
    setResult(null); setSaveName('Custom Look'); setTop(''); setBottom(''); setHair(''); setFootwear(''); setCustomText('')
  }

  function discard() {
    onResult(null)  // parent clears localStorage
    setResult(null); setSaveName('Custom Look')
  }

  const iS = { padding: '9px 12px', borderRadius: 8, fontSize: 13, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lS = { fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }

  return (
    <div ref={drawerRef} style={{
      position: 'fixed', top: 'var(--nav-h)', right: 0, bottom: 0,
      width: 400, zIndex: 400,
      background: 'var(--surface)',
      boxShadow: '-12px 0 48px rgba(0,0,0,0.12)',
      borderLeft: '1px solid var(--border)',
      animation: 'wardrobeDrawerIn 0.2s ease',
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`@keyframes wardrobeDrawerIn{from{transform:translateX(32px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Add Outfit</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Uses character sheet as identity lock · 16:9 · 4K</div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {result && (
          <>
            <img src={result} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', display: 'block' }} />
            <div>
              <span style={lS}>Name this look</span>
              <input value={saveName} onChange={e => setSaveName(e.target.value)} style={iS} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 10px rgba(139,92,246,0.3)', fontFamily: 'inherit' }}>Save to Wardrobe</button>
              <button onClick={discard} style={{ padding: '11px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>Discard</button>
            </div>
          </>
        )}

        {generating && !result && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Generating look…</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{progress > 0 ? `${Math.round(progress)}%` : 'Starting…'}</span>
                <button onClick={cancelGeneration} style={{ padding: '3px 10px', borderRadius: 980, fontSize: 11, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 980, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(3, progress)}%`, background: 'linear-gradient(90deg,#EC4899,#8B5CF6)', borderRadius: 980, transition: 'width 0.5s ease', boxShadow: '0 0 10px rgba(139,92,246,0.5)' }} />
            </div>
          </div>
        )}

        {!result && !generating && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <span style={lS}>Top</span>
                <input value={top} onChange={e => setTop(e.target.value)} placeholder={influencer?.gender === 'Male' ? 'e.g. white oxford' : 'e.g. white crop top'} style={iS} />
              </div>
              <div>
                <span style={lS}>Bottom</span>
                <input value={bottom} onChange={e => setBottom(e.target.value)} placeholder={influencer?.gender === 'Male' ? 'e.g. dark chinos' : 'e.g. baggy jeans'} style={iS} />
              </div>
            </div>
            <div>
              <span style={lS}>Hairstyle</span>
              <input value={hair} onChange={e => setHair(e.target.value)} placeholder={influencer?.gender === 'Male' ? 'e.g. slicked back' : 'e.g. sleek low bun'} style={iS} />
            </div>
            <div>
              <span style={lS}>Footwear</span>
              <input value={footwear} onChange={e => setFootwear(e.target.value)} placeholder={influencer?.gender === 'Male' ? 'e.g. white sneakers' : 'e.g. strappy heels'} style={iS} />
            </div>
            <div>
              <span style={lS}>Full look description</span>
              <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Describe the complete outfit — overrides the fields above…" rows={3} style={{ ...iS, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            {!refImage && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '9px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                No main image — add one to the profile first.
              </div>
            )}
            {error && <div style={{ fontSize: 12, color: '#FF3B30' }}>{error}</div>}
          </>
        )}
      </div>

      {!result && !generating && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={generate} disabled={!canGenerate} style={{
            width: '100%', padding: '13px', borderRadius: 11, fontSize: 14, fontWeight: 700,
            background: canGenerate ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--bg-tertiary)',
            color: canGenerate ? '#fff' : 'var(--text-tertiary)',
            border: 'none', cursor: canGenerate ? 'pointer' : 'not-allowed',
            boxShadow: canGenerate ? '0 2px 12px rgba(139,92,246,0.32)' : 'none',
            transition: 'all 0.15s', fontFamily: 'inherit',
          }}>Generate Look</button>
        </div>
      )}
    </div>
  )
}
