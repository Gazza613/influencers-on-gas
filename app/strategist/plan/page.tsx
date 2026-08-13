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

export default async function StrategistPlanPage() {
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
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">The Strategist</h1>
        <p className="mt-2 max-w-3xl text-[22px] leading-relaxed text-ink-dim">
          It turns the Researcher&apos;s <b className="text-ink">verified fact base</b> into one single-minded,
          defensible strategy, the brief every later step is built from. Every point is traced to a fact. The AI
          drafts and red-teams; you refine and approve at <b className="text-ink">Gate 2</b>.
        </p>
        <StrategyGate clients={clients} ready={ready} />
      </main>
    </div>
  );
}
