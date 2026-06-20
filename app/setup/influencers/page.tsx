import Link from "next/link";
import { auth } from "@/auth";
import { listInfluencers, type Influencer } from "@/lib/influencers";
import CastDeleteButton from "@/components/CastDeleteButton";

export const dynamic = "force-dynamic";

type Persona = {
  tagline?: string;
  bible?: { signature_line?: string; identity?: { profession?: string } };
  brief?: string; hero_realism_url?: string; hero_url?: string; reference_url?: string; locked?: boolean;
};

function thumb(inf: Influencer): string | null {
  const p = (inf.persona ?? {}) as Persona;
  const refs = (inf.look_refs as { url: string; hero?: boolean }[] | undefined) ?? [];
  return p.hero_realism_url || refs.find((r) => r.hero)?.url || refs[0]?.url || p.hero_url || p.reference_url || null;
}

function blurb(inf: Influencer): string {
  const p = (inf.persona ?? {}) as Persona;
  const b = p.bible ?? {};
  const line = p.tagline || b.signature_line || b.identity?.profession || p.brief;
  if (line) return line.length > 130 ? line.slice(0, 128).trim() + "…" : line;
  return inf.mode === "twin" ? "A digital twin, built from a real likeness." : "New influencer, still in the build.";
}

export default async function InfluencersIndex() {
  const influencers = await listInfluencers();
  const session = await auth();
  const isSuper = session?.user?.role === "super_admin";

  if (!influencers.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold">Influencers</h1>
          <p className="mt-2 text-sm text-ink-dim">Reusable identities, built once and used across every video, creative and campaign.</p>
          <p className="mt-4 text-sm text-ink-faint">Hit <span className="font-semibold brand-grad">+ New</span> to build your first one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Your AI Cast <span className="align-middle">✨</span></h1>
        <p className="mt-1 text-sm text-ink-dim">Identity-locked stars, built once and ready to deploy across video, social and campaigns. {influencers.length} in the cast.</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {influencers.map((inf) => {
          const src = thumb(inf);
          const locked = !!((inf.persona ?? {}) as Persona).locked;
          return (
            <Link key={inf.id} href={`/setup/influencers/${inf.id}`}
              className="group overflow-hidden rounded-2xl border border-line bg-surface-1 transition hover:border-[#a855f7]/50 hover:shadow-[0_0_28px_rgba(168,85,247,0.18)]">
              <div className="shimmer relative aspect-[3/4] w-full overflow-hidden">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={inf.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-ink-faint">🎭</div>
                )}
                <span className={`tabular absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${locked ? "bg-ready/85 text-white" : "bg-black/60 text-ink-dim"}`}>
                  {locked ? "🔒 Ready" : "Building"}
                </span>
                {isSuper && <CastDeleteButton id={inf.id} name={inf.name} />}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-ink">{inf.name}</span>
                  <span className="tabular shrink-0 text-[9px] uppercase tracking-wide text-ink-faint">{inf.mode === "twin" ? "twin" : "influencer"}</span>
                </div>
                <p className="mt-1 line-clamp-2 min-h-[2.4em] text-[11px] leading-snug text-ink-dim">{blurb(inf)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
