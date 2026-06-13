"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim transition hover:border-line-strong hover:text-ink"
    >
      Sign out
    </button>
  );
}
