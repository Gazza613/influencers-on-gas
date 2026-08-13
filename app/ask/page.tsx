import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import AskBrain from "@/components/AskBrain";
import FlowSteps from "@/components/FlowSteps";
import { listStudioClients } from "@/lib/studio";

// ASK THE BRAIN. Its own page rather than a box on the research desks, because the whole team needs the
// brains and not just the two desks that research them - someone writing a script needs a client's zero-fee
// list as much as the Strategist does. It also existed only under Setup, which reads as configuration and is
// the last place anyone looks for a daily tool.
export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const clients = await listStudioClients().catch(() => []);
  // Pre-focus on a brain when opened from its page ("Ask this brain"), so the team never re-picks the client.
  const { client } = await searchParams;
  const initialClientId = clients.some((c) => c.id === client) ? client! : "";
  return (
    <div className="min-h-screen bg-surface-0">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <FlowSteps active={2} />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Test the Brain</h1>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-dim">
          Ask the brain anything it should know and check it answers well before the Researcher builds on it.
          Answers come only from that brain&apos;s own material, never from another client&apos;s, and every answer
          shows the passages it was built from, so you can trust it.
        </p>
        {clients.length === 0
          ? <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-lg text-ink-dim">No brains yet. Create one under Setup, Brains.</p>
          : <AskBrain clients={clients} initialClientId={initialClientId} />}
        {/* FORWARD STEP (Gary): the Ask page only went back to the dashboard; it now steps on to the Researcher. */}
        <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
          <Link href="/setup/brains" className="text-base font-semibold text-ink-dim transition hover:text-ink">← Back to the Brain</Link>
          <Link href="/researcher" className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-lg font-bold text-black hover:opacity-90">Happy with it? On to the Researcher →</Link>
        </div>
      </main>
    </div>
  );
}
