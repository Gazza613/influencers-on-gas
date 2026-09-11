// THE ONE BRAIN-STRENGTH FORMULA (Gary: a strong, accurate indicator of true capacity), shared by the brain
// detail page (BrainConsole) and the brains overview list so the number is identical in both places.
//
// Coverage of the four input types PLUS how much CLEAN retrievable knowledge the brain actually holds. Depth uses
// a sqrt curve over the de-duplicated passage count (fast early credit, diminishing returns), so genuine growth
// moves the score while volume padding cannot game it (ingest strips boilerplate + dupes). Photos are creative
// source, not Q&A knowledge, so they carry little weight - a second photo does not move the score, by design.

export type StrengthInput = {
  hasSite: boolean;
  hasDocs: boolean;
  hasDoctrine: boolean;
  hasAssets: boolean;
  liveChunks: number;
};

export const STRENGTH_WEIGHT = { site: 30, docs: 20, doctrine: 12, assets: 5 } as const;

export function brainStrength(i: StrengthInput): number {
  const empty = !i.hasSite && !i.hasDocs && !i.hasDoctrine && !i.hasAssets && i.liveChunks === 0;
  if (empty) return 0;
  const coverage =
    (i.hasSite ? STRENGTH_WEIGHT.site : 0) +
    (i.hasDocs ? STRENGTH_WEIGHT.docs : 0) +
    (i.hasDoctrine ? STRENGTH_WEIGHT.doctrine : 0) +
    (i.hasAssets ? STRENGTH_WEIGHT.assets : 0);
  const depth = Math.round(Math.min(1, Math.sqrt(i.liveChunks / 1000)) * 33);
  return Math.round(Math.min(100, coverage + depth));
}
