import Link from "next/link";

// THE STEPPED INTELLIGENCE FLOW, shown on every step's own screen (Gary: "each section must step to the next
// system... should feel world class... all four steps equally world-class"). The dashboard already numbers the
// tiles 1-2-3-4; this repeats that spine INSIDE each step so you always know where you are and what is next,
// and can jump between them. Researcher (1) -> Brain (2) -> Strategist (3) -> Proposal (4).
//
// The active step is lit in the accent; done/other steps are quiet links. Kept deliberately compact so it reads
// as a breadcrumb-with-progress, not a second navigation bar.
const STEPS: { n: number; label: string; href: string }[] = [
  { n: 1, label: "Researcher", href: "/researcher" },
  { n: 2, label: "Brain", href: "/setup/brains" },
  { n: 3, label: "Strategist", href: "/strategist/plan" },
  { n: 4, label: "Proposal", href: "/strategist/plan" },
];

export default function FlowSteps({ active }: { active: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Intelligence flow" className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[15px]">
      <span className="tabular mr-1 text-[13px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Intelligence</span>
      {STEPS.map((s, i) => {
        const isActive = s.n === active;
        const isDone = s.n < active;
        return (
          <span key={s.n} className="flex items-center gap-1.5">
            <Link
              href={s.href}
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition ${
                isActive
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : isDone
                    ? "border-[#4ade80]/30 bg-[#4ade80]/[0.08] text-[#86efac] hover:border-[#4ade80]/50"
                    : "border-line text-ink-faint hover:text-ink-dim"
              }`}>
              <span className={`tabular text-[12px] font-bold ${isActive ? "text-accent" : isDone ? "text-[#86efac]" : "text-ink-faint"}`}>
                {isDone ? "✓" : s.n}
              </span>
              {s.label}
            </Link>
            {i < STEPS.length - 1 && <span aria-hidden className="text-ink-faint">→</span>}
          </span>
        );
      })}
    </nav>
  );
}
