"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

// SIGN OUT -> ALWAYS the home page. This used to be signOut({ redirectTo: "/" }) and landed home only
// INTERMITTENTLY (Gary), because that hands the redirect to Auth.js: the session POST and a client-side
// navigation race, and when the router wins you stay put or bounce through the gate.
//
// So we do not race. Clear the session first (redirect:false), THEN hard-navigate ourselves with
// window.location - a full page load, so no stale client cache or in-flight route can win. If the signout call
// itself fails we still leave: staying on a gated page with a half-dead session is the worse outcome.
export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    try {
      await signOut({ redirect: false });
    } catch {
      /* leave anyway - see above */
    }
    window.location.href = "/";
  }

  return (
    <button
      onClick={out}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim transition hover:border-line-strong hover:text-ink disabled:opacity-50"
    >
      {busy && (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
