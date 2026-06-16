"use client";

import { useState } from "react";

export default function SetPassword({ token, email }: { token: string; email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/invite/accept", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not set your password."); setBusy(false); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="text-sm text-ink">Password set. You're all in. 🎉</div>
        <a href="/login" className="btn-brand mt-4 inline-block rounded-full px-6 py-3 text-sm font-bold">Sign in →</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full">
      <p className="mb-4 text-center text-xs text-ink-dim">Setting up <span className="text-ink">{email}</span></p>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Choose a password (8+ chars)" autoComplete="new-password"
        className="w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:border-[#a855f7]" />
      <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm password" autoComplete="new-password"
        className="mt-2.5 w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink outline-none focus:border-[#a855f7]" />
      {err && <p className="mt-3 text-xs text-alert">{err}</p>}
      <button type="submit" disabled={busy} className="btn-brand mt-4 w-full rounded-full py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-70">
        {busy ? "Setting…" : "Set password & continue →"}
      </button>
    </form>
  );
}
