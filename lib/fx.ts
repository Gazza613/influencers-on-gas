// Live USD/ZAR rate (ZAR per 1 USD) so costs can be shown in Rand and Dollars.
// Fetched from a free no-key API and cached ~12h per server instance, with a
// sensible fallback so the UI never breaks if the rate is unavailable.
const FALLBACK_ZAR_PER_USD = 18.5;
let cache: { rate: number; at: number } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000;

export async function getZarPerUsd(): Promise<number> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rate;
  for (const url of [
    "https://open.er-api.com/v6/latest/USD",
    "https://api.exchangerate.host/latest?base=USD&symbols=ZAR",
  ]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const d = (await res.json()) as { rates?: { ZAR?: number } };
      const rate = d?.rates?.ZAR;
      if (typeof rate === "number" && rate > 1) {
        cache = { rate, at: Date.now() };
        return rate;
      }
    } catch { /* try next */ }
  }
  return cache?.rate ?? FALLBACK_ZAR_PER_USD;
}

// Convert ZAR cents to a USD amount (dollars) at the current rate.
export function usdFromZarCents(cents: number, zarPerUsd: number): number {
  if (!zarPerUsd) return 0;
  return cents / 100 / zarPerUsd;
}
