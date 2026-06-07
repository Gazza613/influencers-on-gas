import { useState, useRef } from 'react'
import { useInspirationBoards, generateId } from '../store'
import { compressImage } from '../utils/imageUtils'
import Lightbox from '../components/Lightbox'

function downloadImage(src, filename) {
  const a = document.createElement('a')
  a.href = src
  a.download = filename
  a.click()
}

function BoardCard({ board, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(board.name)
  const previews = board.images?.slice(0, 4) ?? []

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        transition: 'box-shadow 0.18s, transform 0.18s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'translateY(0)' }}
      onClick={() => onSelect(board.id)}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', aspectRatio: '4/3', background: 'var(--bg-tertiary)' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
            {previews[i]
              ? <img src={previews[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: 'var(--bg-tertiary)' }} />
            }
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={() => { if (name.trim()) onRename(board.id, name.trim()); else setName(board.name); setEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { if (name.trim()) onRename(board.id, name.trim()); else setName(board.name); setEditing(false) } if (e.key === 'Escape') { setName(board.name); setEditing(false) } }}
            style={{
              fontSize: 14, fontWeight: 600, border: 'none',
              background: 'transparent', color: 'var(--text-primary)',
              outline: 'none', width: '100%',
            }}
          />
        ) : (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{board.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{board.images?.length ?? 0} images</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditing(true)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}>Rename</button>
          <button onClick={() => { if (!board.images?.length || window.confirm(`Delete "${board.name}" and its ${board.images.length} image${board.images.length !== 1 ? 's' : ''}?`)) onDelete(board.id) }} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, color: '#FF3B30', background: 'rgba(255,59,48,0.1)' }}>×</button>
        </div>
      </div>
    </div>
  )
}

function BoardDetail({ board, onBack, onUpdate }) {
  const fileRef = useRef()
  const [lightboxIdx, setLightboxIdx] = useState(null)

  const boardImagesRef = useRef(board.images)
  boardImagesRef.current = board.images

  function addImages(files) {
    const readers = Array.from(files).map(file => new Promise(resolve => {
      const r = new FileReader()
      r.onload = e => compressImage(e.target.result).then(resolve)
      r.readAsDataURL(file)
    }))
    Promise.all(readers).then(results => {
      onUpdate(board.id, { images: [...(boardImagesRef.current ?? []), ...results] })
    }).catch(console.error)
  }

  function removeImage(idx) {
    const next = board.images.filter((_, i) => i !== idx)
    onUpdate(board.id, { images: next })
  }

  function downloadAll() {
    board.images.forEach((img, i) => {
      setTimeout(() => downloadImage(img, `${board.name}-${i + 1}.jpg`), i * 120)
    })
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 28px' }}>
      {lightboxIdx !== null && (
        <Lightbox
          images={board.images}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--surface)' }}
        >← Back</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', flex: 1 }}>{board.name}</h1>
        {board.images?.length > 0 && (
          <button
            onClick={downloadAll}
            style={{ padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 6 }}
          >↓ Download All</button>
        )}
      </div>

      <div style={{
        border: '2px dashed var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '28px',
        textAlign: 'center',
        marginBottom: 24,
        cursor: 'pointer',
        background: 'var(--surface)',
      }} onClick={() => fileRef.current.click()}>
        <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>+</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Add images from Pinterest, Instagram, etc.</div>
        <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
          onChange={e => addImages(e.target.files)} />
      </div>

      {board.images?.length > 0 && (
        <div style={{ columns: 3, gap: 12 }}>
          {board.images.map((img, i) => (
            <div
              key={i}
              style={{ breakInside: 'avoid', marginBottom: 12, borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative', cursor: 'zoom-in' }}
              onClick={() => setLightboxIdx(i)}
            >
              <img src={img} alt="" style={{ width: '100%', display: 'block', transition: 'transform 0.3s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              />
              {/* Overlay buttons — shown on hover via pointer-events */}
              <div style={{
                position: 'absolute', top: 8, right: 8,
                display: 'flex', gap: 6,
              }}>
                <button
                  onClick={e => { e.stopPropagation(); downloadImage(img, `${board.name}-${i + 1}.jpg`) }}
                  title="Download"
                  style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.5)', color: '#fff',
                    fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >↓</button>
                <button
                  onClick={e => { e.stopPropagation(); removeImage(i) }}
                  style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.5)', color: '#fff',
                    fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Inspiration() {
  const [boards, setBoards] = useInspirationBoards()
  const [selectedId, setSelectedId] = useState(null)

  function createBoard() {
    const board = { id: generateId(), name: 'New Board', images: [], createdAt: Date.now() }
    setBoards(prev => [...prev, board])
  }

  function renameBoard(id, name) {
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
  }

  function deleteBoard(id) {
    setBoards(prev => prev.filter(b => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function updateBoard(id, updates) {
    setBoards(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
  }

  const selected = boards.find(b => b.id === selectedId)

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      {selected ? (
        <BoardDetail board={selected} onBack={() => setSelectedId(null)} onUpdate={updateBoard} />
      ) : (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px' }}>Inspiration</h1>
            <button
              onClick={createBoard}
              style={{
                padding: '9px 20px', borderRadius: 980,
                background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff',
                fontSize: 14, fontWeight: 600,
                boxShadow: '0 2px 12px rgba(139,92,246,0.3)',
              }}
            >+ New Board</button>
          </div>

          {boards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
              <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>No boards yet</p>
              <p style={{ fontSize: 13 }}>Create a board to start saving mood board inspiration</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {boards.map(board => (
                <BoardCard
                  key={board.id}
                  board={board}
                  onSelect={setSelectedId}
                  onRename={renameBoard}
                  onDelete={deleteBoard}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
