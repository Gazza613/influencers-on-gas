import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import SetPassword from "@/components/SetPassword";
import { getInvite, isGasEmail } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getInvite(token);
  const invite = found && isGasEmail(found.email) ? found : null;

  return (
    <AuthShell eyebrow="Welcome to the studio">
      {invite ? (
        <SetPassword token={token} email={invite.email} />
      ) : (
        <div className="text-center">
          <div className="text-[17px] font-bold text-ink">This invite has expired</div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
            Invitations last 7 days and are for GAS Marketing addresses. For a fresh one, email{" "}
            <a href="mailto:grow@gasmarketing.co.za" className="inline-block px-1 py-2 text-accent underline-offset-2 hover:underline">grow@gasmarketing.co.za</a>.
          </p>
          <Link href="/login" className="mt-5 inline-block text-[15px] font-semibold text-accent">← Back to sign in</Link>
        </div>
      )}
    </AuthShell>
  );
}
