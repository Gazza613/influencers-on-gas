import { useState, useRef, useEffect } from 'react'
import Lightbox from '../../../components/Lightbox'
import { generateId, useBrandDeals } from '../../../store'
import { buildCharSheetPrompt, buildCharSheetPromptWithClaude } from '../../../utils/charSheetPrompt'
import { isHFConnected } from '../../../utils/higgsfieldAuth'
import { generateSingleImage } from '../../../utils/higgsfieldGenerate'
import { compressImage, downloadImage } from '../../../utils/imageUtils'
import { GEN_DURATION_MS } from '../constants'
import { accent } from '../helpers'

// Brand deal card — WorldDropCard style with brand + category fields

export function BrandDealCard({ deal, editingBrand, editBrand, onEditBrand, onStartEdit, onCommitEdit, onCancelEdit, onImageChange, onDelete, onCategoryChange, onLightbox, generating, progress, claudeStatus, onGenerate }) {
  const fileRef = useRef()
  const [hovered,setHovered]=useState(false)
  const [dragOver,setDragOver]=useState(false)
  const [viewSheet,setViewSheet]=useState(false)
  const [smoothPct,setSmoothPct]=useState(0)
  const startRef=useRef(null)
  const rafRef=useRef(null)

  useEffect(()=>{
    if(generating){
      startRef.current=Date.now()
      setSmoothPct(0)
      const tick=()=>{
        const elapsed=Date.now()-startRef.current
        // Ease toward 90% over GEN_DURATION_MS, never reaches 100 on its own
        const target=90*(1-Math.exp(-3*elapsed/GEN_DURATION_MS))
        setSmoothPct(Math.min(target,90))
        rafRef.current=requestAnimationFrame(tick)
      }
      rafRef.current=requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
      setSmoothPct(0)
    }
    return()=>cancelAnimationFrame(rafRef.current)
  },[generating])

  function genLabel(pct){
    if(pct<8) return 'Asking Claude…'
    if(pct<20) return 'Uploading…'
    if(pct<75) return 'Generating…'
    return 'Almost done…'
  }

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(url => {
      const existing = deal.images || (deal.image ? [deal.image] : [])
      if (existing.length === 0) {
        onImageChange(url) // sets deal.image for backward compat
      } else if (existing.length < 5) {
        onImageChange(null, [...existing, url]) // append
      }
    }).catch(console.error)
    r.readAsDataURL(f)
  }

  const hasSheet = !!deal.characterSheet
  const hasBoth = hasSheet && !!deal.image
  const displayImage = hasBoth ? (viewSheet ? deal.characterSheet : deal.image) : (deal.image || deal.characterSheet)
  useEffect(()=>{ if(deal.characterSheet && !deal.image) setViewSheet(true) },[deal.characterSheet, deal.image])

  return (
    <div
      style={{background:'var(--bg)',borderRadius:12,border:`1.5px solid ${dragOver?'#8B5CF6':hovered?'var(--accent)':'var(--border)'}`,overflow:'hidden',boxShadow:hovered?'var(--shadow-md)':'none',transition:'border-color 0.15s, box-shadow 0.15s'}}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
    >
      {/* Image slot */}
      <div
        style={{aspectRatio:'4/3',background:dragOver?'rgba(139,92,246,0.07)':'var(--bg-tertiary)',overflow:'hidden',cursor:'pointer',position:'relative',transition:'background 0.15s'}}
        onClick={()=>{ if(generating) return; if(displayImage){const imgs=hasBoth?[deal.image,deal.characterSheet]:[displayImage];onLightbox?.(imgs,hasBoth&&viewSheet?1:0)}else{fileRef.current.click()} }}
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}}
      >
        {displayImage
          ? <>
              <img src={displayImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
              {!generating && (
                <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',transition:'background 0.15s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,0,0,0.2)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0)'}}
                >
                  <button onClick={e=>{e.stopPropagation();fileRef.current.click()}} title="Change image" style={{
                    position:'absolute',top:6,left:6,width:22,height:22,borderRadius:'50%',
                    background:'rgba(0,0,0,0.55)',color:'#fff',fontSize:11,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    backdropFilter:'blur(4px)',border:'1px solid rgba(255,255,255,0.15)',
                  }}>↑</button>
                  <button onClick={e=>{e.stopPropagation();onImageChange(null)}} style={{
                    position:'absolute',top:6,right:6,width:22,height:22,borderRadius:'50%',
                    background:'rgba(0,0,0,0.55)',color:'#fff',fontSize:13,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    backdropFilter:'blur(4px)',border:'1px solid rgba(255,255,255,0.15)',
                  }}>×</button>
                </div>
              )}
              {hasBoth && !generating && (
                <div style={{position:'absolute',bottom:6,left:6,display:'flex',background:'rgba(0,0,0,0.55)',borderRadius:7,padding:2,backdropFilter:'blur(4px)',gap:2}} onClick={e=>e.stopPropagation()}>
                  <button onClick={e=>{e.stopPropagation();setViewSheet(false)}} style={{padding:'2px 7px',borderRadius:5,fontSize:9,fontWeight:700,border:'none',cursor:'pointer',lineHeight:1.4,background:!viewSheet?'#fff':'transparent',color:!viewSheet?'#000':'rgba(255,255,255,0.65)'}}>Orig</button>
                  <button onClick={e=>{e.stopPropagation();setViewSheet(true)}} style={{padding:'2px 7px',borderRadius:5,fontSize:9,fontWeight:700,border:'none',cursor:'pointer',lineHeight:1.4,background:viewSheet?'#fff':'transparent',color:viewSheet?'#000':'rgba(255,255,255,0.65)'}}>Sheet</button>
                </div>
              )}
            </>
          : <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}>
              <span style={{fontSize:22,opacity:dragOver?0.6:0.22}}>+</span>
              <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:500}}>{dragOver?'Drop to upload':'Upload or drag & drop'}</span>
            </div>
        }
        {generating && (
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.62)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10}}>
            <div style={{width:24,height:24,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,0.2)',borderTopColor:'#fff',animation:'bdSpin 0.75s linear infinite'}}/>
            <div style={{color:'#fff',fontSize:11,fontWeight:600}}>{genLabel(smoothPct)}</div>
            <div style={{width:100,height:3,borderRadius:99,background:'rgba(255,255,255,0.15)'}}>
              <div style={{height:'100%',borderRadius:99,background:'#fff',width:`${smoothPct}%`,transition:'width 0.4s ease'}}/>
            </div>
          </div>
        )}
        {!generating && claudeStatus && (
          <div style={{position:'absolute',bottom:6,right:6,fontSize:10,fontWeight:700,padding:'3px 7px',borderRadius:6,backdropFilter:'blur(6px)',
            background: claudeStatus==='done' ? 'rgba(52,199,89,0.85)' : claudeStatus==='analyzing' ? 'rgba(139,92,246,0.85)' : 'rgba(255,59,48,0.85)',
            color:'#fff',maxWidth:'90%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
          }}>
            {claudeStatus==='done' ? '✓ Claude analyzed' : claudeStatus==='analyzing' ? 'Claude analyzing…' : '✗ '+claudeStatus.replace('error:','')}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}}
          onChange={e=>{Array.from(e.target.files).forEach(f=>handleFile(f));e.target.value=''}}/>
      </div>

      {/* Extra images strip */}
      {(deal.images?.length > 1) && (
        <div style={{display:'flex',gap:4,padding:'6px 8px 0',overflowX:'auto'}}>
          {deal.images.map((img,i) => (
            <img key={i} src={img} alt="" style={{width:36,height:36,borderRadius:6,objectFit:'cover',flexShrink:0,opacity:i===0?0.5:1}} title={i===0?'Main (shown above)':'Extra angle'}/>
          ))}
        </div>
      )}

      {/* Brand + category + actions */}
      <div style={{padding:'10px 12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
          {editingBrand
            ? <input autoFocus value={editBrand} onChange={e=>onEditBrand(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={e=>{if(e.key==='Enter')onCommitEdit();if(e.key==='Escape')onCancelEdit()}}
                style={{flex:1,fontSize:13,fontWeight:700,border:'none',background:'transparent',color:'var(--text-primary)',outline:'none'}}/>
            : <span style={{flex:1,fontSize:13,fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{deal.brand}</span>
          }
          <div style={{display:'flex',gap:3,flexShrink:0,opacity:hovered&&!generating?1:0,transition:'opacity 0.15s'}}>
            {hasSheet && (
              <button onClick={e=>{e.stopPropagation();downloadImage(deal.characterSheet,`${deal.brand}-sheet.jpg`)}} title="Download sheet" style={{width:22,height:22,borderRadius:6,border:'none',cursor:'pointer',background:'var(--bg-tertiary)',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11}}>↓</button>
            )}
            <button onClick={e=>{e.stopPropagation();onStartEdit()}} title="Rename" style={{width:22,height:22,borderRadius:6,border:'none',cursor:'pointer',background:'var(--bg-tertiary)',color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11}}>✎</button>
            <button onClick={e=>{e.stopPropagation();onDelete()}} title="Delete" style={{width:22,height:22,borderRadius:6,border:'none',cursor:'pointer',background:'rgba(255,59,48,0.08)',color:'#FF3B30',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,lineHeight:1}}>×</button>
          </div>
        </div>
        <input
          value={deal.category||''}
          onChange={e=>onCategoryChange(e.target.value)}
          onClick={e=>e.stopPropagation()}
          placeholder="Category (e.g. Beauty, Tech…)"
          style={{width:'100%',fontSize:11,color:'var(--text-tertiary)',border:'none',background:'transparent',outline:'none',boxSizing:'border-box'}}
        />
        {deal.image && !generating && (
          <button
            onClick={e=>{e.stopPropagation();onGenerate(deal)}}
            style={{marginTop:8,width:'100%',padding:'5px 0',borderRadius:6,fontSize:11,fontWeight:600,background:hasSheet?'var(--bg-tertiary)':'linear-gradient(135deg,#EC4899,#8B5CF6)',color:hasSheet?'var(--text-secondary)':'#fff',boxShadow:hasSheet?'none':'0 1px 6px rgba(139,92,246,0.3)',transition:'all 0.15s',cursor:'pointer'}}
          >{hasSheet ? '↺ Regenerate Sheet' : 'Generate Sheet'}</button>
        )}
      </div>
      <style>{`@keyframes bdSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export function NewBrandModal({ onClose, onSave }) {
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [images, setImages] = useState([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()

  function handleFiles(files) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 5 - images.length)
    arr.forEach(f => {
      const r = new FileReader()
      r.onload = ev => compressImage(ev.target.result).then(url => setImages(prev => [...prev, url].slice(0, 5)))
      r.readAsDataURL(f)
    })
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:20,padding:28,width:400,maxWidth:'90vw',boxShadow:'var(--shadow-lg)'}}>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.4px',marginBottom:20}}>New Brand Deal</div>

        <label style={{display:'block',marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Brand Name</div>
          <input autoFocus value={brand} onChange={e=>setBrand(e.target.value)}
            placeholder="e.g. Nike"
            style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',boxSizing:'border-box'}}/>
        </label>

        <label style={{display:'block',marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Category</div>
          <input value={category} onChange={e=>setCategory(e.target.value)}
            placeholder="e.g. Fitness, Beauty, Tech…"
            style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',boxSizing:'border-box'}}/>
        </label>

        <div style={{marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4}}>Product Images</div>
          <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:10}}>Up to 5 angles — front, back, sides, details. More = more accurate.</div>
          <div
            onDragOver={e=>{e.preventDefault();setDragging(true)}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false)}}
            onDrop={e=>{e.preventDefault();setDragging(false);handleFiles(e.dataTransfer.files)}}
            style={{
              borderRadius:10,padding:8,
              border: dragging ? '1.5px dashed #8B5CF6' : '1.5px dashed transparent',
              background: dragging ? 'rgba(139,92,246,0.07)' : 'transparent',
              transition:'all 0.15s',
            }}
          >
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {images.map((img,i) => (
                <div key={i} style={{position:'relative',aspectRatio:'1',borderRadius:8,overflow:'hidden',background:'var(--bg-tertiary)'}}>
                  <img src={img} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                  <button onClick={()=>setImages(prev=>prev.filter((_,j)=>j!==i))}
                    style={{position:'absolute',top:4,right:4,width:18,height:18,borderRadius:'50%',background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:11,border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                  {i===0&&<div style={{position:'absolute',bottom:4,left:4,fontSize:9,fontWeight:700,background:'rgba(0,0,0,0.6)',color:'#fff',padding:'2px 5px',borderRadius:4}}>MAIN</div>}
                </div>
              ))}
              {images.length < 5 && (
                <div onClick={()=>fileRef.current.click()} style={{aspectRatio:'1',borderRadius:8,border:'1.5px dashed var(--border)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,cursor:'pointer',background:'var(--bg-tertiary)'}}>
                  <span style={{fontSize:20,opacity:0.3}}>+</span>
                  <span style={{fontSize:10,color:'var(--text-tertiary)'}}>{dragging?'Drop here':'Add photo'}</span>
                </div>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{handleFiles(e.target.files);e.target.value=''}}/>
        </div>

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',borderRadius:10,border:'1.5px solid var(--border)',fontSize:14,fontWeight:500,color:'var(--text-secondary)',background:'transparent'}}>Cancel</button>
          <button
            disabled={!brand.trim()}
            onClick={()=>onSave({brand,category,image:images[0]||null,images})}
            style={{flex:2,padding:'10px',borderRadius:10,fontSize:14,fontWeight:700,background:brand.trim()?'linear-gradient(135deg,#EC4899,#8B5CF6)':'var(--border)',color:brand.trim()?'#fff':'var(--text-tertiary)',boxShadow:brand.trim()?'0 2px 12px rgba(139,92,246,0.3)':'none',transition:'all 0.15s'}}
          >Add Brand</button>
        </div>
      </div>
    </div>
  )
}

export function ImportBrandDealsModal({ deals, existingBrands, onImport, onClose }) {
  const [selected, setSelected] = useState(new Set())
  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)',borderRadius:20,padding:28,width:560,maxWidth:'92vw',boxShadow:'var(--shadow-lg)',maxHeight:'80vh',display:'flex',flexDirection:'column' }}>
        <div style={{ fontSize:18,fontWeight:700,letterSpacing:'-0.4px',marginBottom:4 }}>Import Brand Deals</div>
        <div style={{ fontSize:13,color:'var(--text-secondary)',marginBottom:20 }}>Select deals from the Brand Deals page to add to this influencer.</div>

        {deals.length === 0 ? (
          <div style={{ textAlign:'center',padding:'40px 20px',color:'var(--text-tertiary)',fontSize:13 }}>
            No brand deals yet — add some on the Brand Deals page first.
          </div>
        ) : (
          <div style={{ overflowY:'auto',flex:1,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:20 }}>
            {deals.map(deal => {
              const already = existingBrands.has(deal.brand.toLowerCase())
              const isSelected = selected.has(deal.id)
              const thumb = deal.characterSheet || deal.image
              return (
                <div
                  key={deal.id}
                  onClick={() => !already && toggle(deal.id)}
                  style={{
                    borderRadius:12,overflow:'hidden',cursor:already?'default':'pointer',
                    border:`2px solid ${isSelected?'#8B5CF6':already?'var(--border-subtle)':'var(--border)'}`,
                    background: isSelected ? 'rgba(139,92,246,0.08)' : 'var(--bg)',
                    opacity: already ? 0.5 : 1,
                    transition:'border-color 0.15s',
                  }}
                >
                  <div style={{ aspectRatio:'16/9',background:'var(--bg-tertiary)',position:'relative' }}>
                    {thumb
                      ? <img src={thumb} alt={deal.brand} style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }}/>
                      : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:800,color:'var(--text-tertiary)',opacity:0.25 }}>{deal.brand[0]}</div>
                    }
                    {isSelected && (
                      <div style={{ position:'absolute',top:6,right:6,width:20,height:20,borderRadius:'50%',background:'#8B5CF6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:700 }}>✓</div>
                    )}
                    {already && (
                      <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.35)',fontSize:11,fontWeight:700,color:'#fff' }}>Already added</div>
                    )}
                  </div>
                  <div style={{ padding:'8px 10px' }}>
                    <div style={{ fontSize:12,fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{deal.brand}</div>
                    {deal.category && <div style={{ fontSize:10,color:'var(--text-tertiary)',marginTop:1 }}>{deal.category}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display:'flex',gap:10 }}>
          <button onClick={onClose} style={{ flex:1,padding:'11px',borderRadius:10,border:'1.5px solid var(--border)',fontSize:14,fontWeight:500,color:'var(--text-secondary)',background:'transparent',cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
          <button
            disabled={selected.size === 0}
            onClick={() => { onImport(deals.filter(d => selected.has(d.id))); onClose() }}
            style={{ flex:2,padding:'11px',borderRadius:10,background:selected.size?'linear-gradient(135deg,#EC4899,#8B5CF6)':'var(--bg-tertiary)',color:selected.size?'#fff':'var(--text-tertiary)',fontSize:14,fontWeight:700,border:'none',cursor:selected.size?'pointer':'default',fontFamily:'inherit' }}
          >Import {selected.size > 0 ? `${selected.size} Deal${selected.size>1?'s':''}` : 'Selected'}</button>
        </div>
      </div>
    </div>
  )
}

export function BrandDealSection({ deals=[], onChange }) {
  const [globalDeals] = useBrandDeals()
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editId,setEditId]=useState(null)
  const [editBrand,setEditBrand]=useState('')
  const [lightbox,setLightbox]=useState(null)
  const [generating,setGenerating]=useState({})
  const [genProgress,setGenProgress]=useState({})
  const [claudeStatus,setClaudeStatus]=useState({})

  const existingBrands = new Set(deals.map(d => d.brand.toLowerCase()))

  function addDeal({brand,category,image,images}) {
    onChange([...deals,{id:generateId(),brand,category,image,images:images||[]}])
    setShowModal(false)
  }

  function importDeals(toImport) {
    const fresh = toImport
      .filter(d => !existingBrands.has(d.brand.toLowerCase()))
      .map(d => ({ ...d, id: generateId() }))
    if (fresh.length) onChange([...deals, ...fresh])
  }
  function updateDeal(id,updates){ onChange(deals.map(d=>d.id===id?{...d,...updates}:d)) }
  function deleteDeal(id){ onChange(deals.filter(d=>d.id!==id)) }
  function commitRename(){ if(editBrand.trim()) updateDeal(editId,{brand:editBrand.trim()}); setEditId(null); setEditBrand('') }

  async function handleGenerate(deal) {
    if (!isHFConnected()) { alert('Connect Higgsfield in Settings first'); return }
    if (!deal.image) { alert('Upload a product image first'); return }

    setGenerating(g=>({...g,[deal.id]:true}))
    setGenProgress(p=>({...p,[deal.id]:0}))

    let imagePrompt = null
    const allImages = deal.images?.length ? deal.images : (deal.image ? [deal.image] : [])
    if (allImages.length) {
      setClaudeStatus(s=>({...s,[deal.id]:'analyzing'}))
      try {
        setGenProgress(p=>({...p,[deal.id]:5}))
        imagePrompt = await buildCharSheetPromptWithClaude(allImages, deal.brand, deal.category)
        setClaudeStatus(s=>({...s,[deal.id]:'done'}))
        setTimeout(()=>setClaudeStatus(s=>({...s,[deal.id]:null})),3000)
      } catch(e) {
        alert('Claude: ' + e.message)
        setClaudeStatus(s=>({...s,[deal.id]:'error:'+e.message}))
        setTimeout(()=>setClaudeStatus(s=>({...s,[deal.id]:null})),5000)
      }
    }
    if (!imagePrompt) imagePrompt = buildCharSheetPrompt(deal.brand, deal.category)

    try {
      setGenProgress(p=>({...p,[deal.id]:15}))
      const sheetUrl = await generateSingleImage({
        prompt: imagePrompt,
        aspectRatio: '16:9',
        referenceImage: deal.image,
        onProgress: pct=>setGenProgress(prev=>({...prev,[deal.id]:pct})),
      })
      if (sheetUrl) updateDeal(deal.id,{characterSheet:sheetUrl})
    } catch(e) {
      console.error('[CharSheet] Higgsfield error:', e)
      if (!e.message?.includes('CANCELLED')) alert('Image generation step failed: '+e.message)
    } finally {
      setGenerating(g=>({...g,[deal.id]:false}))
      setGenProgress(p=>({...p,[deal.id]:0}))
    }
  }

  return (
    <div>
      {lightbox&&<Lightbox images={lightbox.images} startIndex={lightbox.start||0} onClose={()=>setLightbox(null)}/>}
      {showModal && <NewBrandModal onClose={()=>setShowModal(false)} onSave={addDeal}/>}
      {showImport && <ImportBrandDealsModal deals={globalDeals} existingBrands={existingBrands} onImport={importDeals} onClose={()=>setShowImport(false)}/>}
      {deals.length===0&&(
        <div style={{textAlign:'center',padding:'52px 0',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:36,marginBottom:10,opacity:.2}}>🤝</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>No brand deals yet</div>
          <div style={{fontSize:13}}>Add brands you want this influencer to promote.</div>
        </div>
      )}
      {deals.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:14,marginBottom:16}}>
          {deals.map(deal=>(
            <BrandDealCard
              key={deal.id} deal={deal}
              editingBrand={editId===deal.id} editBrand={editBrand}
              onEditBrand={setEditBrand}
              onStartEdit={()=>{setEditId(deal.id);setEditBrand(deal.brand)}}
              onCommitEdit={commitRename}
              onCancelEdit={()=>{setEditId(null);setEditBrand('')}}
              onImageChange={(img,imgs)=>updateDeal(deal.id, imgs ? {images:imgs,image:imgs[0],characterSheet:null} : {image:img,images:img?[img]:[],characterSheet:null})}
              onDelete={()=>deleteDeal(deal.id)}
              onCategoryChange={cat=>updateDeal(deal.id,{category:cat})}
              onLightbox={(imgs,start)=>setLightbox({images:imgs,start:start||0})}
              generating={!!generating[deal.id]}
              progress={genProgress[deal.id]||0}
              claudeStatus={claudeStatus[deal.id]||null}
              onGenerate={handleGenerate}
            />
          ))}
        </div>
      )}
      <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
        <button onClick={()=>setShowModal(true)} style={{
          display:'flex',alignItems:'center',gap:6,
          padding:'8px 16px',borderRadius:8,
          border:'1.5px dashed var(--border)',
          background:'transparent',color:'var(--text-secondary)',
          fontSize:13,fontWeight:500,cursor:'pointer',
          transition:'border-color 0.15s, color 0.15s',
        }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-secondary)'}}
        >+ Add Brand</button>
        {globalDeals.length > 0 && (
          <button onClick={()=>setShowImport(true)} style={{
            display:'flex',alignItems:'center',gap:6,
            padding:'8px 16px',borderRadius:8,
            border:'1.5px solid rgba(139,92,246,0.35)',
            background:'rgba(139,92,246,0.07)',color:'#8B5CF6',
            fontSize:13,fontWeight:600,cursor:'pointer',
            transition:'border-color 0.15s, background 0.15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(139,92,246,0.14)';e.currentTarget.style.borderColor='#8B5CF6'}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(139,92,246,0.07)';e.currentTarget.style.borderColor='rgba(139,92,246,0.35)'}}
          >↓ Import from Brand Deals</button>
        )}
      </div>
    </div>
  )
}

