import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "@/components/SignOutButton";
import StudioSelectors from "@/components/StudioSelectors";
import { listConnections } from "@/lib/connections";

// Produce-flow stages (ux-flow.md). Skeleton for Phase 1 — wired up in later phases.
const STAGES = [
  "Brief",
  "Script & Scenes",
  "Review & Approve",
  "A-Roll",
  "Build B-Rolls",
  "Add Sounds",
  "Stitch Video",
  "QA",
  "Preview & Download",
];

export default async function StudioPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const conns = await listConnections();
  const missingRequired = conns.filter((c) => c.required && !c.connected).map((c) => c.label);

  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      {/* ── Top bar: wordmark · brain + influencer selectors · live cost readout */}
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 font-extrabold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gas-logo.png" alt="GAS" className="h-7 w-7 rounded-full" />
            <span>Influencers <span className="text-accent">on</span> GAS</span>
          </span>
          <StudioSelectors />
        </div>
        <div className="flex items-center gap-4">
          <div className="tabular text-xs text-ink-dim">
            cost <span className="text-ink">$0.00</span> <span className="text-ink-faint">▮▮▯</span>
          </div>
          <Link href="/setup/influencers" className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink">
            Influencers
          </Link>
          <Link href="/setup/connect" className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink">
            Setup
          </Link>
          <span className="hidden text-xs text-ink-dim sm:inline">{email}</span>
          <SignOutButton />
        </div>
      </header>

      {/* ── Main: stage spine · workspace · co-pilot */}
      <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_300px]">
        {/* Left rail — produce stages */}
        <nav className="flex flex-col gap-1 overflow-y-auto border-r border-line bg-surface-1 p-3">
          <p className="tabular mb-2 px-2 text-[10px] uppercase tracking-[0.25em] text-ink-faint">
            Produce
          </p>
          {STAGES.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] ${
                i === 0 ? "bg-surface-2 text-ink" : "text-ink-dim"
              }`}
            >
              <span className="tabular text-[10px] text-ink-faint">{i + 1}</span>
              {s}
            </div>
          ))}
        </nav>

        {/* Center — stage workspace */}
        <main className="min-h-0 overflow-y-auto p-8">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-xl font-bold">Influencers on GAS</h1>
            <p className="mt-2 text-sm text-ink-dim">
              The agency video-production studio. Connect your tools, then add client
              brains and influencers to start producing.
            </p>
            {missingRequired.length > 0 ? (
              <div className="mt-6 rounded-xl border border-active/40 bg-active/5 p-5">
                <div className="text-sm font-semibold text-active">
                  Connect required tools to start producing
                </div>
                <p className="mt-1 text-xs text-ink-dim">Still needed: {missingRequired.join(", ")}.</p>
                <Link href="/setup/connect" className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-white">
                  Go to Connect Tools →
                </Link>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-ready/30 bg-ready/5 p-5 text-sm text-ink-dim">
                ✓ All required tools connected. Client brains, influencers, and the
                produce pipeline arrive in the next phases.
              </div>
            )}
          </div>
        </main>

        {/* Right rail — producer co-pilot */}
        <aside className="flex min-h-0 flex-col border-l border-line bg-surface-1">
          <div className="tabular border-b border-line px-4 py-3 text-[10px] uppercase tracking-[0.25em] text-ink-faint">
            Producer co-pilot
          </div>
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-ink-faint">
            The co-pilot wakes up in Phase 5.
          </div>
        </aside>
      </div>

      {/* ── Bottom: Build Spine (45s timeline) */}
      <footer className="shrink-0 border-t border-line bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">
            Build spine
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-0 bg-accent" />
          </div>
          <span className="tabular text-[10px] text-ink-faint">0 / 45s</span>
        </div>
      </footer>
    </div>
  );
}
