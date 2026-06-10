import { useState } from 'react'
import { FI, FL, GenderButtons } from './common'

// ─────────────────────────────────────────────
// New influencer modal
export function NewModal({ onClose, onSave }) {
  const [name,setName]=useState('')
  const [gender,setGender]=useState('')
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:20,padding:32,width:360,boxShadow:'var(--shadow-lg)'}}>
        <h2 style={{fontSize:20,fontWeight:700,letterSpacing:'-0.4px',marginBottom:20}}>New Influencer</h2>
        <label style={{display:'block',marginBottom:16}}><FL>Name</FL><FI value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Luna Rose"/></label>
        <div style={{marginBottom:28}}><FL>Gender</FL><GenderButtons value={gender} onChange={setGender}/></div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:10,borderRadius:8,border:'1.5px solid var(--border)',fontSize:14,fontWeight:500,color:'var(--text-secondary)',background:'transparent'}}>Cancel</button>
          <button disabled={!name.trim()} onClick={()=>onSave(name.trim(),gender)}
            style={{flex:1,padding:10,borderRadius:8,background:name.trim()?'linear-gradient(135deg,#EC4899,#8B5CF6)':'var(--border)',color:name.trim()?'#fff':'var(--text-tertiary)',fontSize:14,fontWeight:600,boxShadow:name.trim()?'0 2px 12px rgba(139,92,246,0.3)':'none',transition:'all 0.15s'}}>Create</button>
        </div>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────
// Content Studio helpers


