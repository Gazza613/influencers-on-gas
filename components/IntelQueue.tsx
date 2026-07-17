"use client";

import { useCallback, useEffect, useState } from "react";
import { flex } from "@/lib/flex";

// WORTH REVIEWING. The Journalist and The Strategist research daily and file what they find here. They
// PROPOSE - a human accepts or bins. Nothing reaches the client brain without that gate.
//
// Every item carries its real source and an honest confidence grade, because an unsourced "insight" is worse
// than no insight: it becomes a fact nobody can trace and every future piece of work inherits it.

type Intel = {
  id: string; role: string; headline: string; why_it_matters: string; detail: string | null;
  source_url: string | null; source_name: string | null;
  sources: { name: string; url: string }[];
  published_at: string | null; period: string | null;
  confidence: string; material: boolean; status: string; found_at: string;
  // INTERNAL: what this could do to MoMo SA, and the campaign move it argues for. Never the CEO's public voice.
  impact_risk: string | null; campaign_response: string | null;
};

// TWO dates, and conflating them is how stale information becomes "current":
//   found_at     - when WE researched it
//   published_at - when the SOURCE was published / the thing actually happened
// A 2019 article discovered today is not news. The research window is now 30 days (Gary), so anything past that
// is flagged and can never sit in the queue looking as fresh as something published this morning.
const STALE_DAYS = 30;
function dateBits(i: Intel): { published: string; found: string; ageDays: number | null; stale: boolean } {
  // UK long form, the way we write dates: "17th July 2026".
  const fmt = (d: string) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const day = dt.getUTCDate();
    const th = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
    return `${day}${th} ${dt.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${dt.getUTCFullYear()}`;
  };
  const found = i.found_at ? fmt(i.found_at) : "";
  if (!i.published_at) return { published: "", found, ageDays: null, stale: false };
  const ageDays = Math.floor((Date.now() - new Date(i.published_at).getTime()) / 86_400_000);
  return { published: fmt(i.published_at), found, ageDays, stale: ageDays > STALE_DAYS };
}
type Client = { id: string; name: string };

const CONF: Record<string, string> = {
  high: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]",
  medium: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]",
  low: "border-[#f87171]/40 bg-[#f87171]/10 text-[#fca5a5]",
};

export default function IntelQueue({ clients, role }: { clients: Client[]; role: "journalist" | "strategist" }) {
  // Land on the client that actually HAS work, not whichever happens to be first in the list. The first live
  // run filed everything under MTN MoMo while the picker defaulted to GAS Marketing (alphabetically earlier),
  // so the queue looked empty when it was full. The server hands us the clients already ordered with the ones
  // that have a Studio brand kit first.
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [items, setItems] = useState<Intel[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const d = await fetch(`/api/studio/intel?clientId=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setItems(((d?.intel as Intel[]) || []).filter((i) => i.role === role));
  }, [role]);

  useEffect(() => { refresh(clientId); }, [clientId, refresh]);

  async function decide(id: string, status: "accepted" | "binned") {
    setBusy(true);
    await fetch("/api/studio/intel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, id, status }),
    }).catch(() => {});
    setBusy(false);
    await refresh(clientId);
  }

  // Manual trigger, so you never have to wait for tomorrow's cron to see it work.
  // Runs BOTH roles (they share one research pass), then shows this role's findings. Reports honestly: a run
  // that found nothing and a run that broke must never look the same from the outside.
  async function runNow() {
    setRunning(true); setNote("");
    const r = await fetch(`/api/cron/daily-intel?clientId=${clientId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setRunning(false);
    if (!r?.ok) { flex(r?.error || "Couldn't run the research."); return; }
    const ran = (r.ran as { journalist?: number; strategist?: number; errors?: string[] }[])?.[0];
    if (ran?.errors?.length) { setNote(`A role failed: ${ran.errors[0]}`); flex(ran.errors[0]); }
    else {
      const mine = role === "journalist" ? ran?.journalist ?? 0 : ran?.strategist ?? 0;
      setNote(mine ? "" : "Ran clean and found nothing new today. That is a real answer, not a gap.");
      flex(`Research complete. The Journalist filed ${ran?.journalist ?? 0}, The Strategist filed ${ran?.strategist ?? 0}.`);
    }
    await refresh(clientId);
  }

  // LEAD WITH THE MOST RECENT (Gary). Newest publication first; anything we could not date sinks to the bottom,
  // because we cannot claim it is current.
  const byRecency = (a: Intel, b: Intel) => {
    const av = a.published_at ? new Date(a.published_at).getTime() : -Infinity;
    const bv = b.published_at ? new Date(b.published_at).getTime() : -Infinity;
    return bv - av;
  };
  const material = items.filter((i) => i.material).sort(byRecency);
  const rest = items.filter((i) => !i.material).sort(byRecency);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 p-4">
        <div className="flex items-center gap-3">
          <span className="tabular text-sm uppercase tracking-[0.2em] text-ink-faint">Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-[#60a5fa]">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={runNow} disabled={running || !clientId}
          className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-sm font-bold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-40">
          {running ? "Researching…" : "↻ Run research now"}
        </button>
      </div>

      {note && <p className="rounded-lg border border-[#fbbf24]/35 bg-[#fbbf24]/[0.07] px-3 py-2 text-[15px] text-[#fcd34d]">{note}</p>}

      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
          <p className="text-sm text-ink-dim">Nothing in the queue. The daily run is at 08:30 SAST, or hit <b className="text-ink">Run research now</b>.</p>
        </div>
      ) : (
        <>
          {material.length > 0 && (
            <div>
              <p className="tabular mb-2 text-sm uppercase tracking-[0.2em] text-[#86efac]">Material — {material.length}</p>
              <div className="space-y-3">{material.map((i) => <Card key={i.id} i={i} busy={busy} decide={decide} />)}</div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              <p className="tabular mb-2 mt-6 text-sm uppercase tracking-[0.2em] text-ink-faint">Noted, not material — {rest.length}</p>
              <div className="space-y-3">{rest.map((i) => <Card key={i.id} i={i} busy={busy} decide={decide} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ i, busy, decide }: { i: Intel; busy: boolean; decide: (id: string, s: "accepted" | "binned") => void }) {
  return (
    <div className={`rounded-xl border p-4 ${i.material ? "border-[#4ade80]/30 bg-[#4ade80]/[0.04]" : "border-line bg-surface-1"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[18px] font-bold leading-snug text-ink">{i.headline}</p>
        <span className={`tabular shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-bold ${CONF[i.confidence] || CONF.medium}`}>{i.confidence}</span>
      </div>

      {/* DATE TAGS. When the source was published, and when we found it. They are not the same thing, and
          treating them as one is how something from 2019 ends up being read as this morning's news. */}
      {(() => {
        const d = dateBits(i);
        return (
          // BOTH DATES AS LABELLED TAGS, under the headline (Gary): when the source was published, and when we
          // found it. "found" as loose grey text read like a footnote and got missed.
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {d.published ? (
              <span className={`tabular rounded border px-1.5 py-0.5 text-[12px] font-semibold ${d.stale ? "border-[#fbbf24]/45 bg-[#fbbf24]/10 text-[#fcd34d]" : "border-line text-ink-dim"}`}>
                Published {d.published}{d.stale && d.ageDays !== null ? ` · ${d.ageDays} days old` : ""}
              </span>
            ) : (
              <span className="tabular rounded border border-[#f87171]/45 bg-[#f87171]/10 px-1.5 py-0.5 text-[12px] font-semibold text-[#fca5a5]">
                Published date not established
              </span>
            )}
            <span className="tabular rounded border border-line px-1.5 py-0.5 text-[12px] font-semibold text-ink-faint">
              Found {d.found}
            </span>
            {i.period && (
              <span className="tabular rounded border border-line px-1.5 py-0.5 text-[12px] font-semibold text-ink-faint">
                Data covers {i.period}
              </span>
            )}
          </div>
        );
      })()}

      <p className="mt-2 text-[16px] leading-relaxed text-ink-dim"><b className="text-ink">Why it matters:</b> {i.why_it_matters}</p>
      {i.detail && <p className="mt-2 text-[15px] leading-relaxed text-ink-faint">{i.detail}</p>}

      {/* THE INTERNAL ASSESSMENT - what this could actually do to MoMo SA, and the campaign move it argues for.
          Set apart on purpose: it is GAS's own commercial thinking, NOT part of the sourced reporting above and
          - on a Journalist finding - never the CEO's public voice, which is FAIS-bound. */}
      {(i.impact_risk || i.campaign_response) && (() => {
        const move = i.campaign_response || "";
        const def = /\bdefensive\b/i.test(move), pro = /\bproactive\b/i.test(move);
        const tag = def && pro ? "defensive + proactive" : def ? "defensive" : pro ? "proactive" : "";
        // Label by role: the Strategist guides our activations and the positioning we take to MoMo's internal
        // teams; the Journalist is about the CEO's public narrative. Same fields, different jobs.
        const isStrat = i.role === "strategist";
        return (
          <div className="mt-3 rounded-r-lg border-l-2 border-[#818cf8] bg-surface-2/60 px-3 py-2.5">
            <p className="tabular text-[12px] uppercase tracking-[0.16em] text-[#a5b4fc]">
              Our read{tag ? ` · ${tag}` : ""}
            </p>
            {i.impact_risk && (
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-dim">
                <b className="text-ink">What it could do to MoMo:</b> {i.impact_risk}
              </p>
            )}
            {i.campaign_response && (
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-dim">
                <b className="text-ink">{isStrat ? "What we should do" : "What the CEO could say"}:</b> {i.campaign_response}
              </p>
            )}
          </div>
        );
      })()}

      {/* SOURCES. Every finding shows where it came from. An unsourced "insight" is worse than no insight - it
          becomes a fact nobody can trace, and every future article and strategy inherits it. If a finding has
          no source, say so plainly rather than letting it pass as verified. */}
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="tabular text-[12px] uppercase tracking-[0.16em] text-ink-faint">Sources</p>
        {sourcesOf(i).length === 0 ? (
          <p className="mt-1 text-[13px] font-bold text-[#fca5a5]">⚠ No source. Do not treat this as verified.</p>
        ) : (
          <ol className="mt-1 space-y-0.5">
            {sourcesOf(i).map((s, n) => (
              <li key={s.url + n} className="text-[13px] leading-relaxed">
                <span className="tabular text-ink-faint">{n + 1}.</span>{" "}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-[#93c5fd] underline decoration-[#93c5fd]/40 hover:decoration-[#93c5fd]">
                  {s.name || s.url}
                </a>
                <span className="ml-1.5 text-ink-faint">{host(s.url)}</span>
                {/* The date the content was POSTED, right next to the link (Gary) - so you can see how current
                    a source is without opening it. */}
                <span className="ml-1.5 text-ink-faint">
                  · posted {dateBits(i).published || "date not established"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button onClick={() => decide(i.id, "accepted")} disabled={busy}
          className="rounded-lg border border-[#4ade80]/40 px-3 py-1 text-[13px] font-bold text-[#86efac] hover:bg-[#4ade80]/10 disabled:opacity-40">
          ✓ Accept into the brain
        </button>
        <button onClick={() => decide(i.id, "binned")} disabled={busy}
          className="rounded-lg border border-line px-3 py-1 text-[13px] font-bold text-ink-faint hover:text-ink disabled:opacity-40">
          Bin
        </button>
      </div>
    </div>
  );
}

// Older findings were stored with a single source; newer ones carry the full list. Read both.
function sourcesOf(i: Intel): { name: string; url: string }[] {
  if (Array.isArray(i.sources) && i.sources.length) return i.sources;
  if (i.source_url) return [{ name: i.source_name || i.source_url, url: i.source_url }];
  return [];
}

function host(url: string): string {
  try { return `· ${new URL(url).hostname.replace(/^www\./, "")}`; } catch { return ""; }
}
