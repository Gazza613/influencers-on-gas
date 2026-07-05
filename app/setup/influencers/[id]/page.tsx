import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import { listConnections } from "@/lib/connections";
import CastingStep from "@/components/steps/CastingStep";

export const dynamic = "force-dynamic";

export default async function CastingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [inf, conns] = await Promise.all([getInfluencer(id), listConnections().catch(() => [])]);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(persona.candidates) ? (persona.candidates as { url: string }[]) : [];
  // Required vendor tools not yet connected - casting is a paid call that would fail without them, so we
  // surface a "connect first" gate instead of letting it error mid-build (P0-5).
  const missingTools = conns.filter((c) => c.required && !c.connected).map((c) => c.label);

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
      missingTools={missingTools}
    />
  );
}
