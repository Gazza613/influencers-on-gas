import Link from "next/link";
import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import CreativesStudio from "@/components/steps/CreativesStudio";

export const dynamic = "force-dynamic";

export default async function CreativesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  if (!persona.locked) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
        <p className="text-sm text-ink-dim">Lock the identity down first, then you can render social creatives here.</p>
        <Link href={`/setup/influencers/${id}/lockdown`} className="btn-brand mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold">Go to Lock down →</Link>
      </div>
    );
  }

  return (
    <CreativesStudio
      influencerId={inf.id}
      initial={{
        creatives: Array.isArray(persona.creatives)
          ? (persona.creatives as {
            id?: string;
            url: string | null;
            ratio: string;
            resolution: string;
            scene: string;
            at: number;
            status?: "approved" | "failed_qa" | "failed_generation";
            qa?: { pass: boolean; score10: number; issues: string[] } | null;
            error?: string | null;
          }[])
          : [],
        status: (persona.creatives_status as string) ?? "idle",
      }}
    />
  );
}
