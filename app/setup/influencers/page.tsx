export const dynamic = "force-dynamic";

export default function InfluencersIndex() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold">Influencers</h1>
        <p className="mt-2 text-sm text-ink-dim">
          Reusable identities, built once and used across every video. Each one is a consistent face,
          a voice and a full photoshoot, engineered through our Humaniser to read as a real person.
        </p>
        <p className="mt-4 text-sm text-ink-faint">
          Pick an influencer on the left, or hit <span className="font-semibold text-accent">+ New</span> to build one.
        </p>
      </div>
    </div>
  );
}
