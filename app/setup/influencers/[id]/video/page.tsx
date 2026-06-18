import Link from "next/link";
import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import VideoStudio from "@/components/steps/VideoStudio";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  const persona = (inf.persona ?? {}) as Record<string, unknown>;

  if (!persona.locked) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-6 text-center">
        <p className="text-sm text-ink-dim">Lock the identity down first, then you can give {inf.name} a voice and generate talking video here.</p>
        <Link href={`/setup/influencers/${id}/lockdown`} className="btn-brand mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold">Go to Lock down →</Link>
      </div>
    );
  }

  return (
    <VideoStudio
      influencerId={inf.id}
      name={inf.name}
      mode={inf.mode}
      initial={{
        voice: persona.voice_id ? { id: String(persona.voice_id), name: String(persona.voice_name ?? "Voice"), preview: (persona.voice_preview_url as string) ?? null } : null,
        aroll: Array.isArray(persona.aroll) ? (persona.aroll as { id?: string; url?: string | null; line?: string; ratio?: string; status?: string; error?: string | null }[]) : [],
        signatureLine: ((persona.bible as { signature_line?: string })?.signature_line) ?? "",
      }}
    />
  );
}
