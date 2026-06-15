"use client";

import { useEffect, useRef, useState } from "react";

type Opt = { id: string; name: string };

function Dropdown({ label, options, value, onChange, empty }: { label: string; options: Opt[]; value: string | null; onChange: (id: string | null) => void; empty: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const selected = options.find((o) => o.id === value);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-dim hover:border-line-strong">
        <span className="text-ink-faint">{label}</span>
        <span className={selected ? "text-ink" : "text-ink-faint"}>{selected ? selected.name : empty}</span>
        <span className="text-ink-faint">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-line bg-surface-1 p-1 shadow-xl">
          <button onClick={() => { onChange(null); setOpen(false); }} className="block w-full rounded px-2.5 py-1.5 text-left text-xs text-ink-faint hover:bg-surface-2">{empty}</button>
          {options.length === 0 && <div className="px-2.5 py-2 text-[11px] text-ink-faint">None yet.</div>}
          {options.map((o) => (
            <button key={o.id} onClick={() => { onChange(o.id); setOpen(false); }}
              className={`block w-full truncate rounded px-2.5 py-1.5 text-left text-xs hover:bg-surface-2 ${o.id === value ? "text-accent" : "text-ink"}`}>
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The active brain + influencer for the produce session (persisted; later phases read these).
export default function StudioSelectors() {
  const [brains, setBrains] = useState<Opt[]>([]);
  const [influencers, setInfluencers] = useState<Opt[]>([]);
  const [brain, setBrain] = useState<string | null>(null);
  const [influencer, setInfluencer] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/brains", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { brains: [] })).then((d) => setBrains(d.brains || [])).catch(() => {});
    fetch("/api/influencers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { influencers: [] })).then((d) => setInfluencers(d.influencers || [])).catch(() => {});
    setBrain(localStorage.getItem("gas_brain_id"));
    setInfluencer(localStorage.getItem("gas_influencer_id"));
  }, []);

  const pick = (key: string, set: (v: string | null) => void) => (id: string | null) => {
    set(id);
    if (id) localStorage.setItem(key, id); else localStorage.removeItem(key);
  };

  return (
    <div className="flex items-center gap-2">
      <Dropdown label="Brain" options={brains} value={brain} onChange={pick("gas_brain_id", setBrain)} empty="none" />
      <Dropdown label="Influencer" options={influencers} value={influencer} onChange={pick("gas_influencer_id", setInfluencer)} empty="none" />
    </div>
  );
}
