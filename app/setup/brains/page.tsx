import { listBrains } from "@/lib/brains";
import BrainsManager from "@/components/BrainsManager";

export const dynamic = "force-dynamic";

export default async function BrainsPage() {
  const brains = await listBrains();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Brains</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-dim">
        A brain is a client&apos;s private knowledge base. Feed it the client&apos;s website and notes,
        and the producer co-pilot writes every script on-brand from it. Each brain is fully
        isolated: one client&apos;s brain can never read another&apos;s.
      </p>
      <BrainsManager initial={brains} />
    </div>
  );
}
