// Turn the Character Bible into production-ready text, so the deep work on the casting page actually
// drives the video — the bible becomes the single source of truth for the producer + the shots + voice.
type Dict = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) as string[] : []);

// A rich influencer profile for the storyboard director: who she is, how she carries herself, her
// signature wardrobe + palette, and her tone — so the cast world, wardrobe, performance and VO align.
export function bibleProfile(bible: Dict | undefined | null): string {
  if (!bible || typeof bible !== "object") return "";
  const id = (bible.identity ?? {}) as Dict;
  const perf = (bible.performance ?? {}) as Dict;
  const psy = (bible.psychology ?? {}) as Dict;
  const w = (bible.wardrobe ?? {}) as Dict;
  const pal = (bible.palette ?? {}) as Dict;
  const garments = (Array.isArray(w.garments) ? w.garments : []).map((g) => s((g as Dict)?.item)).filter(Boolean).join(", ");
  const parts = [
    [s(id.age), s(id.ethnicity_design), s(id.build), s(id.profession)].filter(Boolean).join(", "),
    s(id.bio),
    s(perf.body_language) && `Carries herself: ${s(perf.body_language)}`,
    s(perf.movement_rhythm) && `Moves with ${s(perf.movement_rhythm)}`,
    arr(psy.core_traits).length ? `Character: ${arr(psy.core_traits).join(", ")}` : "",
    s(psy.emotional_baseline) && `Emotional baseline: ${s(psy.emotional_baseline)}`,
    garments && `Signature wardrobe: ${garments}${s(w.footwear) ? `, ${s(w.footwear)}` : ""}`,
    arr(pal.wardrobe_colours).length ? `Wardrobe palette: ${arr(pal.wardrobe_colours).join(", ")}` : "",
    s(bible.signature_line) && `Her voice/tone (signature line): "${s(bible.signature_line)}"`,
  ].filter(Boolean);
  return parts.join(". ");
}

// Her signature wardrobe for the keyframe shot prompts (the default outfit, in her palette).
export function bibleWardrobe(bible: Dict | undefined | null): string {
  if (!bible || typeof bible !== "object") return "";
  const w = (bible.wardrobe ?? {}) as Dict;
  const pal = (bible.palette ?? {}) as Dict;
  const garments = (Array.isArray(w.garments) ? w.garments : [])
    .map((g) => [s((g as Dict)?.item), s((g as Dict)?.fabric), s((g as Dict)?.detail)].filter(Boolean).join(" — "))
    .filter(Boolean).join("; ");
  const colours = arr(pal.wardrobe_colours).join(", ");
  const acc = arr(w.accessories).join(", ");
  return [
    garments && `her signature wardrobe (${garments})`,
    s(w.footwear) && `with ${s(w.footwear)}`,
    colours && `in her palette of ${colours}`,
    acc && `accessories: ${acc}`,
  ].filter(Boolean).join(", ");
}

// Her movement/performance, for the clip motion direction.
export function biblePerformance(bible: Dict | undefined | null): string {
  if (!bible || typeof bible !== "object") return "";
  const perf = (bible.performance ?? {}) as Dict;
  return [s(perf.body_language), s(perf.movement_rhythm), s(perf.idle_behaviour)].filter(Boolean).join("; ");
}

export function bibleVoiceDescriptor(bible: Dict | undefined | null): string {
  if (!bible || typeof bible !== "object") return "";
  return s(bible.voice_descriptor);
}
