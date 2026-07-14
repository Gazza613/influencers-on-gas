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
  source_url: string | null; source_name: string | null; confidence: string; material: boolean;
  status: string; found_at: string;
};
type Client = { id: string; name: string };

const CONF: Record<string, string> = {
  high: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]",
  medium: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fcd34d]",
  low: "border-[#f87171]/40 bg-[#f87171]/10 text-[#fca5a5]",
};

export default function IntelQueue({ clients, role }: { clients: Client[]; role: "journalist" | "strategist" }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [items, setItems] = useState<Intel[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

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
  async function runNow() {
    setRunning(true);
    const r = await fetch(`/api/cron/daily-intel?clientId=${clientId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setRunning(false);
    if (!r?.ok) { flex(r?.error || "Couldn't run the research."); return; }
    flex("Research run complete.");
    await refresh(clientId);
  }

  const material = items.filter((i) => i.material);
  const rest = items.filter((i) => !i.material);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 p-4">
        <div className="flex items-center gap-3">
          <span className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-[#60a5fa]">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={runNow} disabled={running || !clientId}
          className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-bold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-40">
          {running ? "Researching…" : "↻ Run research now"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
          <p className="text-sm text-ink-dim">Nothing in the queue. The daily run is at 08:30 SAST, or hit <b className="text-ink">Run research now</b>.</p>
        </div>
      ) : (
        <>
          {material.length > 0 && (
            <div>
              <p className="tabular mb-2 text-xs uppercase tracking-[0.2em] text-[#86efac]">Material — {material.length}</p>
              <div className="space-y-3">{material.map((i) => <Card key={i.id} i={i} busy={busy} decide={decide} />)}</div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              <p className="tabular mb-2 mt-6 text-xs uppercase tracking-[0.2em] text-ink-faint">Noted, not material — {rest.length}</p>
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
        <p className="text-[15px] font-bold leading-snug text-ink">{i.headline}</p>
        <span className={`tabular shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${CONF[i.confidence] || CONF.medium}`}>{i.confidence}</span>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-dim"><b className="text-ink">Why it matters:</b> {i.why_it_matters}</p>
      {i.detail && <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">{i.detail}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {i.source_url && (
          <a href={i.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-[#93c5fd] underline">
            {i.source_name || "source"}
          </a>
        )}
        <span className="flex-1" />
        <button onClick={() => decide(i.id, "accepted")} disabled={busy}
          className="rounded-lg border border-[#4ade80]/40 px-3 py-1 text-[11px] font-bold text-[#86efac] hover:bg-[#4ade80]/10 disabled:opacity-40">
          ✓ Accept into the brain
        </button>
        <button onClick={() => decide(i.id, "binned")} disabled={busy}
          className="rounded-lg border border-line px-3 py-1 text-[11px] font-bold text-ink-faint hover:text-ink disabled:opacity-40">
          Bin
        </button>
      </div>
    </div>
  );
}
