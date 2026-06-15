import { listInfluencers } from "@/lib/influencers";
import InfluencerRoster from "@/components/InfluencerRoster";

export const dynamic = "force-dynamic";

export default async function InfluencersLayout({ children }: { children: React.ReactNode }) {
  const influencers = await listInfluencers();
  return (
    <div className="grid h-full min-h-0 grid-cols-[248px_1fr] gap-6">
      <aside className="min-h-0 border-r border-line pr-4">
        <InfluencerRoster influencers={influencers} />
      </aside>
      <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}
