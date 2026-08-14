"use client";

// THE LIVING RESEARCHER. The signature visual of the Researcher step, the sibling of the Living Brain: a radar
// that sweeps the market and lights up SOURCE points as it verifies them, wiring each one back to the centre as
// a fact. The dots are coloured by TIER (green Tier 1, blue Tier 2, amber Tier 3) - the same grading the fact
// base uses - so the picture and the data speak the same language. Dim and slow when nothing has run; a faster
// sweep and a brighter aura while it collects; a full, wired web once a fact base is standing. Pure inline SVG +
// SMIL/CSS, theme-safe, no libraries.

// Source points around the centre, ordered by seq so they light organically (near/strong first). Tier drives the
// colour, matching the TIER map in ResearchGate.
const TIER_FILL: Record<number, string> = { 1: "#4ade80", 2: "#60a5fa", 3: "#fbbf24" };
const DOTS: { x: number; y: number; seq: number; tier: number; r?: number }[] = [
  { x: 80, y: 40, seq: 0, tier: 1, r: 4 },
  { x: 116, y: 58, seq: 1, tier: 2 },
  { x: 44, y: 60, seq: 2, tier: 1 },
  { x: 126, y: 92, seq: 3, tier: 3 },
  { x: 36, y: 96, seq: 4, tier: 2 },
  { x: 100, y: 30, seq: 5, tier: 2 },
  { x: 58, y: 34, seq: 6, tier: 3 },
  { x: 112, y: 124, seq: 7, tier: 1 },
  { x: 50, y: 126, seq: 8, tier: 3 },
  { x: 132, y: 74, seq: 9, tier: 2 },
  { x: 30, y: 78, seq: 10, tier: 1 },
  { x: 82, y: 132, seq: 11, tier: 2 },
];
const CX = 80, CY = 80;

export default function LivingResearch({ lit, active = false, className = "" }: { lit: number; active?: boolean; className?: string }) {
  const total = DOTS.length;
  const clamped = Math.min(1, Math.max(0, lit));
  const activeCount = Math.max(active ? 3 : 0, Math.round(clamped * total));
  const isOn = (seq: number) => seq < activeCount;
  // The sweep runs steadily at rest and quickens while collecting, so the team can see it working.
  const sweepDur = active ? "2.6s" : "7s";

  return (
    <svg viewBox="0 0 160 160" className={`h-full w-full ${className}`} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="lr-grad" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" /><stop offset="0.5" stopColor="#818CF8" /><stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient id="lr-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#A855F7" stopOpacity={0.14 + 0.5 * clamped} />
          <stop offset="1" stopColor="#A855F7" stopOpacity="0" />
        </radialGradient>
        {/* The sweep wedge: a soft violet fan that fades to nothing along its trailing edge. */}
        <linearGradient id="lr-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A855F7" stopOpacity="0.34" />
          <stop offset="1" stopColor="#A855F7" stopOpacity="0" />
        </linearGradient>
        <filter id="lr-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* The aura, brighter the more it has verified. */}
      <circle cx={CX} cy={CY} r="72" fill="url(#lr-glow)" />

      {/* Radar rings. */}
      {[26, 46, 66].map((r) => (
        <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1" className="text-ink-faint" />
      ))}

      {/* The rotating sweep: a wedge plus its leading edge, turning around the centre. */}
      <g>
        <path d={`M ${CX} ${CY} L ${CX + 66} ${CY} A 66 66 0 0 1 ${CX + 66 * Math.cos(-0.6)} ${CY + 66 * Math.sin(-0.6)} Z`} fill="url(#lr-sweep)">
          <animateTransform attributeName="transform" type="rotate" from={`0 ${CX} ${CY}`} to={`360 ${CX} ${CY}`} dur={sweepDur} repeatCount="indefinite" />
        </path>
        <line x1={CX} y1={CY} x2={CX + 66} y2={CY} stroke="url(#lr-grad)" strokeWidth="1.4" strokeOpacity="0.7">
          <animateTransform attributeName="transform" type="rotate" from={`0 ${CX} ${CY}`} to={`360 ${CX} ${CY}`} dur={sweepDur} repeatCount="indefinite" />
        </line>
      </g>

      {/* Links from the centre to every verified source, so lit dots read as facts wired into the base. */}
      {DOTS.map((d, i) => isOn(d.seq) && (
        <line key={`e${i}`} x1={CX} y1={CY} x2={d.x} y2={d.y} stroke="url(#lr-grad)" strokeWidth="1.2" strokeOpacity="0.5" />
      ))}

      {/* Source points: lit ones take their tier colour, glow and breathe; the rest are faint, waiting. */}
      {DOTS.map((d, i) => {
        const on = isOn(d.seq);
        const r = d.r ?? 3.2;
        const fill = TIER_FILL[d.tier] || "#818CF8";
        return (
          <g key={i}>
            {on && <circle cx={d.x} cy={d.y} r={r + 3.5} fill={fill} opacity="0.24" filter="url(#lr-soft)" />}
            <circle cx={d.x} cy={d.y} r={r} fill={on ? fill : "currentColor"}
              className={on ? "" : "text-ink-faint/40"}
              style={on ? { animation: `brainPulse 2.8s ease-in-out ${(d.seq % 6) * 0.22}s infinite` } : undefined} />
          </g>
        );
      })}

      {/* The centre: the fact base itself, always lit. */}
      <circle cx={CX} cy={CY} r="6" fill="url(#lr-grad)" />
      <circle cx={CX} cy={CY} r="10" fill="none" stroke="url(#lr-grad)" strokeWidth="1.2" strokeOpacity="0.5" />
    </svg>
  );
}
