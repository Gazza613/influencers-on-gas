"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";

type Report = {
  total: { credits: number; cents: number; events: number };
  split: { image: { count: number; cents: number }; video: { count: number; cents: number }; other: { count: number; cents: number } };
  byUser: { user_email: string; credits: number; cents: number; events: number }[];
  byInfluencer: { id: string | null; name: string; credits: number; cents: number; images: number; videos: number; last_at: string }[];
  byProvider: { provider: string; credits: number; cents: number }[];
  byAction: { action: string; credits: number; cents: number }[];
  byDay: { day: string; credits: number; cents: number }[];
  influencers: { id: string; name: string }[];
  providers: string[];
};
type Audit = { taken_at: string; remaining: number | null; ledger_credits: number; ledger_cents: number; note: string | null }[];

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PROVIDER_LABEL: Record<string, string> = {
  higgsfield: "Higgsfield · images & upscale",
  heygen: "HeyGen · presenter",
  anthropic: "Claude · co-pilot & QA",
  elevenlabs: "ElevenLabs · voice",
  voyage: "Voyage · embeddings",
  firecrawl: "Firecrawl · crawl",
};
const ACTION_LABEL: Record<string, string> = {
  casting: "Casting (looks)", photoshoot: "Photoshoot", soul: "Lock-down (legacy Soul)", humaniser: "Humaniser",
  presenter: "Presenter", bible: "Character Casting", ingest: "Brain ingestion", creative: "Creatives (social)",
  qa: "AI Vision QA", compose: "Scene writing", research: "Daily research", tagline: "Tagline",
};

const usd = (cents: number, zarPerUsd: number) => zarPerUsd ? "$" + (cents / 100 / zarPerUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
function addDays(s: string, n: number) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
function startOfWeek() { const d = new Date(); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))); }
function startOfMonth() { const d = new Date(); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))); }
function startOfLastMonth() { const d = new Date(); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))); }
function endOfLastMonth() { const d = new Date(); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))); }
function startOfYear() { const d = new Date(); return ymd(new Date(Date.UTC(d.getUTCFullYear(), 0, 1))); }

const PERIODS = [
  { key: "week", label: "This week", range: () => ({ from: startOfWeek(), to: today() }) },
  { key: "month", label: "This month", range: () => ({ from: startOfMonth(), to: today() }) },
  { key: "lastmonth", label: "Last month", range: () => ({ from: startOfLastMonth(), to: endOfLastMonth() }) },
  { key: "ytd", label: "Year to date", range: () => ({ from: startOfYear(), to: today() }) },
  { key: "all", label: "All time", range: () => ({ from: "", to: "" }) },
];

// Previous equal-length window immediately before [from,to] (for week-on-week etc.).
function prevWindow(from: string, to: string): { cmpFrom: string; cmpTo: string } | null {
  if (!from) return null;
  const end = to || today();
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(from)) / 86400000) + 1);
  return { cmpFrom: addDays(from, -days), cmpTo: addDays(from, -1) };
}

export default function CostControlPage() {
  const [from, setFrom] = useState<string>(startOfMonth());
  const [to, setTo] = useState<string>(today());
  const [preset, setPreset] = useState("month");
  const [influencerId, setInfluencerId] = useState("");
  const [provider, setProvider] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [report, setReport] = useState<Report | null>(null);
  const [audit, setAudit] = useState<Audit>([]);
  const [prev, setPrev] = useState<{ cents: number; credits: number } | null>(null);
  const [cycle, setCycle] = useState<{ start: string; trackedCredits: number; trackedCents: number } | null>(null);
  const [rate, setRate] = useState(0);
  const [bal, setBal] = useState<{ remaining: number | null; monthly: number; creditZarCents: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuper, setIsSuper] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calMsg, setCalMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (influencerId) qs.set("influencerId", influencerId);
    if (provider) qs.set("provider", provider);
    if (userEmail) qs.set("userEmail", userEmail);
    const cmp = prevWindow(from, to);
    if (cmp) { qs.set("cmpFrom", cmp.cmpFrom); qs.set("cmpTo", cmp.cmpTo); }
    const r = await fetch(`/api/cost-control?${qs}`).then((x) => x.json()).catch(() => null);
    if (r?.report) { setReport(r.report); setAudit(r.audit || []); setPrev(r.previous ?? null); setCycle(r.cycle ?? null); setRate(r.zarPerUsd || 0); }
    setLoading(false);
  }, [from, to, influencerId, provider, userEmail]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/balance").then((r) => r.json()).then((d) => setBal({ remaining: d.remaining ?? null, monthly: d.monthly ?? 9000, creditZarCents: d.creditZarCents ?? 64 })).catch(() => {});
    fetch("/api/me").then((r) => (r.ok ? r.json() : { user: null })).then((d) => setIsSuper(d.user?.role === "super_admin")).catch(() => {});
  }, []);

  // Self-heal the daily audit: snapshot once a day when someone opens Cost Control,
  // so it stays current even if the cron hasn't fired.
  const snapped = useRef(false);
  useEffect(() => {
    if (snapped.current || loading) return;
    const haveToday = audit.length > 0 && audit[0].taken_at.slice(0, 10) === today();
    snapped.current = true;
    if (!haveToday) fetch("/api/cost-control/snapshot", { method: "POST" }).then(() => load()).catch(() => {});
  }, [audit, loading, load]);

  async function calibrate() {
    if (calibrating) return;
    setCalibrating(true); setCalMsg("");
    const d = await fetch("/api/cost-control/calibrate", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setCalibrating(false);
    if (d?.results) {
      const ok = d.results.filter((r: { updated: boolean }) => r.updated).map((r: { model: string; credits: number }) => `${r.model}=${r.credits}cr`);
      setCalMsg(ok.length ? `Updated: ${ok.join(", ")}` : "Couldn't read costs — check Higgsfield connection.");
      load();
    } else setCalMsg("Calibration failed.");
  }

  function applyPreset(key: string) {
    setPreset(key);
    const p = PERIODS.find((x) => x.key === key);
    if (p) { const r = p.range(); setFrom(r.from); setTo(r.to); }
  }

  const pct = bal?.remaining != null ? Math.max(0, Math.min(100, (bal.remaining / bal.monthly) * 100)) : null;
  const lastAudit = audit[0];
  const auditDelta = lastAudit && lastAudit.remaining != null ? (bal?.monthly ?? 9000) - lastAudit.remaining - lastAudit.ledger_credits : null;
  // Spend delta vs the previous equal-length period.
  const curCents = report?.total.cents ?? 0;
  const delta = prev && prev.cents > 0 ? Math.round(((curCents - prev.cents) / prev.cents) * 100) : null;

  return (
    <div className="min-h-dvh bg-surface-0 text-ink">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-5 py-7">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cost Control</h1>
            <p className="mt-1 text-sm text-ink-dim">Every credit and Rand this platform spends, by member, influencer, tool and function. Audited daily against the live balance.</p>
          </div>
          <div className="flex items-center gap-2">
            {isSuper && (
              <button onClick={calibrate} disabled={calibrating} title="Read each model's real credit cost from Higgsfield and update the rate card"
                className="rounded-lg border border-[#a855f7]/30 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:border-[#a855f7]/60 hover:bg-[#a855f7]/10 disabled:opacity-50">
                {calibrating ? "Calibrating…" : "Recalibrate costs"}
              </button>
            )}
            <button onClick={() => load()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink disabled:opacity-60">
              {loading ? <span className="spinner-ring" /> : <span>↻</span>}{loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        {calMsg && <p className="tabular mt-1 text-[11px] text-ink-faint">{calMsg}</p>}

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
          <Kpi label="Total spend (period)">
            <div className="tabular text-2xl font-bold">{report ? rand(report.total.cents) : "…"}</div>
            <div className="tabular mt-1 text-xs text-ink-dim">
              {report ? `${rate > 0 ? usd(report.total.cents, rate) + " · " : ""}${Math.round(report.total.credits).toLocaleString()} credits used` : ""}
            </div>
            {delta != null && (
              <div className={`tabular mt-1 text-[11px] font-semibold ${delta > 0 ? "text-active" : "text-ready"}`}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}% vs previous period
              </div>
            )}
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

        {/* Cycle reconciliation: platform ledger vs actual Higgsfield balance */}
        {bal?.remaining != null && cycle && (() => {
          const cz = bal.creditZarCents || 77;
          const crR = (cr: number) => "R" + ((cr * cz) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const crU = (cr: number) => (rate ? " ($" + ((cr * cz) / 100 / rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ")" : "");
          const actualUsed = Math.max(0, bal.monthly - (bal.remaining ?? 0));
          const tracked = cycle.trackedCredits;
          const direct = actualUsed - tracked;
          const Row = ({ label, cr, strong, tone }: { label: string; cr: number; strong?: boolean; tone?: string }) => (
            <div className="flex items-center justify-between border-b border-line/60 py-2 last:border-0">
              <span className={`text-sm ${strong ? "font-semibold text-ink" : "text-ink-dim"}`}>{label}</span>
              <span className={`tabular text-sm ${tone ?? "text-ink"}`}>{Math.round(cr).toLocaleString()} cr · {crR(cr)}<span className="text-ink-faint">{crU(cr)}</span></span>
            </div>
          );
          return (
            <section className="mt-6 rounded-xl border border-line bg-surface-1 p-5">
              <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">Cycle reconciliation · since {cycle.start}</div>
              <p className="mt-1 text-[11px] text-ink-faint">Higgsfield tops up {bal.monthly.toLocaleString()} credits each cycle. This reconciles what the platform tracked against what Higgsfield actually consumed.</p>
              <div className="mt-3">
                <Row label="Higgsfield actually used (live balance)" cr={actualUsed} strong />
                <Row label="Tracked by this platform" cr={tracked} tone="text-ready" />
                <Row label={direct >= 0 ? "Direct / outside the platform" : "Platform over-estimate (re-calibrate)"} cr={Math.abs(direct)} strong tone={direct > 50 ? "text-active" : "text-ink-dim"} />
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                {direct >= 0
                  ? "“Direct” = credits spent straight on Higgsfield (manual generations) or beyond what we metered — so nothing is hidden."
                  : "Our per-model estimates are running higher than Higgsfield's actual burn. Hit “Recalibrate costs” to true them up via get_cost."}
              </p>
            </section>
          );
        })()}

        {/* Pickers */}
        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-1 p-4">
          <div>
            <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Range</div>
            <div className="flex flex-wrap gap-1">
              {PERIODS.map((p) => (
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
              {report?.byUser.map((u) => <option key={u.user_email} value={u.user_email}>{u.user_email === "(system)" ? "Super Admin" : u.user_email}</option>)}
            </select>
          </Picker>
          {(influencerId || provider || userEmail || preset !== "month") && (
            <button onClick={() => { setInfluencerId(""); setProvider(""); setUserEmail(""); applyPreset("month"); }} className="rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-dim hover:text-ink">Clear</button>
          )}
        </div>

        {/* Image vs video split */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-ready/25 bg-ready/5 p-5">
            <div className="tabular text-xs uppercase tracking-[0.2em] text-ready">Images</div>
            <div className="tabular mt-1 text-xl font-bold">{report?.split.image.count ?? 0} <span className="text-sm font-normal text-ink-dim">generated</span></div>
            <div className="tabular mt-1 text-sm text-ink-dim">{report ? rand(report.split.image.cents) : ""}</div>
          </div>
          <div className="rounded-xl border border-active/25 bg-active/5 p-5">
            <div className="tabular text-xs uppercase tracking-[0.2em] text-active">Video / presenter</div>
            <div className="tabular mt-1 text-xl font-bold">{report?.split.video.count ?? 0} <span className="text-sm font-normal text-ink-dim">jobs</span></div>
            <div className="tabular mt-1 text-sm text-ink-dim">{report ? rand(report.split.video.cents) : ""}</div>
          </div>
        </div>

        {/* Tables */}
        <Section title="By team member">{report && <Table rows={report.byUser.map((u) => ({ label: u.user_email === "(system)" ? "Super Admin" : u.user_email, credits: u.credits, cents: u.cents, sub: `${u.events} jobs` }))} />}</Section>
        <Section title="By influencer (latest builds first)">
          {report && <Table rows={report.byInfluencer.map((i) => ({ label: i.name, credits: i.credits, cents: i.cents, sub: `${i.images} img · ${i.videos} vid · last ${i.last_at}` }))} />}
        </Section>
        <Section title="By platform / API">{report && <Table rows={report.byProvider.map((p) => ({ label: PROVIDER_LABEL[p.provider] ?? p.provider, credits: p.credits, cents: p.cents }))} />}</Section>
        <Section title="By function">{report && <Table rows={report.byAction.map((a) => ({ label: ACTION_LABEL[a.action] ?? a.action, credits: a.credits, cents: a.cents }))} />}</Section>

        {/* Charts */}
        <h2 className="tabular mt-9 mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Visualisations</h2>
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

        <p className="mt-8 text-xs text-ink-faint">Prices come from the rate_card table · Higgsfield Ultra $375 / 9,000 credits ≈ R0.77 per credit. {loading ? "Updating…" : ""}</p>
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
  return <section className="mt-6"><h2 className="tabular mb-2 text-xs uppercase tracking-[0.2em] text-ink-faint">{title}</h2><div className="overflow-hidden rounded-xl border border-line bg-surface-1">{children}</div></section>;
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
