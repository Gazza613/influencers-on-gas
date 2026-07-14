import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// THE TWO DOORS. Studio on GAS is the platform; it has two products behind one login:
//   • Influencers on GAS - the AI-influencer video studio (cast, script, voice, shoot, cut).
//   • GAS Studio        - the template creative factory (batch statics, motion, funnel, SMS).
// This is the first screen after sign-in. It deliberately does nothing else: pick a door.
//
// Palette note: both doors stay in the pink/purple/blue accent family (orange is reserved for the GAS
// mark alone - never a background wash). The two are separated by hue within that family, not by
// introducing a new colour: Influencers leans pink/violet, GAS Studio leans blue/cyan.
export const dynamic = "force-dynamic";

// Custom marks, not emoji. Influencers = a face framed in a viewfinder (someone on camera).
// GAS Studio = stacked frames in different ratios (one order, every size).
function InfluencerMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10" aria-hidden>
      <defs>
        <linearGradient id="inf-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      {/* viewfinder corners */}
      <path d="M4 15V8a4 4 0 0 1 4-4h7M44 15V8a4 4 0 0 0-4-4h-7M4 33v7a4 4 0 0 0 4 4h7M44 33v7a4 4 0 0 1-4 4h-7"
        stroke="url(#inf-g)" strokeWidth="2.6" strokeLinecap="round" />
      {/* head + shoulders */}
      <circle cx="24" cy="20.5" r="6.2" stroke="url(#inf-g)" strokeWidth="2.6" />
      <path d="M13.5 38c1.6-5.7 5.6-8.6 10.5-8.6S32.9 32.3 34.5 38"
        stroke="url(#inf-g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function StudioMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10" aria-hidden>
      <defs>
        <linearGradient id="std-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" /><stop offset="0.5" stopColor="#818CF8" /><stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      {/* three frames, three ratios - the same design rendered at every size */}
      <rect x="4" y="10" width="16" height="22" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
      <rect x="24" y="6" width="20" height="20" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
      <rect x="16" y="30" width="28" height="13" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
    </svg>
  );
}

// A nib — writing, with authority.
function JournalistMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10" aria-hidden>
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

// A rising line with a plotted turn — reading the market.
function StrategistMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10" aria-hidden>
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

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Studio <span className="brand-grad">on</span> GAS
          </h1>
          <p className="mt-3 text-base text-ink-dim sm:text-lg">
            Human-led strategy, AI execution. Pick where you&apos;re working today.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
          {/* DOOR 1 - the existing, shipped product. */}
          <Link
            href="/influencers"
            className="group relative overflow-hidden rounded-2xl border border-[#a855f7]/35 bg-gradient-to-br from-[#a855f7]/[0.10] to-[#ec4899]/[0.05] p-7 transition hover:border-[#a855f7]/70 hover:from-[#a855f7]/[0.16]"
          >
            <InfluencerMark />
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">
              Influencers <span className="brand-grad">on</span> GAS
            </h2>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
              Build an AI influencer and take them from a brief to a publish-ready video. Cast and
              lock the identity, write the script, design the voice, shoot the scenes, then cut.
            </p>
            <span className="mt-5 inline-block text-sm font-bold text-[#c79bff] transition group-hover:translate-x-0.5">
              Open the video studio →
            </span>
          </Link>

          {/* DOOR 2 - the template creative factory. Being built in phases; the shell behind this door
              is honest about what is and isn't live yet rather than pretending to be finished. */}
          <Link
            href="/studio"
            className="group relative overflow-hidden rounded-2xl border border-[#60a5fa]/35 bg-gradient-to-br from-[#60a5fa]/[0.10] to-[#22d3ee]/[0.05] p-7 transition hover:border-[#60a5fa]/70 hover:from-[#60a5fa]/[0.16]"
          >
            <StudioMark />
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">GAS Studio</h2>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
              The template creative factory. One campaign order renders every static, motion cut,
              funnel and SMS a client needs, off locked designs that can never drift.
            </p>
            <span className="mt-5 inline-block text-sm font-bold text-[#93c5fd] transition group-hover:translate-x-0.5">
              Open the factory →
            </span>
          </Link>

          {/* DOOR 3 - thought leadership. Industry commentary only: a post that promotes the client's financial
              services becomes a regulated advertisement, so this stays deliberately on the category. */}
          <Link
            href="/journalist"
            className="group relative overflow-hidden rounded-2xl border border-[#22d3ee]/35 bg-gradient-to-br from-[#22d3ee]/[0.09] to-[#818cf8]/[0.05] p-7 transition hover:border-[#22d3ee]/70 hover:from-[#22d3ee]/[0.15]"
          >
            <JournalistMark />
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">The Journalist</h2>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
              Thought leadership a client CEO can put his name to. It researches the category daily and builds
              a defensible argument from primary sources, never from opinion.
            </p>
            <span className="mt-5 inline-block text-sm font-bold text-[#67e8f9] transition group-hover:translate-x-0.5">
              Open the desk →
            </span>
          </Link>

          {/* DOOR 4 - market intelligence. Proposes, never asserts; a human accepts each finding into the brain. */}
          <Link
            href="/strategist"
            className="group relative overflow-hidden rounded-2xl border border-[#818cf8]/35 bg-gradient-to-br from-[#818cf8]/[0.10] to-[#a855f7]/[0.05] p-7 transition hover:border-[#818cf8]/70 hover:from-[#818cf8]/[0.16]"
          >
            <StrategistMark />
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">The Strategist</h2>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
              Daily market and competitor intelligence. It hunts for what makes a current assumption wrong, and
              files it with a source and an honest confidence grade.
            </p>
            <span className="mt-5 inline-block text-sm font-bold text-[#a5b4fc] transition group-hover:translate-x-0.5">
              Open the desk →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
