import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import FlowSteps from "@/components/FlowSteps";
import ProposalStep from "@/components/ProposalStep";
import { db } from "@/lib/db";

// THE PROPOSAL (Step 4), now its OWN step + gate, lifted out of the Strategist page (Gary). Runs from an APPROVED
// strategy: pick the client, build the client-facing growth proposal (Fable 5), then read and gate it section by
// section (approve, or edit by prompt and "refine and rewrite"). The branded PDF cuts once the sections are worked
// through. Human Command, AI Execution: the AI drafts, a senior human reads, steers and approves.
export const dynamic = "force-dynamic";

export default async function ProposalPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  // ?client=<id> carries the client through from the Strategist hand-off, so the Proposal opens on the same client.
  const sp = await searchParams;
  const initialClientId = typeof sp?.client === "string" ? sp.client : "";
  // Clients with an APPROVED strategy (the only ones a proposal can be built from), each with its LATEST approved one.
  const rows = (await db().query(
    `select distinct on (c.id) c.id, c.name, s.id as strategy_id
       from strategies s
       join engagements e on e.id = s.engagement_id
       join clients c on c.id = e.client_id
      where s.status = 'approved'
      order by c.id, s.created_at desc`,
  ).catch(() => [])) as { id: string; name: string; strategy_id: string }[];
  const clients = rows.map((r) => ({ id: String(r.id), name: r.name, strategyId: String(r.strategy_id) }));
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <FlowSteps active={4} />
        <ProposalStep clients={clients} initialClientId={initialClientId} />
      </main>
    </div>
  );
}
