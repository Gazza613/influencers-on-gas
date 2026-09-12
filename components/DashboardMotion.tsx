"use client";

import { useEffect } from "react";

// PROGRESSIVE ENHANCEMENT for the dashboard front door. The page stays a server component (instant, SEO-safe);
// this island only ADDS motion on top of already-rendered content: the hero stat counters count up, and the pod
// tiles get a restrained tilt-and-lift on hover. Everything is readable and usable with JS off - the final
// numbers are server-rendered, and the tiles are ordinary links. Renders nothing.
export default function DashboardMotion() {
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Count-up the hero stats from a visible resting state (the server already rendered the final value).
    document.querySelectorAll<HTMLElement>(".agn [data-count]").forEach((el) => {
      const target = parseInt(el.getAttribute("data-count") || "0", 10) || 0;
      if (reduce) { el.textContent = target.toLocaleString("en-ZA"); return; }
      const start = performance.now(), dur = 1100;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * e).toLocaleString("en-ZA");
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // Restrained tilt-and-lift on hover (fine pointers only). Cleaned up on unmount.
    const fine = window.matchMedia && window.matchMedia("(pointer:fine)").matches;
    const cleanups: (() => void)[] = [];
    if (!reduce && fine) {
      document.querySelectorAll<HTMLElement>(".agn .agn-tile:not(.is-soon)").forEach((t) => {
        const move = (e: PointerEvent) => {
          const r = t.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
          t.style.transform = `perspective(900px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 4).toFixed(2)}deg) translateY(-3px)`;
        };
        const leave = () => { t.style.transform = ""; };
        t.addEventListener("pointermove", move);
        t.addEventListener("pointerleave", leave);
        cleanups.push(() => { t.removeEventListener("pointermove", move); t.removeEventListener("pointerleave", leave); });
      });
    }
    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
