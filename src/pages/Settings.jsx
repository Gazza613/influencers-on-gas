import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { startHiggsfieldOAuthPopup, disconnectHF, isHFConnected } from '../utils/higgsfieldAuth'
import { useTheme } from '../context/theme'
import TeamPanel from '../components/TeamPanel'

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

export default function Settings() {
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const [hfConnected, setHfConnected] = useState(isHFConnected)
  const [hfLoading, setHfLoading] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('connected') === '1') {
      setHfConnected(true)
    }
  }, [location.search])

  async function connectHiggsfield() {
    setHfLoading(true)
    try {
      await startHiggsfieldOAuthPopup()
      setHfConnected(true)
    } catch (e) {
      if (e.message !== 'cancelled') alert('Failed to connect Higgsfield: ' + e.message)
    } finally {
      setHfLoading(false)
    }
  }

  function disconnectHighgsfield() {
    if (!confirm('Disconnect your Higgsfield account?')) return
    disconnectHF()
    setHfConnected(false)
  }

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 28 }}>Settings</h1>

        <TeamPanel />


        <Section title="Appearance">
          <div style={{ display: 'flex', gap: 10 }}>
            {(['light', 'dark']).map(val => {
              const on = theme === val
              return (
                <button key={val} onClick={e => { if (!on) toggle(e.clientX, e.clientY) }} style={{
                  flex: 1, padding: '14px 12px', borderRadius: 12, cursor: on ? 'default' : 'pointer',
                  border: `1.5px solid ${on ? '#8B5CF6' : 'var(--border)'}`,
                  background: on ? 'rgba(139,92,246,0.09)' : 'var(--bg)',
                  color: on ? '#8B5CF6' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  boxShadow: on ? '0 0 0 1px #8B5CF655' : 'none',
                }}>
                  {val === 'light' ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                  {val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Higgsfield">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34C759' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#34C759' }}>Higgsfield enabled</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.6 }}>
            Higgsfield is managed centrally for your team — no connection needed. Image and
            video generation runs on the agency Higgsfield account automatically.
          </p>
        </Section>

        <Section title="Claude AI">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34C759' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#34C759' }}>Claude enabled</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.6 }}>
            Claude is managed centrally for your team — no API key needed. It analyzes product
            images and writes smarter prompts automatically.
          </p>
        </Section>

        <Section title="Session">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
            You're signed in with the team password. Logging out clears it on this device, so the
            password will be required again next time.
          </p>
          <button
            onClick={async () => {
              try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
              window.location.reload()
            }}
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#FF3B30', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', cursor: 'pointer' }}
          >
            Log out
          </button>
        </Section>
      </div>
    </div>
  )
}
