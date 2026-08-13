import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrain, listSources } from "@/lib/brains";
import { getBrandKit } from "@/lib/studio";
import BrainConsole from "@/components/BrainConsole";
import AskBrain from "@/components/AskBrain";
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
      <FlowSteps active={1} />
      <div className="mt-3 flex items-center gap-3">
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 shrink-0" stroke="url(#brain-hd)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <defs>
            <linearGradient id="brain-hd" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#A855F7" /><stop offset="0.55" stopColor="#818CF8" /><stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <path d="M12 18V5" /><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
          <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" /><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
          <path d="M18 18a4 4 0 0 0 2-7.464" /><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
          <path d="M6 18a4 4 0 0 1-2-7.464" /><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
        </svg>
        <h1 className="text-3xl font-bold">{brain.name}</h1>
        <span className="tabular rounded bg-surface-2 px-2.5 py-1 text-[12px] uppercase tracking-wide text-ink-faint">brain</span>
        <span className="tabular text-base text-ink-faint">{brain.chunk_count ?? 0} passages</span>
      </div>
      <BrainConsole brainId={brain.id} initialSources={sources} chunkCount={brain.chunk_count ?? 0} initialDoctrine={kit?.tone_notes ?? ""} />

      {/* TEST THE BRAIN, in the same place you built it (Gary: fold Test the Brain into The Brain, one tile not two).
          Ask this brain a question and check it answers well before the Researcher builds on it. */}
      <div className="mt-12 border-t border-line pt-8">
        <div className="flex items-center gap-3">
          <span className="tabular rounded-md bg-[#a855f7]/12 px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.16em] text-[#c79bff]">Test the Brain</span>
          <span className="text-base text-ink-dim">Check it answers well, straight from this brain&apos;s own material.</span>
        </div>
        <AskBrain clients={[{ id: brain.id, name: brain.name }]} initialClientId={brain.id} lockClient />
      </div>
    </div>
  );
}
