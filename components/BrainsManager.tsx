"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { flex } from "@/lib/flex";
import LivingBrain from "@/components/LivingBrain";

type Brain = { id: string; name: string; slug: string; chunk_count?: number; source_count?: number };

// A compact, static neural glyph for each brain card - the sibling of the Living Brain hero, sized for a chip and
// not animated (a roster can hold many, so per-node animation would be noise + cost). It simply LIGHTS when the
// brain has been fed and stays faint while it is empty, so readiness reads at a glance.
function BrainChip({ fed }: { fed: boolean }) {
  const N = [
    { x: 20, y: 20, r: 2.6 }, { x: 13, y: 13 }, { x: 27, y: 13 }, { x: 20, y: 8 },
    { x: 10, y: 25 }, { x: 30, y: 25 }, { x: 20, y: 32 },
  ];
  const E: [number, number][] = [[0, 1], [0, 2], [0, 4], [0, 5], [0, 6], [1, 3], [2, 3], [1, 4], [2, 5]];
  return (
    <div className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${fed ? "border-accent/30" : "border-line"} bg-surface-2`}>
      <div aria-hidden className={`absolute inset-0 rounded-xl bg-gradient-to-br ${fed ? "from-[#ec4899]/[0.18] to-[#60a5fa]/[0.12]" : "from-transparent to-transparent"}`} />
      <svg viewBox="0 0 40 40" className="relative h-7 w-7" aria-hidden style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="bc-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EC4899" /><stop offset="0.5" stopColor="#A855F7" /><stop offset="1" stopColor="#60A5FA" />
          </linearGradient>
        </defs>
        {E.map(([a, b], i) => (
          <line key={i} x1={N[a].x} y1={N[a].y} x2={N[b].x} y2={N[b].y}
            stroke={fed ? "url(#bc-grad)" : "currentColor"} strokeWidth={fed ? 1.3 : 1}
            className={fed ? "" : "text-ink-faint/40"} strokeOpacity={fed ? 0.7 : 0.4} />
        ))}
        {N.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={n.r ?? 2.1}
            fill={fed ? "url(#bc-grad)" : "currentColor"} className={fed ? "" : "text-ink-faint/50"} />
        ))}
      </svg>
    </div>
  );
}

export default function BrainsManager({ initial }: { initial: Brain[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // DELETE with an UNDO WINDOW (Gary): no modal, the Gmail pattern. Clicking delete dims the card and starts a
  // 6-second countdown; the server delete only fires when the window closes, so "Undo" truly reverses it (nothing
  // is deleted yet). Deleting a SECOND brain commits the first one that was counting down (it is not silently
  // reprieved). Leaving the page before the window closes cancels the pending delete (nothing is deleted).
  const [pendingId, setPendingId] = useState("");
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBrainRef = useRef<Brain | null>(null);
  const mountedRef = useRef(true);
  // Cancel any pending delete on unmount, and flag unmount so an in-flight commit (e.g. one triggered by deleting
  // a second brain) never fires setState after the component is gone. The server DELETE still completes.
  useEffect(() => () => { mountedRef.current = false; if (pendingRef.current) clearTimeout(pendingRef.current); }, []);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/brains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not create the brain"); setBusy(false); return; }
    router.push(`/setup/brains/${d.id}`);
  }

  function startDelete(b: Brain) {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current);
      // A different brain was still counting down: commit it now rather than silently sparing it.
      if (pendingBrainRef.current && pendingBrainRef.current.id !== b.id) commitDelete(pendingBrainRef.current);
    }
    pendingBrainRef.current = b;
    setPendingId(b.id);
    pendingRef.current = setTimeout(() => commitDelete(b), 6000);
  }
  function undoDelete() {
    if (pendingRef.current) { clearTimeout(pendingRef.current); pendingRef.current = null; }
    pendingBrainRef.current = null;
    setPendingId("");
  }
  async function commitDelete(b: Brain) {
    pendingRef.current = null;
    if (pendingBrainRef.current?.id === b.id) pendingBrainRef.current = null;
    const r = await fetch(`/api/brains/${b.id}`, { method: "DELETE" }).catch(() => null);
    if (!mountedRef.current) return;   // component gone; the DELETE already fired, just skip the UI updates
    setPendingId((cur) => (cur === b.id ? "" : cur));   // don't clear a newer pending brain's countdown
    if (r?.ok) { setList((l) => l.filter((x) => x.id !== b.id)); flex(`${b.name} deleted.`); }
    else { const d = await r?.json().catch(() => ({})); flex(d?.error || "Could not delete that brain."); }
  }

  // Live corpus stats, recomputed on every create/delete so the hero always matches the roster below.
  const totalSources = list.reduce((s, b) => s + (b.source_count ?? 0), 0);
  const totalPassages = list.reduce((s, b) => s + (b.chunk_count ?? 0), 0);
  const fedCount = list.filter((b) => (b.source_count ?? 0) > 0).length;
  // The hero brain glows with how much of the roster is actually fed - never fully dark, so it always feels alive.
  const heroLit = list.length ? Math.max(0.18, fedCount / list.length) : 0.18;

  return (
    <div>
      {/* THE LIVING HERO - the roster's signature, sibling of the pod heroes: a Living Brain that glows with how
          much of the estate is fed, a gradient title, and the live corpus tally. */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface-1">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#ec4899]/[0.08] via-transparent to-[#60a5fa]/[0.07]" />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-8">
          <div className="h-28 w-28 shrink-0 self-center text-accent sm:h-32 sm:w-32">
            <LivingBrain lit={heroLit} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl"><span className="brand-grad">Brains</span></h1>
            <p className="mt-2.5 max-w-2xl text-[17px] leading-relaxed text-ink-dim">
              A brain is a client&apos;s private knowledge base. Feed it their website and notes, and every pod
              works on-brand from it. Each brain is fully isolated: one client&apos;s brain can never read another&apos;s.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-2">
              {[
                { n: list.length, label: list.length === 1 ? "brain" : "brains" },
                { n: totalSources, label: totalSources === 1 ? "source" : "sources" },
                { n: totalPassages, label: totalPassages === 1 ? "passage" : "passages" },
              ].map((s) => (
                <span key={s.label} className="flex items-baseline gap-1.5">
                  <span className="tabular text-2xl font-black text-ink">{s.n.toLocaleString()}</span>
                  <span className="text-[15px] text-ink-faint">{s.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Start a new brain. */}
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
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.length === 0 && (
          <div className="col-span-full rounded-xl border border-line bg-surface-1 p-7 text-lg text-ink-dim">
            No brains yet. A brain is a client&apos;s private knowledge base that every pod writes from.
          </div>
        )}
        {list.map((b) => {
          const sources = b.source_count ?? 0;
          const passages = b.chunk_count ?? 0;
          const fed = sources > 0;
          return (
            <div key={b.id} className="group relative overflow-hidden rounded-xl border border-line bg-surface-1 transition hover:border-line-strong hover:bg-surface-2">
              {pendingId === b.id ? (
                // UNDO WINDOW: the brain is not deleted yet - a countdown bar runs, and Undo cancels it entirely.
                <div className="flex items-center justify-between gap-3 p-5">
                  <span className="min-w-0 text-base text-ink-dim">Deleting <b className="text-ink">{b.name}</b>…</span>
                  <button onClick={undoDelete} className="shrink-0 rounded-lg border border-accent/50 px-4 py-2 text-base font-bold text-accent hover:bg-accent/10">Undo</button>
                  <span aria-hidden className="absolute bottom-0 left-0 h-1 w-full origin-left bg-alert" style={{ animation: "shrinkBar 6s linear forwards" }} />
                </div>
              ) : (
                <>
                  <Link href={`/setup/brains/${b.id}`} className="flex items-center gap-4 p-5 pr-12">
                    <BrainChip fed={fed} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xl font-bold text-ink">{b.name}</div>
                      <div className="mt-1.5 flex items-center gap-2.5 text-[14px] text-ink-faint">
                        <span className={`inline-flex items-center gap-1.5 ${fed ? "text-accent" : "text-ink-faint"}`}>
                          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${fed ? "bg-accent" : "bg-ink-faint/60"}`} />
                          {fed ? "Fed" : "Awaiting content"}
                        </span>
                        {fed && (
                          <>
                            <span aria-hidden className="text-ink-faint/40">·</span>
                            <span className="tabular">{sources.toLocaleString()} source{sources === 1 ? "" : "s"}</span>
                            <span aria-hidden className="text-ink-faint/40">·</span>
                            <span className="tabular">{passages.toLocaleString()} passage{passages === 1 ? "" : "s"}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span aria-hidden className="shrink-0 text-ink-faint/50 transition group-hover:translate-x-0.5 group-hover:text-accent">→</span>
                  </Link>
                  <button onClick={() => startDelete(b)}
                    title={`Delete the ${b.name} brain`} aria-label={`Delete the ${b.name} brain`}
                    className="absolute right-2.5 top-2.5 rounded-lg border border-line px-2 py-1 text-[13px] font-semibold text-ink-faint opacity-100 transition hover:border-alert/50 hover:bg-alert/10 hover:text-alert focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    🗑 Delete
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
