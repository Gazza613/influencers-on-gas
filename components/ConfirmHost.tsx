"use client";

import { useEffect, useRef, useState } from "react";
import type { ConfirmOpts } from "@/lib/confirm";

type Pending = { opts: ConfirmOpts; resolve: (ok: boolean) => void };

// The single branded confirm modal. Listens for askConfirm(...) dispatches and resolves the
// caller's promise on Confirm (true) / Cancel|Esc|backdrop (false). One surface, one look, for
// every spend-or-delete action across the app.
export default function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent).detail as Pending;
      // If a dialog is somehow already open, resolve the older one as "false" before replacing it,
      // so its awaiting caller can never hang on an un-resolved promise (a silent blocked spend/delete).
      setPending((prev) => { prev?.resolve(false); return d; });
    };
    window.addEventListener("gas-confirm", onAsk as EventListener);
    return () => window.removeEventListener("gas-confirm", onAsk as EventListener);
  }, []);

  // Focus the primary action + wire Esc/Enter once a dialog is open.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => confirmRef.current?.focus(), 30);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { ev.preventDefault(); close(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function close(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
  }

  if (!pending) return null;
  const { title, body, confirmLabel, cancelLabel, tone = "default", cost } = pending.opts;

  // Danger = destructive (red); spend = costs money (amber/pink); default = neutral accent.
  const accent = tone === "danger" ? "#ef4444" : tone === "spend" ? "#f59e0b" : "#a855f7";
  const glyph = tone === "danger" ? "🗑" : tone === "spend" ? "💳" : "❓";
  const confirmBg =
    tone === "danger"
      ? "linear-gradient(135deg,#ef4444 0%,#b91c1c 100%)"
      : tone === "spend"
        ? "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)"
        : "linear-gradient(135deg,#ec4899 0%,#8b5cf6 100%)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gas-confirm-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(4,4,9,0.66)", backdropFilter: "blur(3px)", animation: "gasConfirmFade 0.14s ease" }}
    >
      <div
        style={{ width: "100%", maxWidth: 440, borderRadius: 18, border: `1px solid ${accent}55`, background: "linear-gradient(180deg,#141019 0%,#0c0b12 100%)", boxShadow: `0 0 0 1px ${accent}18, 0 24px 70px rgba(0,0,0,0.6)`, padding: 24, animation: "gasConfirmPop 0.16s cubic-bezier(0.2,0.8,0.3,1.2)" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div aria-hidden style={{ display: "flex", height: 40, width: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 11, background: `${accent}1f`, border: `1px solid ${accent}44`, fontSize: 19 }}>{glyph}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="gas-confirm-title" style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.2px", color: "#fff", lineHeight: 1.3 }}>{title}</h2>
            {body && <p style={{ marginTop: 7, fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.62)" }}>{body}</p>}
          </div>
        </div>

        {cost && (
          <div style={{ marginTop: 15, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 11, border: `1px solid ${accent}3a`, background: `${accent}12`, padding: "9px 13px" }}>
            <span className="tabular" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)" }}>Estimated cost</span>
            <span className="tabular" style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{cost}</span>
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={() => close(false)}
            style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)", cursor: "pointer" }}
          >
            {cancelLabel || "Cancel"}
          </button>
          <button
            ref={confirmRef}
            onClick={() => close(true)}
            style={{ borderRadius: 999, border: "none", background: confirmBg, padding: "10px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", boxShadow: `0 6px 24px ${accent}55` }}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes gasConfirmFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes gasConfirmPop { from { opacity: 0; transform: translateY(8px) scale(0.97) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}
