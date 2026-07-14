import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// GAS STUDIO - the template creative factory (see docs: STUDIO_BUILD_INSTRUCTION).
//
// PHASE 0 (this file): the door exists and the route is claimed, nothing is built behind it yet.
// This page is deliberately an honest shell - it states what is coming and what is not live, rather
// than showing a dashboard that implies working machinery. Phase 1 replaces it with the real thing.
//
// NOTE ON THIS ROUTE: /studio previously served the influencer cast list. That page now lives at
// /influencers ("Influencers on GAS"). Anything still pointing here lands on the factory instead.
export const dynamic = "force-dynamic";

const PHASES: { n: string; title: string; detail: string }[] = [
  { n: "1", title: "Statics", detail: "Brand kit, template intake from your reference designs, the locked Playwright renderer, batch wizard, review grid, Drive delivery + approval email." },
  { n: "2", title: "Motion", detail: "Shotstack MP4 templates - animated versions of the locked statics, plus on-demand GIFs." },
  { n: "3", title: "Engines", detail: "Copy generation, War Room brief extraction, and the image engine with diversity controls + Soul ID cast." },
  { n: "4", title: "Funnel + SMS", detail: "Webflow funnel publish on approval, branded short links, and the SMS engine with GSM-7 budgeting." },
];

export default function GasStudioPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link href="/home" className="text-xs font-semibold text-ink-dim transition hover:text-ink">← Studio on GAS</Link>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-3xl">🏭</span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">GAS Studio</h1>
            <p className="text-sm text-ink-dim">The template creative factory</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[#f59e0b]/35 bg-[#f59e0b]/[0.06] px-4 py-3">
          <p className="text-sm font-bold text-[#fbbf24]">Not built yet</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">
            The door is open but the factory is empty. Nothing behind this page runs, spends money or
            renders anything. Influencers on GAS is untouched and works exactly as before.
          </p>
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-ink-dim">
          One campaign order will render every static, motion cut, funnel and SMS a client needs - off
          designs locked as code, so the layout can never drift between campaigns. The team supplies the
          offer, the copy and the images. The system produces, and a human approves before anything ships.
        </p>

        <h2 className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-ink-faint">What&apos;s coming, in order</h2>
        <ol className="mt-3 space-y-2">
          {PHASES.map((p) => (
            <li key={p.n} className="flex gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3">
              <span className="tabular mt-0.5 h-6 w-6 shrink-0 rounded-full border border-line text-center text-xs font-bold leading-6 text-ink-faint">{p.n}</span>
              <div>
                <p className="text-sm font-bold text-ink">{p.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{p.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
