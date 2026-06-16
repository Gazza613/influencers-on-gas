"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import WorkingPanel from "@/components/WorkingPanel";
import { CREW } from "@/lib/crew";
import { flex } from "@/lib/flex";

const LOCKDOWN_NARRATION = [
  "Studying every angle of this face — the bone structure, the asymmetry, the tells…",
  "Teaching the model the smile, the eyes, the way the light catches the skin…",
  "Forging a dedicated identity the camera will never forget…",
  "Running the Humaniser — real pores, real catchlights, real skin…",
  "Welding the identity shut so it can never drift between shots…",
  "Almost there — this face is becoming pixel-consistent, forever…",
];

export default function LockdownStep({
  influencerId, status: initialStatus, lockedInit, selectedCount, realismUrl,
}: {
  influencerId: string;
  status: string;
  lockedInit: boolean;
  selectedCount: number;
  realismUrl: string | null;
}) {
  const [st, setSt] = useState(initialStatus);
  const [locked, setLocked] = useState(lockedInit);
  const [busy, setBusy] = useState(initialStatus === "training" || initialStatus === "ready");
  const [err, setErr] = useState("");

  const working = busy || st === "training" || st === "ready";

  async function poll(tries = 0): Promise<void> {
    if (tries > 220) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 6000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      if (inf.persona?.locked) { setLocked(true); setBusy(false); flex("🔒 Identity locked — pixel-consistent forever", { milestone: true }); return; }
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
    setSt("training");
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
            <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ready">🔒 Identity locked</div>
            <p className="mt-1 text-sm text-ink">
              Done. This exact face is trained, humanised and locked. It will stay perfectly consistent across every
              video you ever make with this influencer. That is the magic, no drifting faces, no surprises.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">Next · create &amp; download your creatives</div>
          <p className="mt-2 text-sm text-ink-dim">
            Head to Creatives to generate social-ready images (9:16, 1:1, 16:9 in 2K or 4K) and download them for
            Reels, Stories, feeds and ads. Voice and the full video pipeline arrive later in the Studio.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={`/setup/influencers/${influencerId}/creatives`} className="next-pulse inline-block rounded-full px-5 py-2.5 text-sm font-bold">
              ✦ Create &amp; download images →
            </Link>
            <Link href="/studio" className="text-xs text-ink-dim hover:text-ink">Video production (Studio) →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">Lock down the identity</div>
        <p className="mt-2 text-sm text-ink-dim">
          This is the big one. We train a dedicated AI model on your chosen frames so it truly <span className="text-ink">knows this</span> person,
          then run the Humaniser to add real-skin detail. The result is a face that stays identical in every
          future shot, expression and scene. No two-heads, no hallucinating, no &ldquo;who is that?&rdquo; moments.
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] text-ink-dim">
          <li>⏱️ It takes about <span className="text-ink">10 minutes</span>. Kick it off, then go grab a coffee or get on with other work, it runs in the background.</li>
          <li>🧬 <span className="text-ink">Why lock down?</span> Until it is locked, the face can drift between generations. Locking trains the identity so it is pixel-consistent forever.</li>
          <li>➕ Want to build another influencer while you wait? Go for it. Each lock-down runs on its own, starting a new one will <span className="text-ink">not</span> interrupt this one.</li>
          <li>🎬 Video production needs the locked identity (that is what keeps the face consistent), so it unlocks the moment this finishes. You do not have to sit here, pop back in 10.</li>
        </ul>

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
            <WorkingPanel title="Lock-down" lines={LOCKDOWN_NARRATION} crew={CREW.lockdown} eta="about 10 min" pct={null}
              onAbort={abort}
              note="Running on our servers — it keeps going even if you leave or start another influencer. Soul training can occasionally take up to ~30 min." />
          </div>
        )}
        {err && <p className="mt-2 text-xs text-alert">{err}</p>}
      </div>
    </div>
  );
}
