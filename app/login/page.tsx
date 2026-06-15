"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (res?.error) {
        setError("Sign-in failed. Check your email and password.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Something went wrong signing in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6" style={{ background: "radial-gradient(120% 90% at 50% 0%, #15090A 0%, #08070C 60%, #050509 100%)" }}>
      {/* Warm orange wash + a single magenta spark for influencer energy */}
      <div style={{ position: "absolute", width: 760, height: 760, top: "-28%", left: "50%", transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,106,0,0.22) 0%, transparent 62%)", animation: "lOrb 18s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 560, height: 560, bottom: "-24%", left: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,45,85,0.14) 0%, transparent 65%)", animation: "lOrb 23s ease-in-out infinite reverse", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 480, height: 480, top: "40%", right: "-10%", borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 66%)", animation: "lOrb 27s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 78%)", WebkitMaskImage: "radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 78%)", pointerEvents: "none" }} />

      <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gas-logo.png" alt="GAS" width={104} height={104} className="login-logo rounded-full" style={{ filter: "drop-shadow(0 12px 40px rgba(255,90,30,0.7))" }} />
        <h1 className="mt-7 flex flex-wrap items-baseline justify-center gap-x-[0.42em] text-2xl font-black uppercase sm:text-[1.7rem]" style={{ letterSpacing: "0.22em" }}>
          <span style={{ color: "#F4F1F5", textShadow: "0 0 24px rgba(255,255,255,0.12)" }}>Influencers</span>
          <span style={{ color: "rgba(255,150,90,0.55)" }}>on</span>
          <span style={{ background: "linear-gradient(135deg,#FFB020,#FF6A00 48%,#FF2D55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 18px rgba(255,106,0,0.45))" }}>GAS</span>
        </h1>
        <p className="tabular mt-2 text-[11px] uppercase tracking-[0.42em]" style={{ color: "rgba(255,140,80,0.62)" }}>Influence that matters</p>

        <form onSubmit={submit} className="login-card relative mt-9 w-full rounded-2xl p-8">
          <div className="tabular mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.36em]" style={{ color: "rgba(255,150,90,0.7)" }}>Studio Access</div>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your work email" autoComplete="username"
            className="login-input w-full rounded-lg px-4 py-3 text-sm text-ink outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password"
            className="login-input mt-3 w-full rounded-lg px-4 py-3 text-sm text-ink outline-none" />
          {error && <p className="mt-3 text-xs text-alert">{error}</p>}
          <button type="submit" disabled={busy}
            className="login-cta mt-5 w-full rounded-xl py-3.5 text-sm font-black uppercase tracking-[0.2em] text-white transition disabled:opacity-70"
            style={{ background: "linear-gradient(135deg,#FF8A1E 0%,#FF6A00 45%,#FF2D55 100%)", boxShadow: "0 8px 30px rgba(255,90,20,0.45)" }}>
            {busy ? "Checking…" : "Sign in →"}
          </button>
          <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-faint">
            Access is by invitation only. Contact <a href="mailto:grow@gasmarketing.co.za" className="text-accent">grow@gasmarketing.co.za</a>.
          </p>
        </form>

        <p className="tabular mt-7 flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-ink-faint">
          <span aria-hidden>🔒</span> Secure creative studio
        </p>
      </div>

      <style>{`
        @keyframes lOrb { 0%,100%{transform:translate(-50%,0) scale(1)} 50%{transform:translate(calc(-50% + 30px),-26px) scale(1.07)} }
        .login-logo { animation: logoFloat 6s ease-in-out infinite; }
        @keyframes logoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .login-card {
          background: linear-gradient(180deg, rgba(22,15,18,0.82) 0%, rgba(12,9,14,0.86) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,106,0,0.32);
          box-shadow: 0 0 0 1px rgba(255,106,0,0.06), 0 0 38px rgba(255,90,20,0.18), inset 0 1px 0 rgba(255,255,255,0.04);
          animation: cardGlow 4.5s ease-in-out infinite;
        }
        @keyframes cardGlow {
          0%,100% { border-color: rgba(255,106,0,0.30); box-shadow: 0 0 0 1px rgba(255,106,0,0.05), 0 0 30px rgba(255,90,20,0.15), inset 0 1px 0 rgba(255,255,255,0.04); }
          50%      { border-color: rgba(255,140,40,0.55); box-shadow: 0 0 0 1px rgba(255,106,0,0.12), 0 0 52px rgba(255,90,20,0.30), inset 0 1px 0 rgba(255,255,255,0.05); }
        }
        .login-input { background: rgba(8,7,12,0.6); border: 1px solid rgba(255,255,255,0.08); transition: border-color .15s, box-shadow .15s; }
        .login-input::placeholder { color: rgba(255,255,255,0.32); }
        .login-input:focus { border-color: rgba(255,106,0,0.7); box-shadow: 0 0 0 3px rgba(255,106,0,0.14); }
        .login-cta:hover:not(:disabled) { filter: brightness(1.07) saturate(1.08); box-shadow: 0 10px 42px rgba(255,90,20,0.6); transform: translateY(-1px); }
      `}</style>
    </div>
  );
}
