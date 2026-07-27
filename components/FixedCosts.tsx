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
    <section className="mt-8">
      <h2 className="text-xl font-bold">Monthly subscriptions</h2>
      <p className="mt-0.5 text-lg text-ink-dim">What the stack costs every month before a single job runs.</p>
      <div className="mt-3 rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="tabular text-4xl font-extrabold text-ink">{rand(alloc.totalCents)}<span className="ml-2 text-lg font-normal text-ink-dim">/ month</span></div>
            <div className="tabular mt-1 text-base text-ink-faint">${alloc.totalUsd.toLocaleString()} at R{alloc.zarPerUsd.toFixed(2)}/$ · always one month of plans (the date filter only changes how it splits by section).</div>
          </div>
          {isSuperAdmin && (
            <button onClick={() => setAdding((a) => !a)} className="rounded-lg border border-line px-4 py-2 text-lg font-semibold text-ink-dim hover:text-ink">
              {adding ? "Cancel" : "+ Add a subscription"}
            </button>
          )}
        </div>

        {adding && isSuperAdmin && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-lg border border-line bg-surface-2 p-3">
            <input value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} placeholder="provider (e.g. freepik)"
              className="w-44 rounded-md border border-line bg-surface-1 px-3 py-2 text-lg outline-none focus:border-accent" />
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Plan name"
              className="w-52 rounded-md border border-line bg-surface-1 px-3 py-2 text-lg outline-none focus:border-accent" />
            <input value={draft.monthly_usd} onChange={(e) => setDraft({ ...draft, monthly_usd: e.target.value })} placeholder="USD / month" inputMode="decimal"
              className="w-36 rounded-md border border-line bg-surface-1 px-3 py-2 text-lg outline-none focus:border-accent" />
            <button onClick={add} className="rounded-md bg-accent px-4 py-2 text-lg font-bold text-black">Add</button>
          </div>
        )}

        {unpriced > 0 && (
          <p className="mt-4 rounded-lg border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-3 py-2.5 text-base text-[#fcd34d]">
            <b>{unpriced} plan{unpriced === 1 ? " has" : "s have"} no amount set.</b> They are listed but counted as R0, so the total is understated until you enter the real figures. Nothing here is guessed.
          </p>
        )}

        <div className="mt-4 divide-y divide-line/60">
          {alloc.subscriptions.map((s) => {
            const isEditing = editing[s.id] !== undefined;
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold text-ink">{s.name}</div>
                  {s.note && <div className="mt-0.5 text-base text-ink-faint">{s.note}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isEditing ? (
                    <>
                      <span className="text-lg text-ink-dim">$</span>
                      <input autoFocus value={editing[s.id]} onChange={(e) => setEditing((m) => ({ ...m, [s.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && save(s, Number(editing[s.id]))} inputMode="decimal"
                        className="w-28 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-lg outline-none focus:border-accent" />
                      <button onClick={() => save(s, Number(editing[s.id]))} disabled={saving === s.id}
                        className="rounded-md bg-accent px-3 py-1.5 text-base font-bold text-black disabled:opacity-50">{saving === s.id ? "…" : "Save"}</button>
                      <button onClick={() => setEditing((m) => { const c = { ...m }; delete c[s.id]; return c; })}
                        className="text-base text-ink-faint hover:text-ink">Cancel</button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <div className="tabular text-xl font-bold text-ink">{s.monthly_usd > 0 ? rand(s.cents) : <span className="text-ink-faint">not set</span>}</div>
                        <div className="tabular text-base text-ink-faint">${s.monthly_usd.toLocaleString()}/mo</div>
                      </div>
                      {isSuperAdmin && (
                        <>
                          <button onClick={() => setEditing((m) => ({ ...m, [s.id]: String(s.monthly_usd) }))}
                            className="rounded px-2.5 py-1.5 text-base font-semibold text-ink-faint hover:text-ink">Edit</button>
                          <button onClick={() => remove(s)} aria-label={`Remove ${s.name}`}
                            className="rounded px-2 py-1.5 text-base text-ink-faint hover:bg-alert/15 hover:text-alert">✕</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {alloc.idle.length > 0 && (
          <p className="mt-3 text-base text-ink-faint">
            <b className="text-ink-dim">Not tied to a client section:</b>{" "}
            {alloc.idle.map((i) => `${i.name} (${rand(i.cents)})`).join(" · ")}. Counted in the total, but not charged to any client desk.
          </p>
        )}
      </div>
    </section>
  );
}
