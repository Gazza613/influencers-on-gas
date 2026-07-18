import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import IntelQueue from "@/components/IntelQueue";
import { listStudioClients } from "@/lib/studio";

// THE STRATEGIST. Daily market and competitor intelligence, so GAS's head strategist can advise MTN MoMo from
// something better than yesterday's assumptions.
//
// It PROPOSES, it never asserts. Findings land in a review queue with a real source and an honest confidence
// grade; a human accepts or bins each one. Nothing reaches the client brain automatically - because a bad
// source that quietly becomes "fact" is inherited by every future article and strategy, and by then nobody can
// trace where it came from.
export const dynamic = "force-dynamic";

export default async function StrategistPage() {
  const clients = await listStudioClients().catch(() => []);
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/dashboard" className="text-base font-semibold text-ink-dim transition hover:text-ink">← Dashboard</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">The Strategist</h1>
        <p className="mt-2 max-w-3xl text-[20px] leading-relaxed text-ink-dim">
          Daily market and competitor intelligence for the client. It looks for what makes a current assumption
          <b className="text-ink"> wrong</b> - a competitor move, a regulatory door opening, data that shifts the
          picture. Every finding carries its source and an honest confidence grade. It proposes; you decide.
        </p>
        <IntelQueue clients={clients} role="strategist" />
      </main>
    </div>
  );
}
