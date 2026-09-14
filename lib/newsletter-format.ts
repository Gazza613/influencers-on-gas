// THE NEWSLETTER FORMAT (shared, Gary). The client-approved LinkedIn newsletter has a fixed shape:
//   1. a MASTHEAD  - title, "A letter from {name}, {title}, {company}", "LinkedIn newsletter | approx N words |
//      M-minute read", "Prepared by: GAS Marketing {date}"
//   2. the ARGUMENT (the body the writer produces)
//   3. the SIGN-OFF - the executive's name + designation
//   4. a FACT CHECK & SOURCES block - every significant claim with its source, date and a LIVE link
// The argument + the fact-check list come from the writer (and must stay grounded). The masthead and sign-off are
// pure presentation, built at render time from the resolved signer, so they are never baked into the stored draft
// (the publisher can still be switched between CEO and MD before sending). This one module is the single source of
// truth for the format, used by BOTH the email renderer and the on-screen draft preview, so they cannot drift.

export type FactCheckItem = { claim: string; source: string; date: string; link: string };

// The exact heading the fact-check block is stored under, inside the draft text, so it survives a reload and a
// re-send as one string. renderers split on it.
export const FACT_CHECK_HEADING = "## Fact Check & Sources";
export const FACT_CHECK_INTRO = "Every significant factual claim in the article, with its source, date, and full link.";

// SERIALISE the fact-check list into the trailing block appended to the draft text. Kept human-readable so the raw
// draft is still legible, and machine-parseable by splitFactCheck below.
export function buildFactCheckBlock(items: FactCheckItem[]): string {
  if (!items.length) return "";
  const body = items
    .map((it) => [
      `Claim: ${it.claim}`,
      `Source: ${it.source}`,
      it.date ? `Date: ${it.date}` : null,
      `Link: ${it.link}`,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
  return `\n\n${FACT_CHECK_HEADING}\n\n${body}`;
}

// SPLIT a stored draft into the argument (title + body) and the parsed fact-check list. Tolerant of drafts written
// before this format existed (no heading -> empty list).
export function splitFactCheck(post: string): { body: string; factCheck: FactCheckItem[] } {
  const text = String(post || "");
  const idx = text.indexOf(FACT_CHECK_HEADING);
  if (idx < 0) return { body: text.trim(), factCheck: [] };
  const body = text.slice(0, idx).trim();
  const tail = text.slice(idx + FACT_CHECK_HEADING.length);
  const items: FactCheckItem[] = [];
  for (const blk of tail.split(/\n{2,}/)) {
    const claim = blk.match(/^\s*Claim:\s*(.+)$/im)?.[1]?.trim() || "";
    const link = blk.match(/^\s*Link:\s*(\S+)/im)?.[1]?.trim() || "";
    if (!claim || !link) continue;
    items.push({
      claim,
      source: blk.match(/^\s*Source:\s*(.+)$/im)?.[1]?.trim() || "",
      date: blk.match(/^\s*Date:\s*(.+)$/im)?.[1]?.trim() || "",
      link,
    });
  }
  return { body, factCheck: items };
}

// Word count + read time for the masthead line ("approx 1,300 words | 6-minute read"). ~220 words/minute is the
// standard reading pace used across LinkedIn read-time estimates.
export function wordCount(text: string): number {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}
export function readMinutes(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 220));
}
export function approxWordsLabel(n: number): string {
  // Round to the nearest 100 for an "approx" figure that reads like the approved piece.
  const r = Math.max(100, Math.round(n / 100) * 100);
  return r.toLocaleString("en-GB");
}

// The masthead lines (below the title). Signer + company resolved at render time. dateLabel is the "prepared" date.
export function mastheadLines(opts: {
  signerName?: string | null; signerTitle?: string | null; company?: string | null;
  words: number; preparedDate: string;
}): { byline: string; meta: string; prepared: string } {
  const who = [opts.signerName, opts.signerTitle, opts.company].map((s) => String(s || "").trim()).filter(Boolean);
  const byline = who.length ? `A letter from ${who.join(", ")}` : "";
  const meta = `LinkedIn newsletter | approx. ${approxWordsLabel(opts.words)} words | ${readMinutes(String(opts.words))}-minute read`;
  const prepared = `Prepared by: GAS Marketing ${opts.preparedDate}`;
  return { byline, meta, prepared };
}
