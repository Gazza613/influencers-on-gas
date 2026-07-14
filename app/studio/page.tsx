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
          <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
            <defs>
              <linearGradient id="hdr-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60A5FA" /><stop offset="0.5" stopColor="#818CF8" /><stop offset="1" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <rect x="4" y="10" width="16" height="22" rx="3" stroke="url(#hdr-g)" strokeWidth="2.6" />
            <rect x="24" y="6" width="20" height="20" rx="3" stroke="url(#hdr-g)" strokeWidth="2.6" />
            <rect x="16" y="30" width="28" height="13" rx="3" stroke="url(#hdr-g)" strokeWidth="2.6" />
          </svg>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">GAS Studio</h1>
            <p className="text-sm text-ink-dim">The template creative factory</p>
          </div>
        </div>

        <Link
          href="/studio/intake"
          className="group mt-6 block rounded-xl border border-[#60a5fa]/40 bg-gradient-to-br from-[#60a5fa]/[0.12] to-[#22d3ee]/[0.05] px-5 py-4 transition hover:border-[#60a5fa]/75"
        >
          <p className="text-[15px] font-bold text-ink">Template intake →</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">
            Start here. Upload the reference set your team designed by hand, plus the licensed fonts and
            approved logos. Every template is recreated from your reference and locked against it.
          </p>
        </Link>

        <Link
          href="/studio/campaign"
          className="group mt-4 block rounded-xl border border-[#818cf8]/40 bg-gradient-to-br from-[#818cf8]/[0.12] to-[#f472b6]/[0.05] px-5 py-4 transition hover:border-[#818cf8]/75"
        >
          <p className="text-[15px] font-bold text-ink">Funnel campaign →</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">
            Describe the campaign in a sentence. The Producer designs the whole funnel - 1 masthead,
            1 section 1, 3 sliders, the page copy and the SMS - and shows you the plan before anything
            is generated.
          </p>
        </Link>

        <p className="mt-6 text-[15px] leading-relaxed text-ink-dim">
          One campaign order renders every static, motion cut, funnel and SMS a client needs - off designs
          locked as code, so the layout can never drift between campaigns. You supply the brief. The system
          designs the creatives, writes the copy and generates the imagery, and a human approves before
          anything ships.
        </p>

        <h2 className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-ink-faint">What&apos;s coming, in order</h2>
        <ol className="mt-3 space-y-2">
          {PHASES.map((p) => (
            <li key={p.n} className="flex gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3">
              <span className="tabular mt-0.5 h-6 w-6 shrink-0 rounded-full border border-line text-center text-xs font-bold leading-6 text-ink-faint">{p.n}</span>
              <div>
                <p className="text-[15px] font-bold text-ink">{p.title}</p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-ink-dim">{p.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
