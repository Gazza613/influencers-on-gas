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
};

const BUILDING = new Set(["casting", "generating", "training", "ready"]);

const rand = (cents: number) => "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Live running build cost chip with a traffic-light signal.
function RunningCost({ name, cents }: { name: string; cents: number }) {
  const tier = cents > 100000 ? "red" : cents >= 50000 ? "amber" : "green";
  const styles: Record<string, string> = {
    green: "border-ready/40 bg-ready/10 text-ready",
    amber: "border-active/50 bg-active/10 text-active",
    red: "border-alert/50 bg-alert/12 text-alert",
  };
  return (
    <Link href="/cost-control" title="Open Cost Control"
      className={`tabular ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${styles[tier]} ${tier === "red" ? "pulse-alert" : ""}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tier === "red" ? "bg-alert" : tier === "amber" ? "bg-active" : "bg-ready"}`} />
      {name} running build cost <span className="ml-0.5">{rand(cents)}</span>
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
        });
      }
      if (c?.ok) { const d = await c.json(); setSpendCents(d.influencer?.cents ?? 0); }
      if (!stop.current) t = setTimeout(tick, 6000);
    }
    tick();
    return () => { stop.current = true; clearTimeout(t); };
  }, [id]);

  const building = !s.locked && BUILDING.has(s.status);
  const step1Done = s.candidates > 0 || s.frames > 0 || s.hasReference || s.locked;
  const step2Done = s.frames > 1 || s.locked;
  const base = `/setup/influencers/${id}`;
  const tabs = [
    { href: base, label: "Build my influencer", icon: "①", done: step1Done, match: (p: string) => p === base },
    { href: `${base}/photoshoot`, label: "Photoshoot", icon: "②", done: step2Done, match: (p: string) => p.endsWith("/photoshoot") },
    { href: `${base}/lockdown`, label: "Lock down", icon: "③", done: s.locked, match: (p: string) => p.endsWith("/lockdown") },
  ];
  // Creatives unlocks once the identity is locked (social outputs).
  if (s.locked) tabs.push({ href: `${base}/creatives`, label: "Creatives", icon: "✦", done: false, match: (p: string) => p.endsWith("/creatives") });

  return (
    <div>
      <Link href="/setup/influencers" className="text-xs text-ink-dim hover:text-ink">← Influencers</Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {s.faceUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.faceUrl} alt={name} className="h-12 w-12 rounded-full border border-line object-cover" />
        )}
        <h1 className="text-xl font-bold">{name}</h1>
        <span className="tabular rounded bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
          {mode === "twin" ? "digital twin" : "influencer"}
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

        {/* Running build cost for THIS influencer — green < R500, orange < R1000, red beyond (pulsing). */}
        {spendCents != null && <RunningCost name={name} cents={spendCents} />}
      </div>

      {/* Step tabs — real pages */}
      <div className="mt-4 -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link key={t.href} href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                active ? "step-active border-[#a855f7] bg-[#a855f7]/15 font-bold text-[#c79bff]"
                : t.done ? "border-ready/40 bg-ready/10 text-ready"
                : "border-line text-ink-faint hover:border-line-strong hover:text-ink-dim"
              }`}>
              <span>{t.done && !active ? "✓" : t.icon}</span>
              <span className="font-semibold">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
