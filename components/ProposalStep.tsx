"use client";
import { useState } from "react";
import ProposalBuilder from "@/components/ProposalBuilder";

// The Proposal STEP shell: a client picker over the clients that have an approved strategy, mounting the
// ProposalBuilder for the selected client's latest approved strategy. Keyed on strategyId so switching client
// remounts the builder (and reloads that client's proposal). Empty state points back to the Strategist gate.
type C = { id: string; name: string; strategyId: string };

export default function ProposalStep({ clients, initialClientId = "" }: { clients: C[]; initialClientId?: string }) {
  const [clientId, setClientId] = useState(() => clients.find((c) => c.id === initialClientId)?.id || clients[0]?.id || "");
  const selected = clients.find((c) => c.id === clientId) || null;

  if (!clients.length) {
    return (
      <section className="mt-6 rounded-xl border border-line bg-surface-1 p-6">
        <div className="text-lg font-bold text-ink">No approved strategy yet</div>
        <p className="mt-1 text-lg text-ink-dim">Approve a strategy at the Strategist gate (Step 3) to build its proposal here.</p>
        <a href="/strategist/plan" className="mt-3 inline-block text-lg font-semibold text-accent hover:underline">← Back to the Strategist</a>
      </section>
    );
  }
  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-base font-semibold uppercase tracking-wide text-ink-faint">Client</span>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg outline-none focus:border-accent">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {selected && <ProposalBuilder key={selected.strategyId} strategyId={selected.strategyId} />}
    </div>
  );
}
