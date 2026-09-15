// THE ONE BRAIN-STRENGTH FORMULA (Gary: a strong, accurate indicator of true capacity), shared by the brain
// detail page (BrainConsole) and the brains overview list so the number is identical in both places.
//
// Coverage of the four input types PLUS how much CLEAN retrievable knowledge the brain actually holds. Depth uses
// a sqrt curve over the de-duplicated passage count (fast early credit, diminishing returns), so genuine growth
// moves the score while volume padding cannot game it (ingest strips boilerplate + dupes). Photos are creative
// source, not Q&A knowledge, so they carry little weight - a second photo does not move the score, by design.

export type StrengthInput = {
  hasSite: boolean;
  hasDocs: boolean;       // documents, pasted notes, OR accepted market intelligence - any curated knowledge source
  hasDoctrine: boolean;
  hasAssets: boolean;
  liveChunks: number;     // DISTINCT retrievable passages (deduped), so volume padding cannot lift the score
};

// REBALANCED (audit P2). The old weights undercounted doctrine- and market-fed brains: a doctrine-rich brain (the
// gold standard) scored ~30 because "crawled a website" (30) dwarfed "has a brand doctrine" (12), and a
// market-swept brain earned zero coverage at all. Doctrine is the HIGHEST-signal knowledge a brain holds, so it now
// weighs near a crawled site, the curated-knowledge bucket (docs) includes accepted market intelligence, and depth
// saturates sooner (500 distinct passages, not 1000) because a few hundred clean, deduped passages is a genuinely
// strong brain. Depth uses DISTINCT passage count so cross-source duplication can no longer inflate the score.
export const STRENGTH_WEIGHT = { site: 24, docs: 18, doctrine: 20, assets: 6 } as const;

export function brainStrength(i: StrengthInput): number {
  const empty = !i.hasSite && !i.hasDocs && !i.hasDoctrine && !i.hasAssets && i.liveChunks === 0;
  if (empty) return 0;
  const coverage =
    (i.hasSite ? STRENGTH_WEIGHT.site : 0) +
    (i.hasDocs ? STRENGTH_WEIGHT.docs : 0) +
    (i.hasDoctrine ? STRENGTH_WEIGHT.doctrine : 0) +
    (i.hasAssets ? STRENGTH_WEIGHT.assets : 0);
  const depth = Math.round(Math.min(1, Math.sqrt(i.liveChunks / 500)) * 32);
  return Math.round(Math.min(100, coverage + depth));
}
