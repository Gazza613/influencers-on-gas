"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import WorkingPanel from "@/components/WorkingPanel";
import { CREW } from "@/lib/crew";
import { flex } from "@/lib/flex";

const LOCKDOWN_NARRATION = [
  "Locking the chosen face and its reference set as the one true identity…",
  "Welding the identity shut so it can never drift between shots…",
  "Almost there…",
];

export default function LockdownStep({
  influencerId, name, status: initialStatus, lockedInit, selectedCount, frames = [], realismUrl, soulStartedAt, refCards,
}: {
  influencerId: string;
  name: string;
  status: string;
  lockedInit: boolean;
  selectedCount: number;
  frames?: string[];
  realismUrl: string | null;
  soulStartedAt?: string | null;
  refCards?: { faceCard: string | null; featureSheet: string | null; turnaround: string | null };
}) {
  const [st, setSt] = useState(initialStatus);
  const [locked, setLocked] = useState(lockedInit);
  const [busy, setBusy] = useState(initialStatus === "training" || initialStatus === "ready");
  const [err, setErr] = useState("");
  const [localStart, setLocalStart] = useState<number | null>(null);
  const startedMs = soulStartedAt ? Date.parse(soulStartedAt) : localStart;

  const working = busy || st === "training" || st === "ready";

  async function poll(tries = 0): Promise<void> {
    if (tries > 600) { setBusy(false); return; } // ~60 min, comfortably past the backend window
    await new Promise((r) => setTimeout(r, 6000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      if (inf.persona?.locked) { setLocked(true); setBusy(false); flex("🔒 Identity locked, pixel-consistent forever", { milestone: true }); return; }
      if (inf.status === "soul_failed") { setErr(inf.persona?.soul_error || "Lock-down failed. You can retry."); setBusy(false); return; }
    }
    return poll(tries + 1);
  }
  useEffect(() => { if (working && !locked) poll(); /* resume polling on mount */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lock() {
    if (busy || selectedCount < 5) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/train`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useSelected: true }) });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start lock-down"); setBusy(false); return; }
    setSt("training"); setLocalStart(Date.now());
    flex(`${CREW.lockdown.emoji} ${CREW.lockdown.name}, your ${CREW.lockdown.role}: ${CREW.lockdown.greeting}`);
    poll();
  }

  async function abort() {
    if (!confirm("Abort this lock-down? You can start it again afterwards.")) return;
    await fetch(`/api/influencers/${influencerId}/train`, { method: "DELETE" }).catch(() => {});
    setBusy(false); setErr(""); setSt("frames_ready");
  }

  if (locked) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ready/30 bg-ready/5 p-5">
          {realismUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={realismUrl} alt="locked face" className="h-24 w-24 rounded-lg border border-ready/40 object-cover" />
          )}
          <div className="min-w-[220px] flex-1">
            <div className="tabular text-xs uppercase tracking-[0.2em] text-ready">🔒 Identity locked</div>
            <p className="mt-1 text-sm text-ink">
              Done. This exact face is locked. It will stay perfectly consistent across every creative and video you
              ever make for {name}. That is the magic, no drifting faces, no surprises.
            </p>
          </div>
        </div>

        {refCards && (refCards.faceCard || refCards.featureSheet || refCards.turnaround) && (
          <div className="rounded-xl border border-line bg-surface-1 p-5">
            <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">Identity reference card</div>
            <p className="mt-1 text-[11px] text-ink-faint">The forensic lock: a clean identity headshot, a macro feature sheet and a full turnaround. Every creative is matched against these.</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {([["faceCard", "Identity"], ["featureSheet", "Features"], ["turnaround", "Turnaround"]] as const).map(([k, label]) => {
                const url = refCards[k];
                if (!url) return null;
                return (
                  <a key={k} href={url} target="_blank" rel="noreferrer" className="group block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={label} className="aspect-square w-full rounded-lg border border-line object-cover transition group-hover:border-[#a855f7]/50" />
                    <div className="mt-1 text-center text-[10px] text-ink-faint">{label}</div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
        <div className="rounded-xl border border-ready/40 bg-surface-1 p-5">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ready font-semibold">✓ Your next step</div>
          <div className="mt-1 text-lg font-bold text-ink">Create &amp; download {name}&apos;s creatives</div>
          <p className="mt-1 text-sm text-ink-dim">
            Generate social-ready images (9:16, 1:1, 16:9, up to 4K) for {name}, ready to download for Reels, Stories,
            feeds and ads. Pick any of them in the Producer as a reference look and your video scenes inherit that exact
            wardrobe, styling and world. One locked identity, endless on-brand content.
          </p>
          <div className="mt-3">
            <Link href={`/setup/influencers/${influencerId}/creatives`} className="next-pulse inline-block rounded-full px-5 py-2.5 text-sm font-bold">
              ✦ Create &amp; download {name}&apos;s creatives →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">Lock down the identity</div>
        <p className="mt-2 text-sm text-ink-dim">
          This seals <span className="text-ink">this person</span>{" "}as the one true identity. Their face and reference set
          (identity card, feature sheet and turnaround) become the lock that every creative is matched against, so she
          stays identical in every future shot, expression and scene. No drifting faces, no &ldquo;who is that?&rdquo; moments.
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] text-ink-dim">
          <li>⚡ It is <span className="text-ink">near instant</span> now, the heavy lifting already happened in the photoshoot.</li>
          <li>🧬 <span className="text-ink">Why lock down?</span> Until it is locked, the identity is not sealed. Locking fixes it as the reference for every creative.</li>
          <li>🎬 Creatives and (later) video both build from this locked identity, so it unlocks them the moment you lock.</li>
        </ul>

        {(frames.length > 0 || (refCards && (refCards.faceCard || refCards.featureSheet || refCards.turnaround))) && !working && (
          <div className="mt-4 rounded-xl border border-[#a855f7]/25 bg-[#a855f7]/8 p-4">
            <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">This is what you are locking in</div>
            <p className="mt-1 text-[13px] text-ink-faint">The full reference set - {frames.length} kept frame{frames.length === 1 ? "" : "s"} plus her forensic identity cards. Every future creative is matched against these.</p>
            {/* The kept frames - the collage of the whole identity set being locked. */}
            {frames.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {frames.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="group block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`frame ${i + 1}`} className="aspect-[3/4] w-full rounded-lg border border-line object-cover transition group-hover:border-[#a855f7]/60" />
                  </a>
                ))}
              </div>
            )}
            {/* The forensic cards (identity / features / turnaround), when present. */}
            {refCards && (refCards.faceCard || refCards.featureSheet || refCards.turnaround) && (
              <div className="mt-3 border-t border-line/60 pt-3">
                <div className="tabular mb-2 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Forensic cards</div>
                <div className="grid grid-cols-3 gap-3">
                  {([["faceCard", "Identity"], ["featureSheet", "Features"], ["turnaround", "Turnaround"]] as const).map(([k, label]) => {
                    const url = refCards[k];
                    if (!url) return null;
                    return (
                      <a key={k} href={url} target="_blank" rel="noreferrer" className="group block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={label} className="aspect-square w-full rounded-lg border border-line object-cover transition group-hover:border-[#a855f7]/60" />
                        <div className="mt-1 text-center text-[11px] text-ink-faint">{label}</div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {!working && (
          <button onClick={lock} disabled={selectedCount < 5} className="btn-brand mt-4 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
            {selectedCount < 5 ? "Select 5+ frames in the photoshoot first" : `🔒 Lock down identity (${selectedCount} frames)`}
          </button>
        )}
        {selectedCount < 5 && !working && (
          <Link href={`/setup/influencers/${influencerId}/photoshoot`} className="ml-2 text-xs text-ink-dim hover:text-ink">← back to photoshoot</Link>
        )}

        {working && (
          <div className="mt-4">
            <WorkingPanel title="Lock-down" lines={LOCKDOWN_NARRATION} crew={CREW.lockdown} eta="a few seconds" pct={null}
              startedAt={startedMs} onAbort={abort}
              note="Sealing the identity. This is quick now." />
          </div>
        )}
        {err && <p className="mt-2 text-xs text-alert">{err}</p>}
      </div>
    </div>
  );
}
