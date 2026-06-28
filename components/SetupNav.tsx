"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/studio", label: "Studio" },
  { href: "/setup/influencers", label: "Influencers" },
  { href: "/setup/brains", label: "Brains" },
  { href: "/setup/connect", label: "Connect Tools" },
  { href: "/end-cards", label: "End Cards" },
  { href: "/showcase", label: "Showcase" },
  { href: "/cost-control", label: "Cost Control" },
];

// Top-bar section nav for Setup. The "+ New" button is the core create-an-influencer action
// (→ /start launcher), always visible. Inline links on md+; a hamburger drawer below that so
// the nav never collapses into a broken stack on tablet/phone. Team is super-admin only.
export default function SetupNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = isSuperAdmin ? [...LINKS, { href: "/setup/users", label: "Team" }] : LINKS;
  const isActive = (h: string) => pathname === h || pathname.startsWith(h + "/");

  return (
    <nav className="flex items-center gap-1">
      {/* The core action - create a new influencer - always discoverable */}
      <Link href="/start" className="mr-1 rounded-md border border-[#a855f7]/40 bg-[#a855f7]/15 px-3 py-1.5 text-[13px] font-bold text-[#c79bff] transition hover:bg-[#a855f7]/25">+ New</Link>

      {/* Inline links on desktop */}
      <span className="hidden items-center gap-1 md:flex">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${isActive(l.href) ? "bg-surface-2 text-ink" : "text-ink-dim hover:bg-surface-2/60 hover:text-ink"}`}>
            {l.label}
          </Link>
        ))}
      </span>

      {/* Hamburger drawer on tablet/phone */}
      <div className="relative md:hidden">
        <button onClick={() => setOpen((o) => !o)} aria-label="Open navigation menu" aria-expanded={open} className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-dim transition hover:bg-surface-2/60 hover:text-ink">☰ Menu</button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-40 mt-1 w-52 rounded-lg border border-line bg-surface-1 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              {links.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`block rounded-md px-3 py-2 text-[13px] font-medium transition ${isActive(l.href) ? "bg-surface-2 text-ink" : "text-ink-dim hover:bg-surface-2/60 hover:text-ink"}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
