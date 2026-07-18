"use client";

import { useEffect, useState } from "react";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

// THE TECH-STACK EXPOSURE (Gary: "we should maybe have a fixed cost exposure as a cost level").
//
// Every amount is editable and stored in the database, never in code - the same rule as rate_card, and for
// the same reason: a price hard-coded in a deploy is a price that goes stale silently. Rows seeded at $0 are
// deliberate placeholders for plans whose real amount only Gary knows; inventing a number here would be
// worse than showing a gap, because it would look authoritative while being wrong.

type Sub = { id: string; provider: string; name: string; monthly_usd: number; active: boolean; note: string | null };
type Alloc = {
  totalUsd: number; totalCents: number; zarPerUsd: number;
  byDesk: { desk: string; cents: number; tint: string }[];
  idle: { name: string; cents: number }[];
  subscriptions: (Sub & { cents: number; jobs: number })[];
};

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FixedCosts({ isSuperAdmin, onLoaded }: { isSuperAdmin: boolean; onLoaded?: (a: Alloc) => void }) {
  const [alloc, setAlloc] = useState<Alloc | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ provider: "", name: "", monthly_usd: "" });

  async function load() {
    const d = await fetch("/api/cost-control/subscriptions", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.allocation) { setAlloc(d.allocation); onLoaded?.(d.allocation); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save(s: Sub, usd: number) {
    setSaving(s.id);
    const r = await fetch("/api/cost-control/subscriptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, provider: s.provider, name: s.name, monthly_usd: usd, active: s.active, note: s.note }),
    }).catch(() => null);
    setSaving("");
    if (r?.ok) { setEditing((m) => { const c = { ...m }; delete c[s.id]; return c; }); await load(); }
    else flex("Could not save that amount.");
  }

  async function add() {
    const usd = Number(draft.monthly_usd);
    if (!draft.provider.trim() || !draft.name.trim() || !Number.isFinite(usd)) { flex("Provider, name and a monthly amount are all needed."); return; }
    const r = await fetch("/api/cost-control/subscriptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: draft.provider.trim(), name: draft.name.trim(), monthly_usd: usd }),
    }).catch(() => null);
    if (r?.ok) { setDraft({ provider: "", name: "", monthly_usd: "" }); setAdding(false); await load(); }
    else flex("Could not add that subscription.");
  }

  async function remove(s: Sub) {
    if (!(await askConfirm({ title: `Remove ${s.name}?`, body: "It stops counting towards the fixed monthly exposure.", tone: "danger", confirmLabel: "Remove" }))) return;
    await fetch(`/api/cost-control/subscriptions?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  if (!alloc) return null;
  const unpriced = alloc.subscriptions.filter((s) => s.monthly_usd === 0).length;

  return (
    <section className="mt-6">
      <h2 className="tabular mb-2 text-xs uppercase tracking-[0.2em] text-ink-faint">
        Fixed monthly exposure <span className="normal-case tracking-normal text-ink-dim">· what the stack costs before a single job runs</span>
      </h2>
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="tabular text-2xl font-bold text-ink">{rand(alloc.totalCents)}<span className="ml-2 text-sm font-normal text-ink-dim">/ month</span></div>
            <div className="tabular mt-0.5 text-[11px] text-ink-faint">${alloc.totalUsd.toLocaleString()} at R{alloc.zarPerUsd.toFixed(2)}/$</div>
            {/* Said plainly because it is the one place this panel could mislead: the money is always ONE
                month of subscriptions. Only the split across desks follows the date filter above. */}
            <div className="mt-1 text-[11px] text-ink-faint">Always one month of plans. The date filter changes how it splits across desks, never the total.</div>
          </div>
          {isSuperAdmin && (
            <button onClick={() => setAdding((a) => !a)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink">
              {adding ? "Cancel" : "+ Add a subscription"}
            </button>
          )}
        </div>

        {adding && isSuperAdmin && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-line bg-surface-2 p-3">
            <input value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} placeholder="provider (e.g. freepik)"
              className="w-40 rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Plan name"
              className="w-48 rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
            <input value={draft.monthly_usd} onChange={(e) => setDraft({ ...draft, monthly_usd: e.target.value })} placeholder="USD / month" inputMode="decimal"
              className="w-32 rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
            <button onClick={add} className="rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-black">Add</button>
          </div>
        )}

        {unpriced > 0 && (
          <p className="mt-3 rounded-lg border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-3 py-2 text-[13px] text-[#fcd34d]">
            <b>{unpriced} plan{unpriced === 1 ? " has" : "s have"} no amount set.</b> They are listed but counted as R0, so the total below is
            understated until you enter the real figures. Nothing here is guessed.
          </p>
        )}

        <div className="mt-4 space-y-1.5">
          {alloc.subscriptions.map((s) => {
            const isEditing = editing[s.id] !== undefined;
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{s.name}
                    <span className="tabular ml-2 text-[11px] text-ink-faint">{s.jobs.toLocaleString()} jobs this window</span>
                  </div>
                  {s.note && <div className="text-[11px] text-ink-faint">{s.note}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isEditing ? (
                    <>
                      <span className="text-sm text-ink-dim">$</span>
                      <input autoFocus value={editing[s.id]} onChange={(e) => setEditing((m) => ({ ...m, [s.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && save(s, Number(editing[s.id]))} inputMode="decimal"
                        className="w-24 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent" />
                      <button onClick={() => save(s, Number(editing[s.id]))} disabled={saving === s.id}
                        className="rounded-md bg-accent px-2.5 py-1 text-xs font-bold text-black disabled:opacity-50">{saving === s.id ? "…" : "Save"}</button>
                      <button onClick={() => setEditing((m) => { const c = { ...m }; delete c[s.id]; return c; })}
                        className="text-xs text-ink-faint hover:text-ink">Cancel</button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <div className="tabular text-sm font-bold text-ink">{s.monthly_usd > 0 ? rand(s.cents) : <span className="text-ink-faint">not set</span>}</div>
                        <div className="tabular text-[11px] text-ink-faint">${s.monthly_usd.toLocaleString()}/mo</div>
                      </div>
                      {isSuperAdmin && (
                        <>
                          <button onClick={() => setEditing((m) => ({ ...m, [s.id]: String(s.monthly_usd) }))}
                            className="rounded px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink">Edit</button>
                          <button onClick={() => remove(s)} aria-label={`Remove ${s.name}`}
                            className="rounded px-1.5 py-1 text-xs text-ink-faint hover:bg-alert/15 hover:text-alert">✕</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* PAID FOR, UNUSED. Deliberately not smeared across the desks to make the totals tidy: a plan nobody
            touched in this window is a finding worth acting on, not a rounding error to hide. */}
        {alloc.idle.length > 0 && (
          <p className="mt-3 text-[12px] text-ink-faint">
            <b className="text-ink-dim">Not used in this window:</b>{" "}
            {alloc.idle.map((i) => `${i.name} (${rand(i.cents)})`).join(" · ")}. Paid for, but no jobs ran on it, so it is not charged to any desk.
          </p>
        )}
      </div>
    </section>
  );
}
