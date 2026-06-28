import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import CastingStep from "@/components/steps/CastingStep";

export const dynamic = "force-dynamic";

export default async function CastingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(persona.candidates) ? (persona.candidates as { url: string }[]) : [];

  return (
    <CastingStep
      influencerId={inf.id}
      name={inf.name}
      status={inf.status}
      candidates={candidates}
      chosenUrl={(persona.chosen_url as string) ?? null}
      referenceUrl={(persona.reference_url as string) ?? null}
      initialBrief={(persona.brief as string) ?? null}
      initialBible={(persona.bible as Record<string, unknown>) ?? null}
    />
  );
}
