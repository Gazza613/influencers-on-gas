"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

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
      signOut({ callbackUrl: "/login" });
    }
  }, [pathname]);
  return null;
}
