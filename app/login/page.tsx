"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";

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
    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    if (res?.ok) {
      window.location.href = "/";
    } else {
      setError("Sign-in failed. Check your email and password.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-0 px-6">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-[560px] w-[560px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(249,98,3,0.14) 0%, transparent 60%)" }} />
      <div className="pointer-events-none absolute -top-28 -right-20 h-[520px] w-[520px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 62%)" }} />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center">
        <Image src="/gas-logo.png" alt="GAS" width={88} height={88}
          className="rounded-full" style={{ filter: "drop-shadow(0 0 34px rgba(249,98,3,0.6))" }} priority />
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Influencers <span className="text-accent">on</span> GAS</h1>
        <p className="tabular mt-1 text-[11px] uppercase tracking-[0.35em] text-ink-faint">
          Influence that matters
        </p>

        <form onSubmit={submit}
          className="mt-8 w-full rounded-2xl border border-line bg-surface-1/70 p-7 backdrop-blur">
          <div className="tabular mb-5 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-dim">
            Studio Access
          </div>
          <input
            autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Your work email" autoComplete="username"
            className="w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password" autoComplete="current-password"
            className="mt-2.5 w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
          />
          {error && <p className="mt-3 text-xs text-alert">{error}</p>}
          <button type="submit" disabled={busy}
            className="mt-4 w-full rounded-lg bg-accent py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-70">
            {busy ? "Checking…" : "Sign in"}
          </button>
          <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-faint">
            Access is by invitation only. Contact{" "}
            <a href="mailto:grow@gasmarketing.co.za" className="text-accent">grow@gasmarketing.co.za</a>.
          </p>
        </form>
      </div>
    </div>
  );
}
