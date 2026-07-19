"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The landing headline cycles "Create Your ___". It covers everything behind the login: the AI-influencer video
// studio (Influencers / Avatars), the creative factory (Designs / Social Ads / Campaigns), and the intelligence
// desks (Articles / Research / Insights - Gary). Interleaved rather than grouped, so the line never reads as
// three separate lists.
const WORDS = ["Influencers", "Articles", "Designs", "Research", "Avatars", "Insights", "Social Ads", "Campaigns"];
const TYPE_SPEED = 75;
const DELETE_SPEED = 45;
const PAUSE_MS = 1800;

function useTypewriter() {
  const [text, setText] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "deleting">("typing");
  useEffect(() => {
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
  }, [text, phase, wordIdx]);
  return text;
}

// Six floating card slots (position, rotation, size, float timing).
//
// SIZES: a further 15% up (Gary), on top of the ~40% that took them off the archived Vite build's fixed
// 158/138/146/160/140/148. Floor, growth rate and ceiling all move together, so they read bigger at every
// viewport rather than only on a wide monitor - raising just the ceiling would have changed nothing on a
// laptop, which is where they are actually looked at.
//
// This is a deliberate departure from the archive floors checked earlier: the archive sized them to sit
// behind the headline as texture, and Gary wants them present. Their opacity is still the louder difference
// if they ever start competing with the centre column.
const CARDS = [
  { left: "-30px", top: "6%", w: "clamp(182px, 17vw, 267px)", rot: "-9deg", opacity: 0.92, period: 8, sway: 11, delay: 0.0 },
  { left: "26px", top: "43%", w: "clamp(159px, 15vw, 232px)", rot: "5deg", opacity: 0.78, period: 10, sway: 14, delay: 1.6 },
  { left: "-16px", top: "74%", w: "clamp(168px, 16vw, 246px)", rot: "-5deg", opacity: 0.84, period: 12, sway: 16, delay: 0.8 },
  { right: "-30px", top: "4%", w: "clamp(184px, 17vw, 271px)", rot: "10deg", opacity: 0.92, period: 9, sway: 13, delay: 0.4 },
  { right: "22px", top: "42%", w: "clamp(161px, 15vw, 237px)", rot: "-7deg", opacity: 0.78, period: 11, sway: 15, delay: 2.0 },
  { right: "-18px", top: "72%", w: "clamp(170px, 16vw, 251px)", rot: "6deg", opacity: 0.86, period: 13, sway: 17, delay: 1.2 },
] as const;


// The star field that lived here was removed (Gary). The sunset horizon carries the page on its own now.

type Inf = { status?: string; persona?: { hero_url?: string; hero_realism_url?: string; locked?: boolean } | null; look_refs?: { url: string; hero?: boolean }[] | null };
// All usable photos for an influencer, hero first, then their other frames.
function imagesOf(inf: Inf): string[] {
  const hero = inf.persona?.hero_realism_url || inf.persona?.hero_url || inf.look_refs?.find?.((r) => r.hero)?.url;
  const frames = (inf.look_refs ?? []).map((r) => r.url).filter(Boolean);
  return [...new Set([hero, ...frames].filter((u): u is string => !!u))];
}
// Showcase finished influencers first: locked/ready lead, then in-build, then generating.
function rank(inf: Inf): number {
  if (inf.persona?.locked || inf.status === "ready") return 0;
  if (inf.status === "frames_ready" || inf.status === "cast_ready") return 1;
  return 2;
}


export default function Landing() {
  const router = useRouter();
  const animatedWord = useTypewriter();
  const [cardSrcs, setCardSrcs] = useState<({ url: string; hero: string } | null)[]>(CARDS.map(() => null));
  // SIGNED-IN USERS MAY LOOK AT THIS PAGE (Gary). It used to redirect them straight to /dashboard, which meant
  // typing the landing-page URL bounced you back to the app and there was no way to see the front door at all
  // - not even with a hard refresh. A public homepage you cannot visit is just broken.
  //
  // So nothing redirects now. The page renders for everyone, and the only thing the session changes is the
  // CTA: signed out it says "Get Started" and goes to /login, signed in it says "Enter the Studio" and goes
  // to the dashboard. Same page, right door.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;

    // Read the session only to label the CTA. No redirect, so the "?signedout=1" guard that used to stop a
    // not-yet-cleared session bouncing you back to the dashboard is no longer needed: there is nothing to
    // bounce to.
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (!cancelled) setSignedIn(!!s?.user); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load real influencer hero images: ONE distinct influencer per card (no repeats, no
  // cycling). Cards beyond the number of available influencers stay empty.
  useEffect(() => {
    // Public feed (the landing page is logged-out; /api/influencers is auth-gated). Image URLs only.
    fetch("/api/landing-cards", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { influencers: [] }))
      .then((d) => {
        const list = [...((d.influencers as Inf[]) || [])].sort((a, b) => rank(a) - rank(b));
        // One photo per influencer, but ROTATE the frame by position so look-alike builds
        // show different shots (a unique, varied photo per card rather than 6 headshots).
        const used = new Set<string>();
        const picks: { url: string; hero: string }[] = [];
        list.forEach((inf, idx) => {
          const cands = imagesOf(inf);
          if (!cands.length) return;
          const hero = cands[0]; // reliable curated image, used as the load fallback
          let chosen = hero;
          for (let off = 0; off < cands.length; off++) {
            const c = cands[(idx + off) % cands.length];
            if (!used.has(c)) { chosen = c; break; }
          }
          used.add(chosen);
          picks.push({ url: chosen, hero });
        });
        setCardSrcs(CARDS.map((_, i) => picks[i] ?? null));
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100dvh", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#07070E", overflow: "hidden", padding: "clamp(26px, 6vw, 40px) clamp(18px, 5vw, 24px) clamp(46px, 10vw, 80px)", textAlign: "center" }}>
      {/* Orbs */}
      <div style={{ position: "absolute", width: 760, height: 760, top: "-22%", left: "-18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.28) 0%, transparent 65%)", animation: "orb1 14s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 620, height: 620, top: "-14%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.22) 0%, transparent 65%)", animation: "orb2 19s ease-in-out infinite", pointerEvents: "none" }} />
      {/* DEPTH WHERE THE EYE ACTUALLY LOOKS (Gary, with arrows on a screenshot).
          The first attempt put these at the page EDGES and low-centre, which failed twice over: the edge ones
          sat BEHIND the floating cards so nothing showed, and the low-centre one bled into the sunset and
          muddied the orange. Both are now in the two genuinely empty pockets either side of the logo - the
          black space between the cards and the centre column, high on the page and clear of the horizon.
          Positioned by their CENTRE via a wrapper, because the glow itself animates `transform` and a
          centring translate on the same element would be overwritten by the keyframe. */}
      <div aria-hidden style={{ position: "absolute", left: "25%", top: "22%", pointerEvents: "none" }}>
        <div style={{ width: 520, height: 520, marginLeft: -260, marginTop: -260, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.20) 0%, rgba(99,102,241,0.08) 45%, transparent 70%)", animation: "orb3 24s ease-in-out infinite" }} />
      </div>
      <div aria-hidden style={{ position: "absolute", left: "71%", top: "24%", pointerEvents: "none" }}>
        <div style={{ width: 500, height: 500, marginLeft: -250, marginTop: -250, borderRadius: "50%", background: "radial-gradient(circle, rgba(96,165,250,0.18) 0%, rgba(168,85,247,0.08) 46%, transparent 70%)", animation: "orb4 29s ease-in-out infinite" }} />
      </div>
      {/* ── SUNSET HORIZON (Gary, experimental - "i may reverse this move but lets try") ──────────────────
          Committed on its own so reverting it touches nothing else on the page.

          Three stacked layers, because one flat orange gradient reads as a coloured rectangle rather than as
          light. A real sunset is a bright, narrow band at the horizon, a broad warm bloom above it, and a
          cool gap before the night sky takes over:
            1. BLOOM  - wide and low, the ambient warmth
            2. CORE   - tighter and hotter, hugging the very bottom
            3. BAND   - a thin bright line at the base, which is what actually sells it as a horizon
          All of it sits at zIndex 0, beneath the stars and the content, and breathes slowly so it never
          reads as a static wash. Orange is fine here: the "orange is the GAS mark alone" rule guards CLIENT
          creatives, not our own brand page. */}
      <div aria-hidden style={{ position: "absolute", left: "-16%", right: "-16%", bottom: "-14%", height: "68%", pointerEvents: "none", zIndex: 0, animation: "gasHorizon 17s ease-in-out infinite" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 78% 100% at 50% 100%, rgba(255,106,0,0.20) 0%, rgba(255,72,0,0.095) 36%, transparent 74%)" }} />
        <div style={{ position: "absolute", left: "8%", right: "8%", bottom: 0, height: "54%", background: "radial-gradient(ellipse 62% 100% at 50% 100%, rgba(255,150,30,0.26) 0%, rgba(255,90,0,0.11) 46%, transparent 80%)" }} />
        <div style={{ position: "absolute", left: "14%", right: "14%", bottom: 0, height: 3, background: "linear-gradient(90deg, transparent 0%, rgba(255,170,60,0.40) 28%, rgba(255,195,100,0.50) 50%, rgba(255,170,60,0.40) 72%, transparent 100%)", filter: "blur(2px)" }} />
      </div>

      {/* GRAIN. Large dark gradients band and read as flat colour on a good screen; a fine noise layer is what
          print has always used to stop that, and it reads as texture rather than as an effect. Inline SVG
          turbulence, so it costs no network request and no image to maintain. Very low opacity on purpose -
          if you can see the grain, there is too much of it. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.045, mixBlendMode: "overlay",
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize: "160px 160px" }} />

      {/* Dot grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />


      {/* The six floating influencer cards. A systems variant lived here behind a switch; Gary reviewed it,
          kept the photos, and the switch has been removed along with the code it controlled. */}
      {CARDS.map((card, i) => {
        const pick = cardSrcs[i];
        if (!pick) return null;
        const opt = (u: string) => `/_next/image?url=${encodeURIComponent(u)}&w=640&q=75`;
        const pos: Record<string, string> = {};
        if ("left" in card) pos.left = card.left as string;
        if ("right" in card) pos.right = card.right as string;
        return (
          <div key={i} className="landing-card" style={{ position: "absolute", top: card.top, ...pos, width: card.w, transform: `rotate(${card.rot})`, opacity: 0, ["--target-opacity" as string]: card.opacity, animation: `cardAppear 1s ease ${card.delay + 0.2}s forwards`, pointerEvents: "none", zIndex: 0 }}>
            {/* FLOAT and SWAY must live on SEPARATE elements. Both animate `transform`, so when they shared
                one element CSS let the last one win: cardSway (±5px sideways) silently cancelled cardFloat
                (-18px of drift), and the cards looked almost static. Nested, both transforms compose and the
                cards drift AND sway - on different periods, so the motion stays organic rather than in lockstep. */}
            <div style={{ animation: `cardFloat ${card.period}s ease-in-out ${card.delay}s infinite` }}>
              <div style={{ position: "relative", animation: `cardSway ${card.sway}s ease-in-out ${card.delay * 0.7}s infinite`, borderRadius: 18, overflow: "hidden", boxShadow: "0 28px 70px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.09)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={opt(pick.url)} alt="" loading="lazy" decoding="async"
                onError={(e) => {
                  // Self-heal a broken/expired frame: optimised hero, then raw hero, then stop.
                  const t = e.currentTarget; const step = t.dataset.step || "0";
                  if (step === "0") { t.dataset.step = "1"; t.src = opt(pick.hero); }
                  else if (step === "1") { t.dataset.step = "2"; t.src = pick.hero; }
                }}
                style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(7,7,14,0.16) 0%, transparent 42%)" }} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 46%, rgba(7,7,14,0.5) 100%)", pointerEvents: "none", zIndex: 1 }} />

      {/* Center content */}
      <div style={{ maxWidth: 680, position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "clamp(26px, 6vw, 40px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gas-logo.png" alt="GAS" style={{ width: "clamp(104px, 26vw, 158px)", height: "clamp(104px, 26vw, 158px)", marginBottom: "clamp(16px, 4vw, 22px)", borderRadius: "50%", filter: "drop-shadow(0 10px 32px rgba(255,90,30,0.55))" }} />
          {/* SET IN CAPS (Gary) - the platform name should make a statement. Caps need POSITIVE tracking:
              the -0.6px that suited mixed case jams uppercase letterforms together and reads as a smudge. */}
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: "0.32em", fontSize: "clamp(19px, 4.6vw, 30px)", fontWeight: 800, letterSpacing: "0.08em" }}>
            <span style={{ background: "linear-gradient(135deg, #EC4899 0%, #A855F7 50%, #60A5FA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STUDIO ON</span>
            <span style={{ fontWeight: 900, background: "linear-gradient(135deg, #FFB020 0%, #FF6A00 45%, #FF2D55 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>GAS</span>
          </div>
        </div>

        <h1 style={{ fontSize: "clamp(40px, 11vw, 104px)", fontWeight: 800, letterSpacing: "-0.034em", lineHeight: 1.02, color: "#fff", marginBottom: 2 }}>Create Your</h1>

        <div style={{ fontSize: "clamp(40px, 11vw, 104px)", fontWeight: 800, letterSpacing: "-0.034em", lineHeight: 1.1, minHeight: "1.15em", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "clamp(22px, 5vw, 36px)" }}>
          <span style={{ background: "linear-gradient(135deg, #EC4899 0%, #A855F7 50%, #60A5FA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{animatedWord}</span>
          <span style={{ display: "inline-block", width: "clamp(3px, 0.05em, 5px)", height: "0.72em", background: "linear-gradient(to bottom, #EC4899, #A855F7)", marginLeft: 6, borderRadius: 3, animation: "blink 1s step-end infinite", verticalAlign: "middle", flexShrink: 0 }} />
        </div>

        <p style={{ fontSize: "clamp(17px, 4.6vw, 22px)", color: "rgba(255,255,255,0.44)", lineHeight: 1.6, margin: "0 auto clamp(32px, 7vw, 52px)", maxWidth: 460, fontWeight: 400, letterSpacing: "-0.1px" }}>
          Human command. AI execution. One platform.
        </p>

        <button
          onClick={() => router.push(signedIn ? "/dashboard" : "/login")}
          style={{ padding: "clamp(15px, 3.6vw, 17px) clamp(36px, 11vw, 60px)", borderRadius: 980, maxWidth: "100%", background: "linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)", color: "#fff", fontSize: "clamp(15.5px, 4vw, 17px)", fontWeight: 700, letterSpacing: "-0.2px", boxShadow: "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)", transition: "transform 0.18s, box-shadow 0.18s", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04) translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(168,85,247,0.65), 0 8px 32px rgba(0,0,0,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1) translateY(0)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)"; }}
        >
          {signedIn ? "Enter the Studio →" : "Get Started →"}
        </button>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        /* The horizon breathes rather than sitting still - a fixed gradient reads as a painted background. */
        @keyframes gasHorizon { 0%,100%{opacity:0.85;transform:translateY(0)} 50%{opacity:1;transform:translateY(-8px)} }
        @keyframes orb1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(55px,-45px) scale(1.07)} 66%{transform:translate(-35px,38px) scale(0.93)} }
        @keyframes orb3 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(38px,-46px) scale(0.92)} 70%{transform:translate(-44px,20px) scale(1.07)} }
        @keyframes orb4 { 0%,100%{transform:translate(0,0) scale(1)} 45%{transform:translate(-36px,34px) scale(1.08)} }
        @keyframes orb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-45px,55px) scale(1.11)} }
        /* Drift up and fade in, then back. Opacity reads the per-dot vars so every dot has its own range. */
        @keyframes cardFloat { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-26px)} }
        @keyframes cardSway { 0%,100%{transform:translateX(0px)} 25%{transform:translateX(8px)} 75%{transform:translateX(-7px)} }
        @keyframes cardAppear { from{opacity:0} to{opacity:var(--target-opacity,0.44)} }
        .landing-card { display:block }
        @media (max-width: 860px) {
          .landing-card { display:none }
        }
      `}</style>
    </div>
  );
}
