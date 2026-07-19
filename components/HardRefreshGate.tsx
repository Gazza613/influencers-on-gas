"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Security posture (Gary): a reload/refresh (incl. Ctrl+Shift+R) of any signed-in page must re-gate
// (clear the session and re-authenticate). We detect a reload navigation and hop through /api/relogin,
// which clears the cookies and lands the user on the PUBLIC LANDING PAGE - not the login form, which read
// as being kicked out. The current path rides along as ?to= and is handed on to /login when they choose to
// sign in, so they still return to the SAME page. Runs once per document load (a reload makes a fresh one).
let handled = false;

export default function HardRefreshGate() {
  const pathname = usePathname();
  useEffect(() => {
    if (handled) return;
    handled = true;
    // Public routes must NOT re-gate on reload: the homepage, the login page, and the PUBLIC showcase share
    // links (/s/[token]) - reloading a public brag link should just refresh it, never bounce to login.
    if (pathname === "/login" || pathname === "/" || pathname.startsWith("/s/")) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload") {
      // Fallback if the pre-paint head script didn't catch it: fast cookie-clearing hop that keeps place.
      window.location.replace("/api/relogin?to=" + encodeURIComponent(window.location.pathname + window.location.search));
    }
  }, [pathname]);
  return null;
}
