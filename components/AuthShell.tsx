// The frame shared by every out-of-app auth screen: invite, forgotten password, choose a new password.
//
// It existed three times as copy-pasted markup, so the rebrand to Studio on GAS reached the login page and
// left the invite page still saying "Influencers on GAS" - the one screen a brand-new teammate sees first.
// One component means the next rename cannot half-apply.
//
// Deliberately matched to /login: same orbs, same glowing card, same wordmark treatment in caps with positive
// tracking. Someone who arrives from an invite email and then signs in should not feel they changed product.

export default function AuthShell({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6" style={{ background: "#07070E" }}>
      <div style={{ position: "absolute", width: 700, height: 700, top: "-22%", left: "-15%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.22) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 620, height: 620, bottom: "-22%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.18) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gas-logo.png" alt="GAS" className="rounded-full" style={{ width: "clamp(84px, 24vw, 158px)", height: "clamp(84px, 24vw, 158px)", filter: "drop-shadow(0 12px 40px rgba(255,90,30,0.55))" }} />
        <h1 className="mt-[clamp(14px,4vw,28px)] inline-flex items-baseline gap-[0.32em] font-extrabold" style={{ fontSize: "clamp(19px, 4.6vw, 30px)", letterSpacing: "0.08em" }}>
          <span style={{ background: "linear-gradient(135deg,#EC4899 0%,#A855F7 50%,#60A5FA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>STUDIO ON</span>
          <span style={{ fontWeight: 900, background: "linear-gradient(135deg,#FFB020,#FF6A00 45%,#FF2D55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>GAS</span>
        </h1>
        <p className="tabular mt-[clamp(8px,2vw,12px)] text-[14px] uppercase tracking-[0.38em]" style={{ color: "rgba(255,255,255,0.42)" }}>{eyebrow}</p>

        <div className="login-card mt-[clamp(20px,5vw,36px)] w-full rounded-2xl p-[clamp(22px,6vw,36px)]">{children}</div>
      </div>

      <style>{`
        .login-card {
          background: linear-gradient(180deg, rgba(18,14,26,0.82) 0%, rgba(10,9,16,0.86) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(168,85,247,0.34);
          box-shadow: 0 0 0 1px rgba(168,85,247,0.06), 0 0 38px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .auth-input { background: rgba(8,7,12,0.6); border: 1px solid rgba(255,255,255,0.08); transition: border-color .15s, box-shadow .15s; }
        .auth-input::placeholder { color: rgba(255,255,255,0.32); }
        .auth-input:focus { border-color: rgba(168,85,247,0.7); box-shadow: 0 0 0 3px rgba(168,85,247,0.16); }
      `}</style>
    </div>
  );
}
