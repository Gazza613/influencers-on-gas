import Link from "next/link";
import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import VoicePicker from "@/components/VoicePicker";
import ReferenceGen from "@/components/ReferenceGen";
import PresenterCard from "@/components/PresenterCard";
import BibleEditor from "@/components/BibleEditor";

export const dynamic = "force-dynamic";

export default async function InfluencerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, unknown>;
  const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean }[]) : [];
  const candidates = Array.isArray(persona.candidates) ? (persona.candidates as { url: string }[]) : [];
  const realismUrl = (persona.hero_realism_url as string) ?? null;
  const locked = !!persona.locked;
  const heroUrl = refs.find((r) => r.hero)?.url || (refs.length ? refs[0]?.url : null) || (persona.hero_url as string) || null;
  const faceUrl = locked && realismUrl ? realismUrl : heroUrl;

  // 3-step build progress
  const step1Done = candidates.length > 0 || refs.length > 0;
  const step2Done = refs.length > 1;
  const steps = [
    { n: "①", label: "Casting", done: step1Done },
    { n: "②", label: "Photoshoot", done: step2Done },
    { n: "③", label: "Lock down", done: locked },
  ];
  const activeIdx = locked ? 3 : step2Done ? 2 : step1Done ? 1 : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/setup/influencers" className="text-xs text-ink-dim hover:text-ink">← Influencers</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {faceUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={faceUrl} alt={inf.name} className="h-14 w-14 rounded-full border border-line object-cover" />
        )}
        <h1 className="text-xl font-bold">{inf.name}</h1>
        <span className="tabular rounded bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
          {inf.mode === "twin" ? "digital twin" : "synthetic"}
        </span>
        {inf.mode === "twin" && (
          <span className={`tabular rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${inf.consent_id ? "bg-ready/15 text-ready" : "bg-alert/15 text-alert"}`}>
            {inf.consent_id ? "consent ✓" : "consent missing"}
          </span>
        )}
        <span className={`text-xs font-semibold ${locked ? "text-ready" : "text-active"}`}>{locked ? "🔒 Locked · ready for production" : "Building…"}</span>
      </div>

      {/* Step strip */}
      <div className="mt-4 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${s.done ? "border-ready/40 bg-ready/10 text-ready" : i === activeIdx ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-faint"}`}>
            <span>{s.done ? "✓" : s.n}</span>
            <span className="font-semibold">{s.label}</span>
          </div>
        ))}
      </div>

      {/* The face */}
      {faceUrl && (
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-1 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={faceUrl} alt={`${inf.name} face`} className="h-28 w-28 rounded-lg border border-line object-cover" />
          <div className="min-w-[180px] flex-1">
            <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">The face</div>
            <div className="mt-1 text-sm text-ink">
              {locked ? "Locked + humanised. This exact face carries across every video." : "Your chosen look. Lock the identity below to fix this face across every video."}
            </div>
          </div>
        </div>
      )}

      {/* ① Character Bible — the brief that drives everything */}
      <div className="mt-6">
        <BibleEditor
          influencerId={inf.id}
          initialBrief={(persona.brief as string) ?? null}
          initialBible={(persona.bible as Record<string, unknown>) ?? null}
        />
      </div>

      {/* Casting → Photoshoot → Lock Down */}
      <div className="mt-6">
        <ReferenceGen
          influencerId={inf.id}
          status={inf.status}
          identityPrompt={(persona.identity_prompt as string) ?? null}
          candidates={candidates}
          lookRefs={refs}
          soulId={inf.higgsfield_soul_id}
          lockedInit={locked}
        />
      </div>

      {/* Video production (next phase) — unlocks after lock down */}
      <div className="mt-6 rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Video production · next phase</div>
          <span className={`text-xs ${locked ? "text-ready" : "text-ink-faint"}`}>{locked ? "unlocked" : "locked"}</span>
        </div>
        <p className="mt-2 text-sm text-ink-dim">
          Voice, presenter and the produce pipeline live here. They unlock once the identity is locked down.
        </p>
        {locked ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <VoicePicker influencerId={inf.id} voiceId={inf.voice_id} />
            <PresenterCard influencerId={inf.id} avatarId={inf.heygen_avatar_id} hasHero={!!faceUrl} />
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-ink-faint">Finish the three build steps above to unlock voice, presenter and video production.</p>
        )}
      </div>
    </div>
  );
}
