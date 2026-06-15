import Link from "next/link";
import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import VoicePicker from "@/components/VoicePicker";
import ReferenceGen from "@/components/ReferenceGen";
import PresenterCard from "@/components/PresenterCard";
import RealismBoost from "@/components/RealismBoost";
import BibleEditor from "@/components/BibleEditor";

export const dynamic = "force-dynamic";

export default async function InfluencerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, string>;
  const personaRows = ["gender", "age_range", "niche", "vibe", "wardrobe", "setting", "backstory"]
    .map((k) => [k, persona[k]] as const)
    .filter(([, v]) => v);

  const refs = Array.isArray(inf.look_refs) ? (inf.look_refs as { url: string; hero?: boolean }[]) : [];
  const candidates = Array.isArray((inf.persona as { candidates?: { url: string }[] })?.candidates)
    ? ((inf.persona as { candidates?: { url: string }[] }).candidates as { url: string }[])
    : [];
  // The "face" is the chosen look (only once a set is being built/trained).
  const faceUrl = refs.find((r) => r.hero)?.url || (refs.length ? refs[0]?.url : null) || persona.hero_url || null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/setup/influencers" className="text-xs text-ink-dim hover:text-ink">← Influencers</Link>
      <div className="mt-2 flex items-center gap-3">
        {faceUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={faceUrl} alt={inf.name} className="h-14 w-14 rounded-full border border-line object-cover" />
        )}
        <h1 className="text-xl font-bold">{inf.name}</h1>
        <span className="tabular rounded bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
          {inf.mode === "twin" ? "digital twin" : "synthetic"}
        </span>
        <span className="text-xs text-active">{inf.status}</span>
      </div>

      {faceUrl && (
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-1 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={faceUrl} alt={`${inf.name} face`} className="h-28 w-28 rounded-lg border border-line object-cover" />
          <div className="min-w-[180px] flex-1">
            <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">The face</div>
            <div className="mt-1 text-sm text-ink">
              {inf.higgsfield_soul_id
                ? "This is the locked identity used in every video."
                : "Hero frame. Train the identity below to lock this face across every video."}
            </div>
          </div>
        </div>
      )}

      {/* Humaniser module (flex) */}
      {faceUrl && (
        <div className="mt-4">
          <RealismBoost influencerId={inf.id} realismUrl={(persona as Record<string, string>).hero_realism_url ?? null} hasHero={!!faceUrl} />
        </div>
      )}

      {/* Identity status */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatusCard label="Identity" ok={!!inf.higgsfield_soul_id} pending="Not trained" />
        <VoicePicker influencerId={inf.id} voiceId={inf.voice_id} />
        <PresenterCard influencerId={inf.id} avatarId={inf.heygen_avatar_id} hasHero={!!faceUrl} />
        {inf.mode === "twin" && <StatusCard label="Consent" ok={!!inf.consent_id} pending="Missing" />}
      </div>

      {/* Character Bible (AI-authored blueprint) */}
      <div className="mt-6">
        <BibleEditor
          influencerId={inf.id}
          initialBrief={(persona as Record<string, string>).brief ?? null}
          initialBible={(persona as { bible?: Record<string, unknown> }).bible ?? null}
        />
      </div>

      {/* Persona */}
      {personaRows.length > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular mb-3 text-[10px] uppercase tracking-[0.25em] text-ink-faint">Persona</div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {personaRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line/60 py-1">
                <dt className="text-ink-dim capitalize">{k.replace("_", " ")}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Identity generation (Inngest durable job) */}
      <div className="mt-6">
        <ReferenceGen
          influencerId={inf.id}
          status={inf.status}
          identityPrompt={(persona as Record<string, string>).identity_prompt ?? null}
          candidates={candidates}
          lookRefs={refs}
          soulId={inf.higgsfield_soul_id}
        />
      </div>
    </div>
  );
}

function StatusCard({ label, ok, pending }: { label: string; ok: boolean; pending: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="text-[11px] text-ink-dim">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${ok ? "text-ready" : "text-ink-faint"}`}>
        {ok ? "Ready ✓" : pending}
      </div>
    </div>
  );
}
