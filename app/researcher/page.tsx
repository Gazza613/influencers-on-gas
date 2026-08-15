import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ResearchGate from "@/components/ResearchGate";
import FlowSteps from "@/components/FlowSteps";
import { listStudioClients } from "@/lib/studio";
import { researchableClientIds } from "@/lib/intel";

// THE RESEARCHER (V3) - A COLLECTOR, NOT AN ANALYST (build spec V3, section 3). It turns a client website into a
// verified, source-tiered fact base: facts only, no threats/opportunities/gaps/positioning/trends (those are the
// Strategist's job now). Every claim carries a source and a Tier 1/2/3, so Gate 1 approval is a check of
// falsifiable FACT, not opinion. Gary approves, reruns with notes, or rejects right on this screen.

// Always read the live client list: a brain created just now (the "New Brain" flow) must appear in the dropdown
// on the next load, not after a deploy. Without this the route can be cached and a new client never shows.
export const dynamic = "force-dynamic";

export default async function ResearcherPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  // ?client=<id> arrives when the team clicks through from a specific brain, so the dropdown defaults to the brain
  // they were just working on rather than the cold-visit default.
  const sp = await searchParams;
  const initialClientId = typeof sp?.client === "string" ? sp.client : "";
  const clients = await listStudioClients().catch(() => []);
  // Researchable = an explicit Researcher remit OR any crawled knowledge. A freshly-crawled brain is immediately
  // researchable; the collector derives its scope from its own material and the ground-truth website.
  const configured = await researchableClientIds().catch(() => []);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-[18px] font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <FlowSteps active={2} />
        <div className="mt-4 flex items-center gap-3">
          {/* A radar/scope mark, the sibling of the Brain's neural icon, in the same violet->cyan family. */}
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 shrink-0" stroke="url(#rsr-hd)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <defs>
              <linearGradient id="rsr-hd" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#A855F7" /><stop offset="0.55" stopColor="#818CF8" /><stop offset="1" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <path d="M19.07 4.93A10 10 0 1 0 22 12" /><path d="M14.83 9.17A6 6 0 1 0 18 12" />
            <path d="M12 12 22 2" /><circle cx="12" cy="12" r="1.6" />
          </svg>
          <h1 className="text-[34px] font-bold tracking-tight">The Researcher</h1>
          <span className="tabular rounded bg-surface-2 px-2.5 py-1 text-[13px] uppercase tracking-wide text-ink-faint">step 2</span>
        </div>
        <p className="mt-2 max-w-3xl text-[18px] leading-relaxed text-ink-dim">
          It collects a <b className="text-ink">verified fact base</b> on the selected client, their market and
          their competitors. Facts only, never analysis: every claim carries a <b className="text-ink">source and a
          tier</b>, so what you approve at Gate 1 is checkable at a glance. The analysis comes next, from the
          Strategist. Approve the facts, rerun with notes, or reject, right here.
        </p>
        <ResearchGate clients={clients} configured={configured} initialClientId={initialClientId} />
      </main>
    </div>
  );
}
