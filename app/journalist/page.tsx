import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import IntelQueue from "@/components/IntelQueue";
import { listStudioClients } from "@/lib/studio";

// THE JOURNALIST. Thought leadership for the MTN MoMo CEO to post on LinkedIn.
//
// SCOPE, decided with Gary and legally load-bearing: INDUSTRY COMMENTARY ONLY. The moment a post promotes
// MoMo's services it becomes an FSP advertisement under FAIS and the whole s14 regime applies (no urgency,
// balanced presentation, African Bank identified as product supplier). Staying on category commentary keeps it
// out of that definition entirely: authority without exposure.
//
// And it goes out under a real person's name. So: GAS drafts, the CEO's office approves and publishes. Never
// the other way round. No fabricated quotes, no invented anecdotes, every claim traceable to a public source
// he could defend in a room.
export const dynamic = "force-dynamic";

export default async function JournalistPage() {
  const clients = await listStudioClients().catch(() => []);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">The Journalist</h1>
        <p className="mt-2 max-w-3xl text-[24px] leading-relaxed text-ink-dim">
          Thought leadership the CEO can put his name to. It researches the category daily and files what it
          finds here. <b className="text-ink">Industry commentary only</b> - never product promotion, because a
          post that promotes MoMo&apos;s services becomes a regulated financial advertisement. GAS drafts; the
          CEO&apos;s office approves and publishes.
        </p>
        <IntelQueue clients={clients} role="journalist" />
      </main>
    </div>
  );
}
