import { useState, useEffect, useCallback } from 'react'

// Super-admin only. Invite (email + password), list, and remove team members.
// Renders nothing for non-admins.
export default function TeamPanel() {
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [history, setHistory] = useState({}) // email -> 'loading' | array

  const loadUsers = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/users')
      if (r.ok) { const d = await r.json(); setUsers(d.users || []) }
    } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setMe(d?.user || null); if (d?.user?.role === 'super_admin') loadUsers() })
      .catch(() => {})
  }, [loadUsers])

  if (!me || me.role !== 'super_admin') return null

  async function invite(e) {
    e.preventDefault()
    setError(''); setOk('')
    if (!email.trim() || !pw) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: pw }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setOk(`Added ${d.user.email}`); setEmail(''); setPw(''); loadUsers() }
      else setError(d.error || 'Could not add user')
    } catch { setError('Something went wrong') }
    finally { setBusy(false) }
  }

  async function remove(userEmail) {
    if (!confirm(`Remove ${userEmail}? They'll be signed out immediately and lose access.`)) return
    try {
      const r = await fetch('/api/admin/users', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      })
      if (r.ok) loadUsers()
      else { const d = await r.json().catch(() => ({})); alert(d.error || 'Could not remove user') }
    } catch {}
  }

  async function toggleHistory(userEmail) {
    if (history[userEmail]) { setHistory(h => { const n = { ...h }; delete n[userEmail]; return n }); return }
    setHistory(h => ({ ...h, [userEmail]: 'loading' }))
    try {
      const r = await fetch(`/api/admin/users?history=${encodeURIComponent(userEmail)}`)
      const d = r.ok ? await r.json() : { history: [] }
      setHistory(h => ({ ...h, [userEmail]: d.history || [] }))
    } catch { setHistory(h => ({ ...h, [userEmail]: [] })) }
  }

  return (
    <div style={card}>
      <div style={cardHead}><div style={cardTitle}>Team · Users</div></div>
      <div style={{ padding: '20px 24px' }}>
        <form onSubmit={invite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@gasmarketing.co.za" style={inp} />
          <input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="Set a password" style={inp} />
          <button type="submit" disabled={busy} style={btn}>{busy ? 'Adding…' : 'Add user'}</button>
        </form>
        {error && <div style={{ color: '#FF3B30', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {ok && <div style={{ color: '#34C759', fontSize: 13, marginBottom: 10 }}>{ok}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(u => (
            <div key={u.email} style={row}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email}{u.role === 'super_admin' && <span style={badge}>admin</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                    {u.lastLogin ? `Last sign-in ${new Date(u.lastLogin).toLocaleString()}` : 'Never signed in'}
                  </div>
                  {u.usage && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {u.usage.images} images · {u.usage.videos} videos · {u.usage.claudeCalls} Claude · <strong>~${u.usage.estUsd}</strong> est.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => toggleHistory(u.email)} style={ghostBtn}>{history[u.email] ? 'Hide' : 'History'}</button>
                  {u.email !== me.email && <button onClick={() => remove(u.email)} style={removeBtn}>Remove</button>}
                </div>
              </div>
              {history[u.email] && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {history[u.email] === 'loading'
                    ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</div>
                    : history[u.email].length === 0
                      ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No sign-ins recorded yet.</div>
                      : history[u.email].map((h, i) => (
                          <div key={i} style={{ fontSize: 11.5, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <span>{new Date(h.ts).toLocaleString()}</span>
                            <span style={{ fontFamily: 'monospace' }}>{h.ip}</span>
                          </div>
                        ))}
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No users yet.</div>}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 14, lineHeight: 1.5 }}>
          Only <strong>@gasmarketing.co.za</strong> emails can be added. Removing a user signs them out immediately.
        </div>
      </div>
    </div>
  )
}

const card = { background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 16 }
const cardHead = { padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }
const cardTitle = { fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }
const inp = { flex: '1 1 160px', minWidth: 0, padding: '10px 12px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }
const btn = { padding: '10px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', fontSize: 14, fontWeight: 700 }
const row = { display: 'flex', flexDirection: 'column', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }
const ghostBtn = { padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }
const badge = { marginLeft: 8, fontSize: 9, fontWeight: 800, color: '#8B5CF6', background: 'rgba(139,92,246,0.12)', padding: '2px 7px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }
const removeBtn = { padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: '#FF3B30', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', cursor: 'pointer', flexShrink: 0 }
