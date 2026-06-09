import { useState, useEffect, useMemo } from 'react'
import { discoverHiggsfieldCredits, getHiggsfieldAccount } from '../utils/higgsfieldGenerate'

// Cost dashboard. Visible to any signed-in team member. Leads with the LIVE
// Higgsfield credit balance + deduction ledger (ground truth from Higgsfield),
// then shows our own per-model / per-user usage tracking as estimates.

const fmtUsd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US')
const fmtNum2 = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const lowColor = (c) => c == null ? 'var(--text-primary)' : c < 60 ? '#FF3B30' : c < 200 ? '#FF9500' : 'var(--text-primary)'
const creditsLabel = (c) => c == null ? '' : c < 60 ? 'critically low' : c < 200 ? 'running low' : 'healthy'

function lastMonths(count) {
  const out = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ value: ym, label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) })
  }
  return out
}

function Ring({ used, budget }) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0
  const r = 76, c = 2 * Math.PI * r
  const color = pct >= 90 ? '#FF3B30' : pct >= 70 ? '#FF9500' : '#34C759'
  return (
    <div style={{ position: 'relative', width: 184, height: 184, flexShrink: 0 }}>
      <svg width="184" height="184" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="92" cy="92" r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="14" />
        <circle cx="92" cy="92" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', color: 'var(--text-primary)' }}>{Math.round(pct)}%</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>of monthly credits</div>
      </div>
    </div>
  )
}

export default function Costs() {
  const months = useMemo(() => lastMonths(6), [])
  const [month, setMonth] = useState(months[0].value)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [probe, setProbe] = useState(null) // null | 'loading' | {…} | {error}
  const [live, setLive] = useState('loading') // 'loading' | {credits,plan,transactions} | {error}

  useEffect(() => {
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : null)).then(d => setIsAdmin(d?.user?.role === 'super_admin')).catch(() => {})
  }, [])

  async function loadLive() {
    setLive('loading')
    try { setLive(await getHiggsfieldAccount()) }
    catch (e) { setLive({ error: e.message || 'Could not reach Higgsfield' }) }
  }
  useEffect(() => { loadLive() }, [])

  async function runProbe() {
    setProbe('loading')
    try { setProbe(await discoverHiggsfieldCredits()) }
    catch (e) { setProbe({ error: e.message || 'Probe failed' }) }
  }

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    fetch(`/api/costs?month=${month}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load costs'))))
      .then(d => { if (alive) { setData(d); setLoading(false) } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [month])

  const maxModelCount = Math.max(1, ...(data?.models || []).map(m => m.count))

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.6px', margin: 0 }}>Costs</h1>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 600, lineHeight: 1.55 }}>
              Your team shares one Higgsfield account. The <strong>live balance and deduction ledger</strong> below come
              straight from Higgsfield; the per-model and per-member breakdowns are <strong>estimates</strong> from our own
              usage tracking.
            </p>
          </div>
          <select value={month} onChange={e => setMonth(e.target.value)} style={selectStyle}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {error && <div style={{ ...cardStyle, padding: 20, color: '#FF3B30' }}>{error}</div>}
        {loading && !data && <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>}

        {data && (
          <>
            {/* LIVE balance + deduction ledger — straight from Higgsfield */}
            <div style={{ ...cardStyle, marginBottom: 16, background: 'linear-gradient(135deg, rgba(236,72,153,0.07), rgba(139,92,246,0.07))' }}>
              <div style={{ ...cardHeadStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>● Live Higgsfield balance</span>
                <button onClick={loadLive} disabled={live === 'loading'} style={ghostRefresh}>{live === 'loading' ? 'Refreshing…' : '↻ Refresh'}</button>
              </div>
              <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 24, alignItems: 'start' }}>
                {/* Balance */}
                <div>
                  {live === 'loading' && <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>Reading live balance…</div>}
                  {live?.error && <div style={{ color: '#FF3B30', fontSize: 13, lineHeight: 1.5 }}>Couldn't read live balance: {live.error}</div>}
                  {live && live !== 'loading' && !live.error && (
                    <>
                      <div style={labelStyle}>Credits remaining{live.plan ? ` · ${live.plan} plan` : ''}</div>
                      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-2px', marginTop: 6, color: lowColor(live.credits) }}>
                        {live.credits == null ? '—' : fmtNum2(live.credits)}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                        ≈ {fmtUsd((live.credits || 0) * (data?.plan?.creditUsd || 0.045))} to replace · {creditsLabel(live.credits)}
                      </div>
                      {live.credits != null && live.credits < 200 && (
                        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.3)', fontSize: 12.5, color: '#FF3B30', lineHeight: 1.5 }}>
                          <strong>Low balance.</strong> The shared account is nearly out — generations will start failing for the whole team.{' '}
                          <a href="https://higgsfield.ai/mcp-credits?show_modal=auto_refill&source=mcp" target="_blank" rel="noreferrer" style={{ color: '#FF3B30', fontWeight: 700 }}>Top up / auto-refill →</a>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {/* Recent deductions ledger */}
                <div>
                  <div style={labelStyle}>Recent deductions (live ledger)</div>
                  <div style={{ marginTop: 8 }}>
                    {(!live || live === 'loading' || live.error || !live.transactions?.length) && <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>—</div>}
                    {live?.transactions?.slice(0, 8).map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                        <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(t.at)}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.credits < 0 ? '#FF9500' : '#34C759', minWidth: 52, textAlign: 'right' }}>{t.credits > 0 ? '+' : ''}{fmtNum2(t.credits)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Activity (our tracking) */}
            <div style={{ ...cardStyle, padding: 22, marginBottom: 16 }}>
              <div style={labelStyle}>Generations tracked this month (in-app)</div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.2px', marginTop: 6, color: 'var(--text-primary)' }}>{fmtNum(data.totals.generations)}</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <div><span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtNum(data.totals.images)}</span> <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>images</span></div>
                <div><span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtNum(data.totals.videos)}</span> <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>videos</span></div>
              </div>
            </div>

            {/* Per-model breakdown */}
            <div style={{ ...cardStyle, padding: 0, marginBottom: 16 }}>
              <div style={cardHeadStyle}>Estimated usage by model</div>
              <div style={{ padding: '8px 0' }}>
                {data.models.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No generations yet this month.</div>}
                {data.models.map(m => (
                  <div key={m.model} style={{ padding: '12px 22px', display: 'grid', gridTemplateColumns: '160px 1fr 130px', alignItems: 'center', gap: 14 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{m.kind}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 6, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                        <div style={{ width: `${(m.count / maxModelCount) * 100}%`, height: '100%', borderRadius: 6, background: m.unlimited ? 'linear-gradient(90deg,#34C759,#30D158)' : 'linear-gradient(90deg,#FF9500,#FF3B30)' }} />
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', minWidth: 56, textAlign: 'right' }}>{fmtNum(m.count)} gen</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {m.unlimited
                        ? <span style={badgeIncluded}>Included · $0</span>
                        : <div><div style={{ fontSize: 13.5, fontWeight: 700, color: '#FF9500' }}>{fmtUsd(m.estUsd)}</div><div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{fmtNum(m.credits)} credits</div></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-user */}
            <div style={{ ...cardStyle, padding: 0 }}>
              <div style={cardHeadStyle}>Estimated usage by team member</div>
              <div style={{ padding: '8px 0' }}>
                {data.users.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No team activity yet this month.</div>}
                {data.users.map(u => (
                  <div key={u.email} style={{ padding: '12px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtNum(u.generations)}</div><div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>gens</div></div>
                      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtNum(u.credits)}</div><div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>credits</div></div>
                      <div style={{ textAlign: 'right', minWidth: 64 }}><div style={{ fontSize: 14, fontWeight: 800, color: u.credits > 0 ? '#FF9500' : '#34C759' }}>{fmtUsd(u.estUsd)}</div><div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>credit cost</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ground-truth probe (super admin only) */}
            {isAdmin && (
              <div style={{ ...cardStyle, marginTop: 16 }}>
                <div style={cardHeadStyle}>Verify against Higgsfield (live)</div>
                <div style={{ padding: '18px 22px' }}>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55, maxWidth: 620 }}>
                    The numbers above are estimates from published per-model rates. This asks Higgsfield's own API what tools
                    it exposes and whether it reports a live credit balance — ground truth for whether video really deducts credits.
                  </p>
                  <button onClick={runProbe} disabled={probe === 'loading'} style={probeBtn}>
                    {probe === 'loading' ? 'Checking…' : 'Check live Higgsfield credits'}
                  </button>

                  {probe && probe !== 'loading' && (
                    <div style={{ marginTop: 16 }}>
                      {probe.error && <div style={{ color: '#FF3B30', fontSize: 13 }}>{probe.error}</div>}
                      {probe.results && Object.entries(probe.results).map(([tool, result]) => (
                        <div key={tool} style={{ padding: '14px 16px', borderRadius: 12, background: result?.error ? 'rgba(255,59,48,0.08)' : 'rgba(52,199,89,0.10)', border: `1px solid ${result?.error ? 'rgba(255,59,48,0.25)' : 'rgba(52,199,89,0.25)'}`, marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: result?.error ? '#FF3B30' : '#34C759', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tool.replace(/_/g, ' ')}</div>
                          <pre style={preStyle}>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
                        </div>
                      ))}
                      {probe.tools && (
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>{probe.tools.length} Higgsfield tools available</summary>
                          <pre style={preStyle}>{probe.tools.map(t => `• ${t.name}${t.description ? ' — ' + t.description.slice(0, 120) : ''}`).join('\n')}</pre>
                        </details>
                      )}
                      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 8 }}>Full output is also in the browser console under <strong>[HF][CREDITS]</strong>.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.6 }}>
              The live balance and ledger are pulled directly from Higgsfield. The per-model and per-member figures are
              estimates from in-app tracking at ~{fmtUsd(data.plan.creditUsd)}/credit (the real top-up rate) — Higgsfield
              bills the shared account as a whole, so it can't attribute spend per person; that's what our tracking adds.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const cardStyle = { background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border-subtle)', overflow: 'hidden' }
const cardHeadStyle = { padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }
const labelStyle = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px' }
const badgeIncluded = { fontSize: 11, fontWeight: 800, color: '#34C759', background: 'rgba(52,199,89,0.12)', padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap' }
const selectStyle = { padding: '9px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }
const probeBtn = { padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }
const ghostRefresh = { padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }
const preStyle = { marginTop: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
