import AppHeader from "@/components/AppHeader";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
