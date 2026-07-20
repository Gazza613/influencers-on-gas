import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import AskBrain from "@/components/AskBrain";
import { listStudioClients } from "@/lib/studio";

// ASK THE BRAIN. Its own page rather than a box on the research desks, because the whole team needs the
// brains and not just the two desks that research them - someone writing a script needs a client's zero-fee
// list as much as the Strategist does. It also existed only under Setup, which reads as configuration and is
// the last place anyone looks for a daily tool.
export const dynamic = "force-dynamic";

export default async function AskPage() {
  const clients = await listStudioClients().catch(() => []);
  return (
    <div className="min-h-screen bg-surface-0">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Ask the Brain</h1>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-dim">
          Ask a client&apos;s knowledge base anything it should know. Answers come only from that brain&apos;s own
          material, never from general knowledge and never from another client&apos;s - and every answer shows the
          passages it was built from, so you can check it before you use it.
        </p>
        {clients.length === 0
          ? <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-lg text-ink-dim">No brains yet. Create one under Setup, Brains.</p>
          : <AskBrain clients={clients} />}
      </main>
    </div>
  );
}
