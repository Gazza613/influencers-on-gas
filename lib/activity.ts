import { db } from "./db";
import { deskOf, type Desk } from "./desks";

// TEAM ADOPTION AND ACTIVITY.
//
// Two sources, already being written, that had never been read together:
//   - login_attempts: every sign-in, successful or not, added for the brute-force throttle. It doubles as a
//     login history for free.
//   - usage_events: every paid vendor call, carrying user_email and an action. The action is what deskOf()
//     turns into a desk, so "what is this person actually using" is answerable without new instrumentation.
//
// WHAT THIS DELIBERATELY IS NOT. It reports adoption - who signed in, what they built, which desks they use.
// It is not a surveillance tool and does not attempt to time people or measure hours. The question Gary and
// Sam are asking is "is the team taking this up, and which parts", and that is the question it answers.
//
// Media on GAS is a separate product with its own auth and its own reporting, so nothing here can or should
// include it. The weekly email says so rather than letting a silence imply zero.

// SESSIONS AND DAYS ACTIVE, not minutes (Gary's call).
//
// Nothing records presence, so a minutes figure could only be inferred from events - and reading a briefing,
// reviewing a brain or studying Cost Control produces no events at all. Someone who spent two hours reading
// intelligence would report as zero, which is worse than reporting nothing: it would mislead at the exact
// moment the number was being used to judge adoption.
//
// What the existing timestamps CAN carry honestly: how often someone came to the studio, on how many separate
// days, and the shape of their working day. A session is a run of activity with no gap longer than 30 minutes
// - the standard sessionisation window - stitched from sign-ins and metered jobs together.
const SESSION_GAP_MIN = 30;

function sessionise(stamps: Date[]): { sessions: number; days: Set<string>; firstMins: number[]; lastMins: number[] } {
  const out = { sessions: 0, days: new Set<string>(), firstMins: [] as number[], lastMins: [] as number[] };
  if (!stamps.length) return out;
  const sorted = [...stamps].sort((a, b) => a.getTime() - b.getTime());
  const sast = (d: Date) => new Date(d.getTime() + 2 * 3600 * 1000); // SAST is UTC+2, no DST
  const perDay = new Map<string, Date[]>();
  let prev: Date | null = null;
  for (const d of sorted) {
    if (!prev || (d.getTime() - prev.getTime()) / 60000 > SESSION_GAP_MIN) out.sessions++;
    prev = d;
    const k = sast(d).toISOString().slice(0, 10);
    out.days.add(k);
    perDay.set(k, [...(perDay.get(k) ?? []), d]);
  }
  for (const list of perDay.values()) {
    const f = sast(list[0]), l = sast(list[list.length - 1]);
    out.firstMins.push(f.getUTCHours() * 60 + f.getUTCMinutes());
    out.lastMins.push(l.getUTCHours() * 60 + l.getUTCMinutes());
  }
  return out;
}

const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(Math.round(mins % 60)).padStart(2, "0")}`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export type MemberActivity = {
  email: string;
  name: string | null;
  role: string;
  status: string;
  logins: number;              // successful sign-ins in the window
  failed: number;              // failed attempts, worth seeing next to the successes
  lastLogin: string | null;
  jobs: number;                // metered actions run
  cents: number;               // what those cost
  desks: { desk: Desk; jobs: number }[];
  neverSignedIn: boolean;
  sessions: number;            // runs of activity, 30-minute gap between them
  daysActive: number;          // separate days they showed up
  typicalDay: string | null;   // e.g. "09:12 to 16:40", averaged over their active days
};

export type ActivityReport = {
  from: string; to: string;
  members: MemberActivity[];
  totals: { sessions: number; logins: number; jobs: number; cents: number; activeMembers: number; teamSize: number };
  quietest: MemberActivity[];  // invited or active but no sign-in this window
};

// One window, one report. `days` is the lookback; the weekly email uses 7.
export async function getActivity(days = 7): Promise<ActivityReport> {
  const iv = `${Math.max(1, Math.min(days, 365))} days`;

  const users = (await db().query(
    `select lower(email) as email, name, role, status from users order by created_at asc`,
  )) as { email: string; name: string | null; role: string; status: string }[];

  const logins = (await db().query(
    `select lower(email) as email,
            count(*) filter (where ok)::int      as logins,
            count(*) filter (where not ok)::int  as failed,
            to_char(max(at) filter (where ok) at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') as last_login
     from login_attempts
     where at > now() - $1::interval
     group by 1`, [iv],
  )) as { email: string; logins: number; failed: number; last_login: string | null }[];

  // Per user AND per action, so the desk roll-up happens in TypeScript next to the mapping that defines it
  // rather than as a SQL CASE that would drift out of step with lib/desks.
  const usage = (await db().query(
    `select lower(coalesce(user_email,'')) as email, action,
            count(*)::int as jobs, coalesce(sum(cents),0)::int as cents
     from usage_events
     where created_at > now() - $1::interval
     group by 1, 2`, [iv],
  )) as { email: string; action: string; jobs: number; cents: number }[];

  // RAW TIMESTAMPS for sessionisation. Sign-ins and metered jobs together, because either on its own tells
  // half the story: sign-ins alone miss a long build, jobs alone miss someone who came in only to read.
  const stamps = (await db().query(
    `select lower(email) as email, at from login_attempts where ok and at > now() - $1::interval
     union all
     select lower(user_email) as email, created_at as at from usage_events
      where user_email is not null and created_at > now() - $1::interval`, [iv],
  )) as { email: string; at: string }[];
  const stampsBy = new Map<string, Date[]>();
  for (const r of stamps) {
    if (!r.email) continue;
    stampsBy.set(r.email, [...(stampsBy.get(r.email) ?? []), new Date(r.at)]);
  }

  const loginBy = new Map(logins.map((l) => [l.email, l]));
  const usageBy = new Map<string, { jobs: number; cents: number; desks: Map<Desk, number> }>();
  for (const u of usage) {
    if (!u.email) continue;                        // system jobs (crons) carry no user
    const cur = usageBy.get(u.email) ?? { jobs: 0, cents: 0, desks: new Map<Desk, number>() };
    cur.jobs += u.jobs;
    cur.cents += u.cents;
    const d = deskOf(u.action);
    cur.desks.set(d, (cur.desks.get(d) ?? 0) + u.jobs);
    usageBy.set(u.email, cur);
  }

  const members: MemberActivity[] = users.map((u) => {
    const l = loginBy.get(u.email);
    const g = usageBy.get(u.email);
    const ses = sessionise(stampsBy.get(u.email) ?? []);
    return {
      email: u.email, name: u.name, role: u.role, status: u.status,
      logins: l?.logins ?? 0,
      failed: l?.failed ?? 0,
      lastLogin: l?.last_login ?? null,
      jobs: g?.jobs ?? 0,
      cents: g?.cents ?? 0,
      desks: [...(g?.desks ?? new Map())].map(([desk, jobs]) => ({ desk, jobs })).sort((a, b) => b.jobs - a.jobs),
      neverSignedIn: !(l?.logins ?? 0),
      sessions: ses.sessions,
      daysActive: ses.days.size,
      // Averaged across their active days. One day's shape is noise; a week of them is a working pattern.
      typicalDay: ses.firstMins.length ? `${hhmm(mean(ses.firstMins))} to ${hhmm(mean(ses.lastMins))}` : null,
    };
  }).sort((a, b) => b.jobs - a.jobs || b.logins - a.logins);

  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Johannesburg" });

  return {
    from: fmt(from), to: fmt(to),
    members,
    totals: {
      sessions: members.reduce((a, m) => a + m.sessions, 0),
      logins: members.reduce((a, m) => a + m.logins, 0),
      jobs: members.reduce((a, m) => a + m.jobs, 0),
      cents: members.reduce((a, m) => a + m.cents, 0),
      activeMembers: members.filter((m) => m.sessions > 0).length,
      teamSize: members.length,
    },
    // Suspended people are excluded: not signing in is the point, not a finding.
    quietest: members.filter((m) => m.status !== "suspended" && m.sessions === 0),
  };
}
