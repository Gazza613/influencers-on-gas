import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ResearchGate from "@/components/ResearchGate";
import { listStudioClients } from "@/lib/studio";
import { researchableClientIds } from "@/lib/intel";

// THE RESEARCHER (V3) - A COLLECTOR, NOT AN ANALYST (build spec V3, section 3). It turns a client website into a
// verified, source-tiered fact base: facts only, no threats/opportunities/gaps/positioning/trends (those are the
// Strategist's job now). Every claim carries a source and a Tier 1/2/3, so Gate 1 approval is a check of
// falsifiable FACT, not opinion. Gary approves, reruns with notes, or rejects right on this screen.

// Always read the live client list: a brain created just now (the "New Brain" flow) must appear in the dropdown
// on the next load, not after a deploy. Without this the route can be cached and a new client never shows.
export const dynamic = "force-dynamic";

export default async function ResearcherPage() {
  const clients = await listStudioClients().catch(() => []);
  // Researchable = an explicit Researcher remit OR any crawled knowledge. A freshly-crawled brain is immediately
  // researchable; the collector derives its scope from its own material and the ground-truth website.
  const configured = await researchableClientIds().catch(() => []);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">The Researcher</h1>
        <p className="mt-2 max-w-3xl text-[22px] leading-relaxed text-ink-dim">
          It collects a <b className="text-ink">verified fact base</b> on the selected client, their market and
          their competitors. Facts only, never analysis: every claim carries a <b className="text-ink">source and a
          tier</b>, so what you approve at Gate 1 is checkable at a glance. The analysis comes next, from the
          Strategist. Approve the facts, rerun with notes, or reject, right here.
        </p>
        <ResearchGate clients={clients} configured={configured} />
      </main>
    </div>
  );
}
