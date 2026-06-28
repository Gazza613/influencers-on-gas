// Lightweight client event bus for "flex" call-out toasts. Components call flex(...)
// and the <FlexToasts/> mounted in the root layout renders an animated toast.
// Self-contained - remove FlexToasts + these calls to disable entirely.

export type FlexOpts = { milestone?: boolean };

export function flex(message: string, opts?: FlexOpts) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("flex-toast", {
    detail: { id: Math.random().toString(36).slice(2), message, milestone: !!opts?.milestone },
  }));
}

export function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Varied phrasing pools so it never feels repetitive.
export const QA_LINES = [
  "✓ Shot approved by AI Vision QA",
  "✓ Vision QA: wardrobe & composition checked",
  "✓ Approved - proportions & scale on point",
  "✓ QA cleared: clean, on-brand, sharp",
  "✓ Passed the Vision QA gate",
  "✓ Realism verified - into the keeper pile",
];
export const CAST_LINES = [
  "🎭 Casting complete - distinct faces ready",
  "🎭 Your audition board is in - pick the one",
  "🎭 Fresh looks cast from the character",
];
export const PHOTO_LINES = [
  "📸 Photoshoot wrapped - every angle, same face",
  "📸 Coverage set captured",
  "📸 The shoot's in - frames ready to lock",
];
export const BIBLE_LINES = [
  "✨ Character cast - a whole person, dreamt up",
  "✨ Your influencer has a soul on paper",
  "✨ Character Casting complete",
];
