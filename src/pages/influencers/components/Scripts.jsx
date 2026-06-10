import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { generateId } from '../../../store'
import { SCRIPT_STATUSES, SCRIPT_STATUS_STYLE } from '../constants'
import { accent } from '../helpers'

// ─────────────────────────────────────────────
// Scripts section

export function SaveScriptModal({ onSave, onClose }) {
  const [title, setTitle] = useState('')

  function commit() {
    onSave({ title: title.trim() || 'Untitled' })
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:20,padding:28,width:400,maxWidth:'90vw',boxShadow:'var(--shadow-lg)'}}>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.4px',marginBottom:4}}>Save script</div>
        <div style={{fontSize:13,color:'var(--text-tertiary)',marginBottom:18}}>Give this video a title to find it easily in Scripts.</div>

        <input
          autoFocus value={title} onChange={e=>setTitle(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')onClose()}}
          placeholder="e.g. Product reveal, Morning routine…"
          style={{
            width:'100%',padding:'11px 14px',borderRadius:10,marginBottom:24,
            border:'1.5px solid var(--border)',background:'var(--bg)',
            fontSize:14,color:'var(--text-primary)',boxSizing:'border-box',
          }}
        />

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:'11px',borderRadius:10,border:'1.5px solid var(--border)',fontSize:14,fontWeight:500,color:'var(--text-secondary)',background:'transparent'}}>Cancel</button>
          <button onClick={commit} style={{flex:2,padding:'11px',borderRadius:10,fontSize:14,fontWeight:700,background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',border:'none',boxShadow:'0 2px 12px rgba(139,92,246,0.3)'}}>Save Script</button>
        </div>
      </div>
    </div>
  )
}

export function ScriptsSection({ scripts=[], influencerPrompt='', onChange, initialExpanded=null }) {
  const [selectedId, setSelectedId] = useState(initialExpanded)
  const [copied, setCopied] = useState(null)
  const [vidLightbox, setVidLightbox] = useState(null)
  const [hoveredRef, setHoveredRef] = useState(null) // { ref, rect }
  const drawerRef = useRef()
  const listRef = useRef()

  // Drawer resize
  const drawerWidthRef = useRef(Number(localStorage.getItem('scripts_drawer_width')) || 440)
  const [drawerWidth, setDrawerWidth] = useState(drawerWidthRef.current)
  const isDrawerDragging = useRef(false)
  const drawerDragStartX = useRef(0)
  const drawerDragStartW = useRef(0)

  useEffect(() => {
    function onMove(e) {
      if (!isDrawerDragging.current) return
      // dragging left edge: moving mouse left = wider drawer
      const delta = drawerDragStartX.current - e.clientX
      const w = Math.max(320, Math.min(860, drawerDragStartW.current + delta))
      drawerWidthRef.current = w
      if (drawerRef.current) drawerRef.current.style.width = w + 'px'
    }
    function onUp() {
      if (!isDrawerDragging.current) return
      isDrawerDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDrawerWidth(drawerWidthRef.current)
      localStorage.setItem('scripts_drawer_width', String(Math.round(drawerWidthRef.current)))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const selected = scripts.find(s => s.id === selectedId) || null

  useEffect(() => {
    if (!selectedId) return
    function handleClick(e) {
      if (drawerRef.current?.contains(e.target)) return
      if (listRef.current?.contains(e.target)) return
      // Don't close drawer when clicking inside a portal (lightbox, etc.)
      if (e.target.closest('[data-portal]')) return
      setSelectedId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [selectedId])

  // Clear lightbox whenever selected script changes
  useEffect(() => { setVidLightbox(null) }, [selectedId])

  function add() {
    const s = { id:generateId(), title:`Script ${scripts.length+1}`, status:'Unposted', prompt:'', script:'', videoUrls:[], postedUrl:'', createdAt: Date.now() }
    onChange([s, ...scripts])
    setSelectedId(s.id)
  }
  function upd(id, k, v) { onChange(scripts.map(s => s.id===id ? {...s,[k]:v} : s)) }
  function del(id) {
    if (!window.confirm('Delete this script?')) return
    onChange(scripts.filter(s => s.id !== id))
    setSelectedId(null)
  }
  function copy(text, key) {
    navigator.clipboard.writeText(text).catch(()=>{})
    setCopied(key); setTimeout(()=>setCopied(null), 1600)
  }
  function getUrls(s) {
    if (Array.isArray(s.videoUrls)) return s.videoUrls
    if (s.videoUrl) return [s.videoUrl]
    return []
  }
  function setUrl(s, vi, val) {
    const cur = getUrls(s); const urls = [...cur]
    while (urls.length <= vi) urls.push('')
    urls[vi] = val
    upd(s.id, 'videoUrls', urls)
  }
  function fmtDate(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric' })
  }

  return (
    <div style={{position:'relative'}}>
      <style>{`@keyframes drawerIn{from{transform:translateX(32px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{fontSize:13,color:'var(--text-tertiary)',fontWeight:500}}>
          {scripts.length} script{scripts.length!==1?'s':''}
        </div>
        <button onClick={add} style={{
          padding:'7px 16px',borderRadius:980,
          background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',
          fontSize:12,fontWeight:700,display:'flex',alignItems:'center',gap:5,
          boxShadow:'0 2px 10px rgba(139,92,246,0.3)',
        }}>+ New Script</button>
      </div>

      {/* ── Empty state ── */}
      {scripts.length===0 && (
        <div style={{textAlign:'center',padding:'52px 0',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:36,marginBottom:10,opacity:.2}}>🎬</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>No scripts yet</div>
          <div style={{fontSize:13}}>Save videos from the Videos tab to track them here.</div>
        </div>
      )}

      {/* ── Script cards ── */}
      <div ref={listRef} style={{display:'flex',flexDirection:'column',gap:6}}>
        {scripts.map(s => {
          const ss = SCRIPT_STATUS_STYLE[s.status] || SCRIPT_STATUS_STYLE.Unposted
          const urls = getUrls(s)
          const videoCount = urls.filter(Boolean).length
          const isSelected = selectedId === s.id
          return (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'14px 16px', borderRadius:12, cursor:'pointer',
                background: isSelected ? 'var(--surface)' : 'var(--bg)',
                border: isSelected
                  ? '1.5px solid rgba(139,92,246,0.35)'
                  : '1.5px solid var(--border-subtle)',
                boxShadow: isSelected ? '0 2px 12px rgba(139,92,246,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                transition:'all 0.15s',
                userSelect:'none',
              }}
              onMouseEnter={e=>{ if(!isSelected){e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.07)'}}}
              onMouseLeave={e=>{ if(!isSelected){e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}}}
            >
              {/* Status bar */}
              <div style={{width:3,height:36,borderRadius:2,background:ss.color,flexShrink:0,opacity:0.7}}/>

              {/* Title + subtitle */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:11,color:'var(--text-tertiary)',display:'flex',alignItems:'center',gap:6}}>
                  {s.meta && [s.meta.camera, s.meta.vibe, s.meta.envKey].filter(Boolean).map((t,i)=>(
                    <span key={t}>{i>0&&<span style={{opacity:0.35,marginRight:6}}>·</span>}{t}</span>
                  ))}
                  {!s.meta && <span style={{opacity:0.5}}>No meta</span>}
                </div>
              </div>

              {/* Right badges */}
              <div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0}}>
                {videoCount > 0 && (
                  <span style={{fontSize:11,fontWeight:600,color:'#34C759',background:'rgba(52,199,89,0.1)',padding:'3px 8px',borderRadius:20}}>▶ {videoCount}</span>
                )}
                {s.meta?.duration && (
                  <span style={{fontSize:11,color:'var(--text-tertiary)',background:'var(--bg-tertiary)',padding:'3px 8px',borderRadius:20}}>{s.meta.duration}s</span>
                )}
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:ss.bg,color:ss.color,whiteSpace:'nowrap'}}>{s.status}</span>
                {s.createdAt && <span style={{fontSize:11,color:'var(--text-tertiary)',minWidth:34,textAlign:'right'}}>{fmtDate(s.createdAt)}</span>}
                <span style={{fontSize:15,color:'var(--text-tertiary)',transform:isSelected?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.2s',lineHeight:1,flexShrink:0}}>›</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Drawer ── */}
      {selected && (() => {
        const s = selected
        const ss = SCRIPT_STATUS_STYLE[s.status] || SCRIPT_STATUS_STYLE.Unposted
        const urls = getUrls(s)
        const fieldStyle = {
          width:'100%', padding:'10px 13px', borderRadius:10,
          border:'1.5px solid var(--border)', background:'var(--bg)',
          fontSize:13, color:'var(--text-primary)', fontFamily:'inherit',
          boxSizing:'border-box', lineHeight:1.6,
        }
        return (
          <div ref={drawerRef} style={{
            position:'fixed', top:'var(--nav-h)', right:0, bottom:0,
            width:drawerWidth, zIndex:400,
            display:'flex', flexDirection:'row',
            background:'var(--surface)',
            boxShadow:'-12px 0 48px rgba(0,0,0,0.1)',
            animation:'drawerIn 0.2s ease',
          }}>
            {/* Left drag handle */}
            <div
              onMouseDown={e=>{
                e.preventDefault()
                isDrawerDragging.current=true
                drawerDragStartX.current=e.clientX
                drawerDragStartW.current=drawerWidthRef.current
                document.body.style.cursor='ew-resize'
                document.body.style.userSelect='none'
              }}
              onMouseEnter={e=>{
                e.currentTarget.querySelector('span').style.background='rgba(139,92,246,0.7)'
                e.currentTarget.querySelector('span').style.width='3px'
              }}
              onMouseLeave={e=>{
                if(!isDrawerDragging.current){
                  e.currentTarget.querySelector('span').style.background='var(--border)'
                  e.currentTarget.querySelector('span').style.width='1px'
                }
              }}
              style={{width:8,flexShrink:0,cursor:'ew-resize',display:'flex',alignItems:'stretch',justifyContent:'center',zIndex:1}}
            >
              <span style={{display:'block',width:'1px',background:'var(--border)',transition:'background 0.15s, width 0.15s',pointerEvents:'none'}}/>
            </div>
            {/* Drawer content */}
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

            {/* Header */}
            <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{width:3,height:20,borderRadius:2,background:ss.color,flexShrink:0}}/>
                <input
                  value={s.title}
                  onChange={e=>upd(s.id,'title',e.target.value)}
                  style={{flex:1,fontSize:15,fontWeight:700,border:'none',background:'transparent',color:'var(--text-primary)',outline:'none',letterSpacing:'-0.3px',minWidth:0}}
                />
                <button
                  onClick={e=>{e.stopPropagation();del(s.id)}}
                  title="Delete script"
                  style={{width:28,height:28,borderRadius:7,border:'1px solid rgba(255,59,48,0.2)',background:'rgba(255,59,48,0.07)',color:'#FF3B30',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer'}}
                >🗑</button>
                <button onClick={()=>setSelectedId(null)} style={{
                  width:28,height:28,borderRadius:7,border:'1.5px solid var(--border)',
                  background:'var(--bg-tertiary)',color:'var(--text-secondary)',
                  fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer',
                }}>×</button>
              </div>
              {/* Status pills */}
              <div style={{display:'flex',gap:6}}>
                {SCRIPT_STATUSES.map(st=>{
                  const stStyle=SCRIPT_STATUS_STYLE[st]; const on=s.status===st
                  return (
                    <button key={st} onClick={()=>upd(s.id,'status',st)} style={{
                      padding:'4px 14px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                      background:on?stStyle.bg:'transparent',
                      color:on?stStyle.color:'var(--text-tertiary)',
                      border:`1.5px solid ${on?stStyle.color+'55':'var(--border)'}`,
                      transition:'all 0.15s',
                    }}>{st}</button>
                  )
                })}
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{flex:1,overflowY:'auto',padding:'20px',display:'flex',flexDirection:'column',gap:22}}>

              {/* Videos — small strip thumbs */}
              {urls.filter(Boolean).length > 0 && (
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>
                    Videos · {urls.filter(Boolean).length}
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {urls.filter(Boolean).map((url,vi)=>(
                      <div key={url+vi} style={{width:60,borderRadius:9,overflow:'hidden',flexShrink:0,border:'1.5px solid var(--border)'}}>
                        <div style={{position:'relative',cursor:'pointer'}} onClick={()=>setVidLightbox(url)}>
                          <video src={url} preload="metadata" muted playsInline style={{width:'100%',height:90,objectFit:'cover',display:'block',pointerEvents:'none'}}/>
                          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <div style={{width:22,height:22,borderRadius:'50%',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,paddingLeft:2,color:'#fff',boxShadow:'0 2px 8px rgba(139,92,246,0.45)'}}>▶</div>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:1,background:'var(--bg-tertiary)',padding:'3px'}}>
                          <button
                            title="Download"
                            onClick={async()=>{
                              try{const r=await fetch(url);const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`video-${vi+1}.mp4`;a.click()}
                              catch{window.open(url,'_blank')}
                            }}
                            style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:11,border:'none',cursor:'pointer',background:'rgba(139,92,246,0.12)',color:'#8B5CF6',fontFamily:'inherit'}}
                          >↓</button>
                          <button
                            title="Remove"
                            onClick={()=>upd(s.id,'videoUrls',(s.videoUrls||[]).filter(u=>u!==url))}
                            style={{flex:1,padding:'3px 0',borderRadius:5,fontSize:11,border:'none',cursor:'pointer',background:'rgba(255,59,48,0.1)',color:'#FF3B30',fontFamily:'inherit'}}
                          >×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Script */}
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Script</div>
                  <button onClick={()=>copy(s.script||'',`s-${s.id}`)} style={{padding:'3px 9px',borderRadius:6,fontSize:11,fontWeight:600,border:'1px solid var(--border)',color:copied===`s-${s.id}`?'#34C759':'var(--text-secondary)',background:'var(--bg)',transition:'color 0.15s',cursor:'pointer'}}>{copied===`s-${s.id}`?'✓ Copied':'Copy'}</button>
                </div>
                <textarea value={s.script||''} onChange={e=>upd(s.id,'script',e.target.value)}
                  placeholder="What does the influencer say?"
                  rows={5} style={{...fieldStyle,resize:'vertical'}}/>
              </div>

              {/* Image References */}
              {(s.refs||[]).length > 0 && (
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>References</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
                    {(s.refs||[]).map((ref,ri)=>(
                      <div key={ri} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}
                        onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setHoveredRef({ref,rect:r})}}
                        onMouseLeave={()=>setHoveredRef(null)}>
                        <div style={{width:54,height:70,borderRadius:9,overflow:'hidden',border:`1.5px solid ${hoveredRef?.ref===ref?'var(--accent,#8B5CF6)':'var(--border)'}`,background:'var(--bg-tertiary)',transition:'border-color 0.15s',cursor:'pointer'}}>
                          <img src={ref.url} alt={ref.label} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top',display:'block'}}/>
                        </div>
                        <span style={{fontSize:9,fontWeight:600,color:'var(--text-tertiary)',textAlign:'center',maxWidth:54,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ref.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings */}
              {s.meta && (
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Settings</div>
                  <div style={{display:'flex',flexDirection:'column',gap:7}}>
                    {[
                      ['Location',  s.meta.environment || s.meta.envKey],
                      ['Camera',    s.meta.camera],
                      ['Vibe',      s.meta.vibe],
                      ['Duration',  s.meta.duration && `${s.meta.duration}s`],
                      ['Format',    [s.meta.aspect, s.meta.shotMode==='oner'?'1-shot':s.meta.shotMode==='multi'?'Multi-shot':null].filter(Boolean).join(' · ')],
                      ['Wardrobe',  s.meta.wardrobeName],
                      ['Voice',     s.meta.voiceLabel],
                      ['Notes',     s.meta.additionalNotes],
                    ].filter(([,v])=>v).map(([label,value])=>(
                      <div key={label} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                        <span style={{fontSize:10,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',minWidth:58,flexShrink:0,paddingTop:1}}>{label}</span>
                        <span style={{fontSize:12,color:'var(--text-primary)',lineHeight:1.4}}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generation Prompt */}
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Generation Prompt</div>
                  <div style={{display:'flex',gap:5}}>
                    {influencerPrompt&&(
                      <button onClick={()=>upd(s.id,'prompt',influencerPrompt)} style={{padding:'3px 9px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',color:'var(--text-secondary)',background:'var(--bg)',cursor:'pointer'}}>Use influencer</button>
                    )}
                    <button onClick={()=>copy(s.prompt||'',`p-${s.id}`)} style={{padding:'3px 9px',borderRadius:6,fontSize:11,fontWeight:600,border:'1px solid var(--border)',color:copied===`p-${s.id}`?'#34C759':'var(--text-secondary)',background:'var(--bg)',transition:'color 0.15s',cursor:'pointer'}}>{copied===`p-${s.id}`?'✓ Copied':'Copy'}</button>
                  </div>
                </div>
                <textarea value={s.prompt||''} onChange={e=>upd(s.id,'prompt',e.target.value)}
                  placeholder="Paste the Higgsfield prompt for this video…"
                  rows={8} style={{...fieldStyle,resize:'vertical',fontSize:12,lineHeight:1.65}}/>
              </div>

              {/* Posted URL */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Posted At</div>
                <input value={s.postedUrl||''} onChange={e=>upd(s.id,'postedUrl',e.target.value)}
                  placeholder="Instagram, TikTok, YouTube URL…"
                  style={{...fieldStyle}}/>
                {s.postedUrl&&(
                  <a href={s.postedUrl} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,marginTop:7,fontSize:11,color:'var(--accent)',textDecoration:'none'}}>
                    <span>↗</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.postedUrl}</span>
                  </a>
                )}
              </div>

            </div>

            {/* Reference image hover popup */}
            {hoveredRef && createPortal(
              <div data-portal style={{
                position:'fixed',
                left: hoveredRef.rect.left + hoveredRef.rect.width/2,
                top: hoveredRef.rect.top - 12,
                transform:'translate(-50%,-100%)',
                width:220,
                background:'var(--surface)',
                borderRadius:12,
                boxShadow:'0 12px 40px rgba(0,0,0,0.32)',
                border:'1px solid var(--border)',
                overflow:'hidden',
                zIndex:9000,
                pointerEvents:'none',
                animation:'refPopIn 0.12s ease',
              }}>
                <div style={{width:'100%',background:'var(--bg-tertiary)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <img src={hoveredRef.ref.url} alt={hoveredRef.ref.label} style={{maxWidth:'100%',maxHeight:260,display:'block',objectFit:'contain'}}/>
                </div>
                <div style={{padding:'6px 10px',fontSize:11,fontWeight:600,color:'var(--text-secondary)',borderTop:'1px solid var(--border)'}}>{hoveredRef.ref.label}</div>
              </div>,
              document.body
            )}
            <style>{`@keyframes refPopIn{from{opacity:0;transform:translate(-50%,-94%)}to{opacity:1;transform:translate(-50%,-100%)}}`}</style>

            {/* Video lightbox */}
            {vidLightbox && createPortal(
              <div data-portal onClick={()=>setVidLightbox(null)} onMouseDown={e=>e.stopPropagation()} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.93)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <video src={vidLightbox} controls autoPlay playsInline onClick={e=>e.stopPropagation()} style={{maxWidth:'90vw',maxHeight:'90vh',borderRadius:14,display:'block'}}/>
                <button onClick={()=>setVidLightbox(null)} style={{position:'absolute',top:20,right:20,width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.14)',color:'#fff',border:'none',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
              </div>,
              document.body
            )}
          </div>
          </div>
        )
      })()}
    </div>
  )
}


