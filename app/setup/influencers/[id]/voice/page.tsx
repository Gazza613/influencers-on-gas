import Link from "next/link";
import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import ProducerStudio from "@/components/steps/ProducerStudio";

export const dynamic = "force-dynamic";

// SCRIPT & VOICE stage - the foundation everything downstream is built to. Same ProducerStudio component,
// rendered in "foundation" mode (brief -> storyboard -> voice). The Final Cut stage picks up from here.
export default async function ScriptVoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  if (!persona.locked) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
        <p className="text-sm text-ink-dim">Lock {inf.name}&apos;s identity first, then we can write the script and voice with them.</p>
        <Link href={`/setup/influencers/${id}/lockdown`} className="btn-brand mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold">Go to Lock down →</Link>
      </div>
    );
  }

  const creatives = (Array.isArray(persona.creatives) ? persona.creatives : [])
    .map((c) => c as { url?: string | null; role?: string; ratio?: string; scene?: string; resolution?: string })
    .filter((c) => typeof c.url === "string" && c.url)
    .map((c) => ({ url: c.url as string, role: c.role === "b-roll" ? "b-roll" : "a-roll", ratio: String(c.ratio || ""), scene: String(c.scene || ""), resolution: String(c.resolution || "") }));

  return <ProducerStudio mode="foundation" influencerId={inf.id} name={inf.name} initialVoiceId={String(persona.voice_id || "")} initialVoiceName={String(persona.voice_name || "")} initialProduction={(persona.production as Record<string, unknown>) ?? null} creatives={creatives} arollRef={String(persona.aroll_ref_url || "")} brollRef={String(persona.broll_ref_url || "")} voiceModel={persona.voice_model === "v3" ? "v3" : "v2"} />;
}
