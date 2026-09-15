// TURN A RAW VENDOR ERROR INTO SOMETHING A HUMAN SHOULD SEE (Gary: not a 400 JSON blob). Used wherever a Claude /
// Anthropic call's failure is surfaced to the team. Recognises the common operational failures and gives a plain,
// actionable line; anything else falls back to a trimmed message.
export function humanApiError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  if (/credit balance is too low|plans\s*&\s*billing|insufficient (funds|credit)|billing/i.test(msg)) {
    return "Anthropic credits depleted. Go purchase more credits and return here once done.";
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(msg)) {
    return "The AI is rate limited right now. Wait a moment and try again.";
  }
  if (/overloaded|\b529\b|\b503\b|temporarily unavailable/i.test(msg)) {
    return "The AI is busy right now. Give it a moment and try again.";
  }
  if (/invalid[_\s]?api[_\s]?key|authentication|401|unauthor/i.test(msg)) {
    return "The AI connection is not authorised. Check the API key in Connections.";
  }
  const trimmed = msg.trim();
  return trimmed ? trimmed.slice(0, 240) : fallback;
}
