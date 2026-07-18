"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Brain = { id: string; name: string; slug: string; chunk_count?: number; source_count?: number };

export default function BrainsManager({ initial }: { initial: Brain[] }) {
  const router = useRouter();
  const [list] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/brains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not create the brain"); setBusy(false); return; }
    router.push(`/setup/brains/${d.id}`);
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New brain name (e.g. PSI, Learnalot)"
          className="flex-1 rounded-lg border border-line bg-surface-2 px-4 py-3 text-lg text-ink outline-none focus:border-line-strong"
        />
        <button onClick={create} disabled={busy || !name.trim()} className="btn-brand rounded-lg px-5 py-3 text-lg font-bold disabled:opacity-50">
          {busy ? "Creating…" : "New brain"}
        </button>
      </div>
      {err && <p className="mt-2 text-base text-alert">{err}</p>}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.length === 0 && (
          <div className="col-span-full rounded-xl border border-line bg-surface-1 p-7 text-lg text-ink-dim">
            No brains yet. A brain is a client&apos;s private knowledge base that the co-pilot writes from.
          </div>
        )}
        {list.map((b) => (
          <Link key={b.id} href={`/setup/brains/${b.id}`} className="rounded-xl border border-line bg-surface-1 p-5 transition hover:border-line-strong">
            <div className="text-xl font-bold text-ink">{b.name}</div>
            <div className="mt-2 flex items-center gap-4 text-[15px] text-ink-faint">
              <span>{b.source_count ?? 0} sources</span>
              <span>{b.chunk_count ?? 0} chunks</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
