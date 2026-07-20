import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import IntelQueue from "@/components/IntelQueue";
import { listStudioClients } from "@/lib/studio";
import { brainsWithIntel } from "@/lib/intel";

// THE JOURNALIST. Thought leadership for a named executive to post on LinkedIn, written for whichever brain
// is selected.
//
// It is NOT product promotion, and the reason differs by client rather than being one universal rule. For MTN
// MoMo the line is legal: a post that promotes their services becomes an FSP advertisement under FAIS s14.
// For GAS's own brain there is no such regime, and the constraint is editorial instead - a positioning piece
// that turns into a pitch stops being worth reading.
//
// Which is why the specifics live on the BRAIN (intel_briefs: the scope lock, the journalist brief, the CEO
// rules, who signs) and never in this page. A shared screen cannot carry one client's compliance position as
// though it applied to everyone.

export default async function JournalistPage() {
  const clients = await listStudioClients().catch(() => []);
  // WHICH BRAINS ARE ACTUALLY SET UP FOR THIS DESK. Every brain was offered here regardless, so one with no
  // brief could be selected and would report "nothing in the queue" - which reads as a failed run rather than
  // as never having been configured. A brain without a brief cannot produce findings at all.
  const briefed = await brainsWithIntel().catch(() => []);
  const configured = briefed.filter((b) => b.journalist).map((b) => b.clientId);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-lg font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">The Journalist</h1>
        {/* BRAIN-NEUTRAL. This described MoMo alone - "the CEO", and product promotion becoming "a regulated
            financial advertisement", which is a FAIS point true of a fintech and of nothing else. The platform
            now runs several brains, so a shared page cannot carry one client's compliance position as if it
            were everyone's. The specifics - who signs, what may not be said - live on each brain and are
            applied when the piece is written. */}
        <p className="mt-2 max-w-3xl text-[24px] leading-relaxed text-ink-dim">
          Thought leadership the named executive can put their name to. It researches the selected brain&apos;s
          category daily and files what it finds here. <b className="text-ink">Industry commentary only</b> -
          never product promotion. GAS drafts; the executive&apos;s office approves and publishes. Each brain
          carries its own voice, its own hard lines and its own compliance position, and a piece is written
          under those rather than any other client&apos;s.
        </p>
        <IntelQueue clients={clients} configured={configured} role="journalist" />
      </main>
    </div>
  );
}
