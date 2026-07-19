import AuthShell from "@/components/AuthShell";
import { RequestReset } from "@/components/ResetForms";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthShell eyebrow="Studio access">
      <RequestReset />
    </AuthShell>
  );
}
