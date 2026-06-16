import Link from "next/link";
import { getInvite } from "@/lib/users";
import SetPassword from "@/components/SetPassword";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvite(token);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6" style={{ background: "#07070E" }}>
      <div style={{ position: "absolute", width: 700, height: 700, top: "-22%", left: "-15%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.22) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 620, height: 620, bottom: "-22%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.18) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      <div className="relative z-10 flex w-full max-w-[400px] flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gas-logo.png" alt="GAS" width={96} height={96} className="rounded-full" style={{ filter: "drop-shadow(0 12px 40px rgba(255,90,30,0.55))" }} />
        <h1 className="mt-6 inline-flex items-baseline gap-[0.32em] text-2xl font-extrabold">
          <span className="brand-grad">Influencers on</span>
          <span style={{ fontWeight: 900, background: "linear-gradient(135deg,#FFB020,#FF6A00 45%,#FF2D55)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>GAS</span>
        </h1>
        <p className="tabular mt-2 text-[11px] uppercase tracking-[0.42em]" style={{ color: "rgba(255,255,255,0.42)" }}>Welcome to the studio</p>

        <div className="login-card mt-8 w-full rounded-2xl p-8">
          {invite ? (
            <SetPassword token={token} email={invite.email} />
          ) : (
            <div className="text-center">
              <div className="text-sm font-semibold text-ink">This invite link is invalid or expired</div>
              <p className="mt-2 text-xs text-ink-dim">Ask Gary to send you a fresh invite.</p>
              <Link href="/login" className="mt-4 inline-block text-xs text-accent">← Back to sign in</Link>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .login-card {
          background: linear-gradient(180deg, rgba(18,14,26,0.82) 0%, rgba(10,9,16,0.86) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(168,85,247,0.34);
          box-shadow: 0 0 0 1px rgba(168,85,247,0.06), 0 0 38px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.04);
        }
      `}</style>
    </div>
  );
}
