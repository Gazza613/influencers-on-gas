import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import DeleteInfluencerButton from "@/components/DeleteInfluencerButton";
import { listConnections } from "@/lib/connections";
import { listInfluencers, type Influencer } from "@/lib/influencers";

type Persona = { locked?: boolean; hero_realism_url?: string; hero_url?: string; reference_url?: string; tagline?: string; bible?: { signature_line?: string }; production?: { final_url?: string | null; storyboard?: { title?: string } } };
function thumb(inf: Influencer): string | null {
  const p = (inf.persona ?? {}) as Persona;
  const refs = (inf.look_refs as { url: string; hero?: boolean }[] | undefined) ?? [];
  return p.hero_realism_url || refs.find((r) => r.hero)?.url || refs[0]?.url || p.hero_url || p.reference_url || null;
}

export default async function StudioPage() {
  const [conns, influencers] = await Promise.all([listConnections(), listInfluencers().catch(() => [] as Influencer[])]);
  const missingRequired = conns.filter((c) => c.required && !c.connected).map((c) => c.label);
  const locked = influencers.filter((i) => ((i.persona ?? {}) as Persona).locked);
  const cuts = influencers.map((i) => ({ inf: i, url: ((i.persona ?? {}) as Persona).production?.final_url || null, title: ((i.persona ?? {}) as Persona).production?.storyboard?.title })).filter((x) => x.url);

  return (
    <div className="flex h-dvh flex-col text-ink">
      <AppHeader />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-14 px-6 py-12">
          {/* Hero */}
          <section className="rise">
            <div className="eyebrow">GAS Studio</div>
            <h1 className="display mt-3 text-5xl font-extrabold sm:text-6xl">Brief to <span className="brand-grad">publish-ready</span> ad.</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-dim">Direct a hyper-real AI influencer: write it in Script &amp; Voice, then build it in The Studio - keyframes, lip-synced a-roll, cinematic b-roll, music and the final cut.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={locked.length > 0 ? "/setup/influencers" : "/start"} className="btn-brand rounded-xl px-6 py-3.5 text-sm font-bold">🎬 Start a production</Link>
              <Link href="/start" className="rounded-xl border border-line-strong bg-surface-1/60 px-6 py-3.5 text-sm font-semibold text-ink-dim transition hover:border-[#a855f7]/50 hover:text-ink">+ New influencer</Link>
            </div>
            {/* Stat strip */}
            {influencers.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-3">
                {[["Cast", influencers.length], ["Ready to produce", locked.length], ["Cuts made", cuts.length]].map(([label, n]) => (
                  <div key={label as string} className="card rounded-xl px-4 py-3">
                    <div className="tabular text-2xl font-extrabold leading-none text-ink">{n as number}</div>
                    <div className="eyebrow mt-1.5">{label as string}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Missing tools */}
          {missingRequired.length > 0 && (
            <div className="rounded-xl border border-active/40 bg-active/5 p-5">
              <div className="text-sm font-semibold text-active">Connect required tools to start producing</div>
              <p className="mt-1 text-xs text-ink-dim">Still needed: {missingRequired.join(", ")}.</p>
              <Link href="/setup/connect" className="btn-brand mt-3 inline-block rounded-md px-3 py-1.5 text-xs font-bold">Go to Connect Tools →</Link>
            </div>
          )}

          {/* Your cast - reel */}
          <section className="rise">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Your cast {influencers.length > 0 && <span className="text-ink-faint">· {influencers.length}</span>}</h2>
                <p className="mt-0.5 text-[13px] text-ink-dim">Identity-locked stars, ready to deploy. {locked.length} ready to produce.</p>
              </div>
              <Link href="/setup/influencers" className="text-xs font-semibold text-accent hover:underline">View all →</Link>
            </div>
            {influencers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-surface-1 p-8 text-center">
                <div className="text-3xl">🎬</div>
                <h3 className="mt-2 text-base font-bold text-ink">Build your first influencer</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">Three steps from here to a finished ad:</p>
                <div className="mx-auto mt-5 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
                  {[["1", "Cast & shoot", "Build the influencer and shoot a varied identity set."], ["2", "Lock the identity", "Lock the face so every shot stays consistent."], ["3", "Produce the video", "Write it in Script & Voice, then build it in The Studio."]].map(([n, t, d]) => (
                    <div key={n} className="rounded-xl border border-line bg-surface-2/50 p-4">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a855f7]/20 text-[13px] font-bold text-[#c79bff]">{n}</div>
                      <div className="mt-2 text-sm font-bold text-ink">{t}</div>
                      <div className="mt-0.5 text-[12px] text-ink-dim">{d}</div>
                    </div>
                  ))}
                </div>
                <Link href="/start" className="btn-brand mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-bold">+ Build an influencer</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {influencers.slice(0, 10).map((inf) => {
                  const src = thumb(inf);
                  const isLocked = ((inf.persona ?? {}) as Persona).locked;
                  const href = isLocked ? `/setup/influencers/${inf.id}/voice` : `/setup/influencers/${inf.id}`;
                  return (
                    <div key={inf.id} className="relative">
                      <DeleteInfluencerButton id={inf.id} name={inf.name} />
                      <Link href={href} className="card lift group relative block overflow-hidden rounded-2xl">
                      <div className="relative aspect-[3/4] w-full overflow-hidden">
                        {src
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={src} alt={inf.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]" />
                          : <div className="flex h-full w-full items-center justify-center bg-surface-2 text-3xl text-ink-faint">🎭</div>}
                        {/* gradient scrim so the name/status read cleanly over any image */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                        <span className={`tabular absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur-sm ${isLocked ? "bg-ready/85 text-white" : "bg-black/55 text-ink-dim"}`}>{isLocked ? "● Ready" : "Building"}</span>
                        <div className="absolute inset-x-0 bottom-0 p-3">
                          <div className="truncate text-sm font-bold text-white drop-shadow">{inf.name}</div>
                          <div className="mt-0.5 translate-y-1 text-[11px] font-semibold text-[#c79bff] opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">{isLocked ? "Produce →" : "Continue build →"}</div>
                        </div>
                      </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Latest cuts */}
          {cuts.length > 0 && (
            <section className="rise">
              <div className="mb-5 flex items-end justify-between">
                <h2 className="text-xl font-extrabold tracking-tight">Latest cuts <span className="text-ink-faint">· {cuts.length}</span></h2>
                <Link href="/showcase" className="text-xs font-semibold text-accent hover:underline">Showcase →</Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {cuts.slice(0, 8).map(({ inf, url, title }) => (
                  <div key={inf.id} className="card lift overflow-hidden rounded-2xl">
                    <video src={url as string} controls playsInline className="aspect-[9/16] w-full bg-black object-cover" />
                    <div className="p-3"><div className="truncate text-sm font-bold">{title || inf.name}</div><div className="text-[11px] text-ink-faint">{inf.name}</div></div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
