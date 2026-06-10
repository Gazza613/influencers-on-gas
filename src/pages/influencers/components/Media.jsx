import { useState, useRef, useEffect } from 'react'
import { accent, getGlobalMuted, useGlobalMuted } from '../helpers'

// Shared full-screen lightbox — click-to-expand for history cards and strip thumbs
export function MediaLightbox({ entry, onClose, onDownload, onReuse, onDelete, initialTime = 0, autoPlay = false }) {
  const [muted, toggleMute] = useGlobalMuted()
  const videoRef = useRef()
  const isVideo = entry.type === 'video'
  const [playing, setPlaying] = useState(autoPlay)
  const [currentTime, setCurrentTime] = useState(initialTime)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.muted = muted
    videoRef.current.currentTime = initialTime
    if (autoPlay) videoRef.current.play().catch(() => {})
  }, [])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ' && isVideo) { e.preventDefault(); togglePlay() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, playing])

  function togglePlay() {
    if (!videoRef.current) return
    if (videoRef.current.paused) { videoRef.current.play().catch(() => {}); setPlaying(true) }
    else { videoRef.current.pause(); setPlaying(false) }
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2,'0')}`
  }

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'rgba(0,0,0,0.88)', backdropFilter:'blur(14px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <button onClick={onClose} style={{
        position:'fixed', top:20, right:20, width:36, height:36, borderRadius:'50%',
        background:'rgba(255,255,255,0.12)', color:'#fff', fontSize:18,
        border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:1,
      }}>×</button>
      <div onClick={e=>e.stopPropagation()} style={{
        position:'relative', borderRadius:20, overflow:'hidden',
        boxShadow:'0 40px 100px rgba(0,0,0,0.9)',
        background:'#000', maxWidth: isVideo ? 'min(480px, 88vw)' : 'min(680px, 90vw)', maxHeight:'92vh', display:'flex', flexDirection:'column',
      }}>
        {isVideo ? (
          <div style={{position:'relative', cursor:'pointer'}} onClick={togglePlay}>
            <video ref={videoRef} src={entry.url} muted={muted} playsInline
              style={{width:'100%', display:'block'}}
              onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
              onLoadedMetadata={e => setDuration(e.target.duration)}
              onEnded={() => setPlaying(false)}
            />
            {/* Play/pause overlay — only show when paused */}
            {!playing && (
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.25)'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'rgba(0,0,0,0.55)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',border:'1.5px solid rgba(255,255,255,0.2)'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
              </div>
            )}
            {/* Player controls bar */}
            <div onClick={e=>e.stopPropagation()} style={{
              position:'absolute', bottom:0, left:0, right:0,
              background:'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
              padding:'18px 10px 10px',
              display:'flex', flexDirection:'column', gap:5,
            }}>
              {/* Seekbar */}
              <input type="range" min={0} max={duration || 1} step={0.05} value={currentTime}
                onChange={e => { const t = Number(e.target.value); if (videoRef.current) videoRef.current.currentTime = t; setCurrentTime(t) }}
                style={{ width:'100%', accentColor:'#EC4899', cursor:'pointer', height:3 }}
              />
              {/* Controls row */}
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <button onClick={togglePlay} style={{width:28,height:28,borderRadius:'50%',background:'rgba(255,255,255,0.15)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
                  {playing
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  }
                </button>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.7)',fontVariantNumeric:'tabular-nums',flexShrink:0}}>
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
                <div style={{flex:1}}/>
                <button onClick={e=>{e.stopPropagation(); toggleMute()}} style={{width:28,height:28,borderRadius:'50%',background:'rgba(255,255,255,0.15)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
                  {muted
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  }
                </button>
              </div>
            </div>
          </div>
        ) : (
          <img src={entry.url} alt={entry.label}
            style={{width:'100%', display:'block', objectFit:'contain', maxHeight:'80vh'}}/>
        )}
        <div style={{padding:'10px 12px', display:'flex', gap:8, background:'var(--surface)'}}>
          {onDownload && (
            <button onClick={e=>{e.stopPropagation(); onDownload()}} style={{
              flex:1, padding:'9px', borderRadius:10, fontSize:12, fontWeight:700,
              border:'none', cursor:'pointer', fontFamily:'inherit',
              background:'linear-gradient(135deg,#EC4899,#8B5CF6)', color:'#fff',
            }}>Download</button>
          )}
          {onReuse && (
            <button onClick={e=>{e.stopPropagation(); onReuse()}} style={{
              flex:1, padding:'9px', borderRadius:10, fontSize:12, fontWeight:700,
              border:'none', cursor:'pointer', fontFamily:'inherit',
              background:'rgba(139,92,246,0.12)', color:'#8B5CF6',
            }}>↺ Reuse</button>
          )}
          {onDelete && (
            <button onClick={e=>{e.stopPropagation(); onDelete(); onClose()}} style={{
              flex:1, padding:'9px', borderRadius:10, fontSize:12, fontWeight:600,
              border:'none', cursor:'pointer', fontFamily:'inherit',
              background:'rgba(255,59,48,0.08)', color:'#FF3B30',
            }}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Generation history tab
export function HistoryCard({ entry, onDelete, onDownload, isSelected, onSelect, showSelect, onReuse }) {
  const [hovered, setHovered] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [lightboxTime, setLightboxTime] = useState(0)
  const [muted, toggleMute] = useGlobalMuted()
  const videoRef = useRef()
  const isVideo = entry.type === 'video'
  const dateStr = new Date(entry.date).toLocaleDateString([], { month: 'short', day: 'numeric' })

  function openLightbox() {
    const t = videoRef.current ? videoRef.current.currentTime : 0
    if (videoRef.current) videoRef.current.pause()
    setLightboxTime(t)
    setLightbox(true)
  }

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  function handleEnter() {
    setHovered(true)
    if (videoRef.current) {
      videoRef.current.muted = getGlobalMuted()
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }

  function handleLeave() {
    setHovered(false)
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }
  }

  return (
    <>
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={() => openLightbox()}
        style={{
          position:'relative', borderRadius:10, overflow:'hidden', background:'var(--bg-tertiary)',
          outline: isSelected ? '2px solid var(--accent)' : 'none',
          outlineOffset: -2,
          cursor: 'pointer',
          transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s',
          transform: hovered ? 'scale(1.06)' : 'scale(1)',
          boxShadow: hovered ? '0 12px 32px rgba(0,0,0,0.25)' : 'none',
          zIndex: hovered ? 10 : 1,
        }}>
        <div style={{position:'relative', width:'100%', aspectRatio: isVideo ? '9/16' : '3/4', overflow:'hidden'}}>
          {isVideo
            ? <video ref={videoRef} src={entry.url} preload="metadata" muted playsInline
                style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}}/>
            : <img src={entry.url} alt={entry.label}
                style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}}/>
          }
          {isVideo && !hovered && (
            <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.22)', pointerEvents:'none'}}>
              <div style={{width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#EC4899,#8B5CF6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, paddingLeft:3, color:'#fff', boxShadow:'0 2px 10px rgba(139,92,246,0.5)'}}>▶</div>
            </div>
          )}
          {!isVideo && hovered && (
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.28)',pointerEvents:'none',transition:'opacity 0.15s'}}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 10px rgba(139,92,246,0.5)'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </div>
                <button
                  onClick={e=>{e.stopPropagation(); onDownload()}}
                  style={{padding:'3px 10px',borderRadius:980,fontSize:11,fontWeight:600,background:'rgba(0,0,0,0.55)',color:'#fff',border:'1px solid rgba(255,255,255,0.2)',cursor:'pointer',backdropFilter:'blur(4px)',fontFamily:'inherit'}}>
                  ↓ Download
                </button>
              </div>
            </div>
          )}
          {isVideo && hovered && (
            <button onClick={e=>{e.stopPropagation(); toggleMute()}} style={{
              position:'absolute', top:6, right:6, width:26, height:26, borderRadius:'50%',
              background:'rgba(0,0,0,0.58)', backdropFilter:'blur(4px)',
              border:'none', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, cursor:'pointer', color:'#fff',
            }}>{muted
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          }</button>
          )}
          {(hovered || showSelect || isSelected) && (
            <button onClick={e=>{e.stopPropagation(); onSelect()}} style={{
              position:'absolute', top:6, left:6, width:22, height:22, borderRadius:'50%',
              background: isSelected ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
              border: `2px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.5)'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, color:'#fff', fontWeight:700, cursor:'pointer',
              backdropFilter:'blur(4px)',
            }}>{isSelected ? '✓' : ''}</button>
          )}
        </div>
        <div style={{padding:'6px 8px'}}>
          <div style={{fontSize:11, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{entry.label}</div>
          <div style={{fontSize:10, color:'var(--text-tertiary)', marginTop:1}}>{dateStr}</div>
        </div>
      </div>

      {lightbox && (
        <MediaLightbox
          entry={entry}
          onClose={() => setLightbox(false)}
          onDownload={onDownload}
          onReuse={onReuse ? () => onReuse(entry.settings ?? null) : null}
          onDelete={() => { onDelete(); setLightbox(false) }}
          initialTime={lightboxTime}
          autoPlay={isVideo}
        />
      )}
    </>
  )
}


// Module-level tracker — only one strip popup visible at a time
let _clearActiveStripPopup = null

export function VideoStripThumb({ entry, onReuse, onDelete, isSelected, onToggle }) {
  const [hovered, setHovered] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [lightboxTime, setLightboxTime] = useState(0)
  const [muted, toggleMute] = useGlobalMuted()
  const thumbRef = useRef()
  const popupVideoRef = useRef()
  const leaveTimer = useRef()
  const [popup, setPopup] = useState(null)

  function openLightbox() {
    const t = popupVideoRef.current ? popupVideoRef.current.currentTime : 0
    if (popupVideoRef.current) popupVideoRef.current.pause()
    setLightboxTime(t)
    setLightbox(true)
  }

  useEffect(() => {
    if (popupVideoRef.current) popupVideoRef.current.muted = muted
  }, [muted])

  useEffect(() => {
    if (popup && popupVideoRef.current) {
      popupVideoRef.current.muted = getGlobalMuted()
      popupVideoRef.current.play().catch(() => {})
    }
  }, [!!popup])

  async function download(e) {
    if (e) e.stopPropagation()
    const filename = `video-${new Date(entry.date).toISOString().slice(0,10)}.mp4`
    try {
      const res = await fetch(entry.url); const blob = await res.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
    } catch { const a = document.createElement('a'); a.href = entry.url; a.download = filename; a.target='_blank'; a.click() }
  }

  function clearPopup() {
    clearTimeout(leaveTimer.current)
    setHovered(false)
    setPopup(null)
    if (popupVideoRef.current) popupVideoRef.current.pause()
  }

  function handleEnter() {
    clearTimeout(leaveTimer.current)
    // Instantly dismiss any other open strip popup
    if (_clearActiveStripPopup) { _clearActiveStripPopup(); _clearActiveStripPopup = null }
    _clearActiveStripPopup = clearPopup
    setHovered(true)
    if (!thumbRef.current) return
    const r = thumbRef.current.getBoundingClientRect()
    const popW = 200
    const left = Math.max(8, Math.min(r.left + r.width / 2 - popW / 2, window.innerWidth - popW - 8))
    const popH = popW * 16 / 9 + 80
    const top = r.top > popH + 12 ? r.top - popH - 6 : r.bottom + 6
    setPopup({ left, top, width: popW })
  }

  function handleLeave() {
    leaveTimer.current = setTimeout(() => {
      clearPopup()
      if (_clearActiveStripPopup === clearPopup) _clearActiveStripPopup = null
    }, 200)
  }

  return (
    <>
      <div ref={thumbRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}
        onClick={e => { if (onToggle) { onToggle(); } else { openLightbox() } }}
        onDoubleClick={() => openLightbox()}
        style={{ flexShrink:0, width:60, borderRadius:9, overflow:'hidden', cursor:'pointer', position:'relative',
          outline: isSelected ? '2.5px solid #8B5CF6' : hovered ? '2px solid rgba(139,92,246,0.4)' : '2px solid transparent',
        }}>
        {isSelected && (
          <div style={{position:'absolute',top:4,left:4,zIndex:2,width:16,height:16,borderRadius:'50%',background:'#8B5CF6',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.4)'}}>
            <svg width="9" height="9" viewBox="0 0 10 8" fill="none"><polyline points="1,4 4,7 9,1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        )}
        <video src={entry.url} preload="metadata" muted playsInline style={{width:'100%',height:90,objectFit:'cover',display:'block'}}/>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background: isSelected ? 'rgba(139,92,246,0.18)' : 'rgba(0,0,0,0.18)'}}>
          <div style={{width:22,height:22,borderRadius:'50%',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,paddingLeft:2,color:'#fff',boxShadow:'0 2px 8px rgba(139,92,246,0.45)'}}>▶</div>
        </div>
        <div style={{padding:'4px 6px',fontSize:9,color:'var(--text-tertiary)',fontWeight:500,background:'var(--surface)'}}>
          {new Date(entry.date).toLocaleDateString([],{month:'short',day:'numeric'})}
        </div>
      </div>

      {popup && (
        <div
          onMouseEnter={()=>{ clearTimeout(leaveTimer.current); setHovered(true) }}
          onMouseLeave={handleLeave}
          onClick={() => openLightbox()}
          style={{
            position:'fixed', zIndex:9998,
            left:popup.left, top:popup.top, width:popup.width,
            borderRadius:16, overflow:'hidden',
            boxShadow:'0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
            background:'var(--surface)', cursor:'pointer',
          }}>
          <div style={{position:'relative'}}>
            <video ref={popupVideoRef} src={entry.url} muted playsInline
              style={{width:'100%', display:'block', background:'#000'}}/>
            <button onClick={e=>{e.stopPropagation(); toggleMute()}} style={{
              position:'absolute', top:8, right:8, width:28, height:28, borderRadius:'50%',
              background:'rgba(0,0,0,0.58)', backdropFilter:'blur(4px)',
              border:'none', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, cursor:'pointer', color:'#fff',
            }}>{muted
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          }</button>
          </div>
          <div style={{padding:'7px 8px', display:'flex', gap:5}}>
            <button onClick={download} title="Download" style={{flex:1,padding:'6px 0',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',fontFamily:'inherit',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff'}}>↓</button>
            {onReuse && (
              <button onClick={e=>{e.stopPropagation(); onReuse(entry); clearPopup(); if(_clearActiveStripPopup===clearPopup) _clearActiveStripPopup=null}} title="Reuse settings" style={{flex:1,padding:'6px 0',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',fontFamily:'inherit',background:'rgba(139,92,246,0.12)',color:'#8B5CF6'}}>↺</button>
            )}
            {onDelete && (
              <button onClick={e=>{e.stopPropagation(); onDelete(); clearPopup(); if(_clearActiveStripPopup===clearPopup) _clearActiveStripPopup=null}} title="Delete" style={{flex:1,padding:'6px 0',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',fontFamily:'inherit',background:'rgba(255,59,48,0.08)',color:'#FF3B30'}}>×</button>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <MediaLightbox
          entry={{...entry, type:'video'}}
          onClose={() => setLightbox(false)}
          onDownload={download}
          onReuse={onReuse ? () => { onReuse(entry); setLightbox(false) } : null}
          onDelete={onDelete ? () => { onDelete(); setLightbox(false) } : null}
          initialTime={lightboxTime}
          autoPlay
        />
      )}
    </>
  )
}

