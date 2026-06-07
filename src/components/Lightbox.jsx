import { useEffect, useState } from 'react'

export default function Lightbox({ images, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  const multi = images.length > 1

  useEffect(() => {
    setIdx(i => Math.min(i, Math.max(0, images.length - 1)))
  }, [images.length])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && multi) setIdx(i => Math.min(i + 1, images.length - 1))
      if (e.key === 'ArrowLeft' && multi) setIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images, multi, onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)', color: '#fff',
          fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.15)',
          backdropFilter: 'blur(8px)',
        }}
      >×</button>

      {/* Counter */}
      {multi && (
        <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Prev */}
      {multi && idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(i => i - 1) }}
          style={{
            position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', color: '#fff',
            fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
          }}
        >‹</button>
      )}

      {/* Image — click to close */}
      <img
        src={images[idx]}
        onClick={onClose}
        style={{cursor:'zoom-out',
          maxWidth: '88vw', maxHeight: '88vh',
          objectFit: 'contain',
          borderRadius: 8,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          userSelect: 'none',
        }}
        alt=""
      />

      {/* Next */}
      {multi && idx < images.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(i => i + 1) }}
          style={{
            position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', color: '#fff',
            fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
          }}
        >›</button>
      )}

      {/* Thumbnails strip */}
      {multi && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, maxWidth: '90vw', overflowX: 'auto',
          paddingBottom: 4,
        }}>
          {images.map((src, i) => (
            <div
              key={i}
              onClick={e => { e.stopPropagation(); setIdx(i) }}
              style={{
                width: 44, height: 44, borderRadius: 6,
                overflow: 'hidden', cursor: 'pointer',
                border: i === idx ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                opacity: i === idx ? 1 : 0.55,
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
