import { listBrains } from "@/lib/brains";
import BrainsManager from "@/components/BrainsManager";

export const dynamic = "force-dynamic";

// Type scaled up throughout (Gary: "TOO SMALL THIS BRAINS PAGE CONTENT NEEDS TO BE MUCH BIGGER AND MORE
// VISIBLE"), to the size that works on the Journalist. The column widens 3xl -> 5xl to match: bigger type in
// a narrow column just buys more line breaks, not more readability.

export default async function BrainsPage() {
  const brains = await listBrains();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold">Brains</h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-dim">
        A brain is a client&apos;s private knowledge base. Feed it the client&apos;s website and notes,
        and the producer co-pilot writes every script on-brand from it. Each brain is fully
        isolated: one client&apos;s brain can never read another&apos;s.
      </p>
      <BrainsManager initial={brains} />
    </div>
  );
}
