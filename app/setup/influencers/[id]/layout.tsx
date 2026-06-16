import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import BuildHeader from "@/components/BuildHeader";

export const dynamic = "force-dynamic";

export default async function InfluencerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean }[]) : [];
  const candidates = Array.isArray(persona.candidates) ? (persona.candidates as unknown[]) : [];
  const face =
    (persona.hero_realism_url as string) ||
    refs.find((r) => r.hero)?.url ||
    refs[0]?.url ||
    (persona.hero_url as string) ||
    (persona.reference_url as string) ||
    null;

  return (
    <div className="mx-auto max-w-4xl">
      <BuildHeader
        id={inf.id}
        name={inf.name}
        mode={inf.mode}
        consentId={inf.consent_id}
        initial={{
          status: inf.status,
          candidates: candidates.length,
          frames: refs.length,
          hasReference: !!persona.reference_url,
          locked: !!persona.locked,
          faceUrl: face,
        }}
      />
      <div className="mt-6">{children}</div>
    </div>
  );
}
