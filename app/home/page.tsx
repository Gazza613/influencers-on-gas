import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// THE TWO DOORS. Studio on GAS is the platform; it has two products behind one login:
//   • Influencers on GAS - the AI-influencer video studio (cast, script, voice, shoot, cut).
//   • GAS Studio        - the template creative factory (batch statics, motion, funnel, SMS).
// This is the first screen after sign-in. It deliberately does nothing else: pick a door.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Studio <span className="brand-grad">on</span> GAS
          </h1>
          <p className="mt-3 text-sm text-ink-dim">
            Human-led strategy, AI execution. Pick where you&apos;re working today.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* DOOR 1 - the existing, shipped product. */}
          <Link
            href="/influencers"
            className="group relative overflow-hidden rounded-2xl border border-[#a855f7]/35 bg-gradient-to-br from-[#a855f7]/[0.10] to-[#60a5fa]/[0.06] p-6 transition hover:border-[#a855f7]/70"
          >
            <div className="text-3xl">🎬</div>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-ink">
              Influencers <span className="brand-grad">on</span> GAS
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              Build an AI influencer and take them from a brief to a publish-ready video. Cast and
              lock the identity, write the script, design the voice, shoot the scenes, then cut.
            </p>
            <span className="mt-4 inline-block text-xs font-bold text-[#c79bff] transition group-hover:translate-x-0.5">
              Open the video studio →
            </span>
          </Link>

          {/* DOOR 2 - the template creative factory. Being built in phases; the shell is honest
              about what is and isn't live yet rather than pretending to be finished. */}
          <Link
            href="/studio"
            className="group relative overflow-hidden rounded-2xl border border-[#f59e0b]/30 bg-gradient-to-br from-[#f59e0b]/[0.08] to-[#ec4899]/[0.05] p-6 transition hover:border-[#f59e0b]/60"
          >
            <div className="text-3xl">🏭</div>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-ink">GAS Studio</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
              The template creative factory. One campaign order renders every static, motion cut,
              funnel and SMS a client needs, off locked designs that can never drift.
            </p>
            <span className="mt-4 inline-block text-xs font-bold text-[#fbbf24] transition group-hover:translate-x-0.5">
              Open the factory →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
