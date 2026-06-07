import { useState, useEffect } from 'react'

// Shared-password gate. Shows a password screen until the team password is
// accepted; the server sets an httpOnly cookie so every API call is then
// authorized. If the gate is disabled server-side, this renders children
// immediately.
export default function AppGate({ children }) {
  const [status, setStatus] = useState('checking') // checking | locked | open
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth-check')
      .then(r => { if (!cancelled) setStatus(r.ok ? 'open' : 'locked') })
      .catch(() => { if (!cancelled) setStatus('locked') })
    return () => { cancelled = true }
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!pw.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (res.ok) setStatus('open')
      else setError('Incorrect password. Please try again.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'open') return children
  if (status === 'checking') {
    return (
      <div style={screenStyle}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'gatespin 0.7s linear infinite' }} />
        <style>{`@keyframes gatespin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={screenStyle}>
      <form onSubmit={submit} style={cardStyle}>
        <img src="/gas-logo.png" alt="GAS" style={{ width: 77, height: 77, marginBottom: 18, borderRadius: '50%' }} />
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
          <span style={{ background: 'linear-gradient(135deg,#EC4899 0%,#A855F7 50%,#60A5FA 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Influencers on </span>
          <span style={{ fontWeight: 900, background: 'linear-gradient(135deg,#FFB020 0%,#FF6A00 45%,#FF2D55 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>GAS</span>
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: '8px 0 24px' }}>Enter the team password to continue.</p>
        <input
          autoFocus
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Team password"
          style={inputStyle}
        />
        {error && <div style={{ color: '#FF6B6B', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <button type="submit" disabled={submitting} style={{ ...buttonStyle, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

const screenStyle = {
  position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#0A0A0A', zIndex: 9999, fontFamily: 'inherit',
}
const cardStyle = {
  width: 'min(360px, 90vw)', padding: 32, borderRadius: 16,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', flexDirection: 'column',
}
const inputStyle = {
  padding: '12px 14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, outline: 'none', fontFamily: 'inherit',
}
const buttonStyle = {
  marginTop: 18, padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: '#C9FF00', color: '#0A0A0A', fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
}
