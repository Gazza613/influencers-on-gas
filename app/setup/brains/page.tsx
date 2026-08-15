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
      {/* Header + description now live inside BrainsManager's living hero, so the corpus tally can stay live
          across create/delete. */}
      <BrainsManager initial={brains} />
    </div>
  );
}
