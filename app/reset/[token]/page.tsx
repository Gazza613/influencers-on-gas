import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { ChooseNewPassword } from "@/components/ResetForms";
import { getReset, isGasEmail } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getReset(token);
  const reset = found && isGasEmail(found.email) ? found : null;

  return (
    <AuthShell eyebrow="Studio access">
      {reset ? (
        <ChooseNewPassword token={token} email={reset.email} />
      ) : (
        <div className="text-center">
          <div className="text-[17px] font-bold text-ink">This link has expired</div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
            Reset links last an hour and can only be used once. Ask for a fresh one and it will be with you in a moment.
          </p>
          <Link href="/reset" className="btn-brand mt-6 inline-block rounded-full px-7 py-3.5 text-[16px] font-bold">Send a new link →</Link>
        </div>
      )}
    </AuthShell>
  );
}
