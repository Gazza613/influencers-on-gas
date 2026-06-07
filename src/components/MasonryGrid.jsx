import { useRef, useState } from 'react'
import Lightbox from './Lightbox'
import { compressImage, downloadImage } from '../utils/imageUtils'

export default function MasonryGrid({ images = [], onChange, emptyLabel = 'Add images', cols = 3 }) {
  const fileRef = useRef()
  const [lightbox, setLightbox] = useState(null)
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

  function remove(idx) { onChange(images.filter((_, i) => i !== idx)) }

  return (
    <>
      {lightbox !== null && (
        <Lightbox images={images} startIndex={lightbox} onClose={() => setLightbox(null)} />
      )}

      {images.length === 0 ? (
        <div
          onClick={() => fileRef.current.click()}
          style={{
            border: '1.5px dashed var(--border)', borderRadius: 12,
            padding: '48px 24px', textAlign: 'center',
            cursor: 'pointer', background: 'var(--bg-tertiary)',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <div style={{ fontSize: 22, opacity: 0.25, marginBottom: 8 }}>+</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 500 }}>{emptyLabel}</div>
        </div>
      ) : (
        <div style={{ columns: cols, gap: 10 }}>
          {images.map((src, i) => (
            <div key={i} style={{ breakInside: 'avoid', marginBottom: 10, position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in' }}>
              <img
                src={src}
                alt=""
                onClick={() => setLightbox(i)}
                style={{ width: '100%', display: 'block' }}
              />
              <button
                onClick={e => { e.stopPropagation(); downloadImage(src, `image-${i + 1}.jpg`) }}
                style={{
                  position: 'absolute', bottom: 7, left: 7,
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, border: '1px solid rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(4px)',
                }}
              >↓</button>
              <button
                onClick={e => { e.stopPropagation(); remove(i) }}
                style={{
                  position: 'absolute', bottom: 7, right: 7,
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, border: '1px solid rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(4px)', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.85)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)' }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => fileRef.current.click()}
        style={{
          marginTop: images.length > 0 ? 12 : 0,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8,
          border: '1.5px dashed var(--border)',
          background: 'transparent', color: 'var(--text-secondary)',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
      >
        + Add more
      </button>

      <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
    </>
  )
}
