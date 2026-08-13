"use client";

// THE LIVING BRAIN. The signature visual of the Brain section: a neural graphic that comes ALIVE as the brain is
// fed. Dim and sparse when empty, it lights up node by node and glows brighter as `lit` (0..1, the readiness
// fraction) rises, breathing gently so it always feels alive. Pure inline SVG + CSS, theme-safe, no libraries.

// Nodes laid out in a two-lobe brain silhouette, ordered by `seq` so lighting fills organically (centre + core
// first, outer flourishes last) rather than randomly.
const NODES: { x: number; y: number; seq: number; r?: number }[] = [
  { x: 80, y: 78, seq: 0, r: 4.5 }, // core
  { x: 66, y: 66, seq: 1 }, { x: 96, y: 66, seq: 2 },
  { x: 80, y: 44, seq: 3 }, { x: 56, y: 82, seq: 4 }, { x: 106, y: 82, seq: 5 },
  { x: 58, y: 54, seq: 6 }, { x: 104, y: 54, seq: 7 },
  { x: 70, y: 98, seq: 8 }, { x: 92, y: 98, seq: 9 },
  { x: 42, y: 72, seq: 10 }, { x: 120, y: 72, seq: 11 },
  { x: 80, y: 116, seq: 12 }, { x: 50, y: 100, seq: 13 }, { x: 112, y: 100, seq: 14 },
];
// Synapses, by node index.
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 4], [0, 5], [0, 8], [0, 9], [1, 3], [2, 3], [1, 6], [2, 7],
  [4, 6], [5, 7], [4, 10], [5, 11], [8, 13], [9, 14], [8, 12], [9, 12], [1, 4], [2, 5], [8, 4], [9, 5],
];

export default function LivingBrain({ lit, className = "" }: { lit: number; className?: string }) {
  const total = NODES.length;
  const activeCount = Math.max(1, Math.round(Math.min(1, Math.max(0, lit)) * total));
  const isOn = (seq: number) => seq < activeCount;
  return (
    <svg viewBox="0 0 160 160" className={`h-full w-full ${className}`} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="lb-grad" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" /><stop offset="0.5" stopColor="#818CF8" /><stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient id="lb-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#A855F7" stopOpacity={0.16 + 0.5 * Math.min(1, lit)} />
          <stop offset="1" stopColor="#A855F7" stopOpacity="0" />
        </radialGradient>
        <filter id="lb-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* The aura, brighter the more it knows. */}
      <circle cx="80" cy="80" r="70" fill="url(#lb-glow)" />

      {/* Synapses. */}
      {EDGES.map(([a, b], i) => {
        const on = isOn(NODES[a].seq) && isOn(NODES[b].seq);
        return (
          <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y}
            stroke={on ? "url(#lb-grad)" : "currentColor"} strokeWidth={on ? 1.4 : 1}
            className={on ? "text-transparent" : "text-ink-faint/30"} strokeOpacity={on ? 0.65 : 0.18} />
        );
      })}

      {/* Nodes: lit ones glow and breathe; the rest are faint. Staggered so the pulse ripples across the brain. */}
      {NODES.map((n, i) => {
        const on = isOn(n.seq);
        const r = n.r ?? 3.4;
        return (
          <g key={i}>
            {on && <circle cx={n.x} cy={n.y} r={r + 4} fill="url(#lb-grad)" opacity="0.26" filter="url(#lb-soft)" />}
            <circle cx={n.x} cy={n.y} r={r} fill={on ? "url(#lb-grad)" : "currentColor"}
              className={on ? "" : "text-ink-faint/40"}
              style={on ? { animation: `brainPulse 2.8s ease-in-out ${(n.seq % 6) * 0.22}s infinite` } : undefined} />
          </g>
        );
      })}
    </svg>
  );
}
