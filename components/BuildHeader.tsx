"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Init = {
  status: string;
  candidates: number;
  frames: number;
  hasReference: boolean;
  locked: boolean;
  faceUrl: string | null;
  creatives: number;
  voiceApproved: boolean;
  videoDone: boolean;
};

const BUILDING = new Set(["casting", "generating", "training", "ready"]);

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Live running build cost chip with a traffic-light signal. The amber/red thresholds are tied to
// the team's per-build TARGET (set in Cost Control), not a hardcoded number: amber past 60% of the
// target, red at/over it. With no target set it falls back to sensible fixed thresholds.
function RunningCost({ name, cents, budgetCents }: { name: string; cents: number; budgetCents: number | null }) {
  const amberAt = budgetCents ? budgetCents * 0.6 : 50000;
  const redAt = budgetCents ? budgetCents : 100000;
  const tier = cents >= redAt ? "red" : cents >= amberAt ? "amber" : "green";
  const styles: Record<string, string> = {
    green: "border-ready/40 bg-ready/10 text-ready",
    amber: "border-active/50 bg-active/10 text-active",
    red: "border-alert/50 bg-alert/12 text-alert",
  };
  const title = budgetCents
    ? `${rand(cents)} of ${rand(budgetCents)} build target - open Cost Control`
    : "Open Cost Control (set a per-build target here)";
  return (
    <Link href="/cost-control" title={title}
      className={`tabular ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${styles[tier]} ${tier === "red" ? "pulse-alert" : ""}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tier === "red" ? "bg-alert" : tier === "amber" ? "bg-active" : "bg-ready"}`} />
      {name} running build cost <span className="ml-0.5">{rand(cents)}</span>
      {budgetCents ? <span className="text-ink-faint">/ {rand(budgetCents)}</span> : null}
    </Link>
  );
}

// Live header for the 3-step build journey: avatar, name, "influencer" tag, a
// glowing realtime "building" tag, and the step tabs (each a real page).
export default function BuildHeader({
  id, name, mode, consentId, initial,
}: { id: string; name: string; mode: string; consentId: string | null; initial: Init }) {
  const pathname = usePathname();
  const [s, setS] = useState(initial);
  const [spendCents, setSpendCents] = useState<number | null>(null);
  const [budgetCents, setBudgetCents] = useState<number | null>(null);

  // The team's per-build target (set in Cost Control) - drives the cost chip's amber/red thresholds.
  useEffect(() => {
    fetch("/api/cost-control/budget", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (typeof d?.perBuildCents === "number" && d.perBuildCents > 0) setBudgetCents(d.perBuildCents); })
      .catch(() => {});
  }, []);

  // Poll status + running build cost while jobs run.
  const stop = useRef(false);
  useEffect(() => {
    stop.current = false;
    let t: ReturnType<typeof setTimeout>;
    async function tick() {
      const [r, c] = await Promise.all([
        fetch(`/api/influencers/${id}`, { cache: "no-store" }).catch(() => null),
        fetch(`/api/usage?influencerId=${id}`, { cache: "no-store" }).catch(() => null),
      ]);
      if (r?.ok) {
        const inf = (await r.json()).influencer;
        const persona = inf.persona ?? {};
        const refs = Array.isArray(inf.look_refs) ? inf.look_refs : [];
        const face = persona.hero_realism_url || refs.find((x: { hero?: boolean }) => x.hero)?.url || refs[0]?.url || persona.hero_url || persona.reference_url || null;
        setS({
          status: inf.status,
          candidates: Array.isArray(persona.candidates) ? persona.candidates.length : 0,
          frames: refs.length,
          hasReference: !!persona.reference_url,
          locked: !!persona.locked,
          faceUrl: face,
          creatives: Array.isArray(persona.creatives) ? persona.creatives.length : 0,
          voiceApproved: Array.isArray((persona.production as { wizard_approved?: string[] })?.wizard_approved) && (persona.production as { wizard_approved?: string[] }).wizard_approved!.includes("voice"),
          videoDone: !!(persona.production as { final_url?: string | null })?.final_url,
        });
      }
      if (c?.ok) { const d = await c.json(); setSpendCents(d.influencer?.cents ?? 0); }
      if (!stop.current) t = setTimeout(tick, 6000);
    }
    tick();
    return () => { stop.current = true; clearTimeout(t); };
  }, [id]);

  const building = !s.locked && BUILDING.has(s.status);
  // Honest completion: step 1 ("Build my influencer") is done when a real identity look is CHOSEN
  // (a reference set / kept frames / locked) - NOT merely when audition candidates were generated.
  const step1Done = s.hasReference || s.frames > 0 || s.locked;
  const step2Done = s.frames > 1 || s.locked;
  const base = `/setup/influencers/${id}`;
  // ALL SIX stages are shown from step one so a new user sees the whole arc (the video-making half
  // included), with the post-lock stages LOCKED (not navigable) until the identity is locked. One
  // continuous 1..6 spine - no more ①②③ then ✦🎙️🎬 numbering break.
  const videoLocked = !s.locked;
  const creativesDone = s.creatives > 0;
  const onBuild = pathname.endsWith("/producer") || pathname.endsWith("/voice");
  const tabs: { href: string; label: string; done: boolean; warn?: boolean; locked: boolean; match: (p: string) => boolean }[] = [
    { href: base, label: "Build my influencer", done: step1Done, locked: false, match: (p: string) => p === base },
    { href: `${base}/photoshoot`, label: "Photoshoot", done: step2Done, locked: false, match: (p: string) => p.endsWith("/photoshoot") },
    { href: `${base}/lockdown`, label: "Lock down", done: s.locked, locked: false, match: (p: string) => p.endsWith("/lockdown") },
    { href: `${base}/creatives`, label: "Wardrobe & Set", done: creativesDone, warn: !videoLocked && !creativesDone && onBuild, locked: videoLocked, match: (p: string) => p.endsWith("/creatives") },
    { href: `${base}/voice`, label: "Script & Voice", done: s.voiceApproved, locked: videoLocked, match: (p: string) => p.endsWith("/voice") },
    { href: `${base}/producer`, label: "The Final Cut", done: s.videoDone, warn: !videoLocked && !s.voiceApproved && pathname.endsWith("/producer"), locked: videoLocked, match: (p: string) => p.endsWith("/producer") },
  ];

  return (
    <div>
      <Link href="/setup/influencers" className="text-xs text-ink-dim hover:text-ink">← Influencers</Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {s.faceUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.faceUrl} alt={name} className="h-12 w-12 rounded-full border border-line object-cover" />
        )}
        <h1 className="text-xl font-bold">{name}</h1>
        <span className="tabular rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: "linear-gradient(135deg,#ec4899,#a855f7 55%,#60a5fa)", boxShadow: "0 0 14px rgba(168,85,247,0.45)" }}>
          {mode === "twin" ? "✦ digital twin" : "✦ influencer"}
        </span>
        {mode === "twin" && (
          <span className={`tabular rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${consentId ? "bg-ready/15 text-ready" : "bg-alert/15 text-alert"}`}>
            {consentId ? "consent ✓" : "consent missing"}
          </span>
        )}
        {s.locked ? (
          <span className="tabular rounded-full bg-ready/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ready">🔒 Locked · ready</span>
        ) : building ? (
          <span className="live-building tabular flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ready" /> Building live
          </span>
        ) : null}

        {/* Running build cost for THIS influencer - green < R500, orange < R1000, red beyond (pulsing). */}
        {spendCents != null && <RunningCost name={name} cents={spendCents} budgetCents={budgetCents} />}
      </div>

      {/* Step tabs - all 6 stages as one continuous "Step N of 6" spine. Locked stages (the video half,
          before the identity is locked) render as non-navigable, so the whole arc is visible from day one. */}
      <div className="mt-4 -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t, i) => {
          const active = t.match(pathname);
          const n = i + 1;
          // The little leading badge: locked 🔒 · done ✓ · warn ? · otherwise the step number.
          const badge = t.locked ? "🔒" : active ? n : t.done ? "✓" : t.warn ? "?" : n;
          const cls = `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
            active ? "step-active border-[#a855f7] bg-[#a855f7]/15 font-bold text-[#c79bff]"
            : t.locked ? "cursor-not-allowed border-line/60 bg-surface-1/40 text-ink-faint/60"
            : t.done ? "border-ready/40 bg-ready/10 text-ready"
            : t.warn ? "border-active/50 bg-active/10 text-active"
            : "border-line text-ink-faint hover:border-line-strong hover:text-ink-dim"
          }`;
          const inner = (
            <>
              <span className="tabular flex h-4 w-4 items-center justify-center rounded-full bg-black/20 text-[10px] font-bold">{badge}</span>
              <span className="font-semibold">{t.label}</span>
            </>
          );
          if (t.locked) {
            return (
              <div key={t.href} className={cls} aria-disabled="true" title="Unlocks once you lock down the identity (step 3)">{inner}</div>
            );
          }
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              aria-label={`Step ${n} of ${tabs.length}: ${t.label}`} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
