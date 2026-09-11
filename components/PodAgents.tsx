"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { POD_AGENTS } from "@/lib/pod-agents";

// THE FLEX BADGE + ROSTER POPUP (Gary: "click on the flex of 12 Agents ... their roles and descriptions could pop
// up as a further flex like an information click next to it"). The badge sits ON TOP of the card's stretched link
// (z-20, same trick as the showcase eye) so the click opens the roster instead of navigating into the pod.

export default function PodAgents({ pod, accent }: { pod: string; accent: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);   // portal target only exists in the browser
  useEffect(() => { setMounted(true); }, []);
  const data = POD_AGENTS[pod];
  const count = data?.agents.length ?? 0;

  // Close on Escape, and lock body scroll while the roster is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!data || count === 0) return null;

  // Group the roster so the popup reads as an org chart, not a flat list.
  const groups: { name: string; items: typeof data.agents }[] = [];
  for (const a of data.agents) {
    let g = groups.find((x) => x.name === a.group);
    if (!g) { g = { name: a.group, items: [] }; groups.push(g); }
    g.items.push(a);
  }

  return (
    <>
      {/* THE FLEX PILL (Gary): tinted fill + near-white copy for legibility + a slight accent glow that lifts on
          hover. currentColor is the pod's accent, so the fill, border, dot and glow all sing in the pod's own hue,
          while the label sits in near-white so it reads cleanly. Same footprint as before. */}
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        aria-label={`See the ${count} expert agents in ${data.label}`}
        className={`relative z-20 inline-flex w-fit items-center gap-2 rounded-full border border-current/40 bg-current/10 px-3 py-1 text-[13px] shadow-[0_0_16px_-6px_currentColor] transition hover:-translate-y-px hover:border-current/70 hover:bg-current/[0.18] hover:shadow-[0_0_22px_-4px_currentColor] ${accent}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor] animate-pulse" />
        <span className="tabular font-extrabold">{count}</span>
        <span className="font-medium tracking-[0.02em] text-ink/90">expert agents live here</span>
        {/* An information glyph so it reads as "click to learn more", not just a label. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 opacity-80" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && mounted && createPortal(
        <div role="dialog" aria-modal="true" aria-label={`${data.label}: the agents at work`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl">
            {/* Header stays pinned so the close ✕ is always reachable, even scrolling the Brain's 12 agents. */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface-1 p-6">
              <div>
                <div className={`text-[13px] font-bold uppercase tracking-[0.16em] ${accent}`}>Inside {data.label}</div>
                <h3 className="mt-1 text-[22px] font-extrabold tracking-tight text-ink">{count} expert agents at work</h3>
                <p className="mt-1 text-[14px] text-ink-dim">Every one is a real, working part of this pod. This is the AI swarm of agents working behind the scenes.</p>
              </div>
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
                aria-label="Close" className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[14px] font-bold text-ink-dim hover:bg-surface-2">✕</button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              {groups.map((g) => (
                <div key={g.name}>
                  <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-faint">{g.name}</div>
                  <ul className="mt-2 space-y-2">
                    {g.items.map((a) => (
                      <li key={a.name} className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full bg-current ${accent}`} />
                        <span>
                          <span className="block text-[15px] font-bold text-ink">{a.name}</span>
                          <span className="block text-[14px] leading-relaxed text-ink-dim">{a.role}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
