"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// THE 3D DEAL-CARD WORKSHOP (Gary). Convert the flat intake deal cards into the premium 3D extruded badges the
// reference designs use - with a HUMAN IN THE MIDDLE.
//
// Why the review step is not optional: compositing real deal cards works precisely because no AI touches the
// price. This page is the ONE place an AI does touch it, so every render is shown BEFORE/AFTER at full size and
// a person confirms each digit before it is saved. Approved cards become normal deal_card assets and appear in
// the builder's picker; from then on creatives composite fixed, verified artwork - never a fresh roll.

type Card = { id: string; name: string; url: string };
type Client = { id: string; name: string };
type Job = { status: "working" | "done" | "error"; url?: string; error?: string };

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 shrink-0 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

async function readJson(r: Response): Promise<any> {
  const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error(`Server returned ${r.status}. ${t.slice(0, 120)}`); }
}

export default function DealCards3DPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [jobs, setJobs] = useState<Record<string, Job>>({});   // card id -> render
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [yaw, setYaw] = useState(-10);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState("");

  useEffect(() => {
    fetch("/api/studio").then(readJson).then((d) => {
      const list = d.clients || [];
      setClients(list);
      if (list[0]) setClientId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/studio/deal-cards?clientId=${clientId}`).then(readJson)
      .then((d) => setCards((d.cards || []).filter((c: Card) => !/-\s*3D$/i.test(c.name))))
      .catch(() => {});
  }, [clientId]);

  // Render the 3D version. Nothing is saved until a person approves it.
  async function make(card: Card) {
    setErr(""); setJobs((j) => ({ ...j, [card.id]: { status: "working" } }));
    try {
      const d = await fetch("/api/studio/deal-cards/make-3d", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", clientId, url: card.url, yaw }),
      }).then(readJson);
      if (d.url) setJobs((j) => ({ ...j, [card.id]: { status: "done", url: d.url } }));
      else setJobs((j) => ({ ...j, [card.id]: { status: "error", error: d.error || "failed" } }));
    } catch (e) {
      setJobs((j) => ({ ...j, [card.id]: { status: "error", error: String((e as Error)?.message || e) } }));
    }
  }

  async function approve(card: Card) {
    const job = jobs[card.id];
    if (!job?.url) return;
    try {
      const d = await fetch("/api/studio/deal-cards/make-3d", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", clientId, url: job.url, name: card.name }),
      }).then(readJson);
      if (d.ok) { setSaved((s) => ({ ...s, [card.id]: true })); setJobs((j) => { const c = { ...j }; delete c[card.id]; return c; }); }
      else setErr(d.error || "could not save");
    } catch (e) { setErr(String((e as Error)?.message || e)); }
  }

  const working = Object.values(jobs).filter((j) => j.status === "working").length;
  const approved = Object.keys(saved).length;

  return (
    <div className="min-h-screen bg-surface-0">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink">3D deal cards</h1>
            <p className="mt-1 text-base text-ink-dim">
              Turn the flat intake cards into premium 3D badges. <strong className="text-ink">Check every digit before you approve</strong> - this is the one
              place an AI touches a price. Approved cards join the deal-card picker in the builder.
            </p>
          </div>
          <Link href="/studio/build" className="rounded-lg border border-line px-3 py-1.5 text-base font-bold text-ink-dim hover:text-ink">← Back to the builder</Link>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-1 p-4">
          <div>
            <label className="block text-base font-semibold uppercase tracking-wider text-ink-faint">Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="mt-1 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[15px] outline-none focus:border-accent">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-base font-semibold uppercase tracking-wider text-ink-faint">Angle (Y rotation)</label>
            <input type="number" value={yaw} onChange={(e) => setYaw(Number(e.target.value))} min={-30} max={30}
              className="mt-1 w-28 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[15px] outline-none focus:border-accent" />
          </div>
          <p className="text-base text-ink-dim">
            {cards.length} flat cards · {working} rendering · <span className="font-bold text-[#86efac]">{approved} approved</span>
          </p>
        </div>

        {err && <p className="mt-3 rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-3 py-2 text-base text-[#fca5a5]">{err}</p>}

        <div className="mt-5 space-y-4">
          {cards.map((c) => {
            const job = jobs[c.id];
            return (
              <div key={c.id} className="rounded-xl border border-line bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-bold text-ink">{c.name.replace(/\.(png|jpe?g)$/i, "")}</p>
                  <div className="flex items-center gap-2">
                    {saved[c.id] && <span className="text-base font-bold text-[#86efac]">✓ Saved as 3D</span>}
                    <button onClick={() => make(c)} disabled={job?.status === "working"}
                      className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-base font-bold text-black disabled:opacity-40">
                      {job?.status === "working" && <Spinner />}
                      {job?.status === "working" ? "Rendering…" : job?.url ? "Re-render" : "Make 3D"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[14px] font-semibold uppercase tracking-wider text-ink-faint">Flat original</p>
                    <img src={c.url} alt="" onClick={() => setZoom(c.url)} className="w-full cursor-zoom-in rounded-lg border border-line bg-white/5 object-contain p-2" />
                  </div>
                  <div>
                    <p className="mb-1 text-[14px] font-semibold uppercase tracking-wider text-ink-faint">3D version</p>
                    {job?.status === "working" && (
                      <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-line text-base text-ink-dim">
                        <Spinner className="mr-2 text-accent" /> Extruding…
                      </div>
                    )}
                    {job?.status === "error" && <p className="rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 p-2 text-base text-[#fca5a5]">{job.error}</p>}
                    {job?.url && (
                      <>
                        <img src={job.url} alt="" onClick={() => setZoom(job.url!)} className="w-full cursor-zoom-in rounded-lg border border-line bg-white/5 object-contain p-2" />
                        <div className="mt-2 flex items-center gap-2">
                          <button onClick={() => approve(c)}
                            className="rounded-lg border border-[#4ade80]/50 bg-[#4ade80]/10 px-3 py-1.5 text-base font-bold text-[#86efac]">
                            ✓ Text is correct - approve
                          </button>
                          <button onClick={() => setJobs((j) => { const x = { ...j }; delete x[c.id]; return x; })}
                            className="text-base font-semibold text-ink-dim underline hover:text-ink">Reject</button>
                        </div>
                      </>
                    )}
                    {!job && <p className="rounded-lg border border-dashed border-line p-4 text-base text-ink-dim">Not rendered yet.</p>}
                  </div>
                </div>
              </div>
            );
          })}
          {!cards.length && <p className="rounded-xl border border-dashed border-line p-6 text-center text-base text-ink-dim">No flat deal cards on file for this client.</p>}
        </div>
      </main>

      {zoom && (
        <div onClick={() => setZoom("")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" role="dialog">
          <img src={zoom} alt="" className="max-h-[92vh] max-w-[95vw] rounded-lg bg-white/5" />
          <button onClick={() => setZoom("")} className="absolute right-5 top-5 rounded-lg bg-white/10 px-3 py-1.5 text-base font-bold text-white hover:bg-white/20">Close ✕</button>
        </div>
      )}
    </div>
  );
}
