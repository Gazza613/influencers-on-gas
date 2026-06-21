import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listEndCards } from "@/lib/endcards";
import EndCardsManager from "@/components/EndCardsManager";

export const dynamic = "force-dynamic";

export default async function EndCardsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const cards = await listEndCards().catch(() => []);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">End Cards 🎬</h1>
      <p className="mt-1 text-sm text-ink-dim">A reusable library of closing frames and clips. Upload once, then append any of them to a finished cut from the Producer brief.</p>
      <div className="mt-6"><EndCardsManager initial={cards} /></div>
    </div>
  );
}
