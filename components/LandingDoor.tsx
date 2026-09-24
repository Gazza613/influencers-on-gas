"use client";

import { useEffect, useRef, useState } from "react";
import DoorAtmosphere from "./DoorAtmosphere";
import { TEAM, TEAM_ABOUT_URL } from "@/lib/team";

// THE LANDING DOOR (Gary, approved 2026-09-24 after ~30 rounds on the dummy). One screen, no scroll, on any device:
//   - the official Agency of NOW lockup as the mark, with a soft settle-in, a slow float and one light sweep;
//   - the "Create Your ___" typewriter, carried over from the old landing;
//   - three flex pills (AI agents / AI Brains / Pods) as the way in - all go to login (or the dashboard when signed in);
//   - the TEAM as the atmosphere: one slow cascade of the thirteen down each flank (where the digit rain sits on the
//     Media on GAS door), out of step left to right, every card a quiet link to the About page. On a phone the flanks
//     cannot fit, so the cascade becomes a small strip along the foot.
// The numbers are LIVE: the page passes them in from POD_AGENTS and the database, so the flex never goes stale.

const WORDS = ["Campaigns", "Articles", "Designs", "Research", "Influencers", "Insights", "Social Ads", "Avatars"];
const TYPE_SPEED = 75;
const DELETE_SPEED = 45;
const PAUSE_MS = 1800;

function useTypewriter(enabled: boolean) {
  const [text, setText] = useState(WORDS[0]);
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "deleting">("deleting");
  useEffect(() => {
    if (!enabled) return;
    const word = WORDS[wordIdx];
    if (phase === "typing") {
      if (text.length < word.length) {
        const t = setTimeout(() => setText(word.slice(0, text.length + 1)), TYPE_SPEED);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("deleting"), PAUSE_MS);
      return () => clearTimeout(t);
    }
    if (text.length > 0) {
      const t = setTimeout(() => setText(text.slice(0, -1)), DELETE_SPEED);
      return () => clearTimeout(t);
    }
    setWordIdx((i) => (i + 1) % WORDS.length);
    setPhase("typing");
  }, [enabled, text, phase, wordIdx]);
  return text;
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
  const word = useTypewriter(!reduced);
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
          <h1 className="door-h1">Create Your</h1>
          <div className="door-word-row" aria-live="polite">
            <span className="door-word">{word}</span>
            <span className="door-caret" aria-hidden />
          </div>
          <p className="door-sub">Thirteen humans in command. Eighty-three AI agents in execution. One platform from research to results, where every decision is made by a person and every task is done at machine speed.</p>
        </div>
        <div className="door-lower">
          <div className="door-flex" aria-label="The platform in numbers">
            {pill(agents, "AI agents", ICON_AGENTS, "#EC4899")}
            {pill(brains, "AI Brains", ICON_BRAINS, "#A855F7")}
            {pill(pods, "Pods", ICON_PODS, "#22D3EE")}
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
