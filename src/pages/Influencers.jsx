import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useInfluencers, useBrandDeals, generateId } from '../store'
import ImageGrid from '../components/ImageGrid'
import MasonryGrid from '../components/MasonryGrid'
import Lightbox from '../components/Lightbox'
import { compressImage, downloadImage } from '../utils/imageUtils'
import { generateSingleImage, generateThreeImages, generateVideo, initSession, pollAllJobs, getPendingGens, clearPendingGen, getPendingVideo, clearPendingVideo, resumeVideoJob } from '../utils/higgsfieldGenerate'
import { buildThreeVariationPrompts } from '../utils/systemPrompt'
import { gColor, pLabel } from '../utils/influencerUtils'
import { useTheme } from '../context/theme'
import { isHFConnected } from '../utils/higgsfieldAuth'
import { buildCharSheetPrompt, buildCharSheetPromptWithClaude } from '../utils/charSheetPrompt'
import PhotoStudioPanel from './PhotoStudio'
import WardrobeDrawer from '../components/WardrobeDrawer'
import {
  VIDEO_MODELS, SD, NICHES_F, NICHES_M, NICHES_ALL, SHEET_RATIOS, GM, DEFAULT_PALETTES,
  SCRIPT_STATUSES, SCRIPT_STATUS_STYLE, WARDROBE_STYLES_F, WARDROBE_STYLES_M,
  HAIR_PRESETS_F, HAIR_PRESETS_M, GEN_DURATION_MS, CS_ENVIRONMENTS, CS_ENV_PRESETS,
  AMBIENT_SOUND, CS_CAMERAS, CS_VIBES, VOICE_PRESETS, VIDEO_TEMPLATES, DIALOGUE_STARTERS,
  CAMERA_META, VIBE_META, VIDEO_MAX_WORDS, PHOTO_STUDIO_HISTORY_KEY,
} from './influencers/constants'
import {
  useMobile, getNiches, audiencePh, pColor, accent, accentText, completeness,
  ytId, domain, inferAmbientSound, fmtElapsed, getGlobalMuted, useGlobalMuted,
} from './influencers/helpers'
import {
  buildFeatureSheetPrompt, buildCloseUpPrompt, buildCharacterSheetPrompt,
  buildWardrobePrompt, parseAdditionalNotes, annotateDialogue,
} from './influencers/prompts'
import {
  saveGenParams, getGenParams, getCreationParams,
  saveWardrobePending, getWardrobePending, clearWardrobePending,
} from './influencers/storage'
import {
  Ring, CtxMenu, GenLoadingOverlay, FL, FI, FTA, GenderButtons, ColorPalette,
  InfoCell, BareInput, Sec, Tabs, CSStepHeader, CSChips,
} from './influencers/components/common'
import { HeroBanner, CharacterSheetSlot, CloseUpSlot, MainImageSlot } from './influencers/components/ImageSlots'
import { SaveScriptModal, ScriptsSection } from './influencers/components/Scripts'
import { DescriptionForm } from './influencers/components/Description'
import { WardrobeGenerator } from './influencers/components/Wardrobe'
import { WorldDropCard, WorldDropSection } from './influencers/components/WorldDrops'
import { HomeSection } from './influencers/components/Home'
import { BrandDealCard, NewBrandModal, ImportBrandDealsModal, BrandDealSection } from './influencers/components/BrandDeals'
import { NewModal } from './influencers/components/Modals'
import { MediaLightbox, HistoryCard, VideoStripThumb } from './influencers/components/Media'
import { HistoryTab } from './influencers/components/History'
import { ContentStudio } from './influencers/ContentStudio'



// ─────────────────────────────────────────────
// Main export
export default function Influencers() {
  const [influencers,setInfluencers]=useInfluencers()
  const { isDark } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedId,setSelectedId]=useState(()=>localStorage.getItem('inf_last_selected')||null)
  const [studioTab,setStudioTab]=useState('influencer')
  const [activeTab,setActiveTab]=useState('Overview')
  const [videoRestoreKey, setVideoRestoreKey] = useState(0)
  const [photoRestoreKey, setPhotoRestoreKey] = useState(0)
  const [pendingStartFrame, setPendingStartFrame] = useState(null)
  const [showNew,setShowNew]=useState(false)
  const [lightbox,setLightbox]=useState(null)
  const [ctxMenu,setCtxMenu]=useState(null)
  const [renameId,setRenameId]=useState(null)
  const [renameVal,setRenameVal]=useState('')
  const [mobileView,setMobileView]=useState('list')
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem('inf_sidebar_collapsed')==='1')
  const [sidebarWidth,setSidebarWidth]=useState(()=>Number(localStorage.getItem('inf_sidebar_width'))||216)
  const sidebarWidthRef=useRef(Number(localStorage.getItem('inf_sidebar_width'))||216)
  const asideRef=useRef()
  const isDragging=useRef(false)
  const dragStartX=useRef(0)
  const dragStartW=useRef(0)
  const isMobile=useMobile()
  const tabSecRef=useRef()
  const mainPaneRef=useRef()
  const [scriptsHighlightId,setScriptsHighlightId]=useState(null)
  const hasNavigatedToScripts=useRef(false)
  const prevInfIdRef=useRef(null)
  const currentTabsRef=useRef({ studioTab, activeTab })
  const [infOrder,setInfOrder]=useState(()=>{try{return JSON.parse(localStorage.getItem('inf_order')||'null')}catch{return null}})
  const [dragState,setDragState]=useState(null) // {srcId, overId, above}
  const orderedRef=useRef([])

  // Resize drag handlers — pure DOM during drag, sync to React on mouseup
  useEffect(()=>{
    function onMove(e){
      if(!isDragging.current) return
      const w=Math.max(160,Math.min(420,dragStartW.current+(e.clientX-dragStartX.current)))
      sidebarWidthRef.current=w
      if(asideRef.current) asideRef.current.style.width=w+'px'
    }
    function onUp(){
      if(!isDragging.current) return
      isDragging.current=false
      document.body.style.cursor=''
      document.body.style.userSelect=''
      setSidebarWidth(sidebarWidthRef.current)
      localStorage.setItem('inf_sidebar_width',String(Math.round(sidebarWidthRef.current)))
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
  },[])

  // Bulletproof influencer resolution — three-level fallback, never null if any exist
  const influencer = useMemo(() => {
    // 1. Just arrived from Create — use the ID passed in navigation state
    if (location.state?.selectId) {
      const f = influencers.find(i => i.id === location.state.selectId)
      if (f) return f
    }
    // 2. User clicked something in the sidebar
    if (selectedId) {
      const f = influencers.find(i => i.id === selectedId)
      if (f) return f
    }
    // 3. Default to first in list
    return influencers[0] ?? null
  }, [influencers, location.state?.selectId, selectedId])

  const ac=accent(influencer)
  const pct=influencer?completeness(influencer):0

  // Keep currentTabsRef current so the switch useEffect can read tabs before restoring
  currentTabsRef.current = { studioTab, activeTab }

  // Reset to profile tab on every influencer switch
  useEffect(() => {
    prevInfIdRef.current = influencer?.id
    setStudioTab('influencer')
    setActiveTab('Overview')
    setScriptsHighlightId(null)
    hasNavigatedToScripts.current = false
  }, [influencer?.id]) // eslint-disable-line

  const topImages=influencer?[influencer.mainImage,influencer.characterSheetImage,influencer.closeUpImage1,influencer.closeUpImage2].filter(Boolean):[]

  function create(name,gender) {
    const n={
      id:generateId(),name,gender,type:'Influencer',createdAt:Date.now(),
      mainImage:null,characterSheetImage:null,closeUpImage1:null,closeUpImage2:null,
      prompt:'',age:'',backstory:'',introExtrovert:50,
      niche:'',nicheCustom:'',audience:'',hobbies:'',clothingStyle:'',dreamBrands:'',voice:'',
      contentPillars:[],palette:[],videoUrls:[],scripts:[],
      homeImages:[],brandDealImages:[],
      wardrobeSlots:[
        {id:generateId(),name:'Wardrobe 1',image:null},
        {id:generateId(),name:'Wardrobe 2',image:null},
        {id:generateId(),name:'Wardrobe 3',image:null},
      ],
    }
    setInfluencers(prev=>[...prev,n]); setSelectedId(n.id); setShowNew(false)
  }

  function upd(id,updates){ setInfluencers(prev=>prev.map(i=>i.id===id?{...i,...updates}:i)) }

  function addToHistory(id, entry) {
    setInfluencers(prev => prev.map(i => {
      if (i.id !== id) return i
      const existing = i.generationHistory || []
      const isDupe = existing.some(e => e.url === entry.url && entry.date - e.date < 10000)
      if (isDupe) return i
      return { ...i, generationHistory: [{ id: generateId(), ...entry }, ...existing].slice(0, 300) }
    }))
  }

  function handleSaveToScripts(scriptId) {
    if (hasNavigatedToScripts.current) return
    hasNavigatedToScripts.current = true
    setStudioTab('influencer')
    localStorage.setItem('inf_studio_tab','influencer')
    setActiveTab('Scripts')
    setScriptsHighlightId(scriptId)
    setTimeout(() => tabSecRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 120)
  }

  function dup(id) {
    const src=influencers.find(i=>i.id===id); if(!src) return
    const n={...src,id:generateId(),name:src.name+' (copy)',createdAt:Date.now()}
    setInfluencers(prev=>[...prev,n]); setSelectedId(n.id)
  }

  function del(id) {
    if (!window.confirm('Delete this influencer? This cannot be undone.')) return
    const next=influencers.filter(i=>i.id!==id)
    setInfluencers(next); setSelectedId(next[0]?.id??null)
  }

  function commitRename() {
    if(renameVal.trim()) upd(renameId,{name:renameVal.trim()})
    setRenameId(null); setRenameVal('')
  }

  function openCtx(e,id) {
    e.preventDefault()
    const inf=influencers.find(i=>i.id===id)
    setCtxMenu({x:e.clientX,y:e.clientY,id,inf})
  }

  return (
    <div style={{display:'flex',position:'fixed',top:'var(--nav-h)',left:0,right:0,bottom:0,background:'var(--bg)'}}>
      {showNew&&<NewModal onClose={()=>setShowNew(false)} onSave={create}/>}
      {lightbox&&<Lightbox images={lightbox.images} startIndex={lightbox.index} onClose={()=>setLightbox(null)}/>}
      {ctxMenu&&(
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={()=>setCtxMenu(null)}
          items={[
            {label:'Rename',       action:()=>{setSelectedId(ctxMenu.id);setRenameId(ctxMenu.id);setRenameVal(ctxMenu.inf.name)}},
            {label:'Duplicate',    action:()=>dup(ctxMenu.id)},
            {label:'Delete',color:'#FF6B6B',action:()=>del(ctxMenu.id)},
          ]}
        />
      )}

      {/* ── Dark sidebar — hidden on mobile when viewing detail */}
      {(!isMobile || mobileView==='list') && <aside ref={asideRef} style={{
        width: isMobile?'100%': sidebarCollapsed?0:sidebarWidth,
        flexShrink:0, background:SD.bg,
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition: sidebarCollapsed?'width 0.25s ease':'none',
      }}>
        <div style={{padding:'16px 16px 8px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${SD.border}`,minWidth:160}}>
          <span style={{fontSize:11,fontWeight:700,color:SD.dim,textTransform:'uppercase',letterSpacing:'0.6px'}}>Influencers</span>
          <div style={{display:'flex',gap:5,alignItems:'center'}}>
            <button onClick={()=>setShowNew(true)} style={{width:26,height:26,borderRadius:7,background:'rgba(255,255,255,0.12)',color:SD.text,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.2)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.12)'}}
            >+</button>
            <button onClick={()=>{setSidebarCollapsed(true);localStorage.setItem('inf_sidebar_collapsed','1')}} title="Collapse sidebar" style={{width:26,height:26,borderRadius:7,background:'rgba(255,255,255,0.08)',color:SD.dim,fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.15)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)'}}
            >‹</button>
          </div>
        </div>

        <div className="dark-scroll" style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
          {influencers.length===0&&(
            <div style={{padding:'24px 8px',textAlign:'center',color:SD.dim,fontSize:13}}>No influencers yet</div>
          )}
          {(()=>{
            const ordered = infOrder
              ? [...infOrder.map(id=>influencers.find(i=>i.id===id)).filter(Boolean),
                 ...influencers.filter(i=>!infOrder.includes(i.id))]
              : [...influencers].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))
            orderedRef.current = ordered

            function applyDrop(srcId, overId, above) {
              if (!srcId || srcId === overId) return
              const ids = orderedRef.current.map(i=>i.id)
              const from = ids.indexOf(srcId)
              if (from === -1) return
              const next = [...ids]
              next.splice(from, 1)
              const to = next.indexOf(overId)
              if (to === -1) return
              next.splice(above ? to : to + 1, 0, srcId)
              setInfOrder(next)
              localStorage.setItem('inf_order', JSON.stringify(next))
            }

            const ROW_H = 62
            function getShift(infId) {
              if (!dragState?.overId) return 0
              const { srcId, overId, above } = dragState
              if (infId === srcId) return 0
              const srcIdx = ordered.findIndex(i => i.id === srcId)
              const overIdx = ordered.findIndex(i => i.id === overId)
              const thisIdx = ordered.findIndex(i => i.id === infId)
              const insertAt = above ? overIdx : overIdx + 1
              if (srcIdx < insertAt) {
                if (thisIdx > srcIdx && thisIdx < insertAt) return -ROW_H
              } else {
                if (thisIdx >= insertAt && thisIdx < srcIdx) return ROW_H
              }
              return 0
            }

            return ordered.map(inf=>{
            const pct=completeness(inf)
            const active=influencer?.id===inf.id
            const gc=gColor(inf.gender)
            const isDraggingThis = dragState?.srcId === inf.id
            const dragDy = isDraggingThis && dragState?.pointerY != null ? dragState.pointerY - dragState.startY : 0
            const shift = isDraggingThis ? dragDy : getShift(inf.id)
            return (
              <div key={inf.id} data-inf-id={inf.id} style={{width:'100%',transform:`translateY(${shift}px)`,transition:(dragState&&!isDraggingThis)?'transform 0.18s ease':'none',position:'relative',zIndex:isDraggingThis?99:1,pointerEvents:isDraggingThis?'none':'auto'}}>
                <div style={{
                  display:'flex',alignItems:'center',borderRadius:10,marginBottom:2,
                  opacity: 1,
                  background: active ? SD.active : 'transparent',
                  cursor: dragState ? (isDraggingThis ? 'grabbing' : 'default') : 'grab',
                  userSelect:'none',
                  boxShadow: isDraggingThis ? '0 8px 28px rgba(0,0,0,0.55)' : 'none',
                  transform: isDraggingThis ? 'scale(1.03)' : 'none',
                  transition: isDraggingThis ? 'box-shadow 0.1s,transform 0.1s' : 'none',
                }}
                  onPointerDown={e=>{
                    if (e.button !== 0) return
                    const srcId = inf.id
                    const startX = e.clientX, startY = e.clientY
                    let dragging = false
                    function onMove(ev){
                      if (!dragging) {
                        const dx = ev.clientX - startX, dy = ev.clientY - startY
                        if (dx*dx + dy*dy < 64) return
                        dragging = true
                        setDragState({srcId, overId:null, above:true, startY, pointerY: ev.clientY})
                        return
                      }
                      const el=document.elementFromPoint(ev.clientX,ev.clientY)
                      const row=el?.closest('[data-inf-id]')
                      const pointerY = ev.clientY
                      if(!row){setDragState(s=>s?{...s,overId:null,pointerY}:s);return}
                      const overId=row.dataset.infId
                      if(overId===srcId){setDragState(s=>s?{...s,overId:null,pointerY}:s);return}
                      const rect=row.getBoundingClientRect()
                      const above=ev.clientY<rect.top+rect.height/2
                      setDragState(s=>s?{...s,overId,above,pointerY}:s)
                    }
                    function onUp(){
                      if (dragging) {
                        setDragState(s=>{
                          if(s?.overId) applyDrop(s.srcId,s.overId,s.above)
                          return null
                        })
                      }
                      window.removeEventListener('pointermove',onMove)
                      window.removeEventListener('pointerup',onUp)
                    }
                    window.addEventListener('pointermove',onMove)
                    window.addEventListener('pointerup',onUp)
                  }}
                >
                  <button
                    onClick={()=>{
                      setSelectedId(inf.id)
                      localStorage.setItem('inf_last_selected', inf.id)
                      if(location.state?.selectId) navigate('/influencers',{replace:true,state:{}})
                      if(isMobile)setMobileView('detail')
                    }}
                    onContextMenu={e=>openCtx(e,inf.id)}
                    style={{
                      flex:1,padding:'10px 10px 10px 10px',borderRadius:10,textAlign:'left',
                      background:'transparent',
                      display:'flex',alignItems:'center',gap:10,
                      transition:'background 0.15s',
                      pointerEvents: dragState ? 'none' : 'auto',
                    }}
                    onMouseEnter={e=>{ if(!active&&!dragState) e.currentTarget.style.background=SD.hover }}
                    onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}
                  >
                    {/* Avatar + ring */}
                    <div style={{position:'relative',width:40,height:40,flexShrink:0}}>
                      <Ring pct={pct} size={42}/>
                      <div style={{position:'absolute',top:3,left:3,width:34,height:34,borderRadius:inf.mainImage?'50%':8,overflow:'hidden',background:'rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',transition:'border-radius 0.2s'}}>
                        {inf.mainImage
                          ?<img src={inf.mainImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                          :<span style={{fontSize:14,fontWeight:700,color:SD.dim}}>{inf.name[0]?.toUpperCase()}</span>
                        }
                      </div>
                    </div>
                    {/* Name + gender */}
                    <div style={{minWidth:0,flex:1}}>
                      {renameId===inf.id?(
                        <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e=>{if(e.key==='Enter')commitRename();if(e.key==='Escape')setRenameId(null)}}
                          onClick={e=>e.stopPropagation()}
                          style={{fontSize:13,fontWeight:600,border:'none',background:'transparent',color:SD.text,outline:'none',width:'100%'}}/>
                      ):(
                        <div style={{fontSize:13,fontWeight:600,color:SD.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{inf.name}</div>
                      )}
                      <div style={{fontSize:11,color:inf.tag?'rgba(139,92,246,0.75)':inf.gender?gc:SD.dim,marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                        {inf.tag || inf.gender || 'Influencer'}
                      </div>
                    </div>
                    {/* Pct badge */}
                    <div style={{fontSize:10,fontWeight:700,color:SD.dim,flexShrink:0}}>{pct}%</div>
                  </button>
                </div>
              </div>
            )
          })})()}
        </div>
      </aside>}

      {/* ── Resize handle ── */}
      {!isMobile && !sidebarCollapsed && (
        <div
          onMouseDown={e=>{
            e.preventDefault()
            isDragging.current=true
            dragStartX.current=e.clientX
            dragStartW.current=sidebarWidthRef.current
            document.body.style.cursor='ew-resize'
            document.body.style.userSelect='none'
          }}
          onMouseEnter={e=>{
            e.currentTarget.querySelector('span').style.background='rgba(139,92,246,0.7)'
            e.currentTarget.querySelector('span').style.width='3px'
          }}
          onMouseLeave={e=>{
            if(!isDragging.current){
              e.currentTarget.querySelector('span').style.background=SD.border
              e.currentTarget.querySelector('span').style.width='1px'
            }
          }}
          style={{
            width:8, flexShrink:0, cursor:'ew-resize', position:'relative', zIndex:10,
            display:'flex', alignItems:'stretch', justifyContent:'center',
          }}
        >
          <span style={{
            display:'block', width:'1px', background:SD.border,
            transition:'background 0.15s, width 0.15s',
            pointerEvents:'none',
          }}/>
        </div>
      )}

      {/* ── Main — hidden on mobile when viewing list */}
      {(!isMobile || mobileView==='detail') && (influencer ? (
        <main ref={mainPaneRef} style={{flex:1,overflow:'auto',padding:isMobile?'14px 16px':'20px 24px',display:'flex',flexDirection:'column',gap:14,backgroundImage:'radial-gradient(ellipse at 75% 0%, rgba(0,113,227,0.04) 0%, transparent 55%)'}}>
          {/* Mobile back button */}
          {isMobile&&(
            <button onClick={()=>setMobileView('list')} style={{
              display:'flex',alignItems:'center',gap:6,padding:'8px 0',
              fontSize:14,fontWeight:600,color:'var(--accent)',background:'none',border:'none',
              alignSelf:'flex-start',
            }}>← All Influencers</button>
          )}

          {/* ── Studio tab switcher + sidebar toggle */}
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {/* Expand sidebar button — only when collapsed */}
            {sidebarCollapsed && !isMobile && (
              <button onClick={()=>{setSidebarCollapsed(false);localStorage.setItem('inf_sidebar_collapsed','0')}} title="Show sidebar" style={{
                width:34,height:34,borderRadius:10,border:'1.5px solid var(--border)',
                background:'var(--surface)',color:'var(--text-secondary)',fontSize:15,
                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                transition:'all 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-tertiary)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--surface)'}}
              >›</button>
            )}
            <div style={{display:'flex',gap:4,padding:4,borderRadius:14,background:'var(--bg-tertiary)',border:'1px solid var(--border-subtle)',alignSelf:'flex-start'}}>
              <button onClick={()=>{ setStudioTab('influencer'); localStorage.setItem('inf_studio_tab','influencer') }} style={{
                padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:600,border:'none',
                background: studioTab==='influencer' ? 'var(--surface)' : 'transparent',
                color: studioTab==='influencer' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: studioTab==='influencer' ? '0 1px 6px rgba(0,0,0,0.10), 0 0 0 1px var(--border-subtle)' : 'none',
                transition:'all 0.18s',
              }}>Profile</button>
              <button onClick={()=>{ setStudioTab('photo'); localStorage.setItem('inf_studio_tab','photo') }} style={{
                padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:600,border:'none',
                background: studioTab==='photo' ? 'var(--surface)' : 'transparent',
                color: studioTab==='photo' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: studioTab==='photo' ? '0 1px 6px rgba(0,0,0,0.10), 0 0 0 1px var(--border-subtle)' : 'none',
                transition:'all 0.18s',
              }}>Photos</button>
              <button onClick={()=>{ setStudioTab('content'); localStorage.setItem('inf_studio_tab','content') }} style={{
                padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:600,border:'none',
                background: studioTab==='content' ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'transparent',
                color: studioTab==='content' ? '#fff' : 'var(--text-tertiary)',
                boxShadow: studioTab==='content' ? '0 2px 14px rgba(139,92,246,0.35)' : 'none',
                transition:'all 0.18s',
              }}>Videos</button>
            </div>
          </div>



          <div style={{ display: studioTab==='content' ? 'block' : 'none' }}>
            <ContentStudio key={influencer.id} influencer={influencer} onUpdate={v=>upd(influencer.id,v)} onSaveToScripts={handleSaveToScripts} restoreKey={videoRestoreKey}
              pendingStartFrame={pendingStartFrame} onStartFrameConsumed={()=>setPendingStartFrame(null)}
              onGenerated={(urls, settings)=>{
                const now = Date.now()
                const unique = [...new Set(urls.filter(Boolean))]
                if (!unique.length) return
                setInfluencers(prev => prev.map(inf => {
                  if (inf.id !== influencer.id) return inf
                  const existing = inf.generationHistory || []
                  const fresh = unique
                    .filter(url => !existing.some(e => e.url === url && now - e.date < 30000))
                    .map((url, i) => ({ id: generateId(), type: 'video', label: unique.length > 1 ? `Video ${i+1}` : 'Video', url, date: now, settings }))
                  if (!fresh.length) return inf
                  return { ...inf, generationHistory: [...fresh, ...existing].slice(0, 300) }
                }))
              }}/>
          </div>

          <div style={{ display: studioTab==='photo' ? 'block' : 'none' }}>
            <PhotoStudioPanel influencer={influencer} restoreKey={photoRestoreKey} onGoToWardrobe={() => {
              setStudioTab('influencer')
              localStorage.setItem('inf_studio_tab', 'influencer')
              setActiveTab('Wardrobe')
              setTimeout(() => tabSecRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
            }} onUseAsStartFrame={url => {
              setPendingStartFrame(url)
              setStudioTab('content')
              localStorage.setItem('inf_studio_tab', 'content')
              setTimeout(() => mainPaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
            }} />
          </div>

          {studioTab==='influencer' && <>

          {/* ── Empty state CTA — shown when influencer has no main image yet */}
          {!influencer.mainImage && (
            <div style={{
              borderRadius:18,padding:'36px 28px',textAlign:'center',
              background:'linear-gradient(135deg,rgba(236,72,153,0.06),rgba(139,92,246,0.08))',
              border:'1.5px dashed rgba(139,92,246,0.3)',
            }}>
              <div style={{fontSize:38,marginBottom:12,lineHeight:1}}>✦</div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--text-primary)',marginBottom:6,letterSpacing:'-0.3px'}}>
                {influencer.name} has no images yet
              </div>
              <div style={{fontSize:14,color:'var(--text-tertiary)',marginBottom:24,lineHeight:1.6}}>
                Go through the creation flow to generate photos, set their appearance, and build their identity.
              </div>
              <button
                onClick={() => navigate('/create', { state: { replaceId: influencer.id, prefillName: influencer.name, prefillGender: influencer.gender } })}
                style={{
                  display:'inline-flex',alignItems:'center',gap:10,
                  padding:'13px 28px',borderRadius:12,fontSize:15,fontWeight:700,
                  background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',
                  border:'none',cursor:'pointer',
                  boxShadow:'0 4px 20px rgba(139,92,246,0.4)',
                  transition:'transform 0.15s,box-shadow 0.15s',
                }}
                onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 6px 28px rgba(139,92,246,0.5)'}}
                onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='0 4px 20px rgba(139,92,246,0.4)'}}
              >
                ✦ Generate your influencer
              </button>
            </div>
          )}

          {/* Hero banner */}
          <HeroBanner influencer={influencer} pct={pct} onDelete={()=>del(influencer.id)} onUpdate={v=>upd(influencer.id,v)}/>

          {/* Three image sections */}
          <Sec>
            <div className="inf-img-grid">
              <div>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-secondary)',marginBottom:8}}>Image</div>
                <MainImageSlot key={influencer.id} influencer={influencer} onChange={v=>upd(influencer.id,{mainImage:v})}
                  onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.mainImage)})}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-secondary)',marginBottom:8}}>Character Sheet</div>
                <CharacterSheetSlot
                  key={influencer.id}
                  influencer={influencer}
                  onSave={v=>{upd(influencer.id,{characterSheetImage:v});if(v){addToHistory(influencer.id,{type:'image',label:'Character Sheet',url:v,date:Date.now()})}}}
                  onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.characterSheetImage)})}
                />
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-secondary)',marginBottom:8}}>Close Ups</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <CloseUpSlot
                    key={`${influencer.id}-cu1`}
                    influencer={influencer} imageKey="closeUpImage1" label="Close up 1"
                    onSave={v=>{upd(influencer.id,{closeUpImage1:v});if(v)addToHistory(influencer.id,{type:'image',label:'Close Up',url:v,date:Date.now()})}}
                    onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.closeUpImage1)})}
                  />
                  <CloseUpSlot
                    key={`${influencer.id}-cu2`}
                    influencer={influencer} imageKey="closeUpImage2" label="Feature sheet"
                    onSave={v=>{upd(influencer.id,{closeUpImage2:v});if(v)addToHistory(influencer.id,{type:'image',label:'Feature Sheet',url:v,date:Date.now()})}}
                    onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.closeUpImage2)})}
                    promptFn={buildFeatureSheetPrompt}
                    genAspectRatio="2:3"
                    fit="contain"
                  />
                </div>
              </div>
            </div>
          </Sec>

          {/* Prompt */}
          <Sec>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Prompt</div>
            <textarea value={influencer.prompt} onChange={e=>upd(influencer.id,{prompt:e.target.value})}
              placeholder="Paste your prompt here" rows={3}
              style={{width:'100%',padding:'10px 14px',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',resize:'vertical',lineHeight:1.6}}/>
          </Sec>

          {/* Detail tabs */}
          <div ref={tabSecRef}><Sec style={{marginBottom:20}}>
            <Tabs active={activeTab} onChange={tab=>{setActiveTab(tab);requestAnimationFrame(()=>tabSecRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))}} ac={ac}/>

            {activeTab==='Overview' && <DescriptionForm influencer={influencer} onUpdate={upd}/>}
            {activeTab==='Scripts' && (
              <ScriptsSection
                scripts={influencer.scripts??[]}
                influencerPrompt={influencer.prompt}
                onChange={s=>upd(influencer.id,{scripts:s})}
                initialExpanded={scriptsHighlightId}
              />
            )}
            {activeTab==='Wardrobe' && (<>
              <WardrobeGenerator
                influencer={influencer}
                onAdd={slot => {
                  upd(influencer.id, { wardrobeSlots: [...(influencer.wardrobeSlots??[]), slot] })
                  if (slot.image) addToHistory(influencer.id, { type: 'image', label: `Wardrobe – ${slot.name}`, url: slot.image, date: Date.now() })
                }}
              />
              <WorldDropSection drops={influencer.wardrobeSlots??[]} onChange={slots=>upd(influencer.id,{wardrobeSlots:slots})}/>
            </>)}
            {activeTab==='Home' && (
              <HomeSection slots={influencer.homeSlots??[]} onChange={slots=>upd(influencer.id,{homeSlots:slots})}/>
            )}
            <div style={{ display: activeTab==='Brand Deals' ? 'block' : 'none' }}>
              <BrandDealSection deals={influencer.brandDeals??[]} onChange={deals=>upd(influencer.id,{brandDeals:deals})}/>
            </div>
            {activeTab==='History' && (
              <HistoryTab influencer={influencer} onUpdate={v=>upd(influencer.id,v)}
                onReuseSettings={(seg)=>{ if (seg === 'videos') { setStudioTab('content'); localStorage.setItem('inf_studio_tab','content'); setVideoRestoreKey(k => k+1) } else { setStudioTab('photo'); localStorage.setItem('inf_studio_tab','photo'); setPhotoRestoreKey(k => k+1) } }}/>
            )}

          </Sec></div>
          </>}
        </main>
      ) : isDark ? (
        <main style={{flex:1,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',background:'#07070E'}}>
          <div style={{position:'absolute',width:700,height:700,top:'-20%',left:'-15%',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle, rgba(236,72,153,0.22) 0%, transparent 65%)',animation:'orb1 14s ease-in-out infinite'}}/>
          <div style={{position:'absolute',width:580,height:580,top:'-12%',right:'-10%',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle, rgba(0,113,227,0.18) 0%, transparent 65%)',animation:'orb2 19s ease-in-out infinite'}}/>
          <div style={{position:'absolute',width:700,height:700,bottom:'-28%',left:'20%',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 65%)',animation:'orb3 23s ease-in-out infinite'}}/>
          <div style={{position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',backgroundSize:'32px 32px'}}/>
          <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(7,7,14,0.75) 100%)'}}/>
          <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
            <div style={{width:72,height:72,borderRadius:20,margin:'0 auto 24px',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 40px rgba(139,92,246,0.45)'}}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="11" r="5.5" stroke="white" strokeWidth="2"/><path d="M4 28c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <h2 style={{fontSize:26,fontWeight:800,letterSpacing:'-0.6px',color:'#fff',marginBottom:10,lineHeight:1.2}}>Build your first influencer</h2>
            <p style={{fontSize:14,color:'rgba(255,255,255,0.38)',marginBottom:28}}>Design a unique AI persona in minutes.</p>
            <button onClick={()=>navigate('/create')} style={{padding:'13px 36px',borderRadius:980,background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',fontSize:15,fontWeight:700,letterSpacing:'-0.2px',boxShadow:'0 0 32px rgba(139,92,246,0.4),0 4px 16px rgba(0,0,0,0.3)',transition:'transform 0.18s,box-shadow 0.18s'}}
              onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.04) translateY(-1px)';e.currentTarget.style.boxShadow='0 0 52px rgba(139,92,246,0.55),0 8px 24px rgba(0,0,0,0.4)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 0 32px rgba(139,92,246,0.4),0 4px 16px rgba(0,0,0,0.3)'}}>+ Create Influencer</button>
          </div>
        </main>
      ) : (
        <main style={{flex:1,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:3,opacity:0.18,pointerEvents:'none',transform:'scale(1.04)'}}>
            {['/inf/i1.png','/inf/i4.jpg','/inf/i2.png','/inf/i5.png','/inf/i3.jpg','/inf/i6.jpg'].map((src,i)=>(
              <img key={i} src={src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
            ))}
          </div>
          <div style={{position:'absolute',inset:0,backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)',background:'rgba(255,255,255,0.82)',pointerEvents:'none'}}/>
          <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
            <div style={{width:72,height:72,borderRadius:20,margin:'0 auto 24px',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 32px rgba(139,92,246,0.4)'}}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="11" r="5.5" stroke="white" strokeWidth="2"/><path d="M4 28c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <h2 style={{fontSize:26,fontWeight:800,letterSpacing:'-0.6px',color:'var(--text-primary)',marginBottom:24}}>Build your first influencer</h2>
            <button onClick={()=>navigate('/create')} style={{padding:'13px 36px',borderRadius:980,background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',fontSize:15,fontWeight:700,letterSpacing:'-0.2px',boxShadow:'0 0 28px rgba(139,92,246,0.35),0 4px 16px rgba(0,0,0,0.12)',transition:'transform 0.18s,box-shadow 0.18s'}}
              onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.04) translateY(-1px)';e.currentTarget.style.boxShadow='0 0 48px rgba(139,92,246,0.5),0 8px 24px rgba(0,0,0,0.14)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 0 28px rgba(139,92,246,0.35),0 4px 16px rgba(0,0,0,0.12)'}}>+ Create Influencer</button>
          </div>
        </main>
      ))}
    </div>
  )
}
