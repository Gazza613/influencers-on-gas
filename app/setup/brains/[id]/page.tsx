import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrain, listSources } from "@/lib/brains";
import { getBrandKit } from "@/lib/studio";
import BrainConsole from "@/components/BrainConsole";
import FlowSteps from "@/components/FlowSteps";

export const dynamic = "force-dynamic";

export default async function BrainDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) notFound();
  const sources = await listSources(id);
  // The brand doctrine (positioning + rules) is now edited on this page, not synced from a separate kit.
  const kit = await getBrandKit(id).catch(() => null);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2 text-base text-ink-dim">
        <Link href="/dashboard" className="font-semibold hover:text-ink">← Dashboard</Link>
        <span className="text-ink-faint">/</span>
        <Link href="/setup/brains" className="hover:text-ink">Brains</Link>
      </div>
      <FlowSteps active={2} />
      {/* Ask THIS brain, pre-focused (Gary: ask it in context, not via a separate tile with a re-pick). */}
      <div className="mt-3">
        <Link href={`/ask?client=${brain.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#a855f7]/40 px-3.5 py-2 text-base font-semibold text-[#c79bff] hover:bg-[#a855f7]/10">
          Ask this brain →
        </Link>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-3xl font-bold">{brain.name}</h1>
        <span className="tabular rounded bg-surface-2 px-2.5 py-1 text-[12px] uppercase tracking-wide text-ink-faint">brain</span>
        <span className="tabular text-base text-ink-faint">{brain.chunk_count ?? 0} passages</span>
      </div>
      <BrainConsole brainId={brain.id} initialSources={sources} chunkCount={brain.chunk_count ?? 0} initialDoctrine={kit?.tone_notes ?? ""} />
    </div>
  );
}
