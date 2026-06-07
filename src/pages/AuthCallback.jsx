import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleOAuthCallback } from '../utils/higgsfieldAuth'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const err = params.get('error')

    if (err) {
      setError(params.get('error_description') || err)
      return
    }
    if (!code || !state) {
      setError('Missing OAuth parameters')
      return
    }

    const isPopup = !!(window.opener && !window.opener.closed)

    handleOAuthCallback(code, state)
      .then(() => {
        if (isPopup) {
          window.opener.postMessage({ type: 'hf_auth_success' }, window.location.origin)
          window.close()
        } else {
          const returnUrl = localStorage.getItem('hf_return_url') || '/settings?connected=1'
          localStorage.removeItem('hf_return_url')
          navigate(returnUrl, { replace: true })
        }
      })
      .catch(e => {
        if (isPopup) {
          window.opener.postMessage({ type: 'hf_auth_error', error: e.message }, window.location.origin)
          window.close()
        } else {
          setError(e.message)
        }
      })
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      {error ? (
        <div style={{ textAlign: 'center', maxWidth: 380, padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Connection failed</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>{error}</div>
          <button onClick={() => navigate('/settings')} style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--text-primary)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            Back to Settings
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Connecting your Higgsfield account…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
    </div>
  )
}
