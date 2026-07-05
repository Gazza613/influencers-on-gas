"use client";

import { useRef, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import type { ShowcaseVideo } from "@/lib/showcase";
import Uploader, { capturePoster } from "@/components/Uploader";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

export default function ShowcaseManager({ token, initial }: { token: string; initial: ShowcaseVideo[] }) {
  const [videos, setVideos] = useState<ShowcaseVideo[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [upTitle, setUpTitle] = useState("");
  const [upBusy, setUpBusy] = useState(false);

  // Add a manually-uploaded external reel (brag work not produced on the platform). It goes straight
  // onto the wall, tagged "Uploaded".
  async function addExternal(url: string, posterUrl?: string) {
    setUpBusy(true);
    const r = await fetch("/api/showcase/upload", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, poster_url: posterUrl || "", title: upTitle.trim() }),
    }).then((x) => x.json()).catch(() => null);
    setUpBusy(false);
    if (r?.video) { setVideos((vs) => [r.video, ...vs]); setUpTitle(""); }
  }

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
    if (!(await askConfirm({ title: "Remove this cut from the showcase?", body: "It'll disappear from the reel. You can re-publish it from the Producer's showreel step.", tone: "danger", confirmLabel: "Remove" }))) return;
    setBusy(id);
    const r = await fetch("/api/showcase", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, remove: true }),
    }).catch(() => null);
    if (r?.ok) setVideos((vs) => vs.filter((v) => v.id !== id));
    setBusy(null);
  }

  // Drag-and-drop reorder of the on-reel videos (the order prospects see).
  const dragIdx = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  function reorder(from: number, to: number) {
    if (from === to) return;
    const on = videos.filter((v) => v.showcased);
    const off = videos.filter((v) => !v.showcased);
    const [moved] = on.splice(from, 1);
    on.splice(to, 0, moved);
    setVideos([...on, ...off]);
    fetch("/api/showcase", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: on.map((v) => v.id) }),
    }).catch(() => null);
  }

  // Regenerate the poster still for a video already on the wall: fetch it back, capture a bright frame,
  // upload it, and save. Needs the blob to be CORS-readable; falls back with a hint if not.
  async function regenPoster(v: ShowcaseVideo) {
    if (!v.final_video_url) return;
    setBusy(v.id);
    try {
      // Pull the video through our same-origin proxy so the canvas can read it (cross-origin blob
      // fetches are CORS-blocked for canvas pixel access).
      const res = await fetch(`/api/showcase/poster-source?url=${encodeURIComponent(v.final_video_url)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const file = new File([blob], "reel.mp4", { type: blob.type || "video/mp4" });
      const pb = await capturePoster(file);
      if (!pb) throw new Error("no frame");
      const pf = await blobUpload(`influencers/showreel-poster/regen-${v.id}.jpg`, pb, { access: "public", handleUploadUrl: "/api/upload", clientPayload: "showreel-poster" });
      await fetch("/api/showcase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id, poster_url: pf.url }) });
      setVideos((vs) => vs.map((x) => (x.id === v.id ? { ...x, poster_url: `${pf.url}?t=${Date.now()}` } : x)));
    } catch {
      flex("Couldn't read that video to make a thumbnail. Re-upload it instead and it'll get a fresh poster.");
    }
    setBusy(null);
  }

  // Rename a reel (the title shown under the video on the wall).
  async function rename(id: string, title: string) {
    setVideos((vs) => vs.map((v) => (v.id === id ? { ...v, title } : v))); // optimistic
    await fetch("/api/showcase", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    }).catch(() => null);
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

      {/* Upload an external brag reel (made elsewhere) straight onto the wall */}
      <div className="rounded-xl border border-line bg-surface-1 p-4">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Upload a showreel</div>
        <p className="mt-1 text-[12px] text-ink-dim">Add your best work made elsewhere - it goes onto the wall alongside platform cuts, tagged <span className="rounded bg-[#60a5fa]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#60a5fa]">Uploaded</span>.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px] text-[11px] text-ink-faint">Title / brand
            <input value={upTitle} onChange={(e) => setUpTitle(e.target.value)} placeholder="e.g. MTN MoMo - Launch reel" className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-[#a855f7]" />
          </label>
          <div className={upBusy ? "pointer-events-none opacity-60" : ""}><Uploader kind="showreel" accept="video" withPoster label={upBusy ? "Adding…" : "Choose video"} onUploaded={addExternal} /></div>
        </div>
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
            <div className="tabular mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ready">★ On the showreel · {onReel.length}
              {onReel.length > 1 && <span className="font-medium normal-case tracking-normal text-ink-faint">· drag to reorder</span>}
            </div>
            {onReel.length === 0
              ? <p className="text-sm text-ink-faint">Nothing on the showreel yet. Flag your best videos in from below.</p>
              : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{onReel.map((v, i) => (
                  <div
                    key={v.id}
                    draggable
                    onDragStart={(e) => { dragIdx.current = i; setDragging(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                    onDragEnd={() => { dragIdx.current = null; setDragging(null); }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={(e) => { e.preventDefault(); const from = dragIdx.current ?? Number(e.dataTransfer.getData("text/plain")); if (!Number.isNaN(from)) reorder(from, i); dragIdx.current = null; setDragging(null); }}
                    className={`group/drag relative cursor-grab rounded-xl transition active:cursor-grabbing ${dragging === i ? "opacity-50 ring-2 ring-[#a855f7]" : ""}`}
                  >
                    {/* Reorder controls - drag the card, OR use the arrows (always work, incl. touch) */}
                    <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
                      <button onClick={() => reorder(i, i - 1)} disabled={i === 0} title="Move earlier" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white backdrop-blur disabled:opacity-30 hover:bg-black/80">◀</button>
                      <button onClick={() => reorder(i, i + 1)} disabled={i === onReel.length - 1} title="Move later" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white backdrop-blur disabled:opacity-30 hover:bg-black/80">▶</button>
                      <span title="Drag to reorder" className="ml-0.5 flex h-7 items-center rounded-full bg-black/60 px-2 text-xs text-white/80 backdrop-blur">⠿</span>
                    </div>
                    <Card v={v} busy={busy === v.id} onToggle={toggle} onRemove={remove} onRename={rename} onRegen={regenPoster} reel />
                  </div>
                ))}</div>}
          </section>

          {/* Finished, not on the reel */}
          {offReel.length > 0 && (
            <section>
              <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Finished videos · {offReel.length}</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{offReel.map((v) => <Card key={v.id} v={v} busy={busy === v.id} onToggle={toggle} onRemove={remove} onRename={rename} onRegen={regenPoster} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Card({ v, busy, onToggle, onRemove, onRename, onRegen, reel = false }: { v: ShowcaseVideo; busy: boolean; onToggle: (id: string, on: boolean) => void; onRemove: (id: string) => void; onRename: (id: string, title: string) => void; onRegen: (v: ShowcaseVideo) => void; reel?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(v.title || "");
  function save() { setEditing(false); const t = name.trim(); if (t && t !== (v.title || "")) onRename(v.id, t); else setName(v.title || ""); }
  return (
    <div className={`overflow-hidden rounded-xl border bg-surface-1 ${reel ? "border-ready/30" : "border-line"}`}>
      {v.final_video_url
        ? <video
            src={v.final_video_url} poster={v.poster_url || undefined} controls playsInline draggable={false} preload="metadata"
            onLoadedMetadata={!v.poster_url ? (e) => { const el = e.currentTarget; el.currentTime = Math.min(2, (el.duration || 6) * 0.2); } : undefined}
            className="aspect-[9/16] max-h-[60vh] w-full bg-black object-contain"
          />
        : <div className="flex aspect-[9/16] w-full items-center justify-center bg-surface-2 text-xs text-ink-faint">No video</div>}
      <div className="flex items-center justify-between gap-2 p-3">
        {editing ? (
          <input
            autoFocus value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(v.title || ""); setEditing(false); } }}
            className="min-w-0 flex-1 rounded-md border border-[#a855f7] bg-surface-2 px-2 py-1 text-sm font-semibold text-ink outline-none"
            placeholder="Showreel name"
          />
        ) : (
          <button onClick={() => setEditing(true)} title="Click to rename" className="flex min-w-0 items-center gap-1.5 truncate text-left text-sm font-semibold text-ink hover:text-accent">
            {v.external && <span className="shrink-0 rounded bg-[#60a5fa]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#60a5fa]">Uploaded</span>}
            <span className="truncate">{v.title || "Untitled production"}</span>
            <span className="shrink-0 text-[11px] text-ink-faint">✎</span>
          </button>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => onRegen(v)} disabled={busy} title="Regenerate thumbnail" className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-ink-dim hover:text-accent disabled:opacity-50">↻🖼</button>
          <button
            onClick={() => (reel ? onRemove(v.id) : onToggle(v.id, true))}
            disabled={busy}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${reel ? "border border-line text-ink-dim hover:border-alert/50 hover:text-alert" : "btn-brand"}`}
          >
            {busy ? "…" : reel ? "Remove" : "★ Add to showcase"}
          </button>
        </div>
      </div>
    </div>
  );
}
