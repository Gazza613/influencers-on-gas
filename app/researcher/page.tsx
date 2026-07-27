import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import IntelQueue from "@/components/IntelQueue";
import { listStudioClients } from "@/lib/studio";
import { brainsWithIntel } from "@/lib/intel";

// THE RESEARCHER. A commissioned, world-class deep dive on where a selected client actually stands - the
// analyst to the Strategist's newswire. Where the Strategist runs daily and reports what CHANGED, the
// Researcher is pressed on demand and answers "where do we stand and what should we do", across five fixed
// sections: threats, opportunities, gaps, positioning, and global trends and campaigns worth stealing.
//
// It reuses the same review-and-approve queue as the daily desks (nothing reaches the brain unread), and an
// accepted finding can be turned into the CEO's LinkedIn article with its three-image creative - the same
// pipeline the Journalist used. The specifics live on the BRAIN (its scope lock and Researcher remit), never
// on this page, so a shared screen never carries one client's scope as though it were everyone's.

export default async function ResearcherPage() {
  const clients = await listStudioClients().catch(() => []);
  const briefed = await brainsWithIntel().catch(() => []);
  const configured = briefed.filter((b) => b.researcher).map((b) => b.clientId);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">The Researcher</h1>
        <p className="mt-2 max-w-3xl text-[24px] leading-relaxed text-ink-dim">
          A world-class deep dive on the selected brain, commissioned when you need it. It works five sections -
          <b className="text-ink"> threats, opportunities, gaps, positioning</b>, and <b className="text-ink">global
          trends and campaigns worth stealing</b> - every finding sourced and read through that client&apos;s own
          doctrine. You accept or bin each one, and any finding can become the CEO&apos;s LinkedIn article. Each
          brain is researched under its own scope alone; none is ever borrowed.
        </p>
        <IntelQueue clients={clients} configured={configured} role="researcher" />
      </main>
    </div>
  );
}
