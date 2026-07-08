import { notFound } from "next/navigation";
import { isValidShowcaseToken, listShowcaseVideos } from "@/lib/showcase";
import ShowcaseReel from "@/components/ShowcaseReel";

export const dynamic = "force-dynamic";

// Public, unauthenticated brag wall - a SALES TOOL prospects open. The only gate is the unguessable
// token in the URL. (Excluded from the auth proxy matcher so prospects can open it without a login.)
export default async function PublicShowcase({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isValidShowcaseToken(token))) notFound();
  const videos = await listShowcaseVideos();

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(1100px 620px at 50% -8%, rgba(236,72,153,0.22), transparent 60%)," +
          "radial-gradient(1000px 760px at 100% 18%, rgba(96,165,250,0.18), transparent 58%)," +
          "radial-gradient(950px 760px at 0% 78%, rgba(168,85,247,0.20), transparent 58%)," +
          "radial-gradient(900px 700px at 80% 100%, rgba(96,165,250,0.16), transparent 55%)," +
          "linear-gradient(180deg, #0a0712, #0c0816 55%, #0a0712)",
      }}
    >
      {/* Hero with an accent glow */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="relative mx-auto max-w-3xl px-6 pb-14 pt-16 text-center sm:pt-24">
          {/* GAS mark - the brand anchor, with a SUBTLE breathing ORANGE glow (orange is reserved for the GAS mark) */}
          <style>{`@keyframes gasGlow{0%,100%{opacity:.24;transform:translate(-50%,-50%) scale(1.25)}50%{opacity:.44;transform:translate(-50%,-50%) scale(1.5)}}`}</style>
          <div className="relative mx-auto mb-8 h-[115px] w-[115px]">
            {/* soft, gently breathing orange halo (no rotation) */}
            <span className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-full w-full rounded-full bg-[#FF6A00] blur-2xl" style={{ animation: "gasGlow 4s ease-in-out infinite" }} />
            {/* logo: crop the dark PNG edge (scale + overflow) and only a hairline rim, so no hard black border */}
            <span className="relative block h-[115px] w-[115px] overflow-hidden rounded-full ring-1 ring-white/5" style={{ boxShadow: "0 0 30px rgba(255,106,0,0.5)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gas-logo.png" alt="GAS" className="h-full w-full scale-110 object-cover" />
            </span>
          </div>
          <span className="inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Influencers on GAS</span>
          <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            AI influencers,<br />
            <span className="brand-flow">brought to life.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/60 sm:text-lg">
            Scroll-stopping, publish-ready AI video response ads.
            Concept to final cut, produced end-to-end by GAS Marketing.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {videos.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
            <div className="text-3xl">🎬</div>
            <p className="mt-3 text-sm text-white/80">Fresh work landing soon.</p>
            <p className="mt-1 text-sm text-white/40">Check back shortly to see the latest productions.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="text-lg font-bold tracking-tight">Selected work</h2>
              <span className="text-xs text-white/40">{videos.length} {videos.length === 1 ? "film" : "films"} · hover to play</span>
            </div>
            <ShowcaseReel videos={videos} />
          </>
        )}
      </main>

      {/* CTA - this is a sales tool, so close with a clear next step */}
      <section className="relative overflow-hidden border-t border-white/10">
        <div className="relative mx-auto max-w-3xl px-6 py-16 text-center">
          <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Influence that converts.</h3>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
            Let&apos;s have a conversation that counts.
          </p>
          <a href="https://www.gasmarketing.co.za" target="_blank" rel="noreferrer" className="mt-6 inline-block rounded-xl bg-gradient-to-r from-[#a855f7] to-[#60a5fa] px-6 py-3 text-sm font-bold text-white shadow-[0_10px_40px_rgba(168,85,247,0.4)] transition hover:brightness-110">
            Get in Touch →
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gas-logo.png" alt="GAS" className="h-10 w-10 rounded-full ring-1 ring-white/15" />
              <div>
                <div className="font-extrabold tracking-tight">GAS Marketing</div>
                <div className="text-xs text-white/55">Conversations that Count</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              <a href="https://www.gasmarketing.co.za" target="_blank" rel="noreferrer" className="font-semibold text-white/80 hover:text-white">gasmarketing.co.za</a>
              <a href="https://www.instagram.com/gasmarketingsa/" target="_blank" rel="noreferrer" className="text-white/60 hover:text-white">Instagram</a>
              <a href="https://www.linkedin.com/company/gas-converged-data/" target="_blank" rel="noreferrer" className="text-white/60 hover:text-white">LinkedIn</a>
              <a href="https://www.facebook.com/dataongas/" target="_blank" rel="noreferrer" className="text-white/60 hover:text-white">Facebook</a>
            </div>
          </div>
          <p className="mt-7 border-t border-white/5 pt-5 text-center text-xs text-white/35">
            Response marketing, powered by AI · Produced with Influencers on GAS · © GAS Marketing
          </p>
        </div>
      </footer>
    </div>
  );
}
