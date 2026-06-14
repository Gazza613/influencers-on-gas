import { listInfluencers } from "@/lib/influencers";
import InfluencersManager from "@/components/InfluencersManager";

export const dynamic = "force-dynamic";

export default async function InfluencersPage() {
  const influencers = await listInfluencers();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Influencers</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-dim">
        Reusable identities — built once, used across every video. Each one is a
        consistent face + a voice + look references, engineered to read as a real human.
      </p>
      <InfluencersManager initial={influencers} />
    </div>
  );
}
