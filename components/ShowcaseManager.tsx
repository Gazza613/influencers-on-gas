"use client";

import { useState } from "react";
import type { ShowcaseVideo } from "@/lib/showcase";

export default function ShowcaseManager({ token, initial }: { token: string; initial: ShowcaseVideo[] }) {
  const [videos, setVideos] = useState<ShowcaseVideo[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/s/${token}` : `/s/${token}`;
  const onReel = videos.filter((v) => v.showcased);
  const offReel = videos.filter((v) => !v.showcased);

  async function toggle(id: string, on: boolean) {
    setBusy(id);
    const r = await fetch("/api/showcase", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, showcased: on }),
    }).catch(() => null);
    if (r?.ok) setVideos((vs) => vs.map((v) => (v.id === id ? { ...v, showcased: on } : v)));
    setBusy(null);
  }
  // Remove = delete the cut entirely so it disappears (re-publish from the Producer's showreel step).
  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Remove this cut from the showcase? It'll disappear from the reel. You can re-publish it from the Producer's showreel step.")) return;
    setBusy(id);
    const r = await fetch("/api/showcase", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, remove: true }),
    }).catch(() => null);
    if (r?.ok) setVideos((vs) => vs.filter((v) => v.id !== id));
    setBusy(null);
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Showcase</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Your public brag wall of finished influencer videos. Flag the best productions in, then share the
          link with prospects. They can watch without logging in.
        </p>
      </div>

      {/* Public share link */}
      <div className="rounded-xl border border-[#a855f7]/25 bg-[#a855f7]/8 p-4">
        <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">Public share link</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="tabular flex-1 truncate rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink">{publicUrl}</code>
          <button onClick={copyLink} className="btn-brand shrink-0 rounded-lg px-4 py-2 text-sm font-bold">{copied ? "Copied" : "Copy link"}</button>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-dim hover:text-ink">Preview</a>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">Anyone with this link can view the showcase. Only videos you flag in are shown.</p>
      </div>

      {videos.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-1 p-8 text-center">
          <div className="text-3xl">🎬</div>
          <p className="mt-3 text-sm text-ink">No finished videos yet.</p>
          <p className="mt-1 text-sm text-ink-faint">
            Once the video production pipeline ships and you complete a production, it appears here ready to
            flag into the showcase.
          </p>
        </div>
      ) : (
        <>
          {/* On the showreel */}
          <section>
            <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ready">★ On the showreel · {onReel.length}</div>
            {onReel.length === 0
              ? <p className="text-sm text-ink-faint">Nothing on the showreel yet. Flag your best videos in from below.</p>
              : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{onReel.map((v) => <Card key={v.id} v={v} busy={busy === v.id} onToggle={toggle} onRemove={remove} reel />)}</div>}
          </section>

          {/* Finished, not on the reel */}
          {offReel.length > 0 && (
            <section>
              <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Finished videos · {offReel.length}</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{offReel.map((v) => <Card key={v.id} v={v} busy={busy === v.id} onToggle={toggle} onRemove={remove} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Card({ v, busy, onToggle, onRemove, reel = false }: { v: ShowcaseVideo; busy: boolean; onToggle: (id: string, on: boolean) => void; onRemove: (id: string) => void; reel?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-surface-1 ${reel ? "border-ready/30" : "border-line"}`}>
      {v.final_video_url
        ? <video src={v.final_video_url} controls playsInline className="aspect-[9/16] max-h-[60vh] w-full bg-black object-contain" />
        : <div className="flex aspect-[9/16] w-full items-center justify-center bg-surface-2 text-xs text-ink-faint">No video</div>}
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="truncate text-sm font-semibold text-ink">{v.title || "Untitled production"}</span>
        <button
          onClick={() => (reel ? onRemove(v.id) : onToggle(v.id, true))}
          disabled={busy}
          className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${reel ? "border border-line text-ink-dim hover:border-alert/50 hover:text-alert" : "btn-brand"}`}
        >
          {busy ? "…" : reel ? "Remove" : "★ Add to showcase"}
        </button>
      </div>
    </div>
  );
}
