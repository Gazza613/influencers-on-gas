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
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6" style={{ background: "#07070E" }}>
      {/* Same drifting orbs + dot grid as the landing page — pink / blue / purple */}
      <div style={{ position: "absolute", width: 760, height: 760, top: "-22%", left: "-18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.28) 0%, transparent 65%)", animation: "orb1 14s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 620, height: 620, top: "-14%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.22) 0%, transparent 65%)", animation: "orb2 19s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 820, height: 820, bottom: "-32%", left: "18%", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)", animation: "orb3 23s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gas-logo.png" alt="GAS" width={104} height={104} className="login-logo rounded-full" style={{ filter: "drop-shadow(0 12px 40px rgba(255,90,30,0.55))" }} />
        <h1 className="mt-7 inline-flex items-baseline gap-[0.32em] font-extrabold" style={{ fontSize: "clamp(22px, 3.2vw, 30px)", letterSpacing: "-0.6px" }}>
          <span style={{ background: "linear-gradient(135deg, #EC4899 0%, #A855F7 50%, #60A5FA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Influencers on</span>
          <span style={{ fontWeight: 900, background: "linear-gradient(135deg, #FFB020 0%, #FF6A00 45%, #FF2D55 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>GAS</span>
        </h1>
        <p className="tabular mt-2 text-[11px] uppercase tracking-[0.42em]" style={{ color: "rgba(255,255,255,0.42)" }}>Influence that matters</p>

        <form onSubmit={submit} className="login-card relative mt-9 w-full rounded-2xl p-8">
          <div className="tabular mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.36em]" style={{ color: "rgba(168,85,247,0.85)" }}>Studio Access</div>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your work email" autoComplete="username"
            className="login-input w-full rounded-lg px-4 py-3 text-sm text-ink outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password"
            className="login-input mt-3 w-full rounded-lg px-4 py-3 text-sm text-ink outline-none" />
          {error && <p className="mt-3 text-xs text-alert">{error}</p>}
          <button type="submit" disabled={busy}
            className="login-cta mt-5 w-full rounded-full py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-white transition disabled:opacity-70"
            style={{ background: "linear-gradient(135deg,#EC4899 0%,#8B5CF6 100%)", boxShadow: "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)" }}>
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
        @keyframes orb1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(55px,-45px) scale(1.07)} 66%{transform:translate(-35px,38px) scale(0.93)} }
        @keyframes orb2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-45px,55px) scale(1.11)} }
        @keyframes orb3 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(35px,-55px) scale(0.90)} 70%{transform:translate(-55px,22px) scale(1.08)} }
        .login-logo { animation: logoFloat 6s ease-in-out infinite; }
        @keyframes logoFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .login-card {
          background: linear-gradient(180deg, rgba(18,14,26,0.82) 0%, rgba(10,9,16,0.86) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(168,85,247,0.34);
          box-shadow: 0 0 0 1px rgba(168,85,247,0.06), 0 0 38px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.04);
          animation: cardGlow 4.5s ease-in-out infinite;
        }
        @keyframes cardGlow {
          0%,100% { border-color: rgba(168,85,247,0.32); box-shadow: 0 0 0 1px rgba(168,85,247,0.05), 0 0 30px rgba(168,85,247,0.15), inset 0 1px 0 rgba(255,255,255,0.04); }
          50%      { border-color: rgba(236,72,153,0.5); box-shadow: 0 0 0 1px rgba(168,85,247,0.12), 0 0 52px rgba(168,85,247,0.32), inset 0 1px 0 rgba(255,255,255,0.05); }
        }
        .login-input { background: rgba(8,7,12,0.6); border: 1px solid rgba(255,255,255,0.08); transition: border-color .15s, box-shadow .15s; }
        .login-input::placeholder { color: rgba(255,255,255,0.32); }
        .login-input:focus { border-color: rgba(168,85,247,0.7); box-shadow: 0 0 0 3px rgba(168,85,247,0.16); }
        .login-cta:hover:not(:disabled) { filter: brightness(1.06) saturate(1.06); box-shadow: 0 0 60px rgba(168,85,247,0.65), 0 8px 32px rgba(0,0,0,0.5); transform: translateY(-1px); }
      `}</style>
    </div>
  );
}
