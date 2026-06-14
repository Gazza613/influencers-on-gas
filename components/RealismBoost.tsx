"use client";

import { useState } from "react";

// The "Humaniser" module: a final realism pass (Magnific) that makes the face read as
// a real person on camera. Presented prominently as a showcase capability.
export default function RealismBoost({
  influencerId,
  realismUrl,
  hasHero,
}: {
  influencerId: string;
  realismUrl: string | null;
  hasHero: boolean;
}) {
  const [url, setUrl] = useState(realismUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function poll(tries = 0): Promise<void> {
    if (tries > 80) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 4000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      if (inf.persona?.hero_realism_url) { setUrl(inf.persona.hero_realism_url); setBusy(false); return; }
      if (inf.persona?.realism_error) { setErr(inf.persona.realism_error); setBusy(false); return; }
    }
    return poll(tries + 1);
  }

  async function go() {
    if (busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/realism`, { method: "POST" });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start the Humaniser"); setBusy(false); return; }
    poll();
  }

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-accent">Humaniser</div>
        {url && <span className="text-xs font-semibold text-ready">Humanised ✓</span>}
      </div>
      <p className="mt-2 text-sm text-ink">
        Every face is pushed through our <strong>Humaniser</strong>, a final realism pass that layers
        true-to-life skin texture, pores and micro detail so your influencer reads as a real person
        on camera, never an AI render.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {url && (
          <a href={url} target="_blank" rel="noopener" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="humanised face" className="h-24 w-24 rounded-lg border-2 border-ready object-cover" title="Humanised result (tap to open)" />
          </a>
        )}
        <div>
          <button
            onClick={go}
            disabled={busy || !hasHero}
            title={hasHero ? "" : "Build the identity first"}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Humanising your influencer…" : url ? "Run the Humaniser again" : "Run the Humaniser"}
          </button>
          {busy && <p className="mt-2 text-[11px] text-ink-faint">Adding real-skin detail. This runs in the background, you can carry on.</p>}
          {url && !busy && <p className="mt-2 text-[11px] text-ready">Real-skin detail applied. Tap the result to view full size.</p>}
          {err && <p className="mt-2 text-[11px] text-alert">{err}</p>}
        </div>
      </div>
    </div>
  );
}
