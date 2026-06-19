import Link from "next/link";
import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import ProducerStudio from "@/components/steps/ProducerStudio";

export const dynamic = "force-dynamic";

export default async function ProducerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  if (!persona.locked) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
        <p className="text-sm text-ink-dim">Lock {inf.name}&apos;s identity first, then the Producer can make a video with them.</p>
        <Link href={`/setup/influencers/${id}/lockdown`} className="btn-brand mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold">Go to Lock down →</Link>
      </div>
    );
  }

  return <ProducerStudio influencerId={inf.id} name={inf.name} initialProduction={(persona.production as Record<string, unknown>) ?? null} />;
}
