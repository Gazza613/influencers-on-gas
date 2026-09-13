"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { POD_AGENTS } from "@/lib/pod-agents";

// THE HERO STAT CARDS (Gary): each one is CLICKABLE and opens a popup listing what it counts - all AI agents
// (grouped by pod), all brains, or all pods. No arrows or buttons; the whole card is the control. The count-up
// on land is handled by DashboardMotion (it animates the [data-count] spans rendered here).

type Brain = { id: string; name: string };
type Pod = { name: string; group: string; accent: string };
type Which = "agents" | "brains" | "pods" | null;

const AGENT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="2.5" /><circle cx="12" cy="12" r="2" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></svg>
);
const BRAIN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18V5" /><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" /><path d="M17.6 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.6 1.5" /><path d="M18 18a4 4 0 0 0 2-7.46" /><path d="M19.97 17.48A4 4 0 1 1 12 18a4 4 0 1 1-7.97-.52" /><path d="M6 18a4 4 0 0 1-2-7.46" /></svg>
);
const GRID_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" /></svg>
);

export default function HeroStats({ agentTotal, brains, pods }: { agentTotal: number; brains: Brain[]; pods: Pod[] }) {
  const [open, setOpen] = useState<Which>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <div className="agn-stats">
        <button type="button" className="agn-stat" style={{ "--a": "#ec4899" } as React.CSSProperties} onClick={() => setOpen("agents")} aria-label="See all AI agents">
          <span className="agn-sic">{AGENT_ICON}</span>
          <span className="agn-stx"><b data-count={agentTotal}>{agentTotal}</b><span>AI agents</span></span>
        </button>
        <button type="button" className="agn-stat" style={{ "--a": "#a855f7" } as React.CSSProperties} onClick={() => setOpen("brains")} aria-label="See all brains">
          <span className="agn-sic">{BRAIN_ICON}</span>
          <span className="agn-stx"><b data-count={brains.length}>{brains.length}</b><span>Brains</span></span>
        </button>
        <button type="button" className="agn-stat agn-hide-mobile" style={{ "--a": "#22d3ee" } as React.CSSProperties} onClick={() => setOpen("pods")} aria-label="See all pods">
          <span className="agn-sic">{GRID_ICON}</span>
          <span className="agn-stx"><b data-count={pods.length}>{pods.length}</b><span>Pods</span></span>
        </button>
      </div>

      {open && mounted && createPortal(
        <div role="dialog" aria-modal="true" onClick={() => setOpen(null)}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()}
            className="flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl">

            {open === "agents" && <AgentsBody onClose={() => setOpen(null)} total={agentTotal} />}
            {open === "brains" && <SimpleBody onClose={() => setOpen(null)} accent="#c79bff" kicker="The knowledge" title={`${brains.length} Brains`} note="Every client has a private, isolated knowledge base. One brain can never read another's."
              items={brains.map((b) => ({ name: b.name }))} />}
            {open === "pods" && <PodsBody onClose={() => setOpen(null)} pods={pods} />}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Header({ accent, kicker, title, note, onClose }: { accent: string; kicker: string; title: string; note: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line p-6">
      <div>
        <div className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>{kicker}</div>
        <h3 className="mt-1 text-[24px] font-extrabold tracking-tight text-ink">{title}</h3>
        <p className="mt-1.5 max-w-[52ch] text-[14px] leading-relaxed text-ink-dim">{note}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[14px] font-bold text-ink-dim hover:bg-surface-2">✕</button>
    </div>
  );
}

function AgentsBody({ total, onClose }: { total: number; onClose: () => void }) {
  const pods = Object.values(POD_AGENTS);
  return (
    <>
      <Header accent="#f9a8d4" kicker="The AI swarm" title={`${total} AI agents at work`} note={`Every one is a real, working part of a pod - ${pods.length} pods, each a specialist team behind the scenes.`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
        {pods.map((p) => (
          <div key={p.label}>
            <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-faint">{p.label} · {p.agents.length}</div>
            <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {p.agents.map((a) => (
                <li key={a.name} className="flex gap-2.5 rounded-lg border border-line bg-surface-2 p-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c084fc]" />
                  <span>
                    <span className="block text-[14.5px] font-bold text-ink">{a.name}</span>
                    <span className="block text-[13px] leading-snug text-ink-dim">{a.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function SimpleBody({ accent, kicker, title, note, items, onClose }: { accent: string; kicker: string; title: string; note: string; items: { name: string }[]; onClose: () => void }) {
  return (
    <>
      <Header accent={accent} kicker={kicker} title={title} note={note} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[12px] font-bold" style={{ background: `${accent}22`, color: accent }}>{i + 1}</span>
              <span className="truncate text-[15px] font-semibold text-ink">{it.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function PodsBody({ pods, onClose }: { pods: Pod[]; onClose: () => void }) {
  const groups: { name: string; items: Pod[] }[] = [];
  for (const p of pods) {
    let g = groups.find((x) => x.name === p.group);
    if (!g) { g = { name: p.group, items: [] }; groups.push(g); }
    g.items.push(p);
  }
  return (
    <>
      <Header accent="#7dd3fc" kicker="The platform" title={`${pods.length} pods`} note="Every pod is a specialist surface, grouped into the four layers of the platform." onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-faint">{g.name}</div>
            <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {g.items.map((p) => (
                <li key={p.name} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.accent, boxShadow: `0 0 8px ${p.accent}` }} />
                  <span className="truncate text-[15px] font-semibold text-ink">{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
