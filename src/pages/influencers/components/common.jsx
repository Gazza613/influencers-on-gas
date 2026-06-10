// Small, self-contained presentational components shared across the Influencers
// page and its studios. Extracted verbatim from Influencers.jsx — no behavior change.
import { useState, useEffect } from 'react'
import { SD, GM, DEFAULT_PALETTES } from '../constants'
import { accentText } from '../helpers'

// Completeness ring
export function Ring({ pct, size=42 }) {
  const r=(size-5)/2, c=2*Math.PI*r, off=c-(pct/100)*c
  const col = pct>=80?'#34C759':pct>=50?'#F97316':pct>=25?'#0071E3':'#555'
  return (
    <svg width={size} height={size} style={{position:'absolute',top:-1,left:-1,pointerEvents:'none'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={SD.ring} strokeWidth={2.5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={2.5}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:'stroke-dashoffset 0.5s,stroke 0.3s'}}/>
    </svg>
  )
}

// Context menu
export function CtxMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const h = () => onClose()
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', h, { once: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', h)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'fixed', top:y, left:x, zIndex:400,
      background:'rgba(28,28,30,0.96)', backdropFilter:'blur(20px)',
      borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.1)',
      padding:4, minWidth:170,
    }}>
      {items.map(({label,color,action})=>(
        <button key={label} onClick={()=>{action();onClose()}} style={{
          display:'block', width:'100%', textAlign:'left',
          padding:'9px 14px', borderRadius:8,
          fontSize:13, fontWeight:500,
          color: color||'#F4F4F5', background:'transparent', transition:'background 0.1s',
        }}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}
        >{label}</button>
      ))}
    </div>
  )
}

export function GenLoadingOverlay({ elapsed, onCancel, maxLabel = '5 min' }) {
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:5, borderRadius:10,
      background:'rgba(10,10,18,0.82)', backdropFilter:'blur(6px)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10,
    }}>
      <div style={{
        width:32, height:32, borderRadius:'50%',
        border:'2.5px solid rgba(139,92,246,0.25)',
        borderTopColor:'#A78BFA',
        animation:'spin 0.9s linear infinite',
      }}/>
      <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.9)',letterSpacing:'0.2px'}}>Generating…</div>
      <div style={{fontSize:10,color:'rgba(255,255,255,0.38)',textAlign:'center',lineHeight:1.5}}>
        Up to {maxLabel}<br/>
        <span style={{color:'rgba(255,255,255,0.55)',fontVariantNumeric:'tabular-nums'}}>{timeStr}</span>
      </div>
      {onCancel && (
        <button onClick={onCancel} style={{
          marginTop:2, padding:'5px 14px', borderRadius:980, fontSize:11, fontWeight:600,
          background:'rgba(255,255,255,0.10)', color:'rgba(255,255,255,0.6)',
          border:'1px solid rgba(255,255,255,0.15)', backdropFilter:'blur(4px)',
          transition:'background 0.15s',
        }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.18)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.10)'}
        >Cancel</button>
      )}
    </div>
  )
}

// Field helpers
export function FL({ children }) {
  return <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>{children}</div>
}
export function FI({ value, onChange, placeholder }) {
  return <input value={value} onChange={onChange} placeholder={placeholder} style={{width:'100%',padding:'10px 14px',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)'}}/>
}
export function FTA({ value, onChange, placeholder, rows=3 }) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{width:'100%',padding:'10px 14px',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',resize:'vertical',lineHeight:1.6}}/>
}

// Gender buttons
export function GenderButtons({ value, onChange }) {
  return (
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      {Object.entries(GM).map(([g,m])=>{
        const active=value===g
        return (
          <button key={g} onClick={()=>onChange(g)} style={{
            padding:'4px 11px',borderRadius:20,fontSize:12,fontWeight:600,
            border:`1.5px solid ${active?m.border:'var(--border)'}`,
            background:active?m.bg:'transparent',color:active?m.color:'var(--text-tertiary)',
            transition:'all 0.15s',display:'flex',alignItems:'center',gap:4,
            cursor:'pointer',whiteSpace:'nowrap',
          }}>
            <span style={{fontSize:11}}>{m.icon}</span>
            <span>{g}</span>
          </button>
        )
      })}
    </div>
  )
}

// Color palette
export function ColorPalette({ palette=[], onChange, gender }) {
  const defs = DEFAULT_PALETTES[gender]||['#E5E7EB','#D1D5DB','#9CA3AF','#6B7280']
  const cols = palette.length===4?palette:defs
  return (
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      {[0,1,2,3].map(i=>(
        <label key={i} style={{cursor:'pointer',position:'relative'}}>
          <div style={{width:30,height:30,borderRadius:8,background:cols[i],border:'2px solid rgba(0,0,0,0.1)',boxShadow:'0 1px 4px rgba(0,0,0,0.12)',transition:'transform 0.15s'}}
            onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)'}}/>
          <input type="color" value={cols[i]} onChange={e=>{const n=[...cols];n[i]=e.target.value;onChange(n)}}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer',border:'none',padding:0}}/>
        </label>
      ))}
      <button onClick={()=>onChange(defs)} style={{padding:'4px 9px',borderRadius:7,border:'1px solid var(--border)',fontSize:11,fontWeight:500,color:'var(--text-tertiary)',background:'transparent',cursor:'pointer'}}>Reset</button>
    </div>
  )
}

// Reusable tile for the description grid
export function InfoCell({ label, icon, children, span }) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      style={{
        background: focused ? 'var(--surface)' : 'var(--bg)',
        borderRadius: 12,
        padding: '13px 16px',
        border: `1.5px solid ${focused ? 'var(--accent)' : 'transparent'}`,
        boxShadow: focused ? '0 0 0 3px rgba(0,113,227,0.09)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        gridColumn: span ? `span ${span}` : undefined,
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 7,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
        {label}
      </div>
      {children}
    </div>
  )
}

// Bare input — no box, just text
export function BareInput({ value, onChange, placeholder, multiline, rows = 3 }) {
  const s = {
    width: '100%', border: 'none', background: 'transparent',
    padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
    color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
    outline: 'none', resize: multiline ? 'vertical' : 'none',
    lineHeight: 1.6,
  }
  return multiline
    ? <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={s}/>
    : <input value={value} onChange={onChange} placeholder={placeholder} style={s}/>
}

export function Sec({ children, style }) {
  return (
    <div
      style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:20,boxShadow:'var(--shadow-sm)',border:'1px solid var(--border-subtle)',transition:'box-shadow 0.2s',...style}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='var(--shadow-md)'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='var(--shadow-sm)'}}
    >{children}</div>
  )
}

// Detail tabs with palette-tinted active state
const DETAIL_TABS = ['Overview','Scripts','Wardrobe','Home','Brand Deals','History']

export function Tabs({ active, onChange, ac }) {
  const tc = accentText(ac)
  return (
    <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
      {DETAIL_TABS.map(tab=>(
        <button key={tab} onClick={()=>onChange(tab)} style={{
          padding:'7px 16px',borderRadius:8,fontSize:13,fontWeight:500,
          background: active===tab ? ac : 'var(--bg-tertiary)',
          color: active===tab ? tc : 'var(--text-secondary)',
          border: `1.5px solid ${active===tab ? ac+'55' : 'transparent'}`,
          transition:'all 0.18s',
        }}>{tab}</button>
      ))}
    </div>
  )
}

// Content Studio helpers
export function CSStepHeader({ n, title, sub }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
      <div style={{
        width:22,height:22,borderRadius:'50%',flexShrink:0,
        background:'linear-gradient(135deg,#EC4899,#8B5CF6)',
        color:'#fff',fontSize:11,fontWeight:800,
        display:'flex',alignItems:'center',justifyContent:'center',
      }}>{n}</div>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',lineHeight:1.2}}>{title}</div>
        {sub && <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{sub}</div>}
      </div>
    </div>
  )
}

export function CSChips({ options, value, onChange }) {
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
      {options.map(o=>{
        const key = typeof o === 'object' ? o.key : o
        const label = typeof o === 'object' ? o.label : o
        const on = value === key
        return (
          <button key={key} onClick={()=>onChange(on ? '' : key)} style={{
            padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
            background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
            color: on ? '#8B5CF6' : 'var(--text-secondary)',
            border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
            transition:'all 0.15s',
          }}>{label}</button>
        )
      })}
    </div>
  )
}
