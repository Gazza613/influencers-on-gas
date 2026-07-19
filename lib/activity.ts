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
};

export type ActivityReport = {
  from: string; to: string;
  members: MemberActivity[];
  totals: { logins: number; jobs: number; cents: number; activeMembers: number; teamSize: number };
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
    return {
      email: u.email, name: u.name, role: u.role, status: u.status,
      logins: l?.logins ?? 0,
      failed: l?.failed ?? 0,
      lastLogin: l?.last_login ?? null,
      jobs: g?.jobs ?? 0,
      cents: g?.cents ?? 0,
      desks: [...(g?.desks ?? new Map())].map(([desk, jobs]) => ({ desk, jobs })).sort((a, b) => b.jobs - a.jobs),
      neverSignedIn: !(l?.logins ?? 0),
    };
  }).sort((a, b) => b.jobs - a.jobs || b.logins - a.logins);

  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Johannesburg" });

  return {
    from: fmt(from), to: fmt(to),
    members,
    totals: {
      logins: members.reduce((a, m) => a + m.logins, 0),
      jobs: members.reduce((a, m) => a + m.jobs, 0),
      cents: members.reduce((a, m) => a + m.cents, 0),
      activeMembers: members.filter((m) => m.logins > 0).length,
      teamSize: members.length,
    },
    // Suspended people are excluded: not signing in is the point, not a finding.
    quietest: members.filter((m) => m.status !== "suspended" && m.logins === 0),
  };
}
