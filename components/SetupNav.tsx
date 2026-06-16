"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/studio", label: "Studio" },
  { href: "/setup/influencers", label: "Influencers" },
  { href: "/setup/brains", label: "Brains" },
  { href: "/setup/connect", label: "Connect Tools" },
  { href: "/cost-control", label: "Cost Control" },
];

// Top-bar section nav for Setup (replaces the old left sidebar so the build
// journey gets the full canvas width). Team is super-admin only.
export default function SetupNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isSuperAdmin ? [...LINKS, { href: "/setup/users", label: "Team" }] : LINKS;
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
              active ? "bg-surface-2 text-ink" : "text-ink-dim hover:bg-surface-2/60 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
