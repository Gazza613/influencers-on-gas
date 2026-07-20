import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// THE AGENCY OF NOW - the first screen after sign-in. It does one job: get the team to the right desk.
//
// It is grouped, not gridded, and that is the point. Six tiles laid out flat say "here are six things". Six
// tiles in three named pairs say what this agency actually IS: we MAKE the work, we KNOW the market, and we RUN
// it live. The team reads the shape of the business before they read a single tile.
//
// Palette: everything stays in the pink/purple/blue accent family, separated by hue within it rather than by
// introducing new colours. Orange is the GAS mark alone and never a background wash.
//
// A server component on purpose: no client JS for a page whose job is to be instant. The life on it (the drifting
// glows, the hover lifts) is CSS.
export const dynamic = "force-dynamic";

// Custom marks, not emoji. Each says what its desk does in one glance.
function InfluencerMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="inf-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      <path d="M4 15V8a4 4 0 0 1 4-4h7M44 15V8a4 4 0 0 0-4-4h-7M4 33v7a4 4 0 0 0 4 4h7M44 33v7a4 4 0 0 1-4 4h-7"
        stroke="url(#inf-g)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="20.5" r="6.2" stroke="url(#inf-g)" strokeWidth="2.6" />
      <path d="M13.5 38c1.6-5.7 5.6-8.6 10.5-8.6S32.9 32.3 34.5 38" stroke="url(#inf-g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function StudioMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="std-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" /><stop offset="0.55" stopColor="#22D3EE" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <rect x="4" y="10" width="22" height="28" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
      <rect x="30" y="10" width="14" height="14" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
      <rect x="30" y="28" width="14" height="10" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
    </svg>
  );
}

function JournalistMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="jr-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" /><stop offset="0.55" stopColor="#60A5FA" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <path d="M8 40l4.5-12.5L32 8a4.2 4.2 0 0 1 6 6L18.5 33.5 8 40Z" stroke="url(#jr-g)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M28 12l8 8M12.5 27.5l8 8" stroke="url(#jr-g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function StrategistMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="st-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path d="M6 42V6M6 42h36" stroke="url(#st-g)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M13 32l8-9 7 5 12-15" stroke="url(#st-g)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="23" r="2.8" stroke="url(#st-g)" strokeWidth="2.4" />
      <circle cx="40" cy="13" r="2.8" stroke="url(#st-g)" strokeWidth="2.4" />
    </svg>
  );
}

function MediaMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="md-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" /><stop offset="0.55" stopColor="#22D3EE" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <rect x="5" y="9" width="38" height="27" rx="3.5" stroke="url(#md-g)" strokeWidth="2.6" />
      <path d="M11 26l6-7 5 6 4-9 5 10h6" stroke="url(#md-g)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 42h12M24 36v6" stroke="url(#md-g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function PsiMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="psi-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <path d="M6 8h36L28 25v13l-8 5V25L6 8Z" stroke="url(#psi-g)" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="38" cy="34" r="6.5" stroke="url(#psi-g)" strokeWidth="2.4" />
      <path d="M35.4 34l1.9 1.9 3.4-3.6" stroke="url(#psi-g)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AskMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="ask-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F472B6" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      <path d="M8 6h32a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H22l-10 8v-8H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4Z" stroke="url(#ask-g)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M19.5 16.5a4.5 4.5 0 1 1 5.6 4.36c-.9.24-1.6 1-1.6 2.14" stroke="url(#ask-g)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="23.5" cy="27.5" r="1.6" fill="url(#ask-g)" />
    </svg>
  );
}

function AudienceMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <circle cx="18" cy="17" r="6" stroke="currentColor" strokeWidth="2.6" />
      <path d="M6 40c1.8-6.6 6.3-10 12-10s10.2 3.4 12 10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="34" cy="14" r="4.6" stroke="currentColor" strokeWidth="2.2" opacity="0.75" />
      <path d="M30 32c1.2-4.4 4.2-6.7 8-6.7 1.9 0 3.6.6 5 1.7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

type Door = {
  name: React.ReactNode;
  href: string;
  external?: boolean;
  mark: React.ReactNode;
  blurb: string;
  action: string;
  ring: string;      // border + hover glow
  wash: string;      // the faint gradient inside the card
  accent: string;    // the action text
  // An optional SECOND destination in the corner (the showcase eye). A card can have two jobs: go to work, or
  // go and look at the work.
  peek?: { href: string; label: string };
  // Full width within its group. Used for the tool that serves every desk rather than being one of them.
  wide?: boolean;
  // A desk that does not exist yet. Rendered as a real tile so the shape of the platform is visible, but it
  // does not pretend to be clickable - a placeholder that looks live is just a dead end with better manners.
  soon?: boolean;
};

// The showcase eye. An eye, not a link icon, because the job is "go and SEE the work".
function EyeMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M1.8 12S5.4 5.4 12 5.4 22.2 12 22.2 12 18.6 18.6 12 18.6 1.8 12 1.8 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

// GARY'S ORDER: Influencers, Studio, Media, PSI, Strategist, Journalist. It maps cleanly onto the three pairs,
// so the grouping survives - Run simply moves ahead of Know, and the Strategist leads its pair (it is the daily
// working tool; the Journalist is picked up when someone sits down to write).
const GROUPS: { label: string; note: string; doors: Door[] }[] = [
  {
    label: "Make",
    note: "The work itself",
    doors: [
      {
        name: <>Influencers <span className="brand-grad">on</span> GAS</>,
        href: "/influencers",
        mark: <InfluencerMark />,
        blurb: "Cast a face, give it a voice, then shoot and cut the film. A complete AI-influencer studio, brief to broadcast-ready.",
        action: "Open the studio",
        peek: { href: "/s/showcase", label: "See the showcase" },
        ring: "border-[#a855f7]/30 hover:border-[#a855f7]/70 hover:shadow-[0_0_50px_-12px_rgba(168,85,247,0.45)]",
        wash: "from-[#a855f7]/[0.10] to-[#ec4899]/[0.04]",
        accent: "text-[#d8b4fe]",
      },
      {
        // "Creatives on GAS", not "Studio on GAS" (Gary). STUDIO ON GAS is now the PLATFORM - the whole thing,
        // all six desks. This tile is one desk inside it: the creative factory. Sharing the name made the part
        // look like the whole, so the desk is named for what it actually produces.
        name: <>Creatives <span className="brand-grad">on</span> GAS</>,
        href: "/studio",
        mark: <StudioMark />,
        blurb: "A brief in, a publish-ready funnel out. Every creative built on the client's own proven designs, never invented from scratch.",
        action: "Open the factory",
        ring: "border-[#60a5fa]/30 hover:border-[#60a5fa]/70 hover:shadow-[0_0_50px_-12px_rgba(96,165,250,0.45)]",
        wash: "from-[#60a5fa]/[0.10] to-[#22d3ee]/[0.04]",
        accent: "text-[#93c5fd]",
      },
      {
        name: <>Audience <span className="brand-grad">on</span> GAS</>,
        href: "#",
        mark: <AudienceMark />,
        blurb: "Building next.",
        action: "Coming soon",
        soon: true,
        ring: "border-line",
        wash: "from-white/[0.03] to-transparent",
        accent: "text-ink-faint",
      },
    ],
  },
  {
    label: "Run",
    note: "Live, in market, right now",
    doors: [
      {
        name: <>Media <span className="brand-grad">on</span> GAS</>,
        href: "https://media.gasmarketing.co.za/",
        external: true,
        mark: <MediaMark />,
        blurb: "Live campaign insight, as it happens. What the media is doing right now, every channel on a single dashboard.",
        action: "Open Media",
        ring: "border-[#38bdf8]/30 hover:border-[#38bdf8]/70 hover:shadow-[0_0_50px_-12px_rgba(56,189,248,0.45)]",
        wash: "from-[#38bdf8]/[0.10] to-[#60a5fa]/[0.04]",
        accent: "text-[#7dd3fc]",
      },
      {
        name: <>PSI <span className="brand-grad">on</span> GAS</>,
        href: "https://psi.gasmarketing.co.za/",
        external: true,
        mark: <PsiMark />,
        blurb: "Pre-Sales Intelligence. Qualifies and nurtures every prospect until they are a high-intent lead worth handing over.",
        action: "Open PSI",
        ring: "border-[#ec4899]/30 hover:border-[#ec4899]/70 hover:shadow-[0_0_50px_-12px_rgba(236,72,153,0.45)]",
        wash: "from-[#ec4899]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#f9a8d4]",
      },
    ],
  },
  {
    label: "Know",
    note: "Researched daily, sourced, never assumed",
    doors: [
      {
        name: <>Ask the <span className="brand-grad">Brain</span></>,
        href: "/ask",
        mark: <AskMark />,
        blurb: "Ask any client's knowledge base a question and get an answer built only from their own material, with the passages it used shown beside it.",
        action: "Ask a question",
        wide: true,
        ring: "border-[#f472b6]/30 hover:border-[#f472b6]/70 hover:shadow-[0_0_50px_-12px_rgba(244,114,182,0.45)]",
        wash: "from-[#f472b6]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#f9a8d4]",
      },
      {
        name: <>The Strategist</>,
        href: "/strategist",
        mark: <StrategistMark />,
        blurb: "Daily market and competitor intelligence. It hunts for what makes a current assumption wrong, then says what to do about it.",
        action: "Open the desk",
        ring: "border-[#818cf8]/30 hover:border-[#818cf8]/70 hover:shadow-[0_0_50px_-12px_rgba(129,140,248,0.45)]",
        wash: "from-[#818cf8]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#a5b4fc]",
      },
      {
        name: <>The Journalist</>,
        href: "/journalist",
        mark: <JournalistMark />,
        blurb: "Thought leadership a named executive can put their name to. Built from primary sources, sourced and dated, never opinion.",
        action: "Open the desk",
        ring: "border-[#22d3ee]/30 hover:border-[#22d3ee]/70 hover:shadow-[0_0_50px_-12px_rgba(34,211,238,0.45)]",
        wash: "from-[#22d3ee]/[0.09] to-[#818cf8]/[0.04]",
        accent: "text-[#67e8f9]",
      },
    ],
  },
];

function Tile({ d, index = 0 }: { d: Door; index?: number }) {
  // A DESK THAT DOES NOT EXIST YET is drawn so the shape of the platform is visible, but it is deliberately
  // not a link and carries no hover lift. A placeholder that behaves like a live tile is just a dead end with
  // better manners, and someone will click it twice before believing it.
  if (d.soon) {
    return (
      <div className={`gas-rise relative flex h-full flex-col overflow-hidden rounded-2xl border border-dashed border-line bg-gradient-to-br ${d.wash} p-6 ${d.wide ? "sm:col-span-2" : ""}`}
        style={{ animationDelay: `${80 + index * 90}ms` }} aria-disabled="true">
        <span className="relative block text-ink-faint">{d.mark}</span>
        <h2 className="relative mt-4 text-[25px] font-extrabold tracking-tight text-ink-dim">{d.name}</h2>
        <p className="relative mt-2.5 text-[16px] leading-relaxed text-ink-faint">{d.blurb}</p>
        <span className="tabular relative mt-5 inline-flex w-fit items-center rounded-full border border-line px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {d.action}
        </span>
      </div>
    );
  }

  // The card is a CONTAINER, not itself a link, so a second destination (the showcase eye) can live inside it.
  // Nesting an anchor inside an anchor is invalid HTML and breaks the inner click, so the main destination is a
  // stretched overlay link and the eye sits above it on a higher layer.
  const cls = `group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-gradient-to-br ${d.wash} ${d.ring} p-6 transition duration-300 hover:-translate-y-1 ${d.wide ? "sm:col-span-2" : ""}`;
  // The live products sit on their OWN domains: a plain anchor in a new tab, never a router push (which would
  // try to route them inside this app and 404).
  const label = typeof d.action === "string" ? d.action : "Open";

  return (
    <div className={`${cls} gas-rise`} style={{ animationDelay: `${80 + index * 90}ms` }}>
      {/* A soft light that only wakes on hover - the card feels lit rather than decorated. */}
      <span aria-hidden className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${d.wash} opacity-0 blur-2xl transition duration-500 group-hover:opacity-100`} />

      {/* The main destination, covering the whole card. */}
      {d.external ? (
        <a href={d.href} target="_blank" rel="noreferrer" aria-label={label} className="absolute inset-0 z-10" />
      ) : (
        <Link href={d.href} aria-label={label} className="absolute inset-0 z-10" />
      )}

      <span className="relative block transition duration-300 group-hover:-translate-y-0.5">{d.mark}</span>
      <h2 className="relative mt-4 text-[25px] font-extrabold tracking-tight text-ink">{d.name}</h2>
      <p className="relative mt-2.5 text-[16px] leading-relaxed text-ink-dim">{d.blurb}</p>
      <span className={`relative mt-5 inline-flex items-center gap-1.5 text-[15px] font-bold ${d.accent}`}>
        {d.action}
        <span className="transition-transform duration-300 group-hover:translate-x-1">{d.external ? "↗" : "→"}</span>
      </span>

      {/* THE SHOWCASE EYE, bottom-right and ABOVE the card link so it wins the click. */}
      {d.peek && (
        // A NEW TAB (Gary): the showcase is something you look at while your work stays open behind you, so it
        // must not navigate the dashboard away. A plain anchor, not a router push, for the same reason.
        <a href={d.peek.href} target="_blank" rel="noreferrer" title={d.peek.label} aria-label={`${d.peek.label} (opens in a new tab)`}
          className={`absolute bottom-5 right-5 z-20 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line/80 bg-surface-1/70 backdrop-blur-sm transition ${d.accent} hover:scale-110 hover:border-current`}>
          <EyeMark />
        </a>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* AMBIENT DEPTH. The page was reading flat (Gary), so it now breathes: soft flares that slowly pulse and
          drift, an orange one leading because this is GAS's OWN front door and orange is the GAS energy (the
          "orange is the mark alone" rule guards CLIENT creatives, not our own brand page). Kept low-opacity and
          slow so it feels premium and alive, never a wash or a distraction. Plus a fine grain for texture.
          Pure CSS - the page stays a server component, instant to load, no JS. */}
      <style>{`
        @keyframes gasFlareA { 0%,100%{opacity:.55;transform:translate3d(0,0,0) scale(1)} 50%{opacity:.9;transform:translate3d(2%,-2%,0) scale(1.08)} }
        @keyframes gasFlareB { 0%,100%{opacity:.5;transform:translate3d(0,0,0) scale(1.05)} 50%{opacity:.85;transform:translate3d(-2%,2%,0) scale(1)} }
        @keyframes gasFlareC { 0%,100%{opacity:.4} 50%{opacity:.7} }
        /* Tiles arrive in sequence rather than all at once - it reads as composed, not as a page load. */
        @keyframes gasRise { from{opacity:0;transform:translate3d(0,14px,0)} to{opacity:1;transform:none} }
        /* The hairline under each group label draws itself in. */
        @keyframes gasDraw { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        .gas-draw{transform-origin:left;animation:gasDraw .9s cubic-bezier(.22,.8,.28,1) both}
        @media (prefers-reduced-motion: reduce){
          .gas-flare,.gas-rise,.gas-draw{animation:none !important}
          .gas-rise{opacity:1 !important}
        }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* The GAS orange, top-right, leading. */}
        <div className="gas-flare absolute -right-32 -top-40 h-[40rem] w-[40rem] rounded-full bg-[#f96203]/[0.10] blur-[130px]" style={{ animation: "gasFlareA 11s ease-in-out infinite" }} />
        {/* A smaller, warmer orange ember low-left, so the warmth is not only in one corner. */}
        <div className="gas-flare absolute -bottom-24 left-1/4 h-[26rem] w-[26rem] rounded-full bg-[#fb923c]/[0.07] blur-[120px]" style={{ animation: "gasFlareC 9s ease-in-out infinite 1.5s" }} />
        {/* The accent family holds the balance - violet left, blue right. */}
        <div className="gas-flare absolute -left-40 top-16 h-[34rem] w-[34rem] rounded-full bg-[#a855f7]/[0.08] blur-[120px]" style={{ animation: "gasFlareB 13s ease-in-out infinite" }} />
        <div className="gas-flare absolute -bottom-52 -right-40 h-[36rem] w-[36rem] rounded-full bg-[#60a5fa]/[0.07] blur-[130px]" style={{ animation: "gasFlareA 15s ease-in-out infinite 2s" }} />
        {/* Fine grain for a premium, non-flat surface. A tiny SVG noise tile, very low opacity. */}
        <div className="absolute inset-0 opacity-[0.035] mix-blend-soft-light"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <AppHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-14">
        <div className="max-w-2xl">
          <p className="tabular text-[15px] font-semibold uppercase tracking-[0.34em] text-white">GAS Marketing</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
            The Agency of <span className="brand-grad-anim">NOW</span>
          </h1>
          <p className="mt-4 text-[19px] leading-relaxed text-ink-dim">
            Human command. AI execution. One platform.
          </p>
        </div>

        <div className="mt-12 space-y-10">
          {GROUPS.map((g, gi) => (
            <section key={g.label}>
              {/* The group label carries a hairline out to the edge: it reads as a chapter, not a heading. */}
              <div className="flex items-center gap-4">
                <h2 className="tabular text-[13px] font-semibold uppercase tracking-[0.3em] text-ink-dim">{g.label}</h2>
                <span className="text-[15px] text-ink-faint">{g.note}</span>
                <span aria-hidden className="gas-draw h-px flex-1 bg-gradient-to-r from-line to-transparent" />
              </div>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {g.doors.map((d, n) => <Tile key={d.href} d={d} index={gi * 2 + n} />)}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
