"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import DoorAtmosphere from "@/components/DoorAtmosphere";

// THE LOGIN DOOR (Gary, 2026-09-24): the same world as the landing page it is reached from - the warm ground, the
// ember and halo, the linen and grain, and the official Agency of NOW lockup as the mark - so the click-through
// from the landing pills lands somewhere that feels like the same product, not a different app.
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
      // Return the user to where they were before the reload re-gate (?next=), if it's a safe SAME-ORIGIN
      // path; otherwise the studio hub. Resolve with `new URL` (normalises control-char tricks) + an origin
      // check, so this can't be turned into an open redirect. This is what makes a refresh keep your place.
      let dest = "/dashboard"; // the six desks
      try {
        const raw = new URLSearchParams(window.location.search).get("next") || "";
        if (raw) {
          const u = new URL(raw, window.location.origin);
          if (u.origin === window.location.origin && u.pathname.startsWith("/") && !u.pathname.startsWith("//") && !u.pathname.startsWith("/api/")) {
            dest = u.pathname + u.search;
          }
        }
      } catch { dest = "/dashboard"; }
      window.location.href = dest;
    } catch {
      setError("Something went wrong signing in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="door-page">
      <DoorAtmosphere />

      <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center">
        <a href="/" className="door-mark" aria-label="The Agency of NOW. Back to the front door.">
          <span className="door-bloom" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="door-lockup" src="/agency-of-now.png" width={1600} height={769} fetchPriority="high" decoding="async" alt="The Agency of NOW. Human Command. AI Execution." />
          <span className="door-sweep" aria-hidden />
        </a>

        <form onSubmit={submit} className="login-card">
          <div className="tabular mb-[clamp(16px,4vw,24px)] text-center text-[14px] font-semibold uppercase tracking-[0.34em]" style={{ color: "rgba(168,85,247,0.85)" }}>Agency Access</div>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your work email" autoComplete="username"
            className="login-input w-full rounded-xl px-5 py-4 text-[19px] text-ink outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password"
            className="login-input mt-3.5 w-full rounded-xl px-5 py-4 text-[19px] text-ink outline-none" />
          {error && <p className="mt-3 text-[15px] text-alert">{error}</p>}
          <button type="submit" disabled={busy}
            className="login-cta mt-[clamp(18px,4.5vw,24px)] w-full rounded-full py-4 text-[17px] font-bold uppercase tracking-[0.18em] text-white transition disabled:opacity-70"
            style={{ background: "linear-gradient(135deg,#EC4899 0%,#8B5CF6 100%)", boxShadow: "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)" }}>
            {busy ? "Checking…" : "Sign in →"}
          </button>
          {/* Same muted colour as the line beneath it (Gary) - it is a quiet secondary action, not a second
              call to action competing with Sign in. The underline carries the affordance instead of colour. */}
          <p className="mt-[clamp(14px,3.5vw,24px)] text-center text-[14px] leading-relaxed">
            <a href="/reset" className="text-ink-faint underline-offset-4 hover:text-ink-dim hover:underline">Forgotten your password?</a>
          </p>
          {/* "Contact" and the address stay together on their own line, so the address never dangles alone at
              the end of a wrap. */}
          <p className="mt-3 text-center text-[14px] leading-relaxed text-ink-faint">
            Access is by invitation only.<br />
            Contact <a href="mailto:grow@gasmarketing.co.za" className="text-ink-faint underline-offset-2 hover:text-ink-dim hover:underline">grow@gasmarketing.co.za</a>.
          </p>
        </form>

        <p className="tabular mt-[clamp(16px,4vw,28px)] flex items-center gap-2 text-[12px] uppercase tracking-[0.3em] text-ink-faint">
          <span aria-hidden>🔒</span> Secure platform · Human Command. <span style={{ color: "#F96203" }}>AI Execution.</span>
        </p>
      </div>
    </div>
  );
}
