import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "@/components/SignOutButton";
import CostReadout from "@/components/CostReadout";
import SetupNav from "@/components/SetupNav";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isSuperAdmin = session?.user?.role === "super_admin";
  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-y-2 border-b border-line bg-surface-1 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gas-logo.png" alt="GAS" className="h-6 w-6 rounded-full" />
            <span className="hidden sm:inline">Influencers <span className="brand-grad">on</span> GAS</span>
          </Link>
          <span className="hidden text-ink-faint sm:inline">/</span>
          <SetupNav isSuperAdmin={isSuperAdmin} />
        </div>
        <div className="flex items-center gap-3">
          <CostReadout />
          <Link href="/studio" className="hidden text-xs text-ink-dim hover:text-ink sm:inline">Studio →</Link>
          <SignOutButton />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
