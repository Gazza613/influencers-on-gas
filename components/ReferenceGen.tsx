"use client";

import { useState } from "react";

type Ref = { url: string };

export default function ReferenceGen({
  influencerId,
  status,
  identityPrompt,
  lookRefs,
}: {
  influencerId: string;
  status: string;
  identityPrompt: string | null;
  lookRefs: Ref[];
}) {
  const [st, setSt] = useState(status);
  const [prompt, setPrompt] = useState(identityPrompt);
  const [frames, setFrames] = useState<Ref[]>(lookRefs || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function poll(tries = 0): Promise<void> {
    if (tries > 50) { setBusy(false); return; }
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(`/api/influencers/${influencerId}`, { cache: "no-store" });
    if (r.ok) {
      const inf = (await r.json()).influencer;
      setSt(inf.status);
      if (inf.persona?.identity_prompt) setPrompt(inf.persona.identity_prompt);
      if (Array.isArray(inf.look_refs) && inf.look_refs.length) setFrames(inf.look_refs);
      if (inf.status === "frames_ready" || inf.status === "gen_failed") {
        if (inf.status === "gen_failed") setErr(inf.persona?.gen_error || "Generation failed");
        setBusy(false);
        return;
      }
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
        <span className={`text-xs ${st === "frames_ready" ? "text-ready" : st === "gen_failed" ? "text-alert" : "text-active"}`}>{st}</span>
      </div>
      <p className="mt-2 text-xs text-ink-dim">
        Generates reference frames from the hyper-realism identity prompt. Pick the best, then
        train the identity (next). Takes ~30–90s.
      </p>
      <button onClick={generate} disabled={busy} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {busy ? "Generating…" : frames.length ? "Re-generate" : "Generate reference frames"}
      </button>
      {err && <p className="mt-2 text-xs text-alert">{err}</p>}

      {frames.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {frames.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={f.url} alt={`reference ${i + 1}`} className="aspect-[9/16] w-full rounded-lg border border-line object-cover" />
          ))}
        </div>
      )}

      {prompt && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11px] font-semibold text-ink-dim">Hyper-realism identity prompt</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-dim">
            {prompt}
          </pre>
        </details>
      )}
    </div>
  );
}
