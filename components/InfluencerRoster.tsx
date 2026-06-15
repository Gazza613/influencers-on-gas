"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Influencer } from "@/lib/influencers";
import { buildProgress, ringColour } from "@/lib/build-progress";
import ConsentGate from "@/components/ConsentGate";

type Mode = "synthetic" | "twin";

function Ring({ pct, size = 34 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line, #ffffff14)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColour(pct)} strokeWidth="3"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  );
}

export default function InfluencerRoster({ influencers }: { influencers: Influencer[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [list] = useState(influencers);
  const [modal, setModal] = useState<Mode | null>(null);
  const [consentFor, setConsentFor] = useState<{ name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [twinName, setTwinName] = useState("");

  async function createSynthetic() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const r = await fetch("/api/influencers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), mode: "synthetic", persona: {} }),
    });
    setBusy(false);
    if (r.ok) { const { id } = await r.json(); setModal(null); setName(""); router.push(`/setup/influencers/${id}`); router.refresh(); }
  }

  async function createTwin(consentId: string) {
    setBusy(true);
    const r = await fetch("/api/influencers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: twinName.trim(), mode: "twin", consentId }),
    });
    setBusy(false); setConsentFor(null); setModal(null); setTwinName("");
    if (r.ok) { const { id } = await r.json(); router.push(`/setup/influencers/${id}`); router.refresh(); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Influencers</span>
        <button onClick={() => setModal("synthetic")} className="rounded-md bg-accent px-2 py-1 text-xs font-bold text-white">+ New</button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {list.length === 0 && <p className="px-1 py-4 text-xs text-ink-faint">No influencers yet. Hit + New to build one.</p>}
        {list.map((inf) => {
          const { pct } = buildProgress(inf);
          const active = pathname === `/setup/influencers/${inf.id}`;
          const face = (inf.persona as { hero_url?: string })?.hero_url || (inf.look_refs as { url: string; hero?: boolean }[])?.find?.((r) => r.hero)?.url;
          return (
            <Link key={inf.id} href={`/setup/influencers/${inf.id}`}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 transition ${active ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
              <div className="relative">
                <Ring pct={pct} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {face ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={face} alt={inf.name} className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-ink-faint">{pct}%</span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{inf.name}</div>
                <div className="tabular text-[10px] uppercase tracking-wide text-ink-faint">{inf.mode === "twin" ? "digital twin" : "synthetic"}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <button onClick={() => setModal("twin")} className="mt-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink">
        + Build Me (digital twin)
      </button>

      {modal === "synthetic" && (
        <Modal title="New influencer" onClose={() => setModal(null)}>
          <p className="text-xs text-ink-dim">Give it a name. The Character Bible, casting and the rest happen on the next screen.</p>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createSynthetic()}
            placeholder="e.g. Ava" className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent" />
          <Actions onCancel={() => setModal(null)} onConfirm={createSynthetic} label={busy ? "Creating…" : "Create"} disabled={!name.trim() || busy} />
        </Modal>
      )}
      {modal === "twin" && !consentFor && (
        <Modal title="Build Me: digital twin" onClose={() => setModal(null)}>
          <p className="text-xs text-ink-dim">Your own likeness, from photos and voice. We capture consent before any upload (POPIA / GDPR).</p>
          <input autoFocus value={twinName} onChange={(e) => setTwinName(e.target.value)} placeholder="e.g. Gary"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent" />
          <Actions onCancel={() => setModal(null)} onConfirm={() => setConsentFor({ name: twinName })} label="Continue to consent →" disabled={!twinName.trim()} />
        </Modal>
      )}
      {modal === "twin" && consentFor && <ConsentGate dataType="image" onCancel={() => setConsentFor(null)} onConfirm={createTwin} />}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Actions({ onCancel, onConfirm, label, disabled }: { onCancel: () => void; onConfirm: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">Cancel</button>
      <button onClick={onConfirm} disabled={disabled} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{label}</button>
    </div>
  );
}
