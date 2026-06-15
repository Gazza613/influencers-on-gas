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
      {/* Drifting orbs + dot grid — matches the home page */}
      <div style={{ position: "absolute", width: 680, height: 680, top: "-20%", left: "-15%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.20) 0%, transparent 65%)", animation: "lOrb 16s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 620, height: 620, bottom: "-22%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,106,0,0.18) 0%, transparent 65%)", animation: "lOrb 21s ease-in-out infinite reverse", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "30px 30px", pointerEvents: "none" }} />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gas-logo.png" alt="GAS" width={92} height={92} className="rounded-full" style={{ filter: "drop-shadow(0 10px 34px rgba(255,90,30,0.6))" }} />
        <h1 className="mt-6 inline-flex items-baseline gap-[0.3em] text-3xl font-extrabold tracking-tight">
          <span style={{ background: "linear-gradient(135deg,#EC4899,#A855F7 55%,#60A5FA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Influencers on</span>
          <span style={{ fontWeight: 900, background: "linear-gradient(135deg,#FFB020,#FF6A00 45%,#FF2D55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>GAS</span>
        </h1>
        <p className="tabular mt-1.5 text-[11px] uppercase tracking-[0.35em] text-ink-faint">Influence that matters</p>

        <form onSubmit={submit} className="mt-8 w-full rounded-2xl border border-line bg-surface-1/70 p-7 backdrop-blur">
          <div className="tabular mb-5 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">Studio Access</div>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your work email" autoComplete="username"
            className="w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:border-accent" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password"
            className="mt-2.5 w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:border-accent" />
          {error && <p className="mt-3 text-xs text-alert">{error}</p>}
          <button type="submit" disabled={busy}
            className="login-cta mt-4 w-full rounded-full py-3 text-sm font-bold uppercase tracking-wider text-white transition disabled:opacity-70"
            style={{ background: "linear-gradient(135deg,#EC4899 0%,#8B5CF6 100%)", boxShadow: "0 0 28px rgba(168,85,247,0.4)" }}>
            {busy ? "Checking…" : "Sign in →"}
          </button>
          <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-faint">
            Access is by invitation only. Contact <a href="mailto:grow@gasmarketing.co.za" className="text-accent">grow@gasmarketing.co.za</a>.
          </p>
        </form>
      </div>

      <style>{`
        @keyframes lOrb { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(1.08)} }
        .login-cta:hover:not(:disabled) { filter: saturate(1.1) brightness(1.06); box-shadow: 0 0 46px rgba(168,85,247,0.6); transform: translateY(-1px); }
      `}</style>
    </div>
  );
}
