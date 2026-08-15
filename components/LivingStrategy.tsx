"use client";

// THE LIVING STRATEGIST. The signature visual of the Strategist step, sibling of the Living Brain and the Living
// Researcher: many verified FACTS around the field wiring inward and converging into ONE bright, single-minded
// strategy at the centre. Pulses travel down each wire toward the core, so it reads as "facts becoming a strategy".
// Dim and slow at rest; brighter and faster while it drafts and red-teams. Pure inline SVG + SMIL, theme-safe.

const NODES: { x: number; y: number }[] = [
  { x: 24, y: 40 }, { x: 18, y: 78 }, { x: 30, y: 116 }, { x: 56, y: 24 }, { x: 52, y: 132 },
  { x: 122, y: 34 }, { x: 134, y: 74 }, { x: 124, y: 116 }, { x: 94, y: 22 }, { x: 98, y: 134 },
];
const CX = 80, CY = 80;

export default function LivingStrategy({ lit, active = false, className = "" }: { lit: number; active?: boolean; className?: string }) {
  const clamped = Math.min(1, Math.max(0, lit));
  const on = Math.max(active ? 4 : 0, Math.round(clamped * NODES.length));
  const isOn = (i: number) => i < on;
  const dur = active ? "1.7s" : "3.6s";

  return (
    <svg viewBox="0 0 160 160" className={`h-full w-full ${className}`} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="ls-grad" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" /><stop offset="0.5" stopColor="#A855F7" /><stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient id="ls-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#A855F7" stopOpacity={0.16 + 0.5 * clamped} />
          <stop offset="1" stopColor="#A855F7" stopOpacity="0" />
        </radialGradient>
        <filter id="ls-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>

      {/* The aura, brighter the more the strategy is formed. */}
      <circle cx={CX} cy={CY} r="70" fill="url(#ls-glow)" />

      {/* Converging wires + a pulse travelling inward on each live one. */}
      {NODES.map((p, i) => isOn(i) && (
        <g key={`w${i}`}>
          <line x1={p.x} y1={p.y} x2={CX} y2={CY} stroke="url(#ls-grad)" strokeWidth="1.2" strokeOpacity="0.45" />
          <circle r="2.1" fill="url(#ls-grad)">
            <animateMotion dur={dur} repeatCount="indefinite" path={`M ${p.x} ${p.y} L ${CX} ${CY}`} begin={`${(i % 5) * 0.32}s`} />
          </circle>
        </g>
      ))}

      {/* Fact nodes: lit ones glow and breathe, the rest wait faint. */}
      {NODES.map((p, i) => {
        const lit1 = isOn(i);
        return (
          <g key={`n${i}`}>
            {lit1 && <circle cx={p.x} cy={p.y} r="6" fill="url(#ls-grad)" opacity="0.22" filter="url(#ls-soft)" />}
            <circle cx={p.x} cy={p.y} r={lit1 ? 3 : 2.4} fill={lit1 ? "url(#ls-grad)" : "currentColor"}
              className={lit1 ? "" : "text-ink-faint/40"}
              style={lit1 ? { animation: `brainPulse 2.8s ease-in-out ${(i % 6) * 0.2}s infinite` } : undefined} />
          </g>
        );
      })}

      {/* The centre: the single-minded strategy, always lit. */}
      <circle cx={CX} cy={CY} r="13" fill="url(#ls-glow)" opacity="0.7" />
      <circle cx={CX} cy={CY} r="7.5" fill="url(#ls-grad)" />
      <circle cx={CX} cy={CY} r="12" fill="none" stroke="url(#ls-grad)" strokeWidth="1.3" strokeOpacity="0.5" />
    </svg>
  );
}
