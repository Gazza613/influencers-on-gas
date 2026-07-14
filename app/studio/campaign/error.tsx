"use client";

import { useEffect } from "react";

// "This page couldn't load" tells you nothing and, worse, looks identical whether the cause is a stale
// JavaScript chunk after a deploy (harmless, a reload fixes it) or a real bug in the page. Those need
// different responses from the person staring at the screen, so name them.
//
// The plan is kept. It lives in localStorage now, so a crash here no longer throws away work you paid for
// and then edited by hand.
export default function CampaignError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[studio/campaign]", error); }, [error]);

  // A ChunkLoadError means the browser went looking for JavaScript that a new deploy has replaced. It is not
  // a bug in the page - the tab is just older than the server.
  const stale = /chunk|Loading chunk|dynamically imported module|Failed to fetch/i.test(error?.message || "");

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {stale ? "This tab is older than the app" : "Something in this page broke"}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
        {stale
          ? "A new version was deployed while you had this open, so the browser went looking for code that no longer exists. Nothing is wrong with your work - reload and it will come straight back."
          : "The page hit an error while rendering. Your campaign plan is saved locally, so reloading should bring it back rather than lose it."}
      </p>

      {!stale && error?.message && (
        <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-dim">
          {error.message}{error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
      )}

      <div className="mt-6 flex gap-3">
        <button onClick={() => reset()} className="rounded-lg bg-accent px-5 py-2.5 text-[15px] font-bold text-black">
          Reload the page
        </button>
        <button
          onClick={() => { try { localStorage.removeItem("gas-studio-campaign"); } catch {} location.reload(); }}
          className="rounded-lg border border-line px-5 py-2.5 text-[15px] font-semibold text-ink-dim hover:text-ink"
        >
          Reload and discard the saved plan
        </button>
      </div>
    </div>
  );
}
