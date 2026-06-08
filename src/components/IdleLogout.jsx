import { useEffect } from 'react'
import { flushNow } from '../utils/cloudSync'

// Auto-logout after a period of inactivity. Work is saved continuously
// (localStorage + cloud sync), and we flush any pending sync right before
// logging out so nothing is lost. Only mounted while signed in.
const IDLE_MS = 15 * 60 * 1000 // 15 minutes

export default function IdleLogout() {
  useEffect(() => {
    let timer
    let lastReset = 0
    let loggingOut = false

    async function doLogout() {
      if (loggingOut) return
      loggingOut = true
      try { await flushNow() } catch {}                     // save any pending work
      try { await fetch('/api/logout', { method: 'POST' }) } catch {} // clear the cookie
      window.location.reload()                              // → password screen
    }

    function reset() {
      const now = Date.now()
      if (now - lastReset < 2000) return // throttle — activity fires constantly
      lastReset = now
      clearTimeout(timer)
      timer = setTimeout(doLogout, IDLE_MS)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset() // start the clock

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [])

  return null
}
