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

  // Creatives made in the Creative section, slimmed to what the Producer's guide-picker needs.
  const creatives = (Array.isArray(persona.creatives) ? persona.creatives : [])
    .map((c) => c as { url?: string | null; role?: string; ratio?: string; scene?: string; resolution?: string })
    .filter((c) => typeof c.url === "string" && c.url)
    .map((c) => ({ url: c.url as string, role: c.role === "b-roll" ? "b-roll" : "a-roll", ratio: String(c.ratio || ""), scene: String(c.scene || ""), resolution: String(c.resolution || "") }));

  return <ProducerStudio influencerId={inf.id} name={inf.name} initialVoiceId={String(persona.voice_id || "")} initialVoiceName={String(persona.voice_name || "")} initialProduction={(persona.production as Record<string, unknown>) ?? null} creatives={creatives} arollRef={String(persona.aroll_ref_url || "")} brollRef={String(persona.broll_ref_url || "")} voiceModel={persona.voice_model === "v3" ? "v3" : "v2"} />;
}
