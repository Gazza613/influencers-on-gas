import { useState, useRef, useEffect } from 'react'
import Lightbox from '../../../components/Lightbox'
import { generateId } from '../../../store'
import { generateSingleImage, initSession, pollAllJobs } from '../../../utils/higgsfieldGenerate'
import { downloadImage } from '../../../utils/imageUtils'
import { buildWardrobePrompt } from '../prompts'
import { clearWardrobePending, getWardrobePending, saveWardrobePending } from '../storage'

export function WardrobeGenerator({ influencer, onAdd }) {
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [hair, setHair] = useState('')
  const [customText, setCustomText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { url, name } — waiting to be saved
  const [saveName, setSaveName] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const cancelRef = useRef(false)
  const genStartRef = useRef(null)

  // Time-based progress — fills 0→95% over 180s, only moves forward
  useEffect(() => {
    if (!generating) return
    genStartRef.current = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - genStartRef.current
      setProgress(prev => Math.max(prev, Math.min(95, (elapsed / 180000) * 95)))
    }, 500)
    return () => clearInterval(timer)
  }, [generating])

  const refImage = influencer.characterSheetImage || null

  // Resume any generation that was running when the user navigated away
  useEffect(() => {
    // Restore a completed result that was never saved/discarded
    const savedResult = (() => { try { return JSON.parse(localStorage.getItem(`wd_gen_result_${influencer.id}`) || 'null') } catch { return null } })()
    if (savedResult?.url) { setResult(savedResult); setSaveName(savedResult.name || 'Custom Look'); return }

    const pending = getWardrobePending(influencer.id)
    if (!pending) return
    cancelRef.current = false
    setGenerating(true); setProgress(30)
    initSession()
      .then(() => pollAllJobs(pending.jobIds, 1, setProgress, 16, () => cancelRef.current))
      .then(urls => {
        if (!cancelRef.current && urls[0]) {
          const r = { url: urls[0], name: pending.label }
          try { localStorage.setItem(`wd_gen_result_${influencer.id}`, JSON.stringify(r)) } catch {}
          setResult(r); setSaveName(pending.label)
        }
      })
      .catch(e => { if (!cancelRef.current) setError(e.message) })
      .finally(() => { clearWardrobePending(influencer.id); if (!cancelRef.current) { setGenerating(false); setProgress(0) } })
  }, [influencer.id])

  const canGenerate = refImage && !generating && !result && (
    customText.trim() || top.trim() || bottom.trim() || hair.trim()
  )

  function cancelGeneration() {
    cancelRef.current = true
    clearWardrobePending(influencer.id)
    setGenerating(false); setProgress(0)
  }

  async function generate() {
    if (!canGenerate) return
    cancelRef.current = false
    setGenerating(true); setProgress(0); setError(null)
    try {
      const outfitText = [top, bottom].filter(Boolean).join(', ')
      const label = 'Custom Look'
      const prompt = buildWardrobePrompt(influencer, {
        outfit: outfitText, hair,
        customText: customText || null,
      })
      const url = await generateSingleImage({
        prompt, aspectRatio: '16:9', referenceImage: refImage, onProgress: setProgress,
        onJobIds: jobIds => saveWardrobePending(influencer.id, { jobIds, label }),
        isCancelled: () => cancelRef.current,
      })
      clearWardrobePending(influencer.id)
      if (!cancelRef.current && url) {
        const r = { url, name: label }
        try { localStorage.setItem(`wd_gen_result_${influencer.id}`, JSON.stringify(r)) } catch {}
        setResult(r); setSaveName(label)
      }
    } catch (e) {
      clearWardrobePending(influencer.id)
      if (!cancelRef.current && e.message !== 'CANCELLED') setError(e.message)
    } finally {
      if (!cancelRef.current) { setGenerating(false); setProgress(0) }
    }
  }

  function saveToWardrobe() {
    if (!result) return
    onAdd({ id: generateId(), name: saveName.trim() || result.name, image: result.url })
    try { localStorage.removeItem(`wd_gen_result_${influencer.id}`) } catch {}
    setResult(null); setSaveName(''); setTop(''); setBottom(''); setHair(''); setCustomText('')
  }

  function discardResult() {
    try { localStorage.removeItem(`wd_gen_result_${influencer.id}`) } catch {}
    setResult(null); setSaveName('')
  }

  const iS = { padding: '9px 12px', borderRadius: 8, fontSize: 13, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lS = { fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 20 }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Generate Look</div>
      </div>

      {/* Result preview */}
      {result && (<>
        {lightboxOpen && (
          <Lightbox images={[result.url]} startIndex={0} onClose={() => setLightboxOpen(false)} />
        )}
        <div
          onClick={() => setLightboxOpen(true)}
          style={{ position: 'relative', cursor: 'zoom-in', marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}
          onMouseEnter={e => { e.currentTarget.querySelector('img').style.transform = 'scale(1.03)' }}
          onMouseLeave={e => { e.currentTarget.querySelector('img').style.transform = 'scale(1)' }}
        >
          <img src={result.url} alt="" style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover', transition: 'transform 0.3s ease' }} />
          <button
            onClick={e => { e.stopPropagation(); downloadImage(result.url, `${(result.name || 'look').replace(/\s+/g, '-')}.jpg`) }}
            style={{
              position: 'absolute', bottom: 10, right: 10,
              padding: '5px 12px', borderRadius: 980, fontSize: 12, fontWeight: 600,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >↓ Download</button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Ready to save</div>
        <div style={lS}>Name this look</div>
        <input value={saveName} onChange={e => setSaveName(e.target.value)} style={{ ...iS, marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveToWardrobe} style={{
            flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff',
            boxShadow: '0 2px 10px rgba(139,92,246,0.3)',
          }}>Save to Wardrobe</button>
          <button onClick={discardResult} style={{
            padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
          }}>Discard</button>
        </div>
      </>)}

      {/* Generating state */}
      {generating && !result && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Generating look…</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                {progress > 0 ? `${Math.round(progress)}%` : 'Starting…'}
              </span>
              <button onClick={cancelGeneration} style={{
                padding: '3px 10px', borderRadius: 980, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
                border: '1px solid var(--border)',
              }}>Cancel</button>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 980, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max(3, progress)}%`,
              background: 'linear-gradient(90deg,#EC4899,#8B5CF6)',
              borderRadius: 980,
              transition: 'width 0.5s ease',
              boxShadow: '0 0 10px rgba(139,92,246,0.5)',
            }}/>
          </div>
        </div>
      )}

      {/* Form */}
      {!result && !generating && (<>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={lS}>Top</div>
              <input value={top} onChange={e => setTop(e.target.value)} placeholder={influencer.gender === 'Male' ? 'e.g. white oxford shirt' : 'e.g. white crop top'} style={iS} />
            </div>
            <div>
              <div style={lS}>Bottom</div>
              <input value={bottom} onChange={e => setBottom(e.target.value)} placeholder={influencer.gender === 'Male' ? 'e.g. dark chinos' : 'e.g. baggy jeans'} style={iS} />
            </div>
          </div>
          <div>
            <div style={lS}>Hairstyle</div>
            <input value={hair} onChange={e => setHair(e.target.value)} placeholder={influencer.gender === 'Male' ? 'e.g. slicked back, low fade' : 'e.g. sleek low bun'} style={iS} />
          </div>
          <div>
            <div style={lS}>Full look description</div>
            <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="e.g. vintage leather jacket over a white tee, dark slim jeans, white sneakers, hair pushed back naturally" rows={3} style={{ ...iS, resize: 'vertical' }} />
          </div>
        </div>

        {!refImage && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 14, padding: '9px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
            No character sheet — generate one in the Overview tab first.
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#FF3B30', marginTop: 10 }}>{error}</div>}

        <button onClick={generate} disabled={!canGenerate} style={{
          width: '100%', marginTop: 16, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: canGenerate ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--bg-tertiary)',
          color: canGenerate ? '#fff' : 'var(--text-tertiary)',
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          boxShadow: canGenerate ? '0 2px 12px rgba(139,92,246,0.32)' : 'none',
          transition: 'all 0.15s',
        }}>Generate Look</button>
      </>)}
    </div>
  )
}

