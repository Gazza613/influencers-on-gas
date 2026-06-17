import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import LockdownStep from "@/components/steps/LockdownStep";

export const dynamic = "force-dynamic";

export default async function LockdownPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string }[]) : [];
  const sel = Array.isArray(persona.selected_frames) ? (persona.selected_frames as string[]) : [];
  const selectedCount = sel.length >= 5 ? sel.length : refs.length;

  return (
    <LockdownStep
      influencerId={inf.id}
      name={inf.name}
      status={inf.status}
      lockedInit={!!persona.locked}
      selectedCount={selectedCount}
      realismUrl={(persona.hero_realism_url as string) ?? null}
      soulStartedAt={typeof persona.soul_started_at === "string" ? persona.soul_started_at : null}
      refCards={{
        faceCard: (persona.face_card_url as string) ?? null,
        featureSheet: (persona.feature_sheet_url as string) ?? null,
        turnaround: (persona.turnaround_url as string) ?? null,
      }}
    />
  );
}
