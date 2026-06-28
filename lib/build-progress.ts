// Pure build-stage progress for an influencer (no DB imports - safe in client + server).
export type BuildStage = { key: string; label: string; done: boolean };

type ProgressInput = {
  persona?: Record<string, unknown> | null;
  look_refs?: unknown[] | null;
  mode?: string | null;
  higgsfield_soul_id?: string | null;
  voice_id?: string | null;
  heygen_avatar_id?: string | null;
};

export function buildProgress(inf: ProgressInput): { pct: number; done: number; total: number; stages: BuildStage[] } {
  const p = (inf.persona ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(p.candidates) ? (p.candidates as unknown[]) : [];
  const refs = Array.isArray(inf.look_refs) ? inf.look_refs : [];
  const uploadedRefs = Array.isArray(p.reference_images) ? (p.reference_images as unknown[]).length : 0;
  // An "anchored" identity is built from UPLOADED photos (a twin, or a synthetic the user
  // gave reference art for). It skips the designed Bible and casting, so those stages count
  // as done once the uploads exist (otherwise a fully locked twin would never reach green).
  const anchored = inf.mode === "twin" || uploadedRefs > 0 || !!p.reference_url;
  // Build phase = Bible → Casting → Photoshoot → Lock down. Voice/Presenter are video
  // production (a later phase), so the ring hits 100% when the identity is locked.
  const stages: BuildStage[] = [
    { key: "bible", label: "Bible", done: !!p.bible || anchored },
    { key: "cast", label: "Casting", done: candidates.length > 0 || refs.length > 0 || anchored },
    { key: "shoot", label: "Photoshoot", done: refs.length > 1 || (anchored && refs.length > 0) },
    { key: "locked", label: "Lock down", done: !!p.locked },
  ];
  const done = stages.filter((s) => s.done).length;
  return { pct: Math.round((100 * done) / stages.length), done, total: stages.length, stages };
}

// Ring stroke colour by completion (matches the design tokens).
export function ringColour(pct: number): string {
  if (pct >= 80) return "var(--color-ready, #36d399)";
  if (pct >= 40) return "var(--color-active, #ffb020)";
  return "var(--color-accent, #f96203)";
}
