import { listInfluencers } from "@/lib/influencers";
import InfluencerRoster from "@/components/InfluencerRoster";

export const dynamic = "force-dynamic";

export default async function InfluencersLayout({ children }: { children: React.ReactNode }) {
  const influencers = await listInfluencers();
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-6 lg:grid-cols-[248px_1fr]">
      <aside className="min-h-0 lg:border-r lg:border-line lg:pr-4">
        <InfluencerRoster influencers={influencers} />
      </aside>
      <div className="min-h-0 lg:overflow-y-auto lg:pr-1">{children}</div>
    </div>
  );
}
