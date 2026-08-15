import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import StrategyGate from "@/components/StrategyGate";
import FlowSteps from "@/components/FlowSteps";
import { listStudioClients } from "@/lib/studio";
import { db } from "@/lib/db";

// THE STRATEGIST (Pillar II), Phase C - the planner. Takes the Researcher's APPROVED fact base and turns it into a
// single, structured, defensible strategy (Gate 2). Human Command, AI Execution: the AI drafts and red-teams, a
// senior human refines and approves. The Proposal (next) will run from an approved strategy, in this same POD.
export const dynamic = "force-dynamic";

export default async function StrategistPlanPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  // ?client=<id> carries the client through from the Researcher, so the Strategist opens on the same client you
  // were just working on rather than the first approved one.
  const sp = await searchParams;
  const initialClientId = typeof sp?.client === "string" ? sp.client : "";
  const clients = await listStudioClients().catch(() => []);
  // Which clients have an APPROVED research run - the only ones a strategy can be built from.
  const rows = (await db().query(`select distinct client_id from research_runs where status = 'gate1_approved'`).catch(() => [])) as { client_id: string }[];
  const ready = rows.map((r) => String(r.client_id));
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <FlowSteps active={3} />
        {/* Title + description now live in StrategyGate's living hero, the same pattern as the Brain and Researcher. */}
        <StrategyGate clients={clients} ready={ready} initialClientId={initialClientId} />
      </main>
    </div>
  );
}
