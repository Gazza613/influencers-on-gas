// Cron auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET
// is set. We also accept `?key=` for manual testing. If no secret is configured,
// we allow the call (so crons work out of the box) but you should set CRON_SECRET.
export function cronAuthed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: no secret configured ⇒ no cron access
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  const key = new URL(req.url).searchParams.get("key");
  return key === secret;
}

export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function monthStartIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// Start of the current Higgsfield billing cycle (credits top up on the reset day, ~10th).
export function cycleStartIso(resetDay = 10): string {
  const d = new Date();
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() < resetDay) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(resetDay).padStart(2, "0")}`;
}
