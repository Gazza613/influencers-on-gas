import { notFound, redirect } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";

export const dynamic = "force-dynamic";

// Voice + talking video now live inside the Producer flow (step 4). This standalone page is retired;
// redirect any old bookmark to the Producer so there's one source of truth (no stale persona.aroll path).
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  redirect(`/setup/influencers/${id}/producer`);
}

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
