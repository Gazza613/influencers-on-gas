"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Report = {
  total: { credits: number; cents: number; events: number };
  split: { image: { count: number; cents: number }; video: { count: number; cents: number }; other: { count: number; cents: number } };
  byUser: { user_email: string; credits: number; cents: number; events: number }[];
  byInfluencer: { id: string | null; name: string; credits: number; cents: number; images: number; videos: number }[];
  byProvider: { provider: string; credits: number; cents: number }[];
  byAction: { action: string; credits: number; cents: number }[];
  byDay: { day: string; credits: number; cents: number }[];
  influencers: { id: string; name: string }[];
  providers: string[];
};
type Audit = { taken_at: string; remaining: number | null; ledger_credits: number; ledger_cents: number; note: string | null }[];

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PROVIDER_LABEL: Record<string, string> = {
  higgsfield: "Higgsfield · images & Soul",
  heygen: "HeyGen · presenter",
  magnific: "Magnific · Humaniser",
  anthropic: "Claude · Character Casting",
  elevenlabs: "ElevenLabs · voice",
  voyage: "Voyage · embeddings",
  firecrawl: "Firecrawl · crawl",
};
const ACTION_LABEL: Record<string, string> = {
  casting: "Casting (looks)", photoshoot: "Photoshoot", soul: "Lock-down (Soul)", humaniser: "Humaniser",
  presenter: "Presenter", bible: "Character Casting", ingest: "Brain ingestion",
};

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const PRESETS = [
  { key: "7", label: "7 days", from: () => isoDaysAgo(7) },
  { key: "30", label: "30 days", from: () => isoDaysAgo(30) },
  { key: "90", label: "90 days", from: () => isoDaysAgo(90) },
  { key: "all", label: "All time", from: () => "" },
];

export default function CostControlPage() {
  const [from, setFrom] = useState<string>(isoDaysAgo(30));
  const [to, setTo] = useState<string>("");
  const [preset, setPreset] = useState("30");
  const [influencerId, setInfluencerId] = useState("");
  const [provider, setProvider] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [report, setReport] = useState<Report | null>(null);
  const [audit, setAudit] = useState<Audit>([]);
  const [bal, setBal] = useState<{ remaining: number | null; monthly: number; creditZarCents: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (influencerId) qs.set("influencerId", influencerId);
    if (provider) qs.set("provider", provider);
    if (userEmail) qs.set("userEmail", userEmail);
    const r = await fetch(`/api/cost-control?${qs}`).then((x) => x.json()).catch(() => null);
    if (r?.report) { setReport(r.report); setAudit(r.audit || []); }
    setLoading(false);
  }, [from, to, influencerId, provider, userEmail]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/balance").then((r) => r.json()).then((d) => setBal({ remaining: d.remaining ?? null, monthly: d.monthly ?? 9000, creditZarCents: d.creditZarCents ?? 64 })).catch(() => {});
  }, []);

  function applyPreset(key: string) {
    setPreset(key);
    const p = PRESETS.find((x) => x.key === key);
    if (p) { setFrom(p.from()); setTo(""); }
  }

  const pct = bal?.remaining != null ? Math.max(0, Math.min(100, (bal.remaining / bal.monthly) * 100)) : null;
  const lastAudit = audit[0];
  const auditDelta = lastAudit && lastAudit.remaining != null ? (bal?.monthly ?? 9000) - lastAudit.remaining - lastAudit.ledger_credits : null;

  return (
    <div className="min-h-dvh bg-surface-0 text-ink">
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-line bg-surface-1 px-4 py-2.5">
        <Link href="/studio" className="flex items-center gap-2 font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gas-logo.png" alt="GAS" className="h-7 w-7 rounded-full" />
          <span>Influencers <span className="brand-grad">on</span> GAS</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/studio" className="text-xs text-ink-dim hover:text-ink">Studio</Link>
          <Link href="/setup/influencers" className="text-xs text-ink-dim hover:text-ink">Influencers</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-7">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cost Control</h1>
            <p className="mt-1 text-sm text-ink-dim">Every credit and Rand this platform spends, by member, influencer, tool and function. Audited daily against the live balance.</p>
          </div>
          <button onClick={load} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink">↻ Refresh</button>
        </div>

        {/* Hero KPIs */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Live Higgsfield credits">
            {bal?.remaining != null ? (
              <>
                <div className="tabular text-2xl font-bold">{bal.remaining.toLocaleString()}<span className="text-sm font-normal text-ink-dim"> / {bal.monthly.toLocaleString()}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full ${pct != null && pct < 12 ? "bg-alert" : "bg-ready"}`} style={{ width: `${pct ?? 0}%` }} />
                </div>
              </>
            ) : <div className="text-sm text-ink-faint">reading…</div>}
          </Kpi>
          <Kpi label="Tracked spend (period)">
            <div className="tabular text-2xl font-bold">{report ? rand(report.total.cents) : "…"}</div>
            <div className="tabular mt-1 text-xs text-ink-dim">{report ? `${Math.round(report.total.credits).toLocaleString()} credits` : ""}</div>
          </Kpi>
          <Kpi label="Jobs run (period)">
            <div className="tabular text-2xl font-bold">{report ? report.total.events.toLocaleString() : "…"}</div>
            <div className="tabular mt-1 text-xs text-ink-dim">{report ? `${report.split.image.count} images · ${report.split.video.count} videos` : ""}</div>
          </Kpi>
          <Kpi label="Daily audit">
            {lastAudit ? (
              <>
                <div className={`text-sm font-semibold ${auditDelta != null && Math.abs(auditDelta) > 50 ? "text-active" : "text-ready"}`}>
                  {auditDelta != null && Math.abs(auditDelta) > 50 ? "⚠ review" : "✓ reconciled"}
                </div>
                <div className="tabular mt-1 text-[11px] text-ink-faint">last {lastAudit.taken_at}</div>
              </>
            ) : <div className="text-[11px] text-ink-faint">first audit pending</div>}
          </Kpi>
        </div>

        {/* Pickers */}
        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-1 p-4">
          <div>
            <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Range</div>
            <div className="flex gap-1">
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => applyPreset(p.key)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${preset === p.key ? "bg-[#a855f7]/15 text-[#c79bff]" : "text-ink-dim hover:bg-surface-2"}`}>{p.label}</button>
              ))}
            </div>
          </div>
          <Picker label="From"><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(""); }} className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none" /></Picker>
          <Picker label="To"><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(""); }} className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none" /></Picker>
          <Picker label="Influencer">
            <select value={influencerId} onChange={(e) => setInfluencerId(e.target.value)} className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none">
              <option value="">All influencers</option>
              {report?.influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Picker>
          <Picker label="Platform / tool">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none">
              <option value="">All tools</option>
              {report?.providers.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p] ?? p}</option>)}
            </select>
          </Picker>
          <Picker label="Team member">
            <select value={userEmail} onChange={(e) => setUserEmail(e.target.value)} className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none">
              <option value="">Everyone</option>
              {report?.byUser.map((u) => <option key={u.user_email} value={u.user_email}>{u.user_email}</option>)}
            </select>
          </Picker>
          {(influencerId || provider || userEmail || preset !== "30") && (
            <button onClick={() => { setInfluencerId(""); setProvider(""); setUserEmail(""); applyPreset("30"); }} className="rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-dim hover:text-ink">Clear</button>
          )}
        </div>

        {/* Image vs video split */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-ready/25 bg-ready/5 p-5">
            <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ready">Images</div>
            <div className="tabular mt-1 text-xl font-bold">{report?.split.image.count ?? 0} <span className="text-sm font-normal text-ink-dim">generated</span></div>
            <div className="tabular mt-1 text-sm text-ink-dim">{report ? rand(report.split.image.cents) : ""}</div>
          </div>
          <div className="rounded-xl border border-active/25 bg-active/5 p-5">
            <div className="tabular text-[10px] uppercase tracking-[0.25em] text-active">Video / presenter</div>
            <div className="tabular mt-1 text-xl font-bold">{report?.split.video.count ?? 0} <span className="text-sm font-normal text-ink-dim">jobs</span></div>
            <div className="tabular mt-1 text-sm text-ink-dim">{report ? rand(report.split.video.cents) : ""}</div>
          </div>
        </div>

        {/* Tables */}
        <Section title="By team member">{report && <Table rows={report.byUser.map((u) => ({ label: u.user_email, credits: u.credits, cents: u.cents, sub: `${u.events} jobs` }))} />}</Section>
        <Section title="By influencer (creation · edits · running cost)">
          {report && <Table rows={report.byInfluencer.map((i) => ({ label: i.name, credits: i.credits, cents: i.cents, sub: `${i.images} images · ${i.videos} videos` }))} />}
        </Section>
        <Section title="By platform / API">{report && <Table rows={report.byProvider.map((p) => ({ label: PROVIDER_LABEL[p.provider] ?? p.provider, credits: p.credits, cents: p.cents }))} />}</Section>
        <Section title="By function">{report && <Table rows={report.byAction.map((a) => ({ label: ACTION_LABEL[a.action] ?? a.action, credits: a.credits, cents: a.cents }))} />}</Section>

        {/* Charts */}
        <h2 className="tabular mt-9 mb-3 text-[10px] uppercase tracking-[0.25em] text-ink-faint">Visualisations</h2>
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <div className="text-sm font-semibold text-ink">Daily spend (Rand)</div>
          {report && <LineChart data={report.byDay.map((d) => ({ x: d.day.slice(5), y: d.cents / 100 }))} />}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface-1 p-5">
            <div className="text-sm font-semibold text-ink">Spend by tool</div>
            {report && <Bars data={report.byProvider.map((p) => ({ label: (PROVIDER_LABEL[p.provider] ?? p.provider).split(" ·")[0], v: p.cents }))} />}
          </div>
          <div className="rounded-xl border border-line bg-surface-1 p-5">
            <div className="text-sm font-semibold text-ink">Spend by influencer</div>
            {report && <Bars data={report.byInfluencer.slice(0, 8).map((i) => ({ label: i.name, v: i.cents }))} />}
          </div>
        </div>

        {/* Audit trail */}
        <Section title="Daily cost audit (ledger vs live balance)">
          <p className="px-4 pt-3 text-[11px] text-ink-faint">A cron snapshots the live Higgsfield balance every day and compares it to our ledger, so the numbers above stay provably accurate.</p>
          {audit.length ? (
            <table className="w-full text-xs">
              <thead><tr className="text-ink-faint">
                <th className="px-4 py-2 text-left font-medium">When</th><th className="px-4 py-2 text-right font-medium">Live credits</th>
                <th className="px-4 py-2 text-right font-medium">Ledger credits</th><th className="px-4 py-2 text-right font-medium">Ledger R</th>
              </tr></thead>
              <tbody>{audit.map((a, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="tabular px-4 py-2 text-ink-dim">{a.taken_at}</td>
                  <td className="tabular px-4 py-2 text-right text-ink">{a.remaining != null ? Math.round(a.remaining).toLocaleString() : "—"}</td>
                  <td className="tabular px-4 py-2 text-right text-ink-dim">{Math.round(a.ledger_credits).toLocaleString()}</td>
                  <td className="tabular px-4 py-2 text-right text-ink-dim">{rand(a.ledger_cents)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="px-4 py-5 text-center text-xs text-ink-faint">No audits yet — the first daily snapshot will appear here.</div>}
        </Section>

        <p className="mt-8 text-xs text-ink-faint">Prices come from the rate_card table (R0.64 / credit on the Ultra plan). {loading ? "Updating…" : ""}</p>
      </main>
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface-1 p-4"><div className="tabular text-[10px] uppercase tracking-[0.22em] text-ink-faint">{label}</div><div className="mt-1.5">{children}</div></div>;
}
function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">{label}</div>{children}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-6"><h2 className="tabular mb-2 text-[10px] uppercase tracking-[0.25em] text-ink-faint">{title}</h2><div className="overflow-hidden rounded-xl border border-line bg-surface-1">{children}</div></section>;
}
function Table({ rows }: { rows: { label: string; credits: number; cents: number; sub?: string }[] }) {
  if (!rows.length) return <div className="px-4 py-6 text-center text-xs text-ink-faint">No spend in this view yet.</div>;
  return (
    <table className="w-full text-sm">
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-b border-line last:border-0">
          <td className="px-4 py-2.5 text-ink">{r.label}{r.sub && <span className="ml-2 text-[11px] text-ink-faint">{r.sub}</span>}</td>
          <td className="tabular px-4 py-2.5 text-right text-ink-dim">{Math.round(r.credits).toLocaleString()} cr</td>
          <td className="tabular px-4 py-2.5 text-right font-semibold text-ink">{rand(r.cents)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

// Lightweight SVG charts (no deps).
function LineChart({ data }: { data: { x: string; y: number }[] }) {
  const W = 760, H = 160, P = 28;
  if (data.length < 2) return <div className="mt-3 py-8 text-center text-xs text-ink-faint">Not enough days yet to chart.</div>;
  const max = Math.max(...data.map((d) => d.y), 1);
  const stepX = (W - P * 2) / (data.length - 1);
  const pts = data.map((d, i) => [P + i * stepX, H - P - (d.y / max) * (H - P * 2)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${H - P} L${pts[0][0].toFixed(1)},${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
      <defs><linearGradient id="cc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" /><stop offset="100%" stopColor="#a855f7" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#cc)" />
      <path d={path} fill="none" stroke="#c79bff" strokeWidth="2" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#c79bff" />)}
      {data.map((d, i) => i % Math.ceil(data.length / 8) === 0 && (
        <text key={i} x={P + i * stepX} y={H - 8} textAnchor="middle" className="fill-current text-ink-faint" style={{ fontSize: 9 }}>{d.x}</text>
      ))}
      <text x={P} y={14} className="fill-current text-ink-faint" style={{ fontSize: 9 }}>R{max.toFixed(0)}</text>
    </svg>
  );
}
function Bars({ data }: { data: { label: string; v: number }[] }) {
  if (!data.length) return <div className="mt-3 py-8 text-center text-xs text-ink-faint">No data.</div>;
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div className="mt-3 space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-ink-dim">{d.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(d.v / max) * 100}%`, background: "linear-gradient(90deg,#ec4899,#8b5cf6)" }} />
          </div>
          <span className="tabular w-16 shrink-0 text-right text-[11px] text-ink-dim">{rand(d.v)}</span>
        </div>
      ))}
    </div>
  );
}
