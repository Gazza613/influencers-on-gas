import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { listEndCards } from "@/lib/endcards";
import EndCardsManager from "@/components/EndCardsManager";

export const dynamic = "force-dynamic";

export default async function EndCardsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const cards = await listEndCards().catch(() => []);
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-5 py-6">
          <Link href="/studio" className="text-xs font-semibold text-ink-dim hover:text-ink">← Studio</Link>
          <h1 className="mt-2 text-2xl font-bold">End Cards 🎬</h1>
          <p className="mt-1 text-sm text-ink-dim">A reusable library of closing frames and clips. Upload once, then append any of them to a finished cut from the Producer brief or the Stitch step.</p>
          <div className="mt-6"><EndCardsManager initial={cards} /></div>
        </div>
      </main>
    </div>
  );
}
