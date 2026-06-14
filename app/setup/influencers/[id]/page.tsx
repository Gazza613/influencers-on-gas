import Link from "next/link";
import { notFound } from "next/navigation";
import { getInfluencer } from "@/lib/influencers";
import VoicePicker from "@/components/VoicePicker";

export const dynamic = "force-dynamic";

export default async function InfluencerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inf = await getInfluencer(id);
  if (!inf) notFound();

  const persona = (inf.persona ?? {}) as Record<string, string>;
  const personaRows = ["gender", "age_range", "niche", "vibe", "wardrobe", "setting", "backstory"]
    .map((k) => [k, persona[k]] as const)
    .filter(([, v]) => v);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/setup/influencers" className="text-xs text-ink-dim hover:text-ink">← Influencers</Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-xl font-bold">{inf.name}</h1>
        <span className="tabular rounded bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
          {inf.mode === "twin" ? "digital twin" : "synthetic"}
        </span>
        <span className="text-xs text-active">{inf.status}</span>
      </div>

      {/* Identity status */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatusCard label="Soul (Higgsfield)" ok={!!inf.higgsfield_soul_id} pending="Not trained" />
        <VoicePicker influencerId={inf.id} voiceId={inf.voice_id} />
        {inf.mode === "twin" && <StatusCard label="Avatar (HeyGen)" ok={!!inf.heygen_avatar_id} pending="Not created" />}
        {inf.mode === "twin" && <StatusCard label="Consent" ok={!!inf.consent_id} pending="Missing" />}
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

      {/* Generation (Phase 3b) */}
      <div className="mt-6 rounded-xl border border-active/40 bg-active/5 p-5">
        <div className="text-sm font-semibold text-active">Generation wires up next (Phase 3b)</div>
        <p className="mt-1 text-xs text-ink-dim">
          Reference-frame generation, Soul 2.0 training, the Magnific realism pass, and voice
          binding activate once the vendor tools are connected. The hyper-realism prompt
          library is applied automatically.
        </p>
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
