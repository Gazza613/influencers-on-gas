"use client";

import { useState } from "react";

// Optional skin-realism pass (Magnific) on the hero. Shows the enhanced result.
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
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start realism pass"); setBusy(false); return; }
    poll();
  }

  return (
    <div className="flex items-center gap-3">
      {url && (
        <a href={url} target="_blank" rel="noopener">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="realism-enhanced" className="h-16 w-16 rounded-lg border border-ready object-cover" title="Realism-enhanced (click to open)" />
        </a>
      )}
      <div>
        <button
          onClick={go}
          disabled={busy || !hasHero}
          title={hasHero ? "" : "Build the identity first"}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-line-strong disabled:opacity-50"
        >
          {busy ? "Enhancing… (~1 min)" : url ? "Re-run realism" : "Enhance skin realism"}
        </button>
        {url && <p className="mt-1 text-[11px] text-ready">Realism enhanced ✓</p>}
        {err && <p className="mt-1 text-[11px] text-alert">{err}</p>}
      </div>
    </div>
  );
}
