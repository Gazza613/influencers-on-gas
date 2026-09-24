"use client";

import { useEffect, useRef, useState } from "react";
import DoorAtmosphere from "./DoorAtmosphere";
import { TEAM, TEAM_ABOUT_URL } from "@/lib/team";

// THE LANDING DOOR (Gary, approved 2026-09-24 after ~30 rounds on the dummy). One screen, no scroll, on any device:
//   - the official Agency of NOW lockup as the mark, with a soft settle-in, a slow float and one light sweep;
//   - a typewriter of six call-outs, one per part of the studio, each typed out whole;
//   - three flex pills (AI agents / AI Brains / Pods) as the way in - all go to login (or the dashboard when signed in);
//   - the TEAM as the atmosphere: one slow cascade of the thirteen down each flank (where the digit rain sits on the
//     Media on GAS door), out of step left to right, every card a quiet link to the About page. On a phone the flanks
//     cannot fit, so the cascade becomes a small strip along the foot.
// The numbers are LIVE: the page passes them in from POD_AGENTS and the database, so the flex never goes stale.

// THE SEVEN CALL-OUTS (Gary, 2026-09-24): one per part of the studio, in the order a client is walked through it. Each
// line types out whole, pauses, clears, and the next follows. The last word of each carries the orange.
const LINES = [
  "Research That Verifies",
  "Strategy Before Spend",
  "A Brain For Every Brand",
  "Creative Excellence At Scale",
  "AI Influencers Built Here",
  "Enquiries Scored For Intent",
  "Metrics That Really Matter",
];
const TYPE_SPEED = 58;
const DELETE_SPEED = 28;
const PAUSE_MS = 2400;

function useTypewriter(enabled: boolean) {
  const [idx, setIdx] = useState(0);
  const full = LINES[idx];
  const [n, setN] = useState(full.length);
  const [phase, setPhase] = useState<"typing" | "deleting">("deleting");
  useEffect(() => {
    if (!enabled) return;
    if (phase === "typing") {
      if (n < full.length) { const t = setTimeout(() => setN(n + 1), TYPE_SPEED); return () => clearTimeout(t); }
      const t = setTimeout(() => setPhase("deleting"), PAUSE_MS); return () => clearTimeout(t);
    }
    if (n > 0) { const t = setTimeout(() => setN(n - 1), DELETE_SPEED); return () => clearTimeout(t); }
    setIdx((i) => (i + 1) % LINES.length);
    setPhase("typing");
  }, [enabled, n, phase, full.length]);
  const typed = full.slice(0, n);
  const split = full.lastIndexOf(" ") + 1; // the last word is the orange one
  return { lead: typed.slice(0, split), word: typed.slice(split), full };
}

// The svg icons for the three pills (lucide-style strokes).
const ICON_AGENTS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /></svg>;
const ICON_BRAINS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4a4 4 0 0 0-4 4v8a4 4 0 0 0 8 0V8a4 4 0 0 0-4-4z" /><path d="M12 4v16" /><path d="M8 9H5M8 15H5M19 9h-3M19 15h-3" /></svg>;
const ICON_PODS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
const ICON_PLAY = <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>;

function Card({ m }: { m: (typeof TEAM)[number] }) {
  return (
    <a className="door-card" href={TEAM_ABOUT_URL} target="_blank" rel="noopener" title={`${m.name}, ${m.role}. About GAS`} aria-label={`${m.name}, ${m.role}. About GAS`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/team/${m.slug}.jpg`} width={600} height={1067} alt={`${m.name}, ${m.role}`} decoding="async" fetchPriority="low" />
    </a>
  );
}

// One column of the cascade: the team from `start`, twice, so the fall loops seamlessly. The exact pixel height of
// one set is measured and handed to the animation (a percentage of the column landed a gap short and snapped).
function Column({ start, slow }: { start: number; slow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const order = [...TEAM.slice(start), ...TEAM.slice(0, start)];
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const n = el.children.length / 2;
      const set = (el.children[n] as HTMLElement).offsetTop - (el.children[0] as HTMLElement).offsetTop;
      el.style.setProperty("--set", `${set}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("load", measure); };
  }, []);
  return (
    <div ref={ref} className={`door-col${slow ? " door-col-slow" : ""}`}>
      {order.map((m, i) => <Card key={`a-${i}`} m={m} />)}
      {order.map((m, i) => <Card key={`b-${i}`} m={m} />)}
    </div>
  );
}

export default function LandingDoor({ agents, brains, pods, signedIn }: { agents: number; brains: number; pods: number; signedIn: boolean }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  const { lead, word, full } = useTypewriter(!reduced);
  // THE WORD SLOT is sized to the WHOLE word being typed (an invisible copy), so nothing moves while a word types
  // and deletes; when the next word arrives the slot eases to its width instead of snapping. The row itself has a
  // fixed height, so the mark above it never moves either.
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [slotW, setSlotW] = useState<number | undefined>(undefined);
  useEffect(() => {
    const m = () => { if (sizerRef.current) setSlotW(sizerRef.current.offsetWidth); };
    m(); window.addEventListener("resize", m); return () => window.removeEventListener("resize", m);
  }, [full]);
  const href = signedIn ? "/dashboard" : "/login";
  const pill = (n: number, label: string, icon: React.ReactNode, hue: string) => (
    <a className="door-pill" href={href} style={{ ["--a" as string]: hue }} aria-label={`${n} ${label}. ${signedIn ? "Enter the Agency" : "Sign in"}`}>
      <span className="door-pill-ic" aria-hidden>{icon}</span>
      <span className="door-pill-n tabular">{n}</span>
      <span className="door-pill-l">{label}</span>
      <span className="door-pill-play" aria-hidden>{ICON_PLAY}</span>
    </a>
  );

  return (
    <section className="door" aria-label="The Agency of NOW">
      <DoorAtmosphere />

      <div className="door-cascade door-cascade-l" aria-label="The GAS team">
        <Column start={0} />
      </div>

      <div className="door-inner">
        <div className="door-msg">
          <div className="door-mark">
            <span className="door-bloom" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="door-lockup" src="/agency-of-now.png" width={1600} height={769} fetchPriority="high" decoding="async" alt="The Agency of NOW. Human Command. AI Execution." />
            <span className="door-sweep" aria-hidden />
          </div>
          {/* One line (Gary): "Create Your" and the typed word together, centred as one and re-centring smoothly as
              the word types and deletes (a fixed-width slot jumped on the longer words and sat off-centre on the
              short ones). */}
          <h1 className="door-h1" aria-live="polite">
            <span className="door-word-slot" style={slotW ? { width: slotW } : undefined}>
              <span className="door-word-sizer" ref={sizerRef} aria-hidden>{full}</span>
              <span className="door-lead">{lead}</span><span className="door-word">{word}</span><span className="door-caret" aria-hidden />
            </span>
          </h1>
          <p className="door-sub">Thirteen humans in command. Eighty-three AI agents in execution. One platform from research to results, where every decision is made by a person and every task is done at machine speed.</p>
        </div>
        <div className="door-lower">
          <div className="door-flex" aria-label="The platform in numbers">
            {/* All three in the typewriter's orange (Gary); the play disc carries its exact gradient. Quiet at rest, glowing on hover. */}
            {pill(agents, "AI agents", ICON_AGENTS, "#EE4A18")}
            {pill(brains, "AI Brains", ICON_BRAINS, "#EE4A18")}
            {pill(pods, "Pods", ICON_PODS, "#EE4A18")}
          </div>
        </div>
      </div>

      <div className="door-cascade door-cascade-r" aria-hidden>
        <Column start={6} slow />
      </div>

      {/* Phones: the cascade as a strip along the foot. */}
      <div className="door-strip" aria-hidden>
        <div className="door-strip-track">
          {TEAM.map((m, i) => <Card key={`s-${i}`} m={m} />)}
          {TEAM.map((m, i) => <Card key={`t-${i}`} m={m} />)}
        </div>
      </div>

      <div className="door-credit">GAS Marketing Automation · The Agency of NOW · Human Command. <b>AI Execution.</b></div>
    </section>
  );
}
