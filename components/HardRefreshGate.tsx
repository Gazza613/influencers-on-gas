"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Security posture (Gary): a reload/refresh (incl. Ctrl+Shift+R) of any signed-in page
// must land back on the login screen. We detect a reload navigation and sign out, so the
// gate sends the user to /login. Runs once per document load (a reload makes a fresh one).
let handled = false;

export default function HardRefreshGate() {
  const pathname = usePathname();
  useEffect(() => {
    if (handled) return;
    handled = true;
    if (pathname === "/login") return; // reloading the login page is fine
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload") {
      // Fallback if the pre-paint head script didn't catch it: fast cookie-clearing hop.
      window.location.replace("/api/relogin");
    }
  }, [pathname]);
  return null;
}
