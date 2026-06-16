"use client";

import { useEffect, useRef, useState } from "react";
import Lightbox from "@/components/Lightbox";

type Creative = { url: string; ratio: string; resolution: string; scene: string; at: number };
type Rates = { image: { credits: number; cents: number }; upscale: { credits: number; cents: number } };

const RATIOS = [
  { key: "9:16", label: "9:16", sub: "Reels · Stories · TikTok" },
  { key: "1:1", label: "1:1", sub: "Feeds · LinkedIn" },
  { key: "16:9", label: "16:9", sub: "YouTube · Google · LinkedIn" },
];
const PLATFORMS: { key: string; label: string; ratios: string[] }[] = [
  { key: "instagram", label: "Instagram", ratios: ["9:16", "1:1"] },
  { key: "facebook", label: "Facebook", ratios: ["9:16", "1:1"] },
  { key: "tiktok", label: "TikTok", ratios: ["9:16"] },
  { key: "linkedin", label: "LinkedIn", ratios: ["1:1", "16:9"] },
  { key: "google", label: "Google Ads", ratios: ["16:9", "1:1"] },
];
const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QUIPS = ["Art-directing your creative…", "Framing for each format…", "Dialling in the light…", "Rendering social-ready shots…"];

export default function CreativesStudio({ influencerId, initial }: { influencerId: string; initial: { creatives: Creative[]; status: string } }) {
  const [ratios, setRatios] = useState<Set<string>>(new Set(["9:16", "1:1"]));
  const [res, setRes] = useState<"2k" | "4k">("2k");
  const [scene, setScene] = useState("");
  const [rates, setRates] = useState<Rates | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>(initial.creatives || []);
  const [status, setStatus] = useState(initial.status || "idle");
  const [err, setErr] = useState("");
  const [quip, setQuip] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);

  const running = status === "running";

  useEffect(() => {
    fetch(`/api/influencers/${influencerId}/creatives`).then((r) => r.json()).then((d) => { if (d.rates) setRates(d.rates); }).catch(() => {});
  }, [influencerId]);

  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) { tick.current = setInterval(() => setQuip((q) => (q + 1) % QUIPS.length), 3000); return () => { if (tick.current) clearInterval(tick.current); }; }
    setQuip(0);
  }, [running]);

  async function poll(tries = 0): Promise<void> {
    if (tries > 120) return;
    await new Promise((r) => setTimeout(r, 5000));
    const d = await fetch(`/api/influencers/${influencerId}/creatives`).then((r) => r.json()).catch(() => null);
    if (d) {
      setCreatives(d.creatives || []);
      setStatus(d.status || "idle");
      if (d.status === "failed") { setErr(d.error || "Render failed"); return; }
      if (d.status === "done") return;
    }
    return poll(tries + 1);
  }

  function toggleRatio(k: string) { setRatios((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function applyPlatform(p: { ratios: string[] }) { setRatios((s) => { const n = new Set(s); p.ratios.forEach((r) => n.add(r)); return n; }); }

  const n = ratios.size;
  const estCents = rates ? n * (rates.image.cents + (res === "4k" ? rates.upscale.cents : 0)) : 0;
  const estCredits = rates ? n * (rates.image.credits + (res === "4k" ? rates.upscale.credits : 0)) : 0;

  async function generate() {
    if (!n || running) return;
    setErr(""); setStatus("running");
    const r = await fetch(`/api/influencers/${influencerId}/creatives`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ratios: [...ratios], resolution: res, scene }),
    });
    if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error || "Could not start"); setStatus("idle"); return; }
    poll();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">Creatives · social outputs</div>
        <p className="mt-2 text-sm text-ink-dim">
          Render social-ready stills of this locked influencer. Pick the platforms or formats, choose the resolution,
          and we generate one art-directed image per format. Videos will use this same picker.
        </p>

        {/* Platforms */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Quick platform presets</div>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button key={p.key} onClick={() => applyPlatform(p)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-[#a855f7]/60 hover:text-[#c79bff]">
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Formats */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Formats</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RATIOS.map((r) => {
              const on = ratios.has(r.key);
              return (
                <button key={r.key} onClick={() => toggleRatio(r.key)} className={`rounded-lg border px-3 py-2 text-left transition ${on ? "border-[#a855f7] bg-[#a855f7]/12" : "border-line hover:border-line-strong"}`}>
                  <div className={`text-sm font-bold ${on ? "text-[#c79bff]" : "text-ink-dim"}`}>{r.label} {on && "✓"}</div>
                  <div className="text-[10px] text-ink-faint">{r.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Resolution */}
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Resolution</div>
            <div className="flex gap-2">
              {(["2k", "4k"] as const).map((q) => (
                <button key={q} onClick={() => setRes(q)} className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${res === q ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>
                  {q === "2k" ? "Standard 2K" : "Premium 4K"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-ink-faint">{res === "4k" ? "4K upscales each image (sharper, costs a little more)." : "2K is crisp for feeds, stories and reels."}</p>
        </div>

        {/* Scene */}
        <div className="mt-4">
          <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Scene / brief (optional)</div>
          <textarea value={scene} onChange={(e) => setScene(e.target.value)} rows={2}
            placeholder="e.g. holding a takeaway coffee on a city street at golden hour, smiling at camera"
            className="glow-accent w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink outline-none" />
        </div>

        {/* Cost + generate */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={generate} disabled={!n || running} className="btn-brand rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-50">
            {running ? "Rendering…" : `✨ Generate ${n} creative${n === 1 ? "" : "s"}`}
          </button>
          {rates && n > 0 && (
            <span className="tabular text-xs text-ink-dim">
              ≈ <span className="text-ink">{rand(estCents)}</span>{estCredits > 0 && <span className="text-ink-faint"> · {estCredits} credits</span>} for {n} image{n === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {err && <p className="mt-2 text-xs text-alert">{err}</p>}

        {running && (
          <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex items-center gap-2 text-xs text-ink"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#a855f7]" />{QUIPS[quip]}</div>
            <p className="mt-2 text-[11px] text-ink-faint">Each format renders independently. They appear below as they land.</p>
          </div>
        )}
      </div>

      {/* Gallery */}
      {creatives.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-1 p-5">
          <div className="tabular mb-3 text-[10px] uppercase tracking-[0.25em] text-ink-faint">Your creatives</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {creatives.map((c, i) => (
              <div key={i} className="group relative cursor-pointer overflow-hidden rounded-lg border border-line" onClick={() => setZoom(c.url)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={c.scene} className="aspect-square w-full object-cover" />
                <div className="absolute left-1.5 top-1.5 flex gap-1">
                  <span className="tabular rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white">{c.ratio}</span>
                  <span className="tabular rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">{c.resolution}</span>
                </div>
                <span className="absolute bottom-1.5 right-1.5 hidden rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white group-hover:block">⤢ open</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {zoom && <Lightbox url={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
