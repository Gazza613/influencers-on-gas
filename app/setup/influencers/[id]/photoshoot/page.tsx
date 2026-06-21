import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import PhotoshootStep from "@/components/steps/PhotoshootStep";

export const dynamic = "force-dynamic";

export default async function PhotoshootPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean }[]) : [];
  // The face the photoshoot is built around: chosen candidate, or a reference photo.
  const modelUrl =
    (persona.chosen_url as string) ||
    (persona.reference_url as string) ||
    refs.find((r) => r.hero)?.url ||
    refs[0]?.url ||
    null;
  const selectedInit = Array.isArray(persona.selected_frames) ? (persona.selected_frames as string[]) : [];

  return (
    <PhotoshootStep
      influencerId={inf.id}
      status={inf.status}
      modelUrl={modelUrl}
      frames={refs}
      selectedInit={selectedInit}
      startedAtInit={typeof persona.photoshoot_started_at === "number" ? persona.photoshoot_started_at : null}
    />
  );
}
