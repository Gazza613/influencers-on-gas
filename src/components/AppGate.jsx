import { useState, useEffect } from 'react'

// Shared-password gate, styled to match the "Media on GAS" login.
// Shows a password screen until the team password is accepted; the server sets
// an httpOnly cookie so every API call is then authorized. If the gate is
// disabled server-side, this renders children immediately.

const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
const ORANGE = '#f96203'

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

  return (
    <div style={screenStyle}>
      {/* warm + cool ambient glows */}
      <div style={{ position: 'absolute', width: 700, height: 700, bottom: '-12%', left: '-8%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,98,3,0.16) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 620, height: 620, top: '-10%', right: '-6%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 62%)', pointerEvents: 'none' }} />
      {/* grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none', maskImage: 'radial-gradient(ellipse at 50% 40%, #000 30%, transparent 80%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 40%, #000 30%, transparent 80%)' }} />

      {status === 'checking' ? (
        <div style={{ position: 'relative', width: 26, height: 26, borderRadius: '50%', border: `2.5px solid rgba(249,98,3,0.25)`, borderTopColor: ORANGE, animation: 'gatespin 0.7s linear infinite' }}>
          <style>{`@keyframes gatespin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'min(380px, 92vw)' }}>
          {/* Logo with glow */}
          <img src="/gas-logo.png" alt="GAS" style={{ width: 96, height: 96, borderRadius: '50%', filter: 'drop-shadow(0 0 34px rgba(249,98,3,0.65))' }} />

          {/* Title */}
          <div style={{ marginTop: 22, fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: '6px', color: '#fff', textTransform: 'uppercase' }}>
            INFLUENCERS <span style={{ color: ORANGE }}>ON</span> GAS
          </div>
          {/* Tagline */}
          <div style={{ marginTop: 8, fontFamily: MONO, fontWeight: 500, fontSize: 12.5, letterSpacing: '5px', color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase' }}>
            INFLUENCE THAT MATTERS
          </div>

          {/* Card */}
          <form onSubmit={submit} style={cardStyle}>
            <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, letterSpacing: '4px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', textAlign: 'center', marginBottom: 22 }}>
              Studio Access
            </div>

            <input
              autoFocus
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="Your password"
              style={inputStyle}
            />
            {error && <div style={{ color: '#FF6B6B', fontSize: 12, fontFamily: MONO, marginTop: 12 }}>{error}</div>}

            <button type="submit" disabled={submitting} style={{ ...buttonStyle, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'CHECKING…' : 'SIGN IN'}
            </button>

            <div style={{ marginTop: 22, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
              Access is by invitation only. Contact{' '}
              <a href="mailto:grow@gasmarketing.co.za" style={{ color: ORANGE, textDecoration: 'none' }}>grow@gasmarketing.co.za</a>{' '}
              to request access.
            </div>
          </form>

          {/* Footer */}
          <div style={{ marginTop: 28, fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '3px', color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 11 }}>🔒</span> Secure Creative Platform
          </div>
        </div>
      )}
    </div>
  )
}

const screenStyle = {
  position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#070e16', zIndex: 9999, overflow: 'hidden', padding: 24,
}
const cardStyle = {
  marginTop: 32, width: '100%', padding: '30px 28px', borderRadius: 18,
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(249,98,3,0.30)',
  boxShadow: '0 0 0 1px rgba(249,98,3,0.05), 0 18px 60px rgba(0,0,0,0.55), 0 0 50px rgba(249,98,3,0.08)',
  display: 'flex', flexDirection: 'column',
}
const inputStyle = {
  width: '100%', padding: '14px 16px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)',
  color: '#fff', fontSize: 14, fontFamily: MONO, outline: 'none', letterSpacing: '0.5px',
}
const buttonStyle = {
  marginTop: 16, width: '100%', padding: '14px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(180deg, #ff8a1e 0%, #f96203 100%)',
  color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: MONO, letterSpacing: '3px', textTransform: 'uppercase',
  boxShadow: '0 6px 22px rgba(249,98,3,0.45)',
}
