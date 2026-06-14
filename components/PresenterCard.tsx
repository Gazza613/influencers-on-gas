"use client";

import { useState } from "react";

// The "Presenter" = the talking a-roll avatar built from the influencer's locked face.
export default function PresenterCard({
  influencerId,
  avatarId,
  hasHero,
}: {
  influencerId: string;
  avatarId: string | null;
  hasHero: boolean;
}) {
  const [id, setId] = useState(avatarId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function poll(tries = 0): Promise<void> {
    if (tries > 40) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 4000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      if (inf.heygen_avatar_id) { setId(inf.heygen_avatar_id); setBusy(false); return; }
      if (inf.persona?.presenter_error) { setErr(inf.persona.presenter_error); setBusy(false); return; }
    }
    return poll(tries + 1);
  }

  async function create() {
    if (busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/presenter`, { method: "POST" });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start presenter"); setBusy(false); return; }
    poll();
  }

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="text-[11px] text-ink-dim">Presenter</div>
      <div className={`mt-1 text-sm font-semibold ${id ? "text-ready" : "text-ink-faint"}`}>
        {id ? "Ready ✓" : busy ? "Creating…" : "Not created"}
      </div>
      {!id && (
        <button
          onClick={create}
          disabled={busy || !hasHero}
          title={hasHero ? "" : "Build the identity first"}
          className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-line-strong disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create presenter"}
        </button>
      )}
      {id && <p className="mt-1 text-[11px] text-ink-faint">Talking avatar ready for video.</p>}
      {err && <p className="mt-1 text-[11px] text-alert">{err}</p>}
    </div>
  );
}
