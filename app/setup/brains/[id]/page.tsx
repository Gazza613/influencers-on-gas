import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrain, listSources } from "@/lib/brains";
import BrainConsole from "@/components/BrainConsole";

export const dynamic = "force-dynamic";

export default async function BrainDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) notFound();
  const sources = await listSources(id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/setup/brains" className="text-xs text-ink-dim hover:text-ink">← Brains</Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-xl font-bold">{brain.name}</h1>
        <span className="tabular rounded bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">brain</span>
        <span className="tabular text-xs text-ink-faint">{brain.chunk_count ?? 0} chunks</span>
      </div>
      <BrainConsole brainId={brain.id} initialSources={sources} />
    </div>
  );
}
