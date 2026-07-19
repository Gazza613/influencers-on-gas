"use client";

import { useState } from "react";

const input = "auth-input w-full rounded-xl px-5 py-4 text-[19px] text-ink outline-none";
const cta = "mt-6 w-full rounded-full py-4 text-[17px] font-bold uppercase tracking-[0.18em] text-white transition disabled:opacity-60";
const ctaStyle = { background: "linear-gradient(135deg,#EC4899 0%,#8B5CF6 100%)", boxShadow: "0 0 32px rgba(168,85,247,0.45), 0 4px 20px rgba(0,0,0,0.5)" };

// STEP 1: ask for a link.
//
// The success message is IDENTICAL whether or not the address has an account, and the server behaves the same
// way too. Telling an anonymous visitor "no such user" would turn this form into a way to enumerate who works
// at GAS, and those addresses are the first half of a credential attack.
export function RequestReset() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    await fetch("/api/reset", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }),
    }).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="text-[17px] font-bold text-ink">Check your email</div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          If that address has a Studio on GAS account, a reset link is on its way. It expires in an hour.
        </p>
        <a href="/login" className="mt-6 inline-block text-[15px] font-semibold text-accent">← Back to sign in</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="tabular mb-[clamp(16px,4vw,24px)] text-center text-[14px] font-semibold uppercase tracking-[0.34em]" style={{ color: "rgba(168,85,247,0.85)" }}>Forgotten password</div>
      <p className="mb-5 text-center text-[15px] leading-relaxed text-ink-dim">
        Enter your work email and we will send you a link to choose a new password.
      </p>
      <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="Your work email" autoComplete="username" className={input} />
      <button type="submit" disabled={busy || !email.trim()} className={cta} style={ctaStyle}>
        {busy ? "Sending…" : "Send the link →"}
      </button>
      <p className="mt-[clamp(14px,3.5vw,24px)] text-center text-[14px] text-ink-faint">
        <a href="/login" className="text-accent">← Back to sign in</a>
      </p>
    </form>
  );
}

// STEP 2: choose the new password.
export function ChooseNewPassword({ token, email }: { token: string; email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Matched to the server, which is the one that actually enforces it. Ten rather than eight: this is the
    // only credential on an account that can spend real money through the vendor APIs.
    if (pw.length < 10) { setErr("Use at least 10 characters."); return; }
    if (pw !== pw2) { setErr("Those two do not match."); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/reset", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not set your password."); setBusy(false); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="text-[17px] font-bold text-ink">Password changed</div>
        <p className="mt-3 text-[15px] text-ink-dim">You can sign in with your new password now.</p>
        <a href="/login" className="btn-brand mt-6 inline-block rounded-full px-7 py-3.5 text-[16px] font-bold">Sign in →</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="tabular mb-4 text-center text-[14px] font-semibold uppercase tracking-[0.34em]" style={{ color: "rgba(168,85,247,0.85)" }}>New password</div>
      <p className="mb-5 text-center text-[15px] text-ink-dim">for <span className="text-ink">{email}</span></p>
      <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="New password" autoComplete="new-password" className={input} />
      <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
        placeholder="Type it again" autoComplete="new-password" className={`${input} mt-3.5`} />
      {err && <p className="mt-3 text-[15px] text-alert">{err}</p>}
      <button type="submit" disabled={busy} className={cta} style={ctaStyle}>
        {busy ? "Saving…" : "Save and sign in →"}
      </button>
      <p className="mt-[clamp(14px,3.5vw,24px)] text-center text-[14px] leading-relaxed text-ink-faint">
        At least 10 characters. Use something you do not use anywhere else.
      </p>
    </form>
  );
}
