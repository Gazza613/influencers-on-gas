import { useEffect, useState } from 'react'
import { remoteChanged, flushNow } from '../utils/cloudSync'

// Keeps the shared library fresh:
//  - When you return to the tab, it pushes any pending edits and, if a teammate
//    changed something, reloads to show the latest.
//  - While you're actively in the tab, it checks every ~45s and shows an
//    unobtrusive "Refresh" pill instead of reloading out from under you.
export default function SyncWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    let alive = true

    async function onVisible() {
      if (document.visibilityState !== 'visible') return
      await flushNow()
      if (alive && (await remoteChanged())) window.location.reload()
    }
    document.addEventListener('visibilitychange', onVisible)

    const id = setInterval(async () => {
      if (!alive || document.visibilityState !== 'visible' || updateAvailable) return
      if (await remoteChanged()) setUpdateAvailable(true)
    }, 45000)

    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); clearInterval(id) }
  }, [updateAvailable])

  if (!updateAvailable) return null

  return (
    <button
      onClick={async () => { await flushNow(); window.location.reload() }}
      style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9000,
        padding: '10px 18px', borderRadius: 980, border: 'none', cursor: 'pointer',
        background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff',
        fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        boxShadow: '0 6px 24px rgba(139,92,246,0.45)',
      }}
    >
      🔄 Library updated — Refresh
    </button>
  )
}
