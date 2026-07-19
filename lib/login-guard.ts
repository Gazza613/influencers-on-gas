import { db } from "./db";

// BRUTE-FORCE PROTECTION FOR /login.
//
// The sign-in endpoint had no throttle at all: an attacker could try passwords against a known GAS address as
// fast as the network allowed, indefinitely. The domain gate does not help here - the addresses are public,
// they are on the website - and bcrypt only slows each guess, it does not stop the stream.
//
// TWO LIMITS, because they catch different attacks:
//   - PER EMAIL: someone hammering one known account. 8 failures in 15 minutes.
//   - PER IP: someone spraying one common password across many accounts, which never trips a per-email limit.
//     25 failures in 15 minutes.
//
// FAILURES ONLY EXTEND THE LOCK, successes clear it. A legitimate person who mistypes twice and then gets it
// right is not punished, while an attacker never gets a fresh budget.
//
// Recording never throws into the caller: a throttle that takes sign-in down when the database hiccups is a
// worse outage than the attack it prevents. It fails OPEN deliberately, and that trade is the right way round
// for a tool used by one small team.

const WINDOW_MIN = 15;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 25;

export type GuardResult = { allowed: true } | { allowed: false; retryAfterMin: number; reason: string };

// The caller's address, from the proxy headers Vercel sets. Left-most entry in x-forwarded-for is the client.
export function clientIp(req: unknown): string {
  try {
    const h = (req as { headers?: { get?: (k: string) => string | null } })?.headers;
    const fwd = h?.get?.("x-forwarded-for") || "";
    const first = fwd.split(",")[0]?.trim();
    return first || h?.get?.("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

export async function checkLoginAllowed(email: string, ip: string): Promise<GuardResult> {
  try {
    const rows = (await db().query(
      `select
         count(*) filter (where lower(email) = lower($1))::int as by_email,
         count(*) filter (where ip = $2)::int                  as by_ip
       from login_attempts
       where ok = false and at > now() - ($3 || ' minutes')::interval`,
      [email, ip, String(WINDOW_MIN)],
    )) as { by_email: number; by_ip: number }[];

    const r = rows[0] ?? { by_email: 0, by_ip: 0 };
    if (r.by_email >= MAX_PER_EMAIL) {
      return { allowed: false, retryAfterMin: WINDOW_MIN, reason: "too many attempts for this account" };
    }
    if (r.by_ip >= MAX_PER_IP) {
      return { allowed: false, retryAfterMin: WINDOW_MIN, reason: "too many attempts from this location" };
    }
    return { allowed: true };
  } catch {
    // Fail OPEN - see the note above.
    return { allowed: true };
  }
}

export async function recordAttempt(email: string, ip: string, ok: boolean): Promise<void> {
  try {
    if (ok) {
      // A correct password clears that account's failures, so an honest user who fumbled twice starts clean.
      await db().query(`delete from login_attempts where lower(email) = lower($1) and ok = false`, [email]);
    }
    await db().query(`insert into login_attempts (email, ip, ok) values ($1, $2, $3)`, [email, ip, ok]);
    // Opportunistic tidy-up. The table is only ever read over a 15-minute window, so anything older than a day
    // is dead weight; doing it here avoids needing a cron for a housekeeping job this small.
    if (!ok) await db().query(`delete from login_attempts where at < now() - interval '1 day'`);
  } catch {
    /* never break sign-in over an audit write */
  }
}
