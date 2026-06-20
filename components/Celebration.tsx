"use client";

import { useEffect, useState } from "react";

// A one-shot confetti + streamers celebration that fills the screen when a cut is finished.
const QUIRKS = [
  "{name} is LIVE! 🎉",
  "And… that's a wrap on {name}! 🎬",
  "{name} just dropped a banger 🔥",
  "{name} is ready for her close-up ✨",
  "Cut! {name} absolutely nailed it 👏",
  "Lights, camera, {name}! 🌟",
];
const COLORS = ["#a855f7", "#60a5fa", "#ec4899", "#f59e0b", "#34c759", "#ffffff"];

export default function Celebration({ name, onDone }: { name: string; onDone: () => void }) {
  const [line] = useState(() => QUIRKS[Math.floor(Math.random() * QUIRKS.length)].replace("{name}", name));
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div onClick={onDone} className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/45 backdrop-blur-[1px]">
      <style>{`
        @keyframes gas-confetti { 0% { transform: translateY(-15vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(115vh) rotate(720deg); opacity: 0.85; } }
        @keyframes gas-streamer { 0% { transform: translateY(-100%) scaleY(0.2); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(115vh) scaleY(1); opacity: 0.7; } }
        @keyframes gas-pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
      {/* confetti */}
      {Array.from({ length: 70 }).map((_, i) => {
        const left = (i * 31) % 100;
        const w = 6 + (i % 4) * 3;
        return <span key={`c${i}`} style={{ position: "absolute", top: 0, left: `${left}%`, width: w, height: w * 1.7, background: COLORS[i % COLORS.length], borderRadius: 2, animation: `gas-confetti ${2.3 + (i % 5) * 0.5}s linear ${(i % 12) * 0.13}s 1 both` }} />;
      })}
      {/* streamers */}
      {Array.from({ length: 14 }).map((_, i) => {
        const left = (i * 71) % 100;
        return <span key={`s${i}`} style={{ position: "absolute", top: 0, left: `${left}%`, width: 4, height: "40vh", transformOrigin: "top", background: `linear-gradient(${COLORS[i % COLORS.length]}, transparent)`, animation: `gas-streamer ${3 + (i % 4) * 0.4}s ease-in ${(i % 6) * 0.1}s 1 both` }} />;
      })}
      <div className="relative rounded-2xl border border-[#a855f7]/40 bg-surface-1/90 px-10 py-7 text-center shadow-[0_0_60px_rgba(168,85,247,0.5)]" style={{ animation: "gas-pop 0.5s ease-out both" }}>
        <div className="text-3xl font-extrabold brand-grad sm:text-4xl">{line}</div>
        <div className="mt-2 text-sm text-ink-dim">Your cut is ready. Tap anywhere to continue →</div>
      </div>
    </div>
  );
}
