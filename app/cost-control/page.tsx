"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import FixedCosts from "@/components/FixedCosts";

type Report = {
  total: { credits: number; cents: number; events: number };
  split: { image: { count: number; cents: number }; video: { count: number; cents: number }; other: { count: number; cents: number } };
  byUser: { user_email: string; credits: number; cents: number; events: number }[];
  byUserDesk: { user_email: string; total_cents: number; desks: { desk: string; cents: number; tint: string }[] }[];
  byInfluencer: { id: string | null; name: string; credits: number; cents: number; images: number; videos: number; last_at: string }[];
  byClient: { id: string | null; name: string; cents: number; events: number; research_cents: number; last_at: string }[];
  byProvider: { provider: string; credits: number; cents: number }[];
  byAction: { action: string; credits: number; cents: number; events: number }[];
  byDesk: { desk: string; credits: number; cents: number; events: number; tint: string }[];
  byDay: { day: string; credits: number; cents: number }[];
  influencers: { id: string; name: string }[];
  providers: string[];
};
type Audit = { taken_at: string; remaining: number | null; ledger_credits: number; ledger_cents: number; note: string | null }[];

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (cents: number, zarPerUsd: number) => zarPerUsd ? "$" + (cents / 100 / zarPerUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
const PROVIDER_LABEL: Record<string, string> = {
  higgsfield: "Higgsfield · images & scenes", fal: "fal.ai · talking shots", heygen: "HeyGen · presenter",
  anthropic: "Claude · research, copy & QA", elevenlabs: "ElevenLabs · voice", voyage: "Voyage · embeddings", firecrawl: "Firecrawl · crawl",
};
const ACTION_LABEL: Record<string, string> = {
  casting: "Casting", photoshoot: "Photoshoot", soul: "Lock-down", humaniser: "Humaniser", presenter: "Presenter",
  bible: "Character casting", ingest: "Brain ingestion", creative: "Wardrobe & set", wardrobe: "Wardrobe lock", qa: "Vision QA",
  compose: "Scene writing", "deep-research": "Deep research", "research-file": "Research filing", "research-verify": "Source check",
  "daily-intel": "Strategist watch", "ceo-newsletter": "CEO article", tagline: "Tagline", aroll: "Talking shot", broll: "Scene shot",
  "fonts-extract": "Fonts from doc", storyboard: "Storyboard", script: "Script", voice_script: "Voice script", voice_design: "Voice design",
};

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

// Previous equal-length window immediately before [from,to] (for the "vs previous" delta).
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
  // The FULL subscription allocation from the SAME fetch as the report, so the hero total and the By-section
  // tallies reconcile off ONE consistent set of numbers (fixing the "totals don't add up" - the hero was
  // usage-only while By-section added subscription shares). byDesk = used-plan share per desk; idleCents = plans
  // nobody used this period; totalCents = every active subscription.
  const [fixed, setFixed] = useState<{ totalCents: number; byDesk: { desk: string; cents: number; tint: string }[]; idleCents: number } | null>(null);
  const fixedByDesk = fixed ? Object.fromEntries(fixed.byDesk.map((d) => [d.desk, d.cents])) : {};
  const [audit, setAudit] = useState<Audit>([]);
  const [prev, setPrev] = useState<{ cents: number; credits: number } | null>(null);
  const [cycle, setCycle] = useState<{ start: string; trackedCredits: number; trackedCents: number } | null>(null);
  const [rate, setRate] = useState(0);
  const [bal, setBal] = useState<{ remaining: number | null; monthly: number; creditZarCents: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuper, setIsSuper] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  const [buildTarget, setBuildTarget] = useState<string>("");
  const [targetBusy, setTargetBusy] = useState(false);
  const [targetMsg, setTargetMsg] = useState("");

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
    if (r?.report) {
      setReport(r.report); setAudit(r.audit || []); setPrev(r.previous ?? null); setCycle(r.cycle ?? null); setRate(r.zarPerUsd || 0);
      const f = r.fixed;
      setFixed(f ? { totalCents: f.totalCents || 0, byDesk: f.byDesk || [], idleCents: (f.idle || []).reduce((s: number, x: { cents: number }) => s + (x.cents || 0), 0) } : null);
    }
    setLoading(false);
  }, [from, to, influencerId, provider, userEmail]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/balance").then((r) => r.json()).then((d) => setBal({ remaining: d.remaining ?? null, monthly: d.monthly ?? 9000, creditZarCents: d.creditZarCents ?? 64 })).catch(() => {});
    fetch("/api/me").then((r) => (r.ok ? r.json() : { user: null })).then((d) => setIsSuper(d.user?.role === "super_admin")).catch(() => {});
    fetch("/api/cost-control/budget").then((r) => (r.ok ? r.json() : null)).then((d) => { if (typeof d?.perBuildCents === "number" && d.perBuildCents > 0) setBuildTarget(String(Math.round(d.perBuildCents / 100))); }).catch(() => {});
  }, []);

  async function saveBuildTarget() {
    if (targetBusy) return;
    setTargetBusy(true); setTargetMsg("");
    const rands = Number(buildTarget);
    const perBuildCents = Number.isFinite(rands) ? Math.round(rands * 100) : 0;
    const r = await fetch("/api/cost-control/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ perBuildCents }) }).then((x) => x.json()).catch(() => null);
    setTargetBusy(false);
    setTargetMsg(r?.ok ? (perBuildCents > 0 ? "Target saved" : "Target cleared") : (r?.error || "Could not save"));
  }

  // Self-heal the daily audit: snapshot once a day when someone opens Cost Control.
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
    const seed = await fetch("/api/cost-control/seed-rates").then((r) => r.json()).catch(() => null);
    const applied = Array.isArray(seed?.applied) ? seed.applied.length : 0;
    const d = await fetch("/api/cost-control/calibrate", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setCalibrating(false);
    const seedMsg = applied ? `${applied} rate${applied === 1 ? "" : "s"} applied. ` : "";
    if (d?.results) {
      const ok = d.results.filter((r: { updated: boolean }) => r.updated).map((r: { model: string; credits: number }) => `${r.model}=${r.credits}cr`);
      setCalMsg(seedMsg + (ok.length ? `Higgsfield trued up: ${ok.join(", ")}` : "Higgsfield get_cost unavailable."));
    } else setCalMsg(seedMsg + (applied ? "Higgsfield calibration unavailable." : "Calibration failed."));
    load();
  }

  function applyPreset(key: string) {
    setPreset(key);
    const p = PERIODS.find((x) => x.key === key);
    if (p) { const r = p.range(); setFrom(r.from); setTo(r.to); }
  }

  const pct = bal?.remaining != null ? Math.max(0, Math.min(100, (bal.remaining / bal.monthly) * 100)) : null;
  const delta = prev && prev.cents > 0 ? Math.round((((report?.total.cents ?? 0) - prev.cents) / prev.cents) * 100) : null;
  const periodLabel = PERIODS.find((p) => p.key === preset)?.label ?? (from ? `${from} to ${to || "today"}` : "All time");
  const members = report?.byUserDesk?.length ? report.byUserDesk : (report?.byUser ?? []).map((u) => ({ user_email: u.user_email, total_cents: u.cents, desks: [] as { desk: string; cents: number; tint: string }[] }));
  const anyFilter = influencerId || provider || userEmail || preset !== "month";

  return (
    <div className="min-h-dvh bg-surface-0 text-ink">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-4xl font-extrabold tracking-tight">Cost Control</h1>
          <button onClick={() => load()} disabled={loading}
            className="rounded-lg border border-line px-4 py-2 text-lg font-semibold text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-60">
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        <p className="mt-1 text-lg text-ink-dim">What the platform spends, and who spent it. Priced live, per team member and per section.</p>

        {/* Date range */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className={`rounded-full px-4 py-2 text-lg font-semibold transition ${preset === p.key ? "bg-[#a855f7]/20 text-[#c79bff]" : "border border-line text-ink-dim hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Filters (compact) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={userEmail} onChange={(e) => setUserEmail(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg text-ink outline-none focus:border-[#a855f7]">
            <option value="">Everyone</option>
            {report?.byUser.map((u) => <option key={u.user_email} value={u.user_email}>{u.user_email === "(system)" ? "Super Admin" : u.user_email}</option>)}
          </select>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg text-ink outline-none focus:border-[#a855f7]">
            <option value="">All tools</option>
            {report?.providers.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p] ?? p}</option>)}
          </select>
          <select value={influencerId} onChange={(e) => setInfluencerId(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg text-ink outline-none focus:border-[#a855f7]">
            <option value="">All influencers</option>
            {report?.influencers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          {anyFilter && (
            <button onClick={() => { setInfluencerId(""); setProvider(""); setUserEmail(""); applyPreset("month"); }}
              className="rounded-lg border border-line px-3 py-2 text-lg text-ink-dim hover:text-ink">Clear</button>
          )}
        </div>

        {/* HERO: the TRUE total = pay-per-use + every active subscription. This is what the platform costs the
            agency, and it is the number the By-section tallies reconcile to (usage + used plans + idle plans). */}
        <div className="mt-6 rounded-2xl border border-line bg-surface-1 p-7">
          <div className="text-base uppercase tracking-[0.15em] text-ink-faint">Total spend · {periodLabel}</div>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            <div className="tabular text-6xl font-extrabold leading-none">{report ? rand((report.total.cents) + (fixed?.totalCents ?? 0)) : "…"}</div>
            {rate > 0 && report && <div className="tabular pb-1 text-2xl text-ink-dim">{usd((report.total.cents) + (fixed?.totalCents ?? 0), rate)}</div>}
            {delta != null && (
              <div className={`tabular pb-2 text-xl font-bold ${delta > 0 ? "text-active" : "text-ready"}`}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}% usage vs previous
              </div>
            )}
          </div>
          <div className="mt-2 text-lg text-ink-faint">
            {report ? (fixed && fixed.totalCents > 0
              ? <>{rand(report.total.cents)} usage ({report.total.events.toLocaleString()} paid actions) + {rand(fixed.totalCents)} monthly subscriptions</>
              : `${report.total.events.toLocaleString()} paid actions in this period`) : ""}
          </div>
        </div>

        {/* TEAM MEMBERS - the number that matters most to Gary */}
        <TeamMembers rows={members} />

        {/* BY CLIENT / BRAIN - total spend and research-only cost per client (Gary: "this is key") */}
        {report && report.byClient.some((c) => c.id) && <ClientCosts rows={report.byClient} />}

        {/* BY SECTION */}
        {report && report.byDesk.length > 0 && <SectionSplit desks={report.byDesk} fixedByDesk={fixedByDesk} idleCents={fixed?.idleCents ?? 0} />}

        {/* MONTHLY SUBSCRIPTIONS */}
        <FixedCosts isSuperAdmin={isSuper} />

        {/* DAILY TREND */}
        {report && report.byDay.length > 1 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xl font-bold">Daily spend</h2>
            <div className="rounded-xl border border-line bg-surface-1 p-5"><LineChart data={report.byDay.map((d) => ({ x: d.day.slice(5), y: d.cents / 100 }))} /></div>
          </section>
        )}

        {/* MORE DETAIL - collapsed by default so the main view stays clean */}
        <details className="mt-8 rounded-xl border border-line bg-surface-1 p-5">
          <summary className="cursor-pointer text-xl font-bold text-ink">More detail (by tool, function, influencer)</summary>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <DetailTable title="By tool / platform" rows={(report?.byProvider ?? []).map((p) => ({ label: PROVIDER_LABEL[p.provider] ?? p.provider, cents: p.cents }))} />
            <DetailTable title="By function" rows={(report?.byAction ?? []).map((a) => ({ label: ACTION_LABEL[a.action] ?? a.action, cents: a.cents }))} />
            <DetailTable title="By influencer" rows={(report?.byInfluencer ?? []).map((i) => ({ label: i.name, cents: i.cents, sub: `${i.images} img · ${i.videos} vid` }))} />
          </div>
        </details>

        {/* ADMIN & AUDIT - super-admin only, out of the team's way */}
        {isSuper && (
          <details className="mt-4 rounded-xl border border-line bg-surface-1 p-5">
            <summary className="cursor-pointer text-xl font-bold text-ink">Admin &amp; audit</summary>
            <div className="mt-4 space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={calibrate} disabled={calibrating}
                  className="rounded-lg border border-[#a855f7]/30 px-4 py-2 text-lg font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">
                  {calibrating ? "Calibrating…" : "Recalibrate costs"}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-lg text-ink-dim">Per-build target R</span>
                  <input value={buildTarget} onChange={(e) => setBuildTarget(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="1000"
                    className="tabular w-24 rounded border border-line bg-surface-2 px-2 py-1.5 text-lg text-ink outline-none focus:border-[#a855f7]" />
                  <button onClick={saveBuildTarget} disabled={targetBusy} className="rounded border border-[#a855f7]/30 px-3 py-1.5 text-lg font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{targetBusy ? "…" : "Save"}</button>
                  {targetMsg && <span className="text-lg text-ink-faint">{targetMsg}</span>}
                </div>
              </div>
              {calMsg && <p className="text-lg text-ink-faint">{calMsg}</p>}
              {bal?.remaining != null && (
                <div>
                  <div className="text-lg font-semibold text-ink">Higgsfield credits: <span className="tabular">{bal.remaining.toLocaleString()} / {bal.monthly.toLocaleString()}</span>{cycle ? <span className="text-ink-faint"> · cycle since {cycle.start}</span> : ""}</div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full ${pct != null && pct < 12 ? "bg-alert" : "bg-ready"}`} style={{ width: `${pct ?? 0}%` }} /></div>
                </div>
              )}
              {audit.length > 0 && (
                <div>
                  <div className="mb-2 text-lg font-semibold text-ink">Daily audit (ledger vs live balance)</div>
                  <table className="w-full text-lg">
                    <tbody>{audit.slice(0, 10).map((a, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="tabular py-2 text-ink-dim">{a.taken_at}</td>
                        <td className="tabular py-2 text-right text-ink">{a.remaining != null ? Math.round(a.remaining).toLocaleString() : "-"} cr live</td>
                        <td className="tabular py-2 text-right text-ink-dim">{rand(a.ledger_cents)} ledger</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        )}
      </main>
    </div>
  );
}

// BY CLIENT / BRAIN (Gary: "research by client cost - this is key"). Research, strategy and brain work are all
// keyed by client_id, so this is where "what has each client cost us, research included" gets answered. The
// Research column pulls out the Researcher-desk slice; combined with the Team members view above (who ran it),
// this closes the loop: which client, what it cost, and who commissioned it.
type ClientRow = { id: string | null; name: string; cents: number; events: number; research_cents: number; last_at: string };
function ClientCosts({ rows }: { rows: ClientRow[] }) {
  const clients = rows.filter((c) => c.id);   // drop the "(no client)" platform/cron bucket
  if (!clients.length) return null;
  const researchTint = "#a855f7";   // matches "The Researcher" desk tint
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">By client / brain</h2>
      <p className="mt-0.5 text-lg text-ink-dim">What each client has cost this period, with the research spend pulled out. Pair with Team members above to see who ran it.</p>
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-1">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line text-sm uppercase tracking-wide text-ink-faint">
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 text-right font-semibold"><span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: researchTint }} />Research</span></th>
              <th className="px-5 py-3 text-right font-semibold">Total spend</th>
              <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-line/50 last:border-0">
                <td className="px-5 py-3 text-lg font-semibold text-ink">{c.name}</td>
                <td className="tabular px-5 py-3 text-right text-lg font-bold" style={{ color: c.research_cents > 0 ? researchTint : undefined }}>{c.research_cents > 0 ? rand(c.research_cents) : "—"}</td>
                <td className="tabular px-5 py-3 text-right text-lg font-bold text-ink">{rand(c.cents)}</td>
                <td className="hidden px-5 py-3 text-right text-base text-ink-faint sm:table-cell">{c.last_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// TEAM MEMBERS - who spent what, and on which section. The primary view (Gary): big totals, a stacked bar of
// the sections each person spent on, and a labelled amount per section. One place, no filter-juggling.
type MemberRow = { user_email: string; total_cents: number; desks: { desk: string; cents: number; tint: string }[] };
function TeamMembers({ rows }: { rows: MemberRow[] }) {
  if (!rows.length) return <p className="mt-8 text-lg text-ink-faint">No spend in this period yet.</p>;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">Team members</h2>
      <p className="mt-0.5 text-lg text-ink-dim">Who spent what this period, and on which section.</p>
      <div className="mt-3 space-y-3">
        {rows.map((u) => {
          const name = u.user_email === "(system)" ? "Super Admin" : u.user_email;
          return (
            <div key={u.user_email} className="rounded-xl border border-line bg-surface-1 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xl font-bold text-ink">{name}</span>
                <span className="tabular text-2xl font-extrabold text-ink">{rand(u.total_cents)}</span>
              </div>
              {u.desks.length > 0 && (
                <>
                  <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
                    {u.desks.map((d) => <div key={d.desk} title={`${d.desk}: ${rand(d.cents)}`} style={{ width: `${u.total_cents > 0 ? (d.cents / u.total_cents) * 100 : 0}%`, background: d.tint }} />)}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                    {u.desks.map((d) => (
                      <span key={d.desk} className="tabular inline-flex items-center gap-1.5 text-base text-ink-dim">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.tint }} />
                        {d.desk} <span className="font-semibold text-ink">{rand(d.cents)}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// BY SECTION - each section's true cost: pay-per-use plus its share of the subscriptions its work runs on.
type DeskRow = { desk: string; credits: number; cents: number; events: number; tint: string };
function SectionSplit({ desks, fixedByDesk, idleCents }: { desks: DeskRow[]; fixedByDesk: Record<string, number>; idleCents: number }) {
  const trueOf = (d: DeskRow) => d.cents + (fixedByDesk[d.desk] ?? 0);
  // Include idle plans (paid for, used by nobody) as their own row, so the rows SUM to the hero total exactly:
  // usage + used-plan shares + idle plans = every rand the platform spent this period. No more mismatch.
  const total = desks.reduce((s, d) => s + trueOf(d), 0) + idleCents;
  const pct = (c: number) => (total > 0 ? (c / total) * 100 : 0);
  const anyFixed = Object.values(fixedByDesk).some((v) => v > 0) || idleCents > 0;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">By section</h2>
      {anyFixed && <p className="mt-0.5 text-lg text-ink-dim">Pay-per-use plus each section&apos;s share of the subscriptions. These rows sum to the total above.</p>}
      <div className="mt-3 rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2">
          {desks.map((d) => <div key={d.desk} title={`${d.desk} · ${rand(trueOf(d))}`} style={{ width: `${Math.max(pct(trueOf(d)), trueOf(d) > 0 ? 0.8 : 0)}%`, background: d.tint }} />)}
          {idleCents > 0 && <div title={`Unused plans · ${rand(idleCents)}`} style={{ width: `${Math.max(pct(idleCents), 0.8)}%`, background: "#475569" }} />}
        </div>
        <div className="mt-4 space-y-3">
          {desks.map((d) => {
            const fixed = fixedByDesk[d.desk] ?? 0;
            return (
              <div key={d.desk} className="flex items-center justify-between gap-3 border-b border-line/60 pb-3 last:border-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.tint }} />
                  <span className="truncate text-lg font-semibold text-ink">{d.desk}</span>
                  <span className="tabular shrink-0 text-base text-ink-faint">{d.events.toLocaleString()} jobs</span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular text-xl font-bold text-ink">{rand(trueOf(d))}</div>
                  <div className="tabular text-base text-ink-faint">{fixed > 0 ? `${rand(d.cents)} use + ${rand(fixed)} plans` : `${pct(trueOf(d)).toFixed(0)}%`}</div>
                </div>
              </div>
            );
          })}
          {idleCents > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-3 last:border-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: "#475569" }} />
                <span className="truncate text-lg font-semibold text-ink-dim">Unused plans</span>
                <span className="tabular shrink-0 text-base text-ink-faint">idle capacity</span>
              </div>
              <div className="shrink-0 text-right">
                <div className="tabular text-xl font-bold text-ink-dim">{rand(idleCents)}</div>
                <div className="tabular text-base text-ink-faint">paid for, used by nobody</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DetailTable({ title, rows }: { title: string; rows: { label: string; cents: number; sub?: string }[] }) {
  const shown = rows.filter((r) => r.cents > 0);
  return (
    <div>
      <div className="mb-1.5 text-lg font-semibold text-ink">{title}</div>
      {shown.length ? (
        <table className="w-full text-lg">
          <tbody>{shown.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              <td className="py-2 pr-2 text-ink">{r.label}{r.sub && <span className="ml-2 text-base text-ink-faint">{r.sub}</span>}</td>
              <td className="tabular py-2 text-right font-semibold text-ink">{rand(r.cents)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="py-3 text-base text-ink-faint">Nothing here yet.</div>}
    </div>
  );
}

// Lightweight daily-spend line (no deps).
function LineChart({ data }: { data: { x: string; y: number }[] }) {
  const W = 760, H = 170, P = 30;
  if (data.length < 2) return <div className="py-8 text-center text-lg text-ink-faint">Not enough days yet to chart.</div>;
  const max = Math.max(...data.map((d) => d.y), 1);
  const stepX = (W - P * 2) / (data.length - 1);
  const pts = data.map((d, i) => [P + i * stepX, H - P - (d.y / max) * (H - P * 2)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${H - P} L${pts[0][0].toFixed(1)},${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs><linearGradient id="cc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" /><stop offset="100%" stopColor="#a855f7" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#cc)" />
      <path d={path} fill="none" stroke="#c79bff" strokeWidth="2.5" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#c79bff" />)}
      {data.map((d, i) => i % Math.ceil(data.length / 8) === 0 && (
        <text key={i} x={P + i * stepX} y={H - 9} textAnchor="middle" className="fill-current text-ink-faint" style={{ fontSize: 11 }}>{d.x}</text>
      ))}
      <text x={P} y={16} className="fill-current text-ink-faint" style={{ fontSize: 11 }}>R{max.toFixed(0)}</text>
    </svg>
  );
}
