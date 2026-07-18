"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// CONTEXTUAL NAV (Gary: "the nav buttons seem a little confusing now as it applies for the influencers").
//
// The header used to render ONE menu on every page, and that menu was the Influencers studio's (Cast & Cuts,
// End Cards, Showcase). On the Dashboard, whose entire job is to send you to one of six desks, it competed with
// the tiles and implied the whole platform was Influencers. Inside Studio or the Journalist it advertised
// another product's features.
//
// Three rules now:
//   1. THE DASHBOARD SHOWS NO DESK NAV. The tiles ARE the navigation. Only Brains and Cost Control stay, because
//      both are cross-desk tools the team flexes in front of clients, not one product's features.
//   2. INSIDE A DESK you see THAT desk's links, plus "← Dashboard" to get back out.
//   3. PLATFORM ADMIN (Connect Tools, Team) hides behind one Setup menu so it never crowds the work.

type Item = { href: string; label: string };
type Desk = { match: RegExp; links: Item[]; newHref?: string; newLabel?: string };

// Each desk owns a set of routes. Order matters: the first match wins, so /setup/influencers must be claimed by
// the Influencers desk before any broader /setup rule could see it.
const DESKS: Desk[] = [
  {
    // The AI-influencer video studio.
    match: /^\/(influencers|setup\/influencers|end-cards|showcase|start)(\/|$)/,
    newHref: "/start",
    newLabel: "+ New",
    links: [
      { href: "/influencers", label: "Cast & Cuts" },
      { href: "/setup/influencers", label: "Influencers" },
      { href: "/end-cards", label: "End Cards" },
      { href: "/showcase", label: "Showcase" },
    ],
  },
  {
    // The creative factory.
    match: /^\/studio(\/|$)/,
    links: [
      { href: "/studio", label: "Overview" },
      { href: "/studio/intake", label: "Intake" },
      { href: "/studio/build", label: "Build" },
      { href: "/studio/campaign", label: "Campaign" },
      { href: "/studio/deal-cards", label: "Deal cards" },
    ],
  },
  // The two research desks are single screens. They need no sub-nav, only the way back out.
  { match: /^\/journalist(\/|$)/, links: [] },
  { match: /^\/strategist(\/|$)/, links: [] },
];

// Cross-desk tools. Brains and Cost Control are visible work tools; the rest is admin.
const BRAINS: Item = { href: "/setup/brains", label: "Brains" };
const COSTS: Item = { href: "/cost-control", label: "Cost Control" };
const ADMIN: Item[] = [{ href: "/setup/connect", label: "Connect Tools" }];

export default function SetupNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const desk = DESKS.find((d) => d.match.test(pathname));
  const onDashboard = pathname === "/dashboard";
  const isActive = (h: string) => pathname === h || pathname.startsWith(h + "/");
  const admin = isSuperAdmin ? [...ADMIN, { href: "/setup/users", label: "Team" }] : ADMIN;

  const cls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-[13px] font-medium transition ${active ? "bg-surface-2 text-ink" : "text-ink-dim hover:bg-surface-2/60 hover:text-ink"}`;
  const drawerCls = (active: boolean) =>
    `block rounded-md px-3 py-2 text-[13px] font-medium transition ${active ? "bg-surface-2 text-ink" : "text-ink-dim hover:bg-surface-2/60 hover:text-ink"}`;

  return (
    <nav className="flex items-center gap-1">
      {/* Back to the six desks, from anywhere that is not already there. */}
      {!onDashboard && (
        <Link href="/dashboard" className={cls(false)} title="All six desks">← Dashboard</Link>
      )}

      {/* The desk's own create action, where it has one. */}
      {desk?.newHref && (
        <Link href={desk.newHref} className="mr-1 rounded-md border border-[#a855f7]/40 bg-[#a855f7]/15 px-3 py-1.5 text-[13px] font-bold text-[#c79bff] transition hover:bg-[#a855f7]/25">
          {desk.newLabel}
        </Link>
      )}

      {/* THIS desk's links only, never another product's. */}
      {desk && desk.links.length > 0 && (
        <>
          <span className="hidden items-center gap-1 md:flex">
            {desk.links.map((l) => <Link key={l.href} href={l.href} className={cls(isActive(l.href))}>{l.label}</Link>)}
          </span>

          {/* Below md the desk links collapse rather than breaking into a stack. */}
          <div className="relative md:hidden">
            <button onClick={() => setOpen((o) => !o)} aria-label="Open navigation menu" aria-expanded={open} className={cls(false)}>☰ Menu</button>
            {open && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                <div className="absolute left-0 z-40 mt-1 w-56 rounded-lg border border-line bg-surface-1 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                  {desk.links.map((l) => (
                    <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={drawerCls(isActive(l.href))}>{l.label}</Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Cross-desk tools, everywhere. Brains is client-facing, so it stays top level rather than hiding. */}
      <Link href={BRAINS.href} className={cls(isActive(BRAINS.href))}>{BRAINS.label}</Link>
      <Link href={COSTS.href} className={`hidden sm:block ${cls(isActive(COSTS.href))}`}>{COSTS.label}</Link>

      {/* Platform admin, one menu, out of the way. */}
      <div className="relative">
        <button onClick={() => setSetupOpen((o) => !o)} aria-label="Setup menu" aria-expanded={setupOpen} className={cls(admin.some((l) => isActive(l.href)))}>⚙</button>
        {setupOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setSetupOpen(false)} />
            <div className="absolute left-0 z-40 mt-1 w-52 rounded-lg border border-line bg-surface-1 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              {/* Cost Control lives here too, so it is reachable on a phone where the inline link is hidden. */}
              {[COSTS, ...admin].map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setSetupOpen(false)} className={drawerCls(isActive(l.href))}>{l.label}</Link>
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
