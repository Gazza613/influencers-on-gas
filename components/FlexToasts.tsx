"use client";

import { useEffect, useState } from "react";

type Toast = { id: string; message: string; milestone: boolean; anim: string };
const ANIMS = ["toast-in-pop", "toast-in-slide", "toast-in-flip"];
const COLORS = ["#ec4899", "#a855f7", "#60a5fa", "#34c759", "#ffb020"];

function Confetti() {
  // A small burst of streamers for milestone toasts.
  const bits = Array.from({ length: 14 }, (_, i) => i);
  return (
    <span className="confetti" aria-hidden>
      {bits.map((i) => (
        <i key={i} style={{
          left: `${5 + Math.random() * 90}%`,
          background: COLORS[i % COLORS.length],
          ["--cx" as string]: `${(Math.random() - 0.5) * 40}px`,
          animationDelay: `${Math.random() * 0.2}s`,
        }} />
      ))}
    </span>
  );
}

// Renders animated flex call-outs dispatched via flex() (lib/flex.ts).
export default function FlexToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const onFlex = (e: Event) => {
      const d = (e as CustomEvent).detail as { id: string; message: string; milestone: boolean };
      const t: Toast = { ...d, anim: ANIMS[Math.floor(Math.random() * ANIMS.length)] };
      setToasts((prev) => [...prev.slice(-3), t]); // keep at most 4 on screen
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), t.milestone ? 4500 : 3200);
    };
    window.addEventListener("flex-toast", onFlex as EventListener);
    return () => window.removeEventListener("flex-toast", onFlex as EventListener);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex max-w-[92vw] flex-col items-end gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex-toast ${t.anim} ${t.milestone ? "flex-toast-milestone" : ""}`}>
          {t.milestone && <Confetti />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
