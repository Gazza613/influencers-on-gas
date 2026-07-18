"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { flex } from "@/lib/flex";

// THE WAY BACK (Gary: "if i want to revert to the previous and i am not sattisfied then i should be able to").
//
// The whole point of this control is that changing the front door never needs a deploy or a developer. One
// switch turns all the artwork off and restores the original mark-and-colour tiles instantly; per-tile you
// can upload your own image or hand the tile back to the auto-pull. Same principle as the rate card and the
// subscriptions: the thing you will want to change lives in the database, not in the code.
//
// Deliberately understated and super-admin only. It sits at the foot of the dashboard as a quiet line, not a
// settings panel competing with the six tiles the page exists to present.

const TILES: { key: string; label: string; auto: string }[] = [
  { key: "influencers", label: "Influencers on GAS", auto: "newest cast member" },
  { key: "creatives", label: "Creatives on GAS", auto: "latest funnel creative" },
  { key: "journalist", label: "The Journalist", auto: "latest CEO creative" },
  { key: "strategist", label: "The Strategist", auto: "no artwork of its own" },
  { key: "media", label: "Media on GAS", auto: "no artwork of its own" },
  { key: "psi", label: "PSI on GAS", auto: "no artwork of its own" },
];

export default function TileArtControls() {
  const [me, setMe] = useState<{ role?: string } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [art, setArt] = useState<Record<string, { url: string; source: string }>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : { user: null })).then((d) => setMe(d.user)).catch(() => {});
    load();
  }, []);

  async function load() {
    const d = await fetch("/api/dashboard/tile-art", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d) { setArt(d.art || {}); setEnabled(d.enabled !== false); }
  }

  if (me?.role !== "super_admin") return null;

  async function toggle() {
    setBusy("toggle");
    const next = !enabled;
    const r = await fetch("/api/dashboard/tile-art", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }),
    }).catch(() => null);
    setBusy("");
    if (r?.ok) { setEnabled(next); flex(next ? "Artwork on. Refreshing the tiles." : "Artwork off. Back to the original tiles."); setTimeout(() => window.location.reload(), 700); }
    else flex("Could not change that.");
  }

  async function pick(tileKey: string, file: File | null) {
    if (!file) return;
    setBusy(tileKey);
    try {
      const blob = await upload(`dashboard/${tileKey}-${file.name}`, file, { access: "public", handleUploadUrl: "/api/brains/blob-upload" });
      const r = await fetch("/api/dashboard/tile-art", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tile: tileKey, url: blob.url }),
      }).catch(() => null);
      if (r?.ok) { flex("Set. Refreshing the tiles."); setTimeout(() => window.location.reload(), 700); }
      else flex("Could not set that image.");
    } catch (e) {
      flex(String((e as Error)?.message || e).slice(0, 90));
    }
    setBusy("");
  }

  async function reset(tileKey: string) {
    setBusy(tileKey);
    const r = await fetch("/api/dashboard/tile-art", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tile: tileKey, url: null }),
    }).catch(() => null);
    setBusy("");
    if (r?.ok) { flex("Back to the automatic pick. Refreshing."); setTimeout(() => window.location.reload(), 700); }
  }

  return (
    <div className="relative z-10 mx-auto mt-10 w-full max-w-6xl px-6 pb-10">
      <div className="flex flex-wrap items-center justify-center gap-4 text-[13px]">
        <button onClick={() => setOpen((o) => !o)} className="text-ink-faint transition hover:text-ink-dim">
          {open ? "Hide tile artwork settings" : "Tile artwork"}
        </button>
        <button onClick={toggle} disabled={busy === "toggle"}
          className={`rounded-full border px-3 py-1 font-semibold transition disabled:opacity-50 ${enabled ? "border-[#a855f7]/40 text-[#c79bff]" : "border-line text-ink-faint hover:text-ink-dim"}`}>
          {enabled ? "On" : "Off"}
        </button>
      </div>

      {open && (
        <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-line bg-surface-1/70 p-5 backdrop-blur">
          <p className="text-[13px] text-ink-dim">
            Each tile shows the newest real thing that desk has made, so it stays current on its own. Upload your
            own image to override one, or reset it to go back to the automatic pick. The switch above turns all
            of it off and restores the original tiles.
          </p>
          <div className="mt-4 space-y-2">
            {TILES.map((t) => {
              const current = art[t.key];
              const overridden = current?.source === "Your upload";
              return (
                <div key={t.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {current
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={current.url} alt="" className="h-9 w-14 shrink-0 rounded border border-line object-cover" />
                      : <span className="h-9 w-14 shrink-0 rounded border border-dashed border-line" />}
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-ink">{t.label}</div>
                      <div className="truncate text-[12px] text-ink-faint">{current ? current.source : t.auto}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="cursor-pointer rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-dim hover:text-ink">
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { pick(t.key, e.target.files?.[0] ?? null); e.target.value = ""; }} disabled={busy === t.key} />
                      {busy === t.key ? "Working…" : "Upload"}
                    </label>
                    {overridden && (
                      <button onClick={() => reset(t.key)} disabled={busy === t.key}
                        className="rounded-md px-2 py-1 text-[12px] font-semibold text-ink-faint hover:text-ink">Reset</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
