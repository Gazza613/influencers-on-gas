"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SYSTEMS } from "@/components/SystemMarks";

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
// SIZES: scaled up ~40% from the originals (158/138/146/160/140/148), which came straight across from the
// archived Vite build and always read small on a desktop monitor. They are declared in `vw` with a px floor
// and ceiling, so they now GROW with the viewport instead of staying a fixed 158px on a 27-inch screen -
// which is what made them feel like they had shrunk.
const CARDS = [
  { left: "-30px", top: "6%", w: "clamp(158px, 15vw, 232px)", rot: "-9deg", opacity: 0.92, period: 8, sway: 11, delay: 0.0 },
  { left: "26px", top: "43%", w: "clamp(138px, 13vw, 202px)", rot: "5deg", opacity: 0.78, period: 10, sway: 14, delay: 1.6 },
  { left: "-16px", top: "74%", w: "clamp(146px, 14vw, 214px)", rot: "-5deg", opacity: 0.84, period: 12, sway: 16, delay: 0.8 },
  { right: "-30px", top: "4%", w: "clamp(160px, 15vw, 236px)", rot: "10deg", opacity: 0.92, period: 9, sway: 13, delay: 0.4 },
  { right: "22px", top: "42%", w: "clamp(140px, 13vw, 206px)", rot: "-7deg", opacity: 0.78, period: 11, sway: 15, delay: 2.0 },
  { right: "-18px", top: "72%", w: "clamp(148px, 14vw, 218px)", rot: "6deg", opacity: 0.86, period: 13, sway: 17, delay: 1.2 },
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
  // WHICH LAYOUT: the original floating influencer photos, or the six systems. Stored in the database so it
  // switches without a deploy. ?layout=cards / ?layout=systems previews the other one without changing what
  // the public sees.
  //
  // DEFAULTS TO "cards". Gary previewed the systems layout and did not like it, so the photos are the live
  // page again. The systems code stays because switching is now a click, but the fallback must never be the
  // layout that was turned down - a failed settings lookup should look like the page he approved.
  const [layout, setLayout] = useState<"systems" | "cards">("cards");
  useEffect(() => {
    let cancelled = false;
    // Layout FIRST, before the signed-out early return below - otherwise landing here after sign-out would
    // skip the lookup and always show the default, ignoring whichever layout is actually live.
    const forced = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("layout") : null;
    if (forced === "cards" || forced === "systems") setLayout(forced);
    else fetch("/api/landing-layout", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.layout) setLayout(d.layout); }).catch(() => {});

    // JUST SIGNED OUT? Stay here. Signing out sends you to "/?signedout=1", and without this check the session
    // lookup below could still see a not-yet-propagated session and bounce you straight back to the dashboard -
    // which is exactly what Gary saw ("they land on /home again").
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("signedout")) {
      setAuthChecked(true);
      return;
    }
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (cancelled) return; if (s?.user) router.replace("/dashboard"); else setAuthChecked(true); })
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
    <div style={{ minHeight: "100dvh", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#07070E", overflow: "hidden", padding: "clamp(26px, 6vw, 40px) clamp(18px, 5vw, 24px) clamp(46px, 10vw, 80px)", textAlign: "center" }}>
      {/* Orbs */}
      <div style={{ position: "absolute", width: 760, height: 760, top: "-22%", left: "-18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.28) 0%, transparent 65%)", animation: "orb1 14s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 620, height: 620, top: "-14%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.22) 0%, transparent 65%)", animation: "orb2 19s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 820, height: 820, bottom: "-32%", left: "18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)", animation: "orb3 23s ease-in-out infinite", pointerEvents: "none" }} />
      {/* TWO MORE, DELIBERATELY FAINTER THAN THE FIRST THREE (0.13 and 0.10 against 0.18-0.28). The brief was
          "add a few more but do not overdo it", and the way that goes wrong is matching the new ones to the
          existing intensity: five equal glows is a light show, not depth. These fill the two dead zones - mid
          right, and under the CTA - on their own slow periods so nothing ever pulses in unison. */}
      <div style={{ position: "absolute", width: 560, height: 560, top: "34%", right: "-16%", borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.13) 0%, transparent 68%)", animation: "orb4 27s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 680, height: 680, bottom: "-24%", right: "8%", borderRadius: "50%", background: "radial-gradient(circle, rgba(192,132,252,0.10) 0%, transparent 70%)", animation: "orb5 31s ease-in-out infinite", pointerEvents: "none" }} />
      {/* Dot grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      {/* THE SIX SYSTEMS (or the original influencer photos), in the same six floating slots.
          The mapping is exact and that is the whole idea: there were already three cards down each side and
          there are exactly six systems, so the page's existing character - the drift, the sway, the staggered
          entrance - carries over untouched while the content becomes what the platform actually IS.
          Display only, like the photo cards they replace: a logged-out visitor clicking one would just bounce
          off the login gate, and the page already has one clear action in Get Started. */}
      {CARDS.map((card, i) => {
        const sys = SYSTEMS[i];
        const pick = cardSrcs[i];
        if (layout === "cards" && !pick) return null;
        if (layout === "systems" && !sys) return null;
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
              {layout === "systems" ? (
                // A SYSTEM CARD. Same 2:3 slot as the photo it replaces, so the composition does not shift.
                // The mark is given room and the name is set large: at this size on a moving card, one strong
                // name beats a paragraph nobody can read while it drifts.
                <div style={{ width: "100%", aspectRatio: "2/3", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "16% 13%", background: `linear-gradient(160deg, ${sys.tint}1F 0%, rgba(7,7,14,0.92) 55%)`, textAlign: "left" }}>
                  <div style={{ width: "34%", maxWidth: 54 }}>{sys.mark(`sys-${sys.key}`)}</div>
                  <div>
                    <div style={{ fontSize: "clamp(13px, 1.25vw, 18px)", fontWeight: 800, lineHeight: 1.18, letterSpacing: "-0.3px", color: "#fff" }}>{sys.name}</div>
                    <div style={{ marginTop: "0.45em", fontSize: "clamp(10px, 0.85vw, 12.5px)", lineHeight: 1.35, color: "rgba(255,255,255,0.5)" }}>{sys.line}</div>
                  </div>
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={opt(pick!.url)} alt="" loading="lazy" decoding="async"
                    onError={(e) => {
                      // Self-heal a broken/expired frame: optimised hero, then raw hero, then stop.
                      const t = e.currentTarget; const step = t.dataset.step || "0";
                      if (step === "0") { t.dataset.step = "1"; t.src = opt(pick!.hero); }
                      else if (step === "1") { t.dataset.step = "2"; t.src = pick!.hero; }
                    }}
                    style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(7,7,14,0.16) 0%, transparent 42%)" }} />
                </>
              )}
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

        {/* MOBILE. The floating cards are hidden below 860px, so on a phone the six systems would simply not
            exist - the whole point of the layout, invisible to half the visitors. A compact two-column strip
            carries them instead, below the CTA where it does not fight the headline. */}
        {layout === "systems" && (
          <div className="landing-systems-mobile" style={{ display: "none", gap: 8, marginBottom: 40, textAlign: "left" }}>
            {SYSTEMS.map((sysm) => (
              <div key={sysm.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 12, background: `linear-gradient(140deg, ${sysm.tint}1A 0%, rgba(255,255,255,0.03) 70%)`, border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ width: 22, flexShrink: 0 }}>{sysm.mark(`m-${sysm.key}`)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, color: "rgba(255,255,255,0.92)" }}>{sysm.name}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => router.push("/login")}
          style={{ padding: "clamp(15px, 3.6vw, 17px) clamp(36px, 11vw, 60px)", borderRadius: 980, maxWidth: "100%", background: "linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)", color: "#fff", fontSize: "clamp(15.5px, 4vw, 17px)", fontWeight: 700, letterSpacing: "-0.2px", boxShadow: "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)", transition: "transform 0.18s, box-shadow 0.18s", border: "none", cursor: "pointer" }}
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
        @keyframes orb4 { 0%,100%{transform:translate(0,0) scale(1)} 45%{transform:translate(-40px,30px) scale(1.09)} }
        @keyframes orb5 { 0%,100%{transform:translate(0,0) scale(1)} 55%{transform:translate(30px,-38px) scale(0.92)} }
        @keyframes cardFloat { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-26px)} }
        @keyframes cardSway { 0%,100%{transform:translateX(0px)} 25%{transform:translateX(8px)} 75%{transform:translateX(-7px)} }
        @keyframes cardAppear { from{opacity:0} to{opacity:var(--target-opacity,0.44)} }
        .landing-card { display:block }
        @media (max-width: 860px) {
          .landing-card { display:none }
          /* The systems strip only exists where the floating cards do not. */
          .landing-systems-mobile { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)) }
        }
      `}</style>
    </div>
  );
}
