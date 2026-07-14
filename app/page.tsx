"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const WORDS = ["Influencer", "Creator", "Avatar", "Celebrity"];
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
const CARDS = [
  { left: "-28px", top: "6%", w: 158, rot: "-9deg", opacity: 0.92, period: 8, sway: 11, delay: 0.0 },
  { left: "28px", top: "43%", w: 138, rot: "5deg", opacity: 0.78, period: 10, sway: 14, delay: 1.6 },
  { left: "-14px", top: "74%", w: 146, rot: "-5deg", opacity: 0.84, period: 12, sway: 16, delay: 0.8 },
  { right: "-28px", top: "4%", w: 160, rot: "10deg", opacity: 0.92, period: 9, sway: 13, delay: 0.4 },
  { right: "24px", top: "42%", w: 140, rot: "-7deg", opacity: 0.78, period: 11, sway: 15, delay: 2.0 },
  { right: "-16px", top: "72%", w: 148, rot: "6deg", opacity: 0.86, period: 13, sway: 17, delay: 1.2 },
] as const;

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
  // Session-aware: an ALREADY signed-in user who lands here (e.g. tapping "← Home") should go straight into
  // the app, not see the logged-out "Get Started" marketing view - which read as a surprise logout. Hold the
  // render until we know, so the CTA never flashes for a signed-in user.
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (cancelled) return; if (s?.user) router.replace("/home"); else setAuthChecked(true); })
      .catch(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, [router]);

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

  // Signed-in users are being redirected to /home (the two doors); don't flash the marketing CTA at them.
  if (!authChecked) return <div style={{ minHeight: "100vh", background: "#07070E" }} />;

  return (
    <div style={{ minHeight: "100vh", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#07070E", overflow: "hidden", padding: "40px 24px 80px", textAlign: "center" }}>
      {/* Orbs */}
      <div style={{ position: "absolute", width: 760, height: 760, top: "-22%", left: "-18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.28) 0%, transparent 65%)", animation: "orb1 14s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 620, height: 620, top: "-14%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.22) 0%, transparent 65%)", animation: "orb2 19s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 820, height: 820, bottom: "-32%", left: "18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)", animation: "orb3 23s ease-in-out infinite", pointerEvents: "none" }} />
      {/* Dot grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      {/* Floating influencer cards (real heroes) */}
      {CARDS.map((card, i) => {
        const pick = cardSrcs[i];
        if (!pick) return null;
        const opt = (u: string) => `/_next/image?url=${encodeURIComponent(u)}&w=384&q=75`;
        const pos: Record<string, string> = {};
        if ("left" in card) pos.left = card.left as string;
        if ("right" in card) pos.right = card.right as string;
        return (
          <div key={i} className="landing-card" style={{ position: "absolute", top: card.top, ...pos, width: card.w, transform: `rotate(${card.rot})`, opacity: 0, ["--target-opacity" as string]: card.opacity, animation: `cardAppear 1s ease ${card.delay + 0.2}s forwards`, pointerEvents: "none", zIndex: 0 }}>
            <div style={{ position: "relative", animation: `cardFloat ${card.period}s ease-in-out ${card.delay}s infinite, cardSway ${card.sway}s ease-in-out ${card.delay * 0.7}s infinite`, borderRadius: 18, overflow: "hidden", boxShadow: "0 28px 70px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.09)" }}>
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
        );
      })}

      {/* Vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 46%, rgba(7,7,14,0.5) 100%)", pointerEvents: "none", zIndex: 1 }} />

      {/* Center content */}
      <div style={{ maxWidth: 680, position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gas-logo.png" alt="GAS" style={{ width: 110, height: 110, marginBottom: 22, borderRadius: "50%", filter: "drop-shadow(0 10px 32px rgba(255,90,30,0.55))" }} />
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: "0.32em", fontSize: "clamp(22px, 3.2vw, 30px)", fontWeight: 800, letterSpacing: "-0.6px" }}>
            <span style={{ background: "linear-gradient(135deg, #EC4899 0%, #A855F7 50%, #60A5FA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Studio on</span>
            <span style={{ fontWeight: 900, background: "linear-gradient(135deg, #FFB020 0%, #FF6A00 45%, #FF2D55 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>GAS</span>
          </div>
        </div>

        <h1 style={{ fontSize: "clamp(62px,10vw,104px)", fontWeight: 800, letterSpacing: "-3.5px", lineHeight: 1.0, color: "#fff", marginBottom: 2 }}>Create Your</h1>

        <div style={{ fontSize: "clamp(62px,10vw,104px)", fontWeight: 800, letterSpacing: "-3.5px", lineHeight: 1.1, minHeight: "1.15em", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 36 }}>
          <span style={{ background: "linear-gradient(135deg, #EC4899 0%, #A855F7 50%, #60A5FA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{animatedWord}</span>
          <span style={{ display: "inline-block", width: 5, height: "0.72em", background: "linear-gradient(to bottom, #EC4899, #A855F7)", marginLeft: 6, borderRadius: 3, animation: "blink 1s step-end infinite", verticalAlign: "middle", flexShrink: 0 }} />
        </div>

        <p style={{ fontSize: 20, color: "rgba(255,255,255,0.38)", lineHeight: 1.65, margin: "0 auto 52px", maxWidth: 440, fontWeight: 400, letterSpacing: "-0.1px" }}>
          Build, manage, and grow your AI influencers.
        </p>

        <button
          onClick={() => router.push("/login")}
          style={{ padding: "17px 60px", borderRadius: 980, background: "linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)", color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.2px", boxShadow: "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)", transition: "transform 0.18s, box-shadow 0.18s", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04) translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(168,85,247,0.65), 0 8px 32px rgba(0,0,0,0.5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1) translateY(0)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)"; }}
        >
          Get Started →
        </button>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes orb1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(55px,-45px) scale(1.07)} 66%{transform:translate(-35px,38px) scale(0.93)} }
        @keyframes orb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-45px,55px) scale(1.11)} }
        @keyframes orb3 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(35px,-55px) scale(0.90)} 70%{transform:translate(-55px,22px) scale(1.08)} }
        @keyframes cardFloat { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-18px)} }
        @keyframes cardSway { 0%,100%{transform:translateX(0px)} 25%{transform:translateX(5px)} 75%{transform:translateX(-4px)} }
        @keyframes cardAppear { from{opacity:0} to{opacity:var(--target-opacity,0.44)} }
        .landing-card { display:block }
        @media (max-width: 860px) { .landing-card { display:none } }
      `}</style>
    </div>
  );
}
