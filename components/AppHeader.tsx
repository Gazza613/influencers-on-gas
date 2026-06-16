"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SignOutButton from "@/components/SignOutButton";
import CostReadout from "@/components/CostReadout";
import SetupNav from "@/components/SetupNav";

// Persistent top navigation shown on every signed-in page so you can always move
// around (and never get stuck). Logo → studio, the section nav, cost readout, sign out.
export default function AppHeader() {
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : { user: null })).then((d) => setMe(d.user)).catch(() => {});
  }, []);

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-y-2 border-b border-line bg-surface-1 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/studio" className="flex items-center gap-2 font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gas-logo.png" alt="GAS" className="h-6 w-6 rounded-full" />
          <span className="hidden sm:inline">Influencers <span className="brand-grad">on</span> GAS</span>
        </Link>
        <span className="hidden text-ink-faint sm:inline">/</span>
        <SetupNav isSuperAdmin={me?.role === "super_admin"} />
      </div>
      <div className="flex items-center gap-3">
        <CostReadout />
        <SignOutButton />
      </div>
    </header>
  );
}
