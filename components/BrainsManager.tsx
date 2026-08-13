"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

type Brain = { id: string; name: string; slug: string; chunk_count?: number; source_count?: number };

export default function BrainsManager({ initial }: { initial: Brain[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState("");

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/brains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not create the brain"); setBusy(false); return; }
    router.push(`/setup/brains/${d.id}`);
  }

  // DELETE a brain from the list (Gary: a delete button on the pod section). Confirmed and destructive: the brain
  // and ALL its knowledge go. Scoped to super admins server-side.
  async function remove(b: Brain) {
    if (!(await askConfirm({ title: `Delete the ${b.name} brain?`, body: "The brain and ALL its sources, passages and brand assets are permanently removed. This cannot be undone.", tone: "danger", confirmLabel: "Delete brain" }))) return;
    setDeletingId(b.id);
    const r = await fetch(`/api/brains/${b.id}`, { method: "DELETE" }).catch(() => null);
    setDeletingId("");
    if (r?.ok) { setList((l) => l.filter((x) => x.id !== b.id)); flex(`${b.name} deleted.`); }
    else { const d = await r?.json().catch(() => ({})); flex(d?.error || "Could not delete that brain."); }
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
        <button onClick={create} disabled={busy || !name.trim()} className="btn-brand inline-flex items-center gap-2 rounded-lg px-5 py-3 text-lg font-bold disabled:opacity-50">
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
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
          <div key={b.id} className="group relative rounded-xl border border-line bg-surface-1 transition hover:border-line-strong">
            <Link href={`/setup/brains/${b.id}`} className="block p-5">
              <div className="text-xl font-bold text-ink">{b.name}</div>
              <div className="mt-2 flex items-center gap-4 text-[15px] text-ink-faint">
                <span>{b.source_count ?? 0} sources</span>
                <span>{b.chunk_count ?? 0} passages</span>
              </div>
            </Link>
            <button onClick={() => remove(b)} disabled={deletingId === b.id}
              title={`Delete the ${b.name} brain`} aria-label={`Delete the ${b.name} brain`}
              className="absolute right-2.5 top-2.5 rounded-lg border border-line px-2 py-1 text-[13px] font-semibold text-ink-faint opacity-0 transition hover:border-alert/50 hover:bg-alert/10 hover:text-alert focus:opacity-100 group-hover:opacity-100 disabled:opacity-60">
              {deletingId === b.id ? "…" : "🗑 Delete"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
