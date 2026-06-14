import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-extrabold tracking-tight">
            GAS<span className="text-accent">·</span>Studio
          </Link>
          <span className="text-ink-faint">/</span>
          <span className="text-sm text-ink-dim">Setup</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-ink-dim hover:text-ink">← Studio</Link>
          <SignOutButton />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr]">
        <nav className="flex flex-col gap-1 border-r border-line bg-surface-1 p-3">
          <p className="tabular mb-2 px-2 text-[10px] uppercase tracking-[0.25em] text-ink-faint">Setup</p>
          <Link href="/setup/connect" className="rounded-md px-2.5 py-2 text-[13px] text-ink-dim hover:bg-surface-2 hover:text-ink">
            Connect Tools
          </Link>
          <Link href="/setup/influencers" className="rounded-md px-2.5 py-2 text-[13px] text-ink-dim hover:bg-surface-2 hover:text-ink">
            Influencers
          </Link>
          <div className="flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] text-ink-faint">
            Brains <span className="tabular text-[9px] uppercase tracking-wide">Phase 4</span>
          </div>
        </nav>
        <main className="min-h-0 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
