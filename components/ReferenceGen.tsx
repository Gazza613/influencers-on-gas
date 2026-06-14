"use client";

import { useState } from "react";

export default function ReferenceGen({
  influencerId,
  status,
  identityPrompt,
}: {
  influencerId: string;
  status: string;
  identityPrompt: string | null;
}) {
  const [st, setSt] = useState(status);
  const [prompt, setPrompt] = useState(identityPrompt);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function poll(tries = 0): Promise<void> {
    if (tries > 30) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      const p = inf.persona?.identity_prompt as string | undefined;
      if (p) { setPrompt(p); setBusy(false); return; }
    }
    return poll(tries + 1);
  }

  async function generate() {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/generate`, { method: "POST" });
    if (!r.ok) {
      setErr((await r.json().catch(() => ({})))?.error || "Could not start generation");
      setBusy(false);
      return;
    }
    setSt("generating");
    poll();
  }

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Identity generation</div>
        <span className="text-xs text-active">{st}</span>
      </div>
      <p className="mt-2 text-xs text-ink-dim">
        Builds the hyper-realism identity prompt now; reference-frame generation, the realism
        pass, and identity training wire in next.
      </p>
      <button onClick={generate} disabled={busy} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {busy ? "Working…" : prompt ? "Re-run" : "Generate identity"}
      </button>
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}
      {prompt && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-ink-dim">Hyper-realism identity prompt</div>
          <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-dim">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}
