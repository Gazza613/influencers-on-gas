// WHICH DESK SPENT THE MONEY (Gary: "can we see the strategist and the reporter costs?").
//
// usage_events records WHAT was bought (provider, model, action) but not WHO bought it, because when the
// ledger was built there was only one desk. There are six now, and "what did the Journalist cost us this
// month" is a question the ledger could not answer.
//
// The action string is the signal. It is set at each call site and is already specific enough to attribute:
// "casting" only ever happens in the influencer studio, "ceo-newsletter" only in the Journalist. So the desk
// is derived here, in ONE place, rather than smeared across a SQL CASE or duplicated per chart.
//
// WHY DERIVED AND NOT STORED: a `desk` column would only be accurate from the day it shipped. Deriving reads
// the whole history, including the R1.4k of Higgsfield spend that predates this file, so the split is right
// on day one rather than in a month's time.
//
// DRIFT IS MADE VISIBLE, NOT GUESSED AT. An action nobody has mapped lands in "Unattributed" and shows up in
// Cost Control as its own row. That is deliberate: silently folding an unknown action into the biggest desk
// would quietly corrupt exactly the number this exists to produce.

export type Desk =
  | "Influencers on GAS"
  | "Creatives on GAS"
  | "The Strategist"
  | "The Journalist"
  | "Brains"
  | "Platform"
  | "Unattributed";

export const DESK_ORDER: Desk[] = [
  "Influencers on GAS",
  "Creatives on GAS",
  "The Strategist",
  "The Journalist",
  "Brains",
  "Platform",
  "Unattributed",
];

// Tailwind accent per desk, matched to the dashboard tiles so a colour means the same thing in both places.
export const DESK_TINT: Record<Desk, string> = {
  "Influencers on GAS": "#c084fc",
  "Creatives on GAS": "#60a5fa",
  "The Strategist": "#34d399",
  "The Journalist": "#fbbf24",
  Brains: "#f472b6",
  Platform: "#94a3b8",
  Unattributed: "#64748b",
};

// The AI-influencer video studio: casting a face, giving it a voice, shooting and cutting the film.
const INFLUENCERS = new Set([
  "casting", "photoshoot", "soul", "humaniser", "wardrobe", "train", "creative", "edit", "sharpen",
  "aroll", "broll", "presenter", "stitch", "music", "ambient", "voice",
  "voice_design", "voice_script", "script", "script-retrieve",
  "story", "story-retrieve", "storyboard", "brief", "brief-retrieve", "perfect-brief",
  "bible", "tagline", "reflow", "compose", "qa",
  "aroll-diagnostic", "tts-diagnostic",
]);

// The creative factory: reference-matched funnel sections, sliders, deal cards.
const CREATIVES = new Set([
  "deal-card-3d", "deal-extract", "refmatch-campaign", "generate-campaign", "wizard-build",
  "studio-analyse", "studio-grammar", "cut-out",
  "forensic-swap-test", "strip-person-test",
]);

// The two research desks.
const STRATEGIST = new Set(["daily-intel"]);
const JOURNALIST = new Set(["ceo-newsletter", "ceo-backdrop", "ceo-linkedin-creative"]);

// Shared client knowledge, and platform housekeeping that belongs to no single desk.
const BRAINS = new Set(["ingest", "brain-reindex"]);
const PLATFORM = new Set(["research", "list", "status", "create", "search"]);

export function deskOf(action: string | null | undefined): Desk {
  const a = String(action || "").trim().toLowerCase();
  if (!a) return "Unattributed";

  if (INFLUENCERS.has(a)) return "Influencers on GAS";
  if (CREATIVES.has(a)) return "Creatives on GAS";
  if (STRATEGIST.has(a)) return "The Strategist";
  if (JOURNALIST.has(a)) return "The Journalist";
  if (BRAINS.has(a)) return "Brains";
  if (PLATFORM.has(a)) return "Platform";

  // FAMILIES built by string interpolation at the call site, e.g. `retheme-${section}` and `edit-${section}`.
  // These must be tested AFTER the exact sets above: bare "edit" is an influencer creative edit, while
  // "edit-slider" and "edit-section1" are the funnel builder. Prefix-first would swallow both.
  if (a.startsWith("retheme-") || a.startsWith("edit-") || a.startsWith("studio-")) return "Creatives on GAS";
  if (a.startsWith("ceo-")) return "The Journalist";
  if (a.startsWith("intel-")) return "The Strategist";

  return "Unattributed";
}

export type DeskSpend = { desk: Desk; credits: number; cents: number; events: number; tint: string };

// Roll a ledger slice up by desk. Takes the action-level rows so the mapping stays in TypeScript, where the
// call sites are, instead of a SQL CASE that would drift out of step with them.
export function rollUpByDesk(
  rows: { action: string | null; credits: number | string; cents: number | string; events?: number | string }[],
): DeskSpend[] {
  const acc = new Map<Desk, DeskSpend>();
  for (const r of rows) {
    const desk = deskOf(r.action);
    const cur = acc.get(desk) ?? { desk, credits: 0, cents: 0, events: 0, tint: DESK_TINT[desk] };
    cur.credits += Number(r.credits) || 0;
    cur.cents += Number(r.cents) || 0;
    cur.events += Number(r.events) || 0;
    acc.set(desk, cur);
  }
  // Ordered by the dashboard's own order, not by spend, so the list does not reshuffle between refreshes.
  // Empty desks are dropped: a desk that has never spent is noise, not information.
  return DESK_ORDER.map((d) => acc.get(d)).filter((d): d is DeskSpend => !!d && d.events > 0);
}
