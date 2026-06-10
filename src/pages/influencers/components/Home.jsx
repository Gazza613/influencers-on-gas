import { useState } from 'react'
import Lightbox from '../../../components/Lightbox'
import { generateId } from '../../../store'
import { accent } from '../helpers'
import { WorldDropCard } from './WorldDrops'

// ─────────────────────────────────────────────
// Home section — same WorldDropCard design for home/room photos
export function HomeSection({ slots=[], onChange }) {
  const [editId,setEditId]=useState(null)
  const [editName,setEditName]=useState('')
  const [lightboxUrl,setLightboxUrl]=useState(null)

  function addSlot() { onChange([...slots,{id:generateId(),name:`Room ${slots.length+1}`,image:null}]) }
  function updateSlot(id,updates){ onChange(slots.map(s=>s.id===id?{...s,...updates}:s)) }
  function deleteSlot(id){ onChange(slots.filter(s=>s.id!==id)) }
  function commitRename(){ if(editName.trim()) updateSlot(editId,{name:editName.trim()}); setEditId(null); setEditName('') }

  return (
    <div>
      {lightboxUrl&&<Lightbox images={[lightboxUrl]} startIndex={0} onClose={()=>setLightboxUrl(null)}/>}
      {slots.length===0&&(
        <div style={{textAlign:'center',padding:'52px 0',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:36,marginBottom:10,opacity:.2}}>🏠</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>No home photos yet</div>
          <div style={{fontSize:13}}>Add room and home photos for your influencer.</div>
        </div>
      )}
      {slots.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:14,marginBottom:16}}>
          {slots.map(slot=>(
            <WorldDropCard
              key={slot.id} drop={slot}
              editing={editId===slot.id} editName={editName}
              onEditName={setEditName}
              onStartEdit={()=>{setEditId(slot.id);setEditName(slot.name)}}
              onCommitEdit={commitRename}
              onCancelEdit={()=>{setEditId(null);setEditName('')}}
              onImageChange={img=>updateSlot(slot.id,{image:img})}
              onDelete={()=>deleteSlot(slot.id)}
              onLightbox={()=>setLightboxUrl(slot.image)}
            />
          ))}
        </div>
      )}
      <button onClick={addSlot} style={{
        display:'flex',alignItems:'center',gap:6,
        padding:'8px 16px',borderRadius:8,
        border:'1.5px dashed var(--border)',
        background:'transparent',color:'var(--text-secondary)',
        fontSize:13,fontWeight:500,cursor:'pointer',
        transition:'border-color 0.15s, color 0.15s',
      }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-secondary)'}}
      >+ Add Room</button>
    </div>
  )
}

// ─────────────────────────────────────────────
