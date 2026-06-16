"use client";

import { useEffect, useState } from "react";
import type { CrewMember } from "@/lib/crew";

// Cinematic "crew at work" panel. A named specialist (the crew member) is working live:
// a pulsing orb, an elapsed clock + LIVE pill so long waits read as ACTIVE not frozen,
// rotating narration that flexes what the platform is doing, and a progress / sweep bar.
// Turns dead waits into an over-the-shoulder, premium moment. Used across every build step.
export default function WorkingPanel({
  title, lines, pct, sub, note, onAbort, crew, eta,
}: {
  title: string;
  lines: string[];
  pct?: number | null;
  sub?: string;
  note?: string;
  onAbort?: () => void;
  crew?: CrewMember;
  eta?: string; // e.g. "about 2 min"
}) {
  const [i, setI] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % lines.length), 2800);
    return () => clearInterval(t);
  }, [lines.length]);

  // Elapsed clock — the single strongest "it's alive" signal during long renders.
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-2xl border border-[#a855f7]/30 bg-surface-1 p-5" style={{ boxShadow: "0 0 38px rgba(168,85,247,0.16)" }}>
      <div className="flex items-center gap-4">
        <div className="working-orb">
          <span className="ring" /><span className="ring r2" /><span className="core" />
          {crew && <span className="orb-emoji">{crew.emoji}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">{title}</span>
            {crew && <span className="text-[11px] text-ink-dim">· {crew.name}, {crew.role}</span>}
          </div>
          <div key={i} className="narrate-line mt-1 text-sm text-ink">{lines[i]}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="live-pill tabular">● LIVE</span>
          <span className="tabular text-[11px] text-ink-faint">{clock}</span>
        </div>
      </div>

      <div className="mt-3">
        {typeof pct === "number"
          ? <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, pct)}%`, background: "linear-gradient(90deg,#ec4899,#a855f7,#60a5fa)" }} /></div>
          : <div className="bar-sweep" />}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-faint">{note}{eta ? ` Usually ${eta}.` : ""}</p>
        <div className="flex items-center gap-3">
          {sub && <span className="tabular shrink-0 text-[11px] text-ink-faint">{sub}</span>}
          {onAbort && (
            <button onClick={onAbort} className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-dim hover:border-alert/50 hover:text-alert">Abort</button>
          )}
        </div>
      </div>
    </div>
  );
}
