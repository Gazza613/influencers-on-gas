import { useState, useEffect, useMemo } from 'react'

// Plan-true cost dashboard. Visible to any signed-in team member.
// Headline is the real bill (fixed Ultra plan), with a credit-budget ring driven
// by credit-consuming models (Veo). Unlimited models show as "Included · $0".

const fmtUsd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US')

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
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 580, lineHeight: 1.55 }}>
              Your team runs on one <strong>Higgsfield {data?.plan?.name || 'Ultra'}</strong> account — a fixed monthly
              cost where <strong>images are unlimited</strong>, while <strong>video models draw down</strong> the
              monthly credit budget. Video is the spend to watch.
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
            {/* Top row: bill + budget ring + month activity */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
              {/* Bill */}
              <div style={{ ...cardStyle, padding: 22, background: 'linear-gradient(135deg, rgba(236,72,153,0.10), rgba(139,92,246,0.10))' }}>
                <div style={labelStyle}>This month's bill</div>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-1.5px', marginTop: 6, background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {fmtUsd(data.billUsd)}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                  {fmtUsd(data.plan.monthlyUsd)} fixed plan
                  {data.estOverageUsd > 0
                    ? <> + <span style={{ color: '#FF9500', fontWeight: 700 }}>{fmtUsd(data.estOverageUsd)} credit overage</span></>
                    : <> · <span style={{ color: '#34C759', fontWeight: 700 }}>within budget</span></>}
                </div>
              </div>

              {/* Credit budget ring */}
              <div style={{ ...cardStyle, padding: 22, display: 'flex', alignItems: 'center', gap: 18 }}>
                <Ring used={data.creditsUsed} budget={data.creditsBudget} />
                <div style={{ minWidth: 0 }}>
                  <div style={labelStyle}>Credit budget</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginTop: 6 }}>
                    {fmtNum(data.creditsUsed)}<span style={{ fontSize: 14, color: 'var(--text-tertiary)', fontWeight: 600 }}> / {fmtNum(data.creditsBudget)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                    {data.creditsUsed <= data.creditsBudget
                      ? <>{fmtNum(data.creditsBudget - data.creditsUsed)} credits left</>
                      : <span style={{ color: '#FF3B30', fontWeight: 700 }}>{fmtNum(data.overageCredits)} over</span>}
                  </div>
                </div>
              </div>

              {/* Activity */}
              <div style={{ ...cardStyle, padding: 22 }}>
                <div style={labelStyle}>Generations this month</div>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-1.5px', marginTop: 6, color: 'var(--text-primary)' }}>{fmtNum(data.totals.generations)}</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                  <div><span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtNum(data.totals.images)}</span> <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>images</span></div>
                  <div><span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtNum(data.totals.videos)}</span> <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>videos</span></div>
                </div>
              </div>
            </div>

            {/* Per-model breakdown */}
            <div style={{ ...cardStyle, padding: 0, marginBottom: 16 }}>
              <div style={cardHeadStyle}>By model — what's included vs what costs credits</div>
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
              <div style={cardHeadStyle}>By team member</div>
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

            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.6 }}>
              Credit costs are estimates from Higgsfield's published per-model rates ({fmtUsd(data.plan.creditUsd)}/credit on the {data.plan.name} plan).
              Unlimited models are included in the fixed plan at no marginal cost. A weekly watcher flags when Higgsfield changes pricing so these stay accurate.
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
