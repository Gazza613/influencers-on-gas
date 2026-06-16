"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import BibleEditor from "@/components/BibleEditor";
import Lightbox from "@/components/Lightbox";
import WorkingPanel from "@/components/WorkingPanel";
import { CREW } from "@/lib/crew";
import { flex, pick, CAST_LINES } from "@/lib/flex";

type Ref = { url: string };

const CAST_TOTAL = 6;
const CASTING_NARRATION = [
  "Our casting director is reading your character brief…",
  "Auditioning six distinct faces, each a real, believable human…",
  "Art-directing the lighting and mood for every look…",
  "No two faces alike, you'll pick the one that clicks…",
  "Layering in real-skin detail so none of them read as AI…",
  "Almost there, lining up your audition board…",
];

export default function CastingStep({
  influencerId, status: initialStatus, candidates: initialCandidates, chosenUrl, referenceUrl,
  initialBrief, initialBible,
}: {
  influencerId: string;
  status: string;
  candidates: Ref[];
  chosenUrl: string | null;
  referenceUrl: string | null;
  initialBrief: string | null;
  initialBible: Record<string, unknown> | null;
}) {
  const [st, setSt] = useState(initialStatus);
  const [candidates, setCandidates] = useState<Ref[]>(initialCandidates || []);
  const [chosen, setChosen] = useState<string | null>(chosenUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const bibleFlush = useRef<(() => Promise<void>) | null>(null); // save character edits before casting

  const casting = st === "casting" || busy;

  async function poll(tries = 0): Promise<void> {
    if (tries > 160) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      if (Array.isArray(inf.persona?.candidates)) setCandidates(inf.persona.candidates);
      if (inf.status === "gen_failed") { setErr(inf.persona?.gen_error || "Casting failed. Give it another go."); setBusy(false); return; }
      if (inf.status === "cast_ready") { flex(pick(CAST_LINES)); setBusy(false); return; }
    }
    return poll(tries + 1);
  }

  async function cast() {
    if (busy) return;
    setBusy(true); setErr(""); setChosen(null);
    // Make sure any in-flight character edits are written before we build the prompt.
    try { await bibleFlush.current?.(); } catch { /* non-fatal */ }
    const r = await fetch(`/api/influencers/${influencerId}/generate`, { method: "POST" });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start casting"); setBusy(false); return; }
    setSt("casting"); setCandidates([]);
    flex(`${CREW.casting.emoji} ${CREW.casting.name}, your ${CREW.casting.role}: ${CREW.casting.greeting}`);
    poll();
  }

  async function choose(url: string) {
    setChosen(url);
    fetch(`/api/influencers/${influencerId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaPatch: { chosen_url: url } }),
    }).catch(() => {});
  }

  const pct = Math.min(100, Math.round((candidates.length / CAST_TOTAL) * 100));

  return (
    <div className="space-y-6">
      {/* Character Casting (the brief → full character) */}
      <BibleEditor influencerId={influencerId} initialBrief={initialBrief} initialBible={initialBible} />

      {/* Look casting */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">Cast the looks</div>

        {referenceUrl ? (
          // Reference / twin path, casting is skipped.
          <div className="mt-3">
            <p className="text-sm text-ink-dim">
              You gave us a reference photo, so we skip casting and shoot straight from that face. Nice shortcut.
            </p>
            <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={referenceUrl} alt="reference" className="h-16 w-16 rounded-lg border border-line object-cover" />
              <Link href={`/setup/influencers/${influencerId}/photoshoot`} className="next-pulse rounded-full px-5 py-2.5 text-sm font-bold">
                Start the photoshoot →
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-dim">
              Now we audition the face. We generate <span className="text-ink">6 photoreal looks</span> from your
              character above, you pick the one that feels right. The looks follow the Character Casting, so to
              change the vibe, tweak the character (or re-brief) first, then cast.
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">
              💸 Heads up: each casting run costs about <span className="text-ink-dim">6 credits (~R4)</span>. Re-casting
              spends the same again, so it is worth getting the character right before you fire away.
            </p>

            {!casting && (
              <button onClick={cast} className="btn-brand mt-3 rounded-lg px-4 py-2 text-sm font-bold">
                {candidates.length ? "↻ Re-cast looks (~6 credits)" : "✨ Generate looks"}
              </button>
            )}

            {casting && (
              <div className="mt-4">
                <WorkingPanel title="Casting" lines={CASTING_NARRATION} crew={CREW.casting} eta="about 2 min"
                  pct={candidates.length ? pct : null} sub={`${candidates.length}/${CAST_TOTAL} looks`}
                  note="Fresh, distinct faces appear as they're cast." />
              </div>
            )}

            {err && <p className="mt-2 text-xs text-alert">{err}</p>}

            {candidates.length > 0 && (
              <>
                <p className="mt-4 text-[11px] font-semibold text-ink-dim">
                  {chosen ? "Love it. That is your model." : "Tap the look you love, the tick top-right means it is selected."}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {candidates.map((c, i) => {
                    const sel = chosen === c.url;
                    return (
                      <div key={i} onClick={() => !busy && !broken.has(c.url) && choose(c.url)} className="shimmer group relative block cursor-pointer overflow-hidden rounded-lg">
                        {broken.has(c.url) ? (
                          <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border-2 border-line bg-surface-2 px-2 text-center text-[10px] text-ink-faint">look didn&apos;t load, re-cast to refresh</div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.url} alt={`look ${i + 1}`} onError={() => setBroken((b) => new Set(b).add(c.url))}
                            className={`aspect-[9/16] w-full rounded-lg border-2 object-cover transition ${sel ? "border-[#a855f7] shadow-[0_0_22px_rgba(168,85,247,0.45)]" : "border-line opacity-85 hover:opacity-100"}`} />
                        )}
                        <span className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition ${sel ? "border-[#a855f7] bg-[#a855f7] text-white" : "border-white/70 bg-black/45 text-transparent group-hover:text-white/70"}`}>✓</span>
                        <button onClick={(e) => { e.stopPropagation(); setZoom(c.url); }} title="View full size"
                          className="absolute bottom-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded-md bg-black/60 text-xs text-white group-hover:flex">⤢</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* Next step, only once a face is chosen (or reference path handled above) */}
        {!referenceUrl && chosen && (
          <div className="mt-5 rounded-lg border border-ready/30 bg-ready/5 p-4">
            <p className="text-sm text-ink">Step one done. Next we run a full photoshoot on this exact face.</p>
            <Link href={`/setup/influencers/${influencerId}/photoshoot`} className="next-pulse mt-3 inline-block rounded-full px-5 py-2.5 text-sm font-bold">
              Start the photoshoot →
            </Link>
          </div>
        )}
      </div>

      {zoom && <Lightbox url={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
