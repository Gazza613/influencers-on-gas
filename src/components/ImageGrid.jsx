import { useRef, useState } from 'react'
import Lightbox from './Lightbox'
import { compressImage, downloadImage } from '../utils/imageUtils'

export default function ImageGrid({ images = [], onChange, emptyLabel = 'Add images', columns = 3 }) {
  const fileRef = useRef()
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const [lightbox, setLightbox] = useState(null) // index
  const imagesRef = useRef(images)
  imagesRef.current = images

  function handleFiles(files) {
    const readers = Array.from(files).map(f => new Promise(res => {
      const r = new FileReader()
      r.onload = e => compressImage(e.target.result).then(res)
      r.readAsDataURL(f)
    }))
    Promise.all(readers).then(results => onChange([...imagesRef.current, ...results])).catch(console.error)
  }

  function remove(idx) {
    onChange(images.filter((_, i) => i !== idx))
  }

  // Drag-to-reorder
  function onDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', idx)
  }

  function onDragOver(e, idx) {
    e.preventDefault()
    setOverIdx(idx)
  }

  function onDrop(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return }
    const next = [...images]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(idx, 0, moved)
    onChange(next)
    setDragIdx(null); setOverIdx(null)
  }

  function onDragEnd() { setDragIdx(null); setOverIdx(null) }

  return (
    <>
      {lightbox !== null && (
        <Lightbox images={images} startIndex={lightbox} onClose={() => setLightbox(null)} />
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(columns, 4)}, 1fr)`,
        gap: 10,
      }}>
        {images.map((src, i) => (
          <div
            key={i}
            draggable
            onDragStart={e => onDragStart(e, i)}
            onDragOver={e => onDragOver(e, i)}
            onDrop={e => onDrop(e, i)}
            onDragEnd={onDragEnd}
            style={{
              position: 'relative',
              borderRadius: 10,
              overflow: 'hidden',
              aspectRatio: '1',
              background: 'var(--bg-tertiary)',
              cursor: 'grab',
              opacity: dragIdx === i ? 0.45 : 1,
              outline: overIdx === i && dragIdx !== i ? '2px solid var(--accent)' : 'none',
              transition: 'opacity 0.15s, outline 0.1s',
            }}
          >
            <img
              src={src}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
            />

            {/* Lightbox trigger overlay */}
            <div
              onClick={() => setLightbox(i)}
              style={{
                position: 'absolute', inset: 0,
                cursor: 'zoom-in',
                background: 'rgba(0,0,0,0)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0)' }}
            />

            {/* Download button */}
            <button
              onClick={e => { e.stopPropagation(); downloadImage(src, `image-${i + 1}.jpg`) }}
              style={{
                position: 'absolute', bottom: 6, left: 6,
                width: 22, height: 22, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', color: '#fff',
                fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, zIndex: 2, border: '1px solid rgba(255,255,255,0.15)',
                backdropFilter: 'blur(4px)',
              }}
            >↓</button>

            {/* Delete button */}
            <button
              onClick={e => { e.stopPropagation(); remove(i) }}
              style={{
                position: 'absolute', bottom: 6, right: 6,
                width: 22, height: 22, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', color: '#fff',
                fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, zIndex: 2, border: '1px solid rgba(255,255,255,0.15)',
                backdropFilter: 'blur(4px)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.background = 'rgba(220,50,50,0.85)' }}
              onMouseLeave={e => { e.stopPropagation(); e.currentTarget.style.background = 'rgba(0,0,0,0.6)' }}
            >×</button>

            {/* Drag handle */}
            <div style={{
              position: 'absolute', top: 6, left: 6,
              width: 18, height: 18,
              background: 'rgba(0,0,0,0.4)',
              borderRadius: 4, backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0.6,
            }}>
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <rect y="0" width="10" height="1.5" rx="0.75" fill="white"/>
                <rect y="3.25" width="10" height="1.5" rx="0.75" fill="white"/>
                <rect y="6.5" width="10" height="1.5" rx="0.75" fill="white"/>
              </svg>
            </div>
          </div>
        ))}

        {/* Add slot */}
        <div
          onClick={() => fileRef.current.click()}
          style={{
            aspectRatio: '1', borderRadius: 10,
            border: '1.5px dashed var(--border)',
            background: 'var(--bg-tertiary)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', gap: 6, transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <span style={{ fontSize: 20, opacity: 0.3 }}>+</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'center' }}>{emptyLabel}</span>
        </div>
      </div>

      <input
        ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
      />
    </>
  )
}
