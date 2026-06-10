import { useState, useEffect } from 'react'
import { PHOTO_STUDIO_HISTORY_KEY } from '../constants'
import { HistoryCard } from './Media'

export function HistoryTab({ influencer, onUpdate, onReuseSettings }) {
  const [segment, setSegment] = useState('photos')
  const [selected, setSelected] = useState(new Set())

  // Photo Studio — from localStorage, filtered by this influencer
  const [photoEntries, setPhotoEntries] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PHOTO_STUDIO_HISTORY_KEY) || '[]')
        .filter(h => h.influencerId === influencer.id)
    } catch { return [] }
  })

  // Re-read when influencer changes
  useEffect(() => {
    try {
      setPhotoEntries(
        JSON.parse(localStorage.getItem(PHOTO_STUDIO_HISTORY_KEY) || '[]')
          .filter(h => h.influencerId === influencer.id)
      )
    } catch {}
    setSelected(new Set())
  }, [influencer.id])

  // Re-read when PhotoStudio adds a new entry in the same browser tab
  useEffect(() => {
    function onUpdate() {
      try {
        setPhotoEntries(
          JSON.parse(localStorage.getItem(PHOTO_STUDIO_HISTORY_KEY) || '[]')
            .filter(h => h.influencerId === influencer.id)
        )
      } catch {}
    }
    window.addEventListener('photo_studio_history_updated', onUpdate)
    return () => window.removeEventListener('photo_studio_history_updated', onUpdate)
  }, [influencer.id])

  // Content Studio — only videos from generationHistory
  const videoEntries = (influencer.generationHistory || []).filter(e => e.type === 'video')

  const entries = segment === 'photos' ? photoEntries : videoEntries
  const selecting = selected.size > 0

  function toggle(key) {
    setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function deleteEntry(entry) {
    if (segment === 'photos') {
      try {
        const all = JSON.parse(localStorage.getItem(PHOTO_STUDIO_HISTORY_KEY) || '[]')
        const next = all.filter(h => h.url !== entry.url || h.createdAt !== entry.createdAt)
        localStorage.setItem(PHOTO_STUDIO_HISTORY_KEY, JSON.stringify(next))
        setPhotoEntries(next.filter(h => h.influencerId === influencer.id))
      } catch {}
    } else {
      onUpdate({ generationHistory: (influencer.generationHistory || []).filter(e => e.id !== entry.id) })
    }
    setSelected(s => { const n = new Set(s); n.delete(entry.url); return n })
  }

  function deleteSelected() {
    if (segment === 'photos') {
      try {
        const keys = selected
        const all = JSON.parse(localStorage.getItem(PHOTO_STUDIO_HISTORY_KEY) || '[]')
        const next = all.filter(h => !(h.influencerId === influencer.id && keys.has(h.url)))
        localStorage.setItem(PHOTO_STUDIO_HISTORY_KEY, JSON.stringify(next))
        setPhotoEntries(next.filter(h => h.influencerId === influencer.id))
      } catch {}
    } else {
      const keys = selected
      onUpdate({ generationHistory: (influencer.generationHistory || []).filter(e => !keys.has(e.id)) })
    }
    setSelected(new Set())
  }

  async function downloadEntry(entry) {
    const isVideo = entry.type === 'video'
    const ext = isVideo ? 'mp4' : 'jpg'
    const label = entry.label || entry.location || 'photo'
    const filename = `${label.replace(/\s+/g,'-').toLowerCase()}-${Date.now()}.${ext}`
    try {
      const res = await fetch(entry.url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = blobUrl; a.download = filename; a.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } catch {
      const a = document.createElement('a'); a.href = entry.url; a.download = filename; a.target = '_blank'; a.click()
    }
  }

  function downloadSelected() {
    entries.filter(e => selected.has(segment === 'photos' ? e.url : e.id)).forEach(downloadEntry)
  }

  function handleReuse(settings) {
    if (!settings) { onReuseSettings?.(segment); return }
    const key = segment === 'photos' ? `ps_restore_pending_${influencer.id}` : `hf_restore_pending_${influencer.id}`
    try { localStorage.setItem(key, JSON.stringify(settings)) } catch {}
    onReuseSettings?.(segment)
  }

  // Normalise photo entry for HistoryCard
  function normalizePhoto(h, idx) {
    return {
      id: `ps_${h.createdAt}_${idx}`,
      _url_key: h.url,           // used as selection key for photos
      type: 'image',
      label: [h.location, h.timeOfDay].filter(Boolean).join(' · '),
      url: h.url,
      date: h.createdAt,
      aspectRatio: h.aspectRatio,
      settings: h.settings ?? null,
      _raw: h,
    }
  }

  const visibleEntries = segment === 'photos'
    ? photoEntries.map(normalizePhoto)
    : videoEntries

  const total = visibleEntries.length

  return (
    <>
      {/* Segment switcher */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:0,background:'var(--bg-tertiary)',borderRadius:10,padding:3}}>
          {[['photos','📸 Photos'],['videos','🎬 Videos']].map(([s,label])=>(
            <button key={s} onClick={()=>{setSegment(s);setSelected(new Set())}} style={{
              padding:'7px 18px',borderRadius:8,fontSize:13,fontWeight:600,border:'none',cursor:'pointer',fontFamily:'inherit',
              background: segment===s ? 'var(--surface)' : 'transparent',
              color: segment===s ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: segment===s ? '0 1px 6px rgba(0,0,0,0.10),0 0 0 1px var(--border-subtle)' : 'none',
              transition:'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Selection actions */}
        {selecting && (<>
          <span style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginLeft:4}}>{selected.size} selected</span>
          <button onClick={downloadSelected} style={{
            padding:'5px 12px',borderRadius:8,fontSize:12,fontWeight:600,border:'none',cursor:'pointer',fontFamily:'inherit',
            background:'var(--bg-tertiary)',color:'var(--text-secondary)',
          }}>↓ Download</button>
          <button onClick={deleteSelected} style={{
            padding:'5px 12px',borderRadius:8,fontSize:12,fontWeight:600,border:'none',cursor:'pointer',fontFamily:'inherit',
            background:'rgba(255,59,48,0.1)',color:'#FF3B30',
          }}>Delete</button>
          <button onClick={()=>setSelected(new Set())} style={{
            padding:'5px 8px',borderRadius:8,fontSize:12,fontWeight:500,border:'none',cursor:'pointer',fontFamily:'inherit',
            background:'transparent',color:'var(--text-tertiary)',
          }}>Cancel</button>
        </>)}

        <div style={{flex:1}}/>
        <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{total} item{total!==1?'s':''}</span>
      </div>

      {/* Empty state */}
      {total === 0 && (
        <div style={{textAlign:'center',padding:'52px 20px',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:28,marginBottom:10,opacity:0.25}}>{segment==='photos'?'📸':'🎬'}</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-secondary)',marginBottom:5}}>No {segment==='photos'?'photos':'videos'} yet</div>
          <div style={{fontSize:12,lineHeight:1.6}}>
            {segment==='photos'
              ? 'Generate photos in the Photos tab to see them here.'
              : 'Generated videos from the Videos tab appear here.'}
          </div>
        </div>
      )}

      {/* Grid */}
      {total > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(148px,1fr))',gap:10}}>
          {visibleEntries.map(entry => {
            const selKey = segment === 'photos' ? entry._url_key : entry.id
            return (
              <HistoryCard
                key={entry.id}
                entry={entry}
                showSelect={selecting}
                isSelected={selected.has(selKey)}
                onSelect={() => toggle(selKey)}
                onDelete={() => deleteEntry(segment === 'photos' ? entry._raw : entry)}
                onDownload={() => downloadEntry(entry)}
                onReuse={handleReuse}
              />
            )
          })}
        </div>
      )}
    </>
  )
}

