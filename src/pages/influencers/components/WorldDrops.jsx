import { useState, useRef } from 'react'
import Lightbox from '../../../components/Lightbox'
import { generateId } from '../../../store'
import { compressImage, downloadImage } from '../../../utils/imageUtils'
import { accent } from '../helpers'

// ─────────────────────────────────────────────
// World Drops
export function WorldDropCard({ drop, editing, editName, onEditName, onStartEdit, onCommitEdit, onCancelEdit, onImageChange, onDelete, onLightbox }) {
  const fileRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(onImageChange).catch(console.error)
    r.readAsDataURL(f)
  }

  return (
    <div
      style={{ background:'var(--bg)', borderRadius:12, border:`1.5px solid ${dragOver?'#8B5CF6':hovered?'var(--accent)':'var(--border)'}`, overflow:'hidden', boxShadow:hovered?'var(--shadow-md)':'none', transition:'border-color 0.15s, box-shadow 0.15s' }}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
    >
      {/* Image slot */}
      <div
        style={{ aspectRatio:'4/3', background: dragOver ? 'rgba(139,92,246,0.07)' : 'var(--bg-tertiary)', overflow:'hidden', cursor:'pointer', position:'relative', transition:'background 0.15s' }}
        onClick={() => drop.image ? onLightbox?.() : fileRef.current.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}}
      >
        {drop.image
          ? <>
              <img src={drop.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', transition:'background 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,0,0,0.2)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0)'}}
              >
                <button onClick={e=>{e.stopPropagation();onImageChange(null)}} style={{
                  position:'absolute', top:6, right:6, width:22, height:22, borderRadius:'50%',
                  background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:13,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  backdropFilter:'blur(4px)', border:'1px solid rgba(255,255,255,0.15)',
                }}>×</button>
              </div>
            </>
          : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span style={{ fontSize:22, opacity: dragOver ? 0.6 : 0.22 }}>+</span>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontWeight:500 }}>{dragOver ? 'Drop to upload' : 'Upload or drag & drop'}</span>
            </div>
        }
        <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e=>{handleFile(e.target.files[0]);e.target.value=''}}/>
      </div>

      {/* Name + hover-reveal actions */}
      <div style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:6, minHeight:42 }}>
        {editing
          ? <input autoFocus value={editName} onChange={e=>onEditName(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={e=>{if(e.key==='Enter')onCommitEdit();if(e.key==='Escape')onCancelEdit()}}
              style={{ flex:1, fontSize:13, fontWeight:600, border:'none', background:'transparent', color:'var(--text-primary)', outline:'none' }}/>
          : <span style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{drop.name}</span>
        }
        <div style={{ display:'flex', gap:3, flexShrink:0, opacity: hovered ? 1 : 0, transition:'opacity 0.15s' }}>
          {drop.image && (
            <button onClick={e=>{e.stopPropagation();downloadImage(drop.image,`${drop.name||'wardrobe'}.jpg`)}} title="Download" style={{
              width:26, height:26, borderRadius:7, border:'none', cursor:'pointer',
              background:'var(--bg-tertiary)', color:'var(--text-secondary)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
            }}>↓</button>
          )}
          <button onClick={e=>{e.stopPropagation();onStartEdit()}} title="Rename" style={{
            width:26, height:26, borderRadius:7, border:'none', cursor:'pointer',
            background:'var(--bg-tertiary)', color:'var(--text-secondary)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
          }}>✎</button>
          <button onClick={e=>{e.stopPropagation();onDelete()}} title="Delete" style={{
            width:26, height:26, borderRadius:7, border:'none', cursor:'pointer',
            background:'rgba(255,59,48,0.08)', color:'#FF3B30',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, lineHeight:1,
          }}>×</button>
        </div>
      </div>
    </div>
  )
}

export function WorldDropSection({ drops=[], onChange }) {
  const [editId,setEditId]=useState(null)
  const [editName,setEditName]=useState('')
  const [lightboxUrl,setLightboxUrl]=useState(null)

  function addDrop() {
    onChange([...drops, { id:generateId(), name:`Wardrobe ${drops.length+1}`, image:null }])
  }
  function updateDrop(id,updates){ onChange(drops.map(d=>d.id===id?{...d,...updates}:d)) }
  function deleteDrop(id){ onChange(drops.filter(d=>d.id!==id)) }
  function commitRename(){ if(editName.trim()) updateDrop(editId,{name:editName.trim()}); setEditId(null); setEditName('') }

  return (
    <div>
      {lightboxUrl&&<Lightbox images={[lightboxUrl]} startIndex={0} onClose={()=>setLightboxUrl(null)}/>}
      {drops.length===0&&(
        <div style={{ textAlign:'center', padding:'52px 0', color:'var(--text-tertiary)' }}>
          <div style={{ fontSize:36, marginBottom:10, opacity:.2 }}>👗</div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--text-secondary)', marginBottom:6 }}>No wardrobe slots yet</div>
          <div style={{ fontSize:13 }}>Add wardrobe slots to organize your influencer's looks.</div>
        </div>
      )}
      {drops.length>0&&(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:14, marginBottom:16 }}>
          {drops.map(drop=>(
            <WorldDropCard
              key={drop.id} drop={drop}
              editing={editId===drop.id} editName={editName}
              onEditName={setEditName}
              onStartEdit={()=>{setEditId(drop.id);setEditName(drop.name)}}
              onCommitEdit={commitRename}
              onCancelEdit={()=>{setEditId(null);setEditName('')}}
              onImageChange={img=>updateDrop(drop.id,{image:img})}
              onDelete={()=>deleteDrop(drop.id)}
              onLightbox={()=>setLightboxUrl(drop.image)}
            />
          ))}
        </div>
      )}
      <button onClick={addDrop} style={{
        display:'flex', alignItems:'center', gap:6,
        padding:'8px 16px', borderRadius:8,
        border:'1.5px dashed var(--border)',
        background:'transparent', color:'var(--text-secondary)',
        fontSize:13, fontWeight:500, cursor:'pointer',
        transition:'border-color 0.15s, color 0.15s',
      }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-secondary)'}}
      >+ Add Wardrobe</button>
    </div>
  )
}

