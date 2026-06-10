// Shared idle-timeout state. Last-activity is persisted to localStorage so the
// inactivity window is enforced ACROSS reloads — a hard refresh after being idle
// past the window lands on the login screen, while a refresh during active work
// keeps you signed in. Used by IdleLogout (open tab) and AppGate (on load).
export const IDLE_MS = 15 * 60 * 1000 // 15 minutes of inactivity → logout
const KEY = 'hf_last_activity'

export function markActivity() {
  try { localStorage.setItem(KEY, String(Date.now())) } catch {}
}
export function getLastActivity() {
  try { return Number(localStorage.getItem(KEY) || 0) } catch { return 0 }
}
export function clearActivity() {
  try { localStorage.removeItem(KEY) } catch {}
}
// True only when we have a recorded activity time AND it's older than the window.
export function isIdleExpired() {
  const t = getLastActivity()
  return t > 0 && (Date.now() - t > IDLE_MS)
}
