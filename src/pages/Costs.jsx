import { useState, useEffect } from 'react'
import { discoverHiggsfieldCredits, getHiggsfieldAccount } from '../utils/higgsfieldGenerate'

// Cost dashboard. Visible to any signed-in team member. Leads with the LIVE
// Higgsfield credit balance (ground truth from the shared Ultra account), then
// shows our own per-model / per-member cost intelligence: images are unlimited
// ($0 marginal) on Ultra, videos draw credits, and the fixed $310/mo is blended
// across the team so every member carries a real cost.

const fmtUsd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US')
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const fmtDay = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) } catch { return d } }
const lowColor = (c) => c == null ? 'var(--text-primary)' : c < 600 ? '#FF3B30' : c < 2000 ? '#FF9500' : 'var(--text-primary)'
const creditsLabel = (c) => c == null ? '' : c < 600 ? 'critically low' : c < 2000 ? 'running low' : 'healthy'

// Donut showing % of the credit budget remaining.
function Ring({ pct, centerTop, centerBottom }) {
  const p = Math.max(0, Math.min(100, pct))
  const r = 76, c = 2 * Math.PI * r
  const color = p <= 10 ? '#FF3B30' : p <= 30 ? '#FF9500' : '#34C759'
  return (
    <div style={{ position: 'relative', width: 184, height: 184, flexShrink: 0 }}>
      <svg width="184" height="184" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="92" cy="92" r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="14" />
        <circle cx="92" cy="92" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (p / 100) * c} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', color: 'var(--text-primary)' }}>{centerTop}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2, textAlign: 'center', lineHeight: 1.3, padding: '0 18px' }}>{centerBottom}</div>
      </div>
    </div>
  )
}

function StatTile({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 150, padding: '16px 18px', borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border-subtle)' }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.8px', marginTop: 6, color: accent || 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function Costs() {
  const [cycleKey, setCycleKey] = useState(null) // null → current cycle
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [probe, setProbe] = useState(null)
  const [live, setLive] = useState('loading')
  const [chartMode, setChartMode] = useState('daily') // 'daily' | 'monthly' | 'todate'

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
    fetch(`/api/costs${cycleKey ? `?cycle=${cycleKey}` : ''}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load costs'))))
      .then(d => { if (alive) { setData(d); setLoading(false) } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false) } })
    return () => { alive = false }
  }, [cycleKey])

  const budget = data?.creditsBudget || 9000
  const creditUsd = data?.plan?.creditUsd || 0.045
  // Prefer the live remaining balance; fall back to budget − our tracked usage.
  const liveCredits = (live && live !== 'loading' && !live.error) ? live.credits : null
  const remaining = liveCredits != null ? liveCredits : (data ? Math.max(0, budget - data.creditsUsed) : null)
  const pctRemaining = remaining != null ? (remaining / budget) * 100 : 0

  const images = data?.models?.filter(m => m.kind === 'image') || []
  const videos = data?.models?.filter(m => m.kind === 'video') || []
  const maxVideoCredits = Math.max(1, ...videos.map(m => m.credits))
  const maxImageCount = Math.max(1, ...images.map(m => m.count))

  const chartSeries = !data ? [] : chartMode === 'daily'
    ? (data.daily || []).map(d => ({ label: fmtDay(d.date), images: d.images, videos: d.videos }))
    : chartMode === 'monthly'
      ? (data.cycleSeries || []).map(c => ({ label: c.label, images: c.images, videos: c.videos }))
      : [{ label: 'To date', images: data.toDate?.images || 0, videos: data.toDate?.videos || 0 }]

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.6px', margin: 0 }}>Costs</h1>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 640, lineHeight: 1.55 }}>
              One shared <strong>Higgsfield Ultra</strong> account — <strong>$310/mo for 9,000 credits</strong>, reloading on the 11th.
              Images are <strong>included (unlimited)</strong>; videos spend credits. The fee is blended across the team so every
              member and client job shows a real cost.
            </p>
          </div>
          {data?.cycles && (
            <select value={cycleKey || data.cycle.key} onChange={e => setCycleKey(e.target.value)} style={selectStyle}>
              {data.cycles.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          )}
        </div>

        {error && <div style={{ ...cardStyle, padding: 20, color: '#FF3B30' }}>{error}</div>}
        {loading && !data && <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>}

        {data && (
          <>
            {/* HERO — live balance ring + cycle facts + deduction ledger */}
            <div style={{ ...cardStyle, marginBottom: 16, background: 'linear-gradient(135deg, rgba(236,72,153,0.07), rgba(139,92,246,0.07))' }}>
              <div style={{ ...cardHeadStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>● Live Higgsfield balance · {data.plan.name} plan</span>
                <button onClick={loadLive} disabled={live === 'loading'} style={ghostRefresh}>{live === 'loading' ? 'Refreshing…' : '↻ Refresh'}</button>
              </div>
              <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'center' }}>
                {/* Ring + live number */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <Ring
                    pct={pctRemaining}
                    centerTop={`${Math.round(pctRemaining)}%`}
                    centerBottom="credits left"
                  />
                  <div>
                    {live === 'loading' && <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>Reading live balance…</div>}
                    {live?.error && <div style={{ color: '#FF3B30', fontSize: 13, lineHeight: 1.5, maxWidth: 240 }}>Couldn't read live balance: {live.error}</div>}
                    {(liveCredits != null || (live && live !== 'loading' && !live.error)) && (
                      <>
                        <div style={labelStyle}>Credits remaining</div>
                        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-2px', marginTop: 4, color: lowColor(remaining) }}>
                          {remaining == null ? '—' : fmtNum(Math.round(remaining))}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                          of {fmtNum(budget)} · {creditsLabel(remaining)}
                        </div>
                        {remaining != null && remaining < 2000 && (
                          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.3)', fontSize: 12.5, color: '#FF3B30', lineHeight: 1.5, maxWidth: 280 }}>
                            <strong>Low balance.</strong> Video generations will start failing for the whole team.{' '}
                            <a href="https://higgsfield.ai/mcp-credits?show_modal=auto_refill&source=mcp" target="_blank" rel="noreferrer" style={{ color: '#FF3B30', fontWeight: 700 }}>Top up →</a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {/* Recent deductions ledger */}
                <div>
                  <div style={labelStyle}>Recent deductions (live ledger)</div>
                  <div style={{ marginTop: 8 }}>
                    {(!live || live === 'loading' || live.error || !live.transactions?.length) && <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>—</div>}
                    {live?.transactions?.slice(0, 7).map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                        <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(t.at)}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.credits < 0 ? '#FF9500' : '#34C759', minWidth: 52, textAlign: 'right' }}>{t.credits > 0 ? '+' : ''}{fmtNum(Math.round(t.credits))}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Cycle facts */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatTile label="Billing cycle" value={data.cycle.label} sub={`Reloads in ${data.cycle.daysToReset} day${data.cycle.daysToReset === 1 ? '' : 's'} (the 11th)`} />
              <StatTile label="Credits used (tracked)" value={fmtNum(data.creditsUsed)} sub={`of ${fmtNum(budget)} · ${Math.round((data.creditsUsed / budget) * 100)}% of budget`} accent={data.overageCredits > 0 ? '#FF3B30' : 'var(--text-primary)'} />
              <StatTile label="Cycle spend" value={fmtUsd(data.cycleSpendUsd)} sub={data.overageCredits > 0 ? `$${data.plan.baseUsd} base + ${fmtUsd(data.estOverageUsd)} overage` : `$${data.plan.baseUsd} base · no overage`} accent={data.overageCredits > 0 ? '#FF9500' : 'var(--text-primary)'} />
            </div>

            {/* Images vs Videos — materially different costs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
              {/* Images */}
              <div style={{ ...cardStyle, padding: 20, borderLeft: '3px solid #34C759' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={labelStyle}>🖼 Images</div>
                  <span style={badgeIncluded}>Included · $0</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.2px', marginTop: 8, color: 'var(--text-primary)' }}>{fmtNum(data.totals.images)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 }}>generated this cycle · unlimited on Ultra, zero marginal cost</div>
              </div>
              {/* Videos */}
              <div style={{ ...cardStyle, padding: 20, borderLeft: '3px solid #FF9500' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={labelStyle}>🎬 Videos</div>
                  <span style={{ ...badgeIncluded, color: '#FF9500', background: 'rgba(255,149,0,0.12)' }}>Credit cost</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.2px', marginTop: 8, color: 'var(--text-primary)' }}>{fmtNum(data.totals.videos)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
                  {fmtNum(data.totals.videoCredits)} credits burned · {fmtUsd(data.totals.videoCredits * creditUsd)} credit value
                </div>
              </div>
            </div>

            {/* Volume over time — images vs videos */}
            <div style={{ ...cardStyle, padding: 0, marginBottom: 16 }}>
              <div style={{ ...cardHeadStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span>Volume — images vs videos</span>
                <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', padding: 3, borderRadius: 9 }}>
                  {[['daily', 'Daily'], ['monthly', 'Monthly'], ['todate', 'To date']].map(([k, l]) => (
                    <button key={k} onClick={() => setChartMode(k)} style={{
                      padding: '5px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0,
                      background: chartMode === k ? 'var(--surface)' : 'transparent',
                      color: chartMode === k ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      boxShadow: chartMode === k ? 'var(--shadow-sm)' : 'none',
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: '20px 22px' }}>
                <VolumeChart series={chartSeries} />
                {chartMode === 'monthly' && chartSeries.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>Each bar is one billing cycle (11th → 10th).</div>}
              </div>
            </div>

            {/* By model — grouped */}
            <div style={{ ...cardStyle, padding: 0, marginBottom: 16 }}>
              <div style={cardHeadStyle}>Usage by model</div>
              <div style={{ padding: '8px 0' }}>
                {data.models.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No generations yet this cycle.</div>}
                {videos.length > 0 && <div style={groupHead}>Videos — credit cost</div>}
                {videos.map(m => (
                  <ModelRow key={m.model} m={m} pct={(m.credits / maxVideoCredits) * 100} right={<><div style={{ fontSize: 13.5, fontWeight: 700, color: '#FF9500' }}>{fmtUsd(m.estUsd)}</div><div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{fmtNum(m.credits)} cr · {fmtNum(m.count)} gen</div></>} barColor="linear-gradient(90deg,#FF9500,#FF3B30)" />
                ))}
                {images.length > 0 && <div style={groupHead}>Images — included</div>}
                {images.map(m => (
                  <ModelRow key={m.model} m={m} pct={(m.count / maxImageCount) * 100} right={<span style={badgeIncluded}>$0 · {fmtNum(m.count)} gen</span>} barColor="linear-gradient(90deg,#34C759,#30D158)" />
                ))}
              </div>
            </div>

            {/* By team member — allocated cost */}
            <div style={{ ...cardStyle, padding: 0 }}>
              <div style={cardHeadStyle}>Usage by team member</div>
              <div style={{ padding: '8px 0' }}>
                {data.users.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No team activity yet this cycle.</div>}
                {data.users.map(u => (
                  <div key={u.email} style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{fmtNum(u.images)} images · {fmtNum(u.videos)} videos · {fmtNum(u.credits)} credits</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>{fmtUsd(u.creditValueUsd)}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>video value</div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 72 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>{fmtUsd(u.allocatedUsd)}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>allocated cost</div>
                      </div>
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
              The live balance and ledger come straight from Higgsfield. <strong>Allocated cost</strong> spreads the {fmtUsd(data.plan.baseUsd)} fixed
              fee (plus any overage at {fmtUsd(creditUsd)}/credit) across the team by usage — videos weigh by credits, images by a small flat
              share — so each member's allocated cost sums to the real {fmtUsd(data.cycleSpendUsd)} cycle bill. <strong>Video value</strong> is the
              raw credit cost of their videos. Figures shift slightly as more work lands in the cycle.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Legend({ color, label }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: color }} />{label}</div>
}

function Bar({ value, max, H, color }) {
  const h = value > 0 ? Math.max(3, Math.round((value / max) * H)) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: H }}>
      {value > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3 }}>{value}</div>}
      <div style={{ width: 20, height: h, borderRadius: '5px 5px 0 0', background: color }} />
    </div>
  )
}

function VolumeChart({ series }) {
  if (!series.length || series.every(s => !s.images && !s.videos)) {
    return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No activity to chart yet.</div>
  }
  const max = Math.max(1, ...series.flatMap(s => [s.images, s.videos]))
  const H = 150
  const few = series.length <= 8
  return (
    <div>
      <div style={{ display: 'flex', gap: 18, marginBottom: 16, paddingLeft: 2 }}>
        <Legend color="#34C759" label="Images" />
        <Legend color="#FF9500" label="Videos" />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: few ? 24 : 16, overflowX: 'auto', paddingBottom: 4 }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48, flex: few ? 1 : '0 0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: H }}>
              <Bar value={s.images} max={max} H={H} color="linear-gradient(180deg,#34C759,#30D158)" />
              <Bar value={s.videos} max={max} H={H} color="linear-gradient(180deg,#FFB340,#FF9500)" />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 8, whiteSpace: 'nowrap', maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.label}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModelRow({ m, pct, right, barColor }) {
  return (
    <div style={{ padding: '12px 22px', display: 'grid', gridTemplateColumns: '160px 1fr 140px', alignItems: 'center', gap: 14 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{m.kind}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 6, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 6, background: barColor }} />
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>{right}</div>
    </div>
  )
}

const cardStyle = { background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border-subtle)', overflow: 'hidden' }
const cardHeadStyle = { padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }
const groupHead = { padding: '10px 22px 4px', fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px' }
const labelStyle = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px' }
const badgeIncluded = { fontSize: 11, fontWeight: 800, color: '#34C759', background: 'rgba(52,199,89,0.12)', padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap' }
const selectStyle = { padding: '9px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }
const probeBtn = { padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }
const ghostRefresh = { padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }
const preStyle = { marginTop: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
