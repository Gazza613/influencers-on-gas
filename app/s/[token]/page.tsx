import { notFound } from "next/navigation";
import { isValidShowcaseToken, listShowcaseVideos } from "@/lib/showcase";

export const dynamic = "force-dynamic";

// Public, unauthenticated brag wall. The only gate is the unguessable token in the URL.
// (Excluded from the auth proxy matcher so prospects can open it without a login.)
export default async function PublicShowcase({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isValidShowcaseToken(token))) notFound();
  const videos = await listShowcaseVideos();

  return (
    <div className="min-h-screen bg-surface-0 text-ink">
      <header className="flex items-center gap-2 border-b border-line px-5 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gas-logo.png" alt="GAS" className="h-6 w-6 rounded-full" />
        <span className="font-extrabold tracking-tight">Influencers <span className="brand-grad">on</span> GAS</span>
        <span className="ml-2 text-sm text-ink-faint">Showcase</span>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">AI influencers, brought to life.</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-dim">
          A selection of finished videos produced on the GAS platform. Every face is a consistent, owned AI
          identity, rendered and ready to publish.
        </p>

        {videos.length === 0 ? (
          <div className="mt-10 rounded-xl border border-line bg-surface-1 p-10 text-center">
            <div className="text-3xl">🎬</div>
            <p className="mt-3 text-sm text-ink">Fresh work landing soon.</p>
            <p className="mt-1 text-sm text-ink-faint">Check back shortly to see the latest productions.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <figure key={v.id} className="overflow-hidden rounded-xl border border-line bg-surface-1">
                <video src={v.final_video_url ?? undefined} controls playsInline className="aspect-[9/16] max-h-[70vh] w-full bg-black object-contain" />
                <figcaption className="truncate p-3 text-sm font-semibold text-ink">{v.title || "Untitled production"}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-line px-5 py-6 text-center text-xs text-ink-faint">
        Produced with Influencers on GAS · GAS Marketing
      </footer>
    </div>
  );
}
