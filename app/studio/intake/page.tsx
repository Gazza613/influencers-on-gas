import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import StudioIntake from "@/components/StudioIntake";
import { listBrains } from "@/lib/brains";

// TEMPLATE INTAKE (spec 5c). The GAS team designs the first set by hand to the client's CI. That
// human-made set is the reference. It is ingested here, recreated as locked code, and from order two
// onwards the system produces and the team only supplies offer, copy and images.
export const dynamic = "force-dynamic";

export default async function StudioIntakePage() {
  const clients = (await listBrains().catch(() => [])).map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <Link href="/studio" className="text-sm font-semibold text-ink-dim transition hover:text-ink">← GAS Studio</Link>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Template intake</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-dim">
          Upload the set your team designed by hand. Nothing here is invented: every template is recreated
          from your reference and locked against it, so the design can never drift between campaigns.
        </p>
        <StudioIntake initialClients={clients} />
      </main>
    </div>
  );
}
