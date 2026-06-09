import { useEffect, useState, useRef } from 'react'
import { flushNow } from '../utils/cloudSync'

// Auto-logout after inactivity, with a 1-minute warning. Work is saved
// continuously (localStorage + cloud sync) and we flush any pending sync right
// before logging out, so nothing is lost. Only mounted while signed in.
const IDLE_MS = 15 * 60 * 1000        // total inactivity before logout
const WARN_MS = 14 * 60 * 1000        // show the warning 1 minute before
const COUNTDOWN_S = Math.round((IDLE_MS - WARN_MS) / 1000)

export default function IdleLogout() {
  const [warning, setWarning] = useState(false)
  const [secs, setSecs] = useState(COUNTDOWN_S)
  const resetRef = useRef(() => {})

  useEffect(() => {
    let warnTimer, logoutTimer, countdownInt, lastReset = 0, loggingOut = false

    async function doLogout() {
      if (loggingOut) return
      loggingOut = true
      try { await flushNow() } catch {}                              // save any pending work
      try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {} // end the session
      window.location.reload()                                       // → password screen
    }

    function clearAll() {
      clearTimeout(warnTimer); clearTimeout(logoutTimer); clearInterval(countdownInt)
    }

    function startWarning() {
      setWarning(true)
      setSecs(COUNTDOWN_S)
      countdownInt = setInterval(() => setSecs(s => (s > 1 ? s - 1 : 1)), 1000)
      logoutTimer = setTimeout(doLogout, IDLE_MS - WARN_MS)
    }

    function reset(force) {
      const now = Date.now()
      if (!force && now - lastReset < 2000) return // throttle — activity fires constantly
      lastReset = now
      clearAll()
      setWarning(false)
      warnTimer = setTimeout(startWarning, WARN_MS)
    }

    const onActivity = () => reset(false)
    resetRef.current = () => reset(true) // for the "Stay logged in" button

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    reset(true)

    return () => { clearAll(); events.forEach(e => window.removeEventListener(e, onActivity)) }
  }, [])

  if (!warning) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9500,
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 18px', borderRadius: 14,
      background: 'rgba(20,16,30,0.96)', border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
      fontFamily: 'inherit', maxWidth: '92vw',
    }}>
      <span style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>
        You'll be logged out in <strong style={{ color: '#FFB020' }}>{secs}s</strong> due to inactivity.
      </span>
      <button
        onClick={() => resetRef.current()}
        style={{
          padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        Stay logged in
      </button>
    </div>
  )
}
