import { useState, useRef, useEffect } from 'react'
import { generateSingleImage, generateThreeImages, initSession, pollAllJobs, getPendingGens, clearPendingGen } from '../../../utils/higgsfieldGenerate'
import { compressImage, downloadImage } from '../../../utils/imageUtils'
import { gColor } from '../../../utils/influencerUtils'
import { buildThreeVariationPrompts } from '../../../utils/systemPrompt'
import { GM, SHEET_RATIOS } from '../constants'
import { accent, useMobile } from '../helpers'
import { buildCharacterSheetPrompt, buildCloseUpPrompt } from '../prompts'
import { getCreationParams, getGenParams, saveGenParams } from '../storage'
import { GenLoadingOverlay } from './common'

// ─────────────────────────────────────────────
// Hero banner — clean profile card
export function HeroBanner({ influencer, onDelete, pct, onUpdate }) {
  const ac = accent(influencer)
  const gc = gColor(influencer.gender)
  const r = 33, c = 2*Math.PI*r, off = c*(1-pct/100)
  const ringColor = pct>=80?'#34C759':pct>=50?'#F97316':'#0071E3'
  const isMobile = useMobile()
  const [editingTag, setEditingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState(influencer.tag || '')

  return (
    <div style={{
      background:'var(--surface)',
      borderRadius:16,
      border:'1px solid var(--border-subtle)',
      boxShadow:'var(--shadow-sm)',
      overflow:'hidden',
      flexShrink:0,
    }}>
      {/* Accent stripe */}
      <div style={{height:3,background:`linear-gradient(to right, ${ac}, ${ac}55, transparent)`}}/>

      <div style={{padding:isMobile?'14px 16px':'18px 22px',display:'flex',alignItems:'center',gap:isMobile?12:18,flexWrap:isMobile?'wrap':'nowrap'}}>
        {/* Avatar + completion ring */}
        <div style={{position:'relative',width:74,height:74,flexShrink:0}}>
          <svg width={74} height={74} style={{position:'absolute',top:0,left:0,pointerEvents:'none'}}>
            <circle cx={37} cy={37} r={r} fill="none" stroke="var(--border)" strokeWidth={2.5}/>
            <circle cx={37} cy={37} r={r} fill="none" stroke={ringColor} strokeWidth={2.5}
              strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
              transform="rotate(-90 37 37)"
              style={{transition:'stroke-dashoffset 0.5s,stroke 0.3s'}}/>
          </svg>
          <div style={{
            position:'absolute',top:5,left:5,width:64,height:64,
            borderRadius: influencer.mainImage ? '50%' : 14,
            overflow:'hidden',
            background:`${ac}1A`,
            display:'flex',alignItems:'center',justifyContent:'center',
            transition:'border-radius 0.2s',
          }}>
            {influencer.mainImage
              ?<img src={influencer.mainImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              :<span style={{fontSize:24,fontWeight:800,color:ac,letterSpacing:'-1px'}}>
                {influencer.name[0]?.toUpperCase()}
              </span>
            }
          </div>
        </div>

        {/* Name + meta */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,flexWrap:'wrap'}}>
            <div style={{fontSize:22,fontWeight:800,letterSpacing:'-0.5px',color:'var(--text-primary)',lineHeight:1.2}}>
              {influencer.name}
            </div>
            {editingTag ? (
              <input
                autoFocus
                value={tagDraft}
                onChange={e=>setTagDraft(e.target.value)}
                onBlur={()=>{setEditingTag(false);onUpdate({tag:tagDraft.trim()})}}
                onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape'){setEditingTag(false);onUpdate({tag:tagDraft.trim()})}}}
                placeholder="Add title…"
                style={{fontSize:12,fontWeight:600,padding:'3px 10px',borderRadius:20,border:'1.5px solid rgba(139,92,246,0.5)',background:'rgba(139,92,246,0.07)',color:'#8B5CF6',outline:'none',fontFamily:'inherit',width:140}}
              />
            ) : (
              <button
                onClick={()=>{setTagDraft(influencer.tag||'');setEditingTag(true)}}
                style={{fontSize:12,fontWeight:600,padding:'3px 10px',borderRadius:20,
                  border:`1.5px solid ${influencer.tag?'rgba(139,92,246,0.35)':'var(--border)'}`,
                  background:influencer.tag?'rgba(139,92,246,0.07)':'transparent',
                  color:influencer.tag?'#8B5CF6':'var(--text-tertiary)',
                  cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',
                }}
              >{influencer.tag || '+ Add title'}</button>
            )}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            {influencer.gender&&(
              <span style={{
                fontSize:12,fontWeight:600,color:gc,
                background:`${gc}14`,padding:'3px 10px',borderRadius:20,
              }}>{GM[influencer.gender]?.icon} {influencer.gender}</span>
            )}
            {influencer.niche&&influencer.niche!=='Other'&&(
              <span style={{fontSize:12,color:'var(--text-secondary)',background:'var(--bg-tertiary)',padding:'3px 10px',borderRadius:20}}>
                {influencer.niche}
              </span>
            )}
            {influencer.age&&(
              <span style={{fontSize:12,color:'var(--text-tertiary)'}}>Age {influencer.age}</span>
            )}
          </div>
          <div style={{marginTop:8,fontSize:11,color:'var(--text-tertiary)',fontWeight:500,display:'flex',alignItems:'center',gap:5}}>
            <span style={{color:ringColor,fontWeight:700}}>{pct}%</span>
            <span>profile complete</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{display:'flex',gap:8,flexShrink:0,marginLeft:isMobile?'auto':0}}>
          <button onClick={onDelete} style={{
            padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:600,
            background:'rgba(255,59,48,0.08)',color:'#FF3B30',border:'1.5px solid rgba(255,59,48,0.2)',
            transition:'background 0.15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,59,48,0.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,59,48,0.08)'}}
          >Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Character sheet slot with inline generation

export function CharacterSheetSlot({ influencer, onSave, onLightbox }) {
  const [open, setOpen] = useState(false)
  const [ratio, setRatio] = useState('16:9')
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState(null)
  const [hovered, setHovered] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const cancelRef = useRef(false)
  const value = influencer.characterSheetImage

  function handleFileDrop(file) {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(v => { onSave(v); setOpen(false) }).catch(console.error)
    r.readAsDataURL(file)
  }

  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  // Resume any in-progress job that survived a page reload
  useEffect(() => {
    const job = getPendingGens().find(j => j.influencerId === influencer.id && j.slot === 'characterSheetImage')
    if (!job) { setLoading(false); return }
    const secondsIn = Math.floor((Date.now() - job.startedAt) / 1000)
    setElapsed(secondsIn)
    setLoading(true)
    initSession()
      .then(() => pollAllJobs(job.jobIds, 1, () => {}, 16))
      .then(urls => {
        if (urls[0]) { onSave(urls[0]); setOpen(false) }
        else setErr('No image returned — please try again')
      })
      .catch(e => setErr(e.message || 'Resumed generation failed'))
      .finally(() => { clearPendingGen(influencer.id, 'characterSheetImage'); setLoading(false) })
  }, [influencer.id]) // eslint-disable-line

  function cancelGeneration() {
    cancelRef.current = true
    clearPendingGen(influencer.id, 'characterSheetImage')
    setLoading(false); setElapsed(0)
  }

  async function generate(storedParams = null) {
    if (!influencer.mainImage) { setErr('Upload a main image first — used as the face reference.'); return }
    cancelRef.current = false
    setLoading(true); setErr(null)
    const prompt = storedParams?.prompt ?? buildCharacterSheetPrompt(influencer)
    const ar     = storedParams?.aspectRatio ?? ratio
    try {
      const url = await generateSingleImage({
        prompt, aspectRatio: ar, referenceImage: influencer.mainImage, onProgress: () => {},
        pendingKey: { influencerId: influencer.id, slot: 'characterSheetImage' },
        isCancelled: () => cancelRef.current,
      })
      if (cancelRef.current) return
      if (url) {
        saveGenParams(influencer.id, 'characterSheetImage', { prompt, aspectRatio: ar, usedReference: true })
        onSave(url); setOpen(false)
      } else setErr('No image returned — please try again')
    } catch(e) { if (!cancelRef.current) setErr(e.message || 'Generation failed') }
    finally { if (!cancelRef.current) setLoading(false) }
  }

  function regenerate() {
    const stored = getGenParams(influencer.id, 'characterSheetImage')
    generate(stored)
  }

  return (
    <div>
      {/* Image slot */}
      <div style={{position:'relative',width:'100%',aspectRatio:'3/4',borderRadius:10,overflow:'hidden',
        boxShadow: dragOver ? '0 0 0 2px #8B5CF6, 0 0 18px rgba(139,92,246,0.35)' : loading ? '0 0 0 1.5px rgba(139,92,246,0.5), 0 0 18px rgba(139,92,246,0.18)' : 'none',
        transition:'box-shadow 0.3s',
      }}
        onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFileDrop(e.dataTransfer.files[0]) }}>
        {loading && <GenLoadingOverlay elapsed={elapsed} onCancel={cancelGeneration}/>}
        {value ? (
          <>
            <img src={value} alt="Character sheet" onClick={onLightbox} style={{width:'100%',height:'100%',objectFit:'contain',borderRadius:10,cursor:'zoom-in',display:'block',background:'var(--bg-tertiary)'}}/>

            {/* Delete — top right on hover */}
            <button onClick={()=>onSave(null)} style={{
              position:'absolute',top:7,right:7,width:22,height:22,borderRadius:'50%',
              background:'rgba(0,0,0,0.45)',color:'#fff',fontSize:12,
              display:'flex',alignItems:'center',justifyContent:'center',
              backdropFilter:'blur(4px)',border:'1px solid rgba(255,255,255,0.12)',
              opacity: hovered ? 1 : 0, transition:'opacity 0.15s',
            }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(220,50,50,0.85)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0.45)'}}>×</button>

            {/* Hover action bar — bottom: Generate + Replace + Download */}
            <div style={{
              position:'absolute',bottom:0,left:0,right:0,
              padding:'28px 8px 8px',
              background:'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
              display:'flex',gap:5,
              opacity: hovered ? 1 : 0, transition:'opacity 0.2s',
            }}>
              <button onClick={regenerate} disabled={loading} style={{
                flex:1.4,padding:'6px 0',borderRadius:7,fontSize:11,fontWeight:700,
                background:'linear-gradient(135deg,rgba(236,72,153,0.7),rgba(139,92,246,0.7))',color:'#fff',
                backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.18)',
                transition:'opacity 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.opacity='0.82'}}
                onMouseLeave={e=>{e.currentTarget.style.opacity='1'}}>{loading?'···':'Regenerate'}</button>
              <button onClick={()=>fileRef.current.click()} style={{
                flex:1,padding:'6px 0',borderRadius:7,fontSize:11,fontWeight:600,
                background:'rgba(255,255,255,0.15)',color:'#fff',
                backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.18)',
                transition:'background 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.25)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.15)'}}>Replace</button>
              <button onClick={e=>{e.stopPropagation();downloadImage(value,`${influencer.name||'character'}-sheet.jpg`)}} style={{
                flex:0.6,padding:'6px 0',borderRadius:7,fontSize:11,fontWeight:600,
                background:'rgba(255,255,255,0.15)',color:'#fff',
                backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.18)',
                transition:'background 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.25)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.15)'}}>↓</button>
            </div>
          </>
        ) : (
          <div style={{width:'100%',height:'100%',borderRadius:10,border:'1.5px dashed var(--border)',background:'var(--bg-tertiary)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
            <span style={{fontSize:20,opacity:0.22}}>+</span>
            <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:500}}>Character sheet</span>
            {/* Generate Sheet — inside slot at bottom */}
            <button onClick={e=>{e.stopPropagation();setOpen(o=>!o)}} style={{
              position:'absolute',bottom:10,left:10,right:10,
              padding:'7px 0',borderRadius:8,fontSize:11,fontWeight:700,
              background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',
              boxShadow:'0 2px 10px rgba(139,92,246,0.28)',transition:'opacity 0.15s',
            }}
              onMouseEnter={e=>{e.currentTarget.style.opacity='0.85'}}
              onMouseLeave={e=>{e.currentTarget.style.opacity='1'}}>Generate Sheet</button>
          </div>
        )}
        {/* Sliding progress bar */}
        {loading && (
          <div style={{
            position:'absolute', bottom:0, left:0, right:0, height:2, zIndex:10,
            backgroundImage:'linear-gradient(90deg, transparent, #EC4899, #8B5CF6, transparent)',
            backgroundSize:'300% 100%',
            animation:'progress-slide 1.6s linear infinite',
          }}/>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>compressImage(ev.target.result).then(onSave).catch(console.error);r.readAsDataURL(f);e.target.value=''}}/>
      </div>

      {/* Inline panel */}
      {open && (
        <div style={{marginTop:8,padding:'12px 14px',borderRadius:10,background:'var(--surface)',border:'1.5px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          {/* Ratio picker — hidden during generation */}
          {!loading && <div>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>Aspect Ratio</div>
            <div style={{display:'flex',gap:6}}>
              {SHEET_RATIOS.map(r=>(
                <button key={r.id} onClick={()=>setRatio(r.id)} style={{
                  flex:1,padding:'6px 4px',borderRadius:7,fontSize:11,fontWeight:600,
                  border:`1.5px solid ${ratio===r.id?'#8B5CF6':'var(--border)'}`,
                  background:ratio===r.id?'rgba(139,92,246,0.1)':'var(--bg)',
                  color:ratio===r.id?'#8B5CF6':'var(--text-secondary)',
                  display:'flex',flexDirection:'column',alignItems:'center',gap:1,
                }}>
                  <span>{r.label}</span>
                  <span style={{fontSize:9,fontWeight:500,opacity:0.7}}>{r.rec?'✦ '+r.sub:r.sub}</span>
                </button>
              ))}
            </div>
          </div>}

          {err && <div style={{fontSize:11,color:'#FF3B30',lineHeight:1.4}}>{err}</div>}

          <button onClick={generate} disabled={loading} style={{
            padding:'9px 0',borderRadius:8,fontSize:13,fontWeight:700,
            background:loading?'var(--bg-tertiary)':'linear-gradient(135deg,#EC4899,#8B5CF6)',
            color:loading?'var(--text-tertiary)':'#fff',
            boxShadow:loading?'none':'0 2px 12px rgba(139,92,246,0.3)',
            transition:'all 0.15s',
          }}>
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Close-up slot with inline generation
export function CloseUpSlot({ influencer, imageKey, label, onSave, onLightbox, promptFn = buildCloseUpPrompt, genAspectRatio = '4:5', fit = 'cover' }) {
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState(null)
  const [hovered, setHovered] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const cancelRef = useRef(false)
  const value = influencer[imageKey]

  function handleFileDrop(file) {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(onSave).catch(console.error)
    r.readAsDataURL(file)
  }

  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  // Resume any in-progress job that survived a page reload
  useEffect(() => {
    const job = getPendingGens().find(j => j.influencerId === influencer.id && j.slot === imageKey)
    if (!job) { setLoading(false); return }
    const secondsIn = Math.floor((Date.now() - job.startedAt) / 1000)
    setElapsed(secondsIn)
    setLoading(true)
    initSession()
      .then(() => pollAllJobs(job.jobIds, 1, () => {}, 16))
      .then(urls => {
        if (urls[0]) onSave(urls[0])
        else setErr('No image returned — please try again')
      })
      .catch(e => setErr(e.message || 'Resumed generation failed'))
      .finally(() => { clearPendingGen(influencer.id, imageKey); setLoading(false) })
  }, [influencer.id, imageKey]) // eslint-disable-line

  function cancelGeneration() {
    cancelRef.current = true
    clearPendingGen(influencer.id, imageKey)
    setLoading(false); setElapsed(0)
  }

  async function generate(storedParams = null) {
    if (!influencer.mainImage) { setErr('Upload a main image first.'); return }
    cancelRef.current = false
    setLoading(true); setErr(null)
    const prompt = storedParams?.prompt ?? promptFn(influencer)
    const ar     = storedParams?.aspectRatio ?? genAspectRatio
    try {
      const url = await generateSingleImage({
        prompt, aspectRatio: ar,
        referenceImage: influencer.mainImage,
        onProgress: () => {},
        pendingKey: { influencerId: influencer.id, slot: imageKey },
        isCancelled: () => cancelRef.current,
      })
      if (cancelRef.current) return
      if (url) {
        saveGenParams(influencer.id, imageKey, { prompt, aspectRatio: ar, usedReference: true })
        onSave(url)
      } else setErr('No image returned — please try again')
    } catch(e) { if (!cancelRef.current) setErr(e.message || 'Generation failed') }
    finally { if (!cancelRef.current) setLoading(false) }
  }

  function regenerate() {
    const stored = getGenParams(influencer.id, imageKey)
    generate(stored)
  }

  return (
    <div>
      <div
        style={{
          position:'relative', width:'100%', aspectRatio:'3/2', borderRadius:10, overflow:'hidden',
          boxShadow: dragOver ? '0 0 0 2px #8B5CF6, 0 0 18px rgba(139,92,246,0.35)' : loading ? '0 0 0 1.5px rgba(139,92,246,0.5), 0 0 18px rgba(139,92,246,0.18)' : 'none',
          transition:'box-shadow 0.3s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFileDrop(e.dataTransfer.files[0]) }}
      >
        {loading && <GenLoadingOverlay elapsed={elapsed} onCancel={cancelGeneration} maxLabel="6 min"/>}
        {value ? (
          <>
            <img
              src={value} alt={label} onClick={onLightbox}
              style={{ width:'100%', height:'100%', objectFit:fit, borderRadius:10, cursor:'zoom-in', display:'block', background:'var(--bg-tertiary)' }}
            />
            {/* Hover action bar — bottom: Generate + Replace + ↓ */}
            <div style={{
              position:'absolute', bottom:0, left:0, right:0,
              padding:'28px 8px 8px',
              background:'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
              display:'flex', gap:5,
              opacity: hovered ? 1 : 0, transition:'opacity 0.2s',
            }}>
              <button
                onClick={regenerate} disabled={loading}
                style={{
                  flex:1.4, padding:'5px 0', borderRadius:6, fontSize:10, fontWeight:700,
                  background: loading ? 'rgba(0,0,0,0.45)' : 'linear-gradient(135deg,rgba(236,72,153,0.7),rgba(139,92,246,0.7))',
                  color:'#fff', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.18)',
                  transition:'opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.82' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >{loading ? '···' : 'Regenerate'}</button>
              <button
                onClick={() => fileRef.current.click()}
                style={{
                  flex:1, padding:'5px 0', borderRadius:6, fontSize:10, fontWeight:600,
                  background:'rgba(255,255,255,0.15)', color:'#fff',
                  backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,0.18)',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
              >Replace</button>
              <button
                onClick={e => { e.stopPropagation(); downloadImage(value, `${influencer.name || 'closeup'}-${label}.jpg`) }}
                style={{
                  flex:0.6, padding:'5px 0', borderRadius:6, fontSize:10, fontWeight:600,
                  background:'rgba(255,255,255,0.15)', color:'#fff',
                  backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,0.18)',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
              >↓</button>
            </div>
          </>
        ) : (
          <div style={{
            width:'100%', height:'100%', borderRadius:10,
            border:'1.5px dashed var(--border)', background:'var(--bg-tertiary)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:6,
          }}>
            <span style={{ fontSize:18, opacity:0.22 }}>+</span>
            <span style={{ fontSize:11, color:'var(--text-tertiary)', fontWeight:500 }}>{label}</span>
            {/* Generate — inside slot at bottom */}
            <button
              onClick={e => { e.stopPropagation(); generate() }}
              disabled={loading}
              style={{
                position:'absolute', bottom:8, left:8, right:8,
                padding:'6px 0', borderRadius:7, fontSize:11, fontWeight:700,
                background: loading ? 'var(--bg-tertiary)' : 'linear-gradient(135deg,#EC4899,#8B5CF6)',
                color: loading ? 'var(--text-tertiary)' : '#fff',
                boxShadow: loading ? 'none' : '0 2px 10px rgba(139,92,246,0.28)',
                transition:'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >{loading ? '···' : 'Generate'}</button>
          </div>
        )}
        {/* Sliding progress bar */}
        {loading && (
          <div style={{
            position:'absolute', bottom:0, left:0, right:0, height:2, zIndex:10,
            backgroundImage:'linear-gradient(90deg, transparent, #EC4899, #8B5CF6, transparent)',
            backgroundSize:'300% 100%',
            animation:'progress-slide 1.6s linear infinite',
          }}/>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => {
            const f = e.target.files[0]; if (!f) return
            const r = new FileReader()
            r.onload = ev => compressImage(ev.target.result).then(onSave).catch(console.error)
            r.readAsDataURL(f); e.target.value = ''
          }}/>
      </div>
      {err && <div style={{ fontSize:11, color:'#FF3B30', marginTop:5, lineHeight:1.4 }}>{err}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main image slot with hover bar (Replace / Download)
export function MainImageSlot({ influencer, onChange, onLightbox }) {
  const fileRef = useRef()
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const value = influencer.mainImage

  function handleFileDrop(file) {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(onChange).catch(console.error)
    r.readAsDataURL(file)
  }

  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  async function regenerate() {
    const params = getCreationParams(influencer.id)
    if (!params) {
      alert('No creation data found — this influencer was created before regeneration was supported. Try replacing the image manually.')
      return
    }
    setLoading(true)
    try {
      const prompts = buildThreeVariationPrompts(
        { ...params, name: influencer.name },
        params.aspectRatio || '9:16',
        params.model || 'gpt_image_2'
      )
      const onePrompt = prompts[Math.floor(Math.random() * prompts.length)]
      const urls = await generateThreeImages({
        prompts: [onePrompt],
        aspectRatio: params.aspectRatio || '9:16',
        model: params.model || 'gpt_image_2',
        faceRef: params.faceRef || null,
        styleRef: params.styleRef || null,
        physicalDesc: params.physicalDesc || '',
        faceRefNote: params.faceRefNote || '',
        styleRefNote: params.styleRefNote || '',
        onProgress: () => {},
      })
      if (urls[0]) onChange(urls[0])
      else alert('No image returned — please try again')
    } catch (e) {
      alert('Regeneration failed: ' + (e.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div
        style={{
          position: 'relative', width: '100%', aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
          boxShadow: dragOver ? '0 0 0 2px #8B5CF6, 0 0 18px rgba(139,92,246,0.35)' : loading ? '0 0 0 1.5px rgba(139,92,246,0.5), 0 0 18px rgba(139,92,246,0.18)' : 'none',
          transition: 'box-shadow 0.3s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFileDrop(e.dataTransfer.files[0]) }}
      >
        {loading && <GenLoadingOverlay elapsed={elapsed} maxLabel="5 min 30 sec" />}
        {value ? (
          <>
            <img src={value} alt="Main image" onClick={onLightbox}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in', display: 'block' }} />
            {/* Delete — top right on hover */}
            <button onClick={() => onChange(null)} style={{
              position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.12)',
              opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.85)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.45)' }}>×</button>
            {/* Hover action bar — Regenerate + Replace + Download */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '28px 8px 8px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
              display: 'flex', gap: 5,
              opacity: hovered ? 1 : 0, transition: 'opacity 0.2s',
            }}>
              <button onClick={regenerate} disabled={loading} style={{
                flex: 1.4, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 700,
                background: 'linear-gradient(135deg,rgba(236,72,153,0.7),rgba(139,92,246,0.7))', color: '#fff',
                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)',
                transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.82' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>{loading ? '···' : 'Regenerate'}</button>
              <button onClick={() => fileRef.current.click()} style={{
                flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>Replace</button>
              <button onClick={e => { e.stopPropagation(); downloadImage(value, `${influencer.name || 'main'}-image.jpg`) }} style={{
                flex: 0.6, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>↓</button>
            </div>
            {loading && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, zIndex: 10,
                backgroundImage: 'linear-gradient(90deg, transparent, #EC4899, #8B5CF6, transparent)',
                backgroundSize: '300% 100%',
                animation: 'progress-slide 1.6s linear infinite',
              }} />
            )}
          </>
        ) : (
          <div onClick={() => fileRef.current.click()} style={{
            width: '100%', height: '100%', borderRadius: 10,
            border: '1.5px dashed var(--border)', background: 'var(--bg-tertiary)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', gap: 5, transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <span style={{ fontSize: 20, opacity: 0.22 }}>+</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>Main image</span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files[0]; if (!f) return
            const r = new FileReader()
            r.onload = ev => compressImage(ev.target.result).then(onChange).catch(console.error)
            r.readAsDataURL(f); e.target.value = ''
          }} />
      </div>
    </div>
  )
}

