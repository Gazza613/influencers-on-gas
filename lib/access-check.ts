import { db } from "./db";

// IS THIS SESSION STILL ALLOWED? Checked on every gated request.
//
// THE PROBLEM THIS FIXES. Sessions are JWTs with an 8-hour life, and the token carries the role stamped at
// sign-in. Nothing re-checked the database afterwards, so removing someone from the Team page deleted their
// row and left their token working: a revoked person kept full access to the studio - dashboard, brains, cost
// control - for up to eight hours. The confirmation dialog said "they will lose access immediately", and that
// was simply not true.
//
// WHY IT LIVES HERE AND NOT IN lib/users. This module runs inside the edge gate, so it may only import things
// that work there. lib/users pulls in bcryptjs and node:crypto and would break the middleware bundle. This
// file imports the Neon driver and nothing else - that driver speaks HTTP, which is what makes a database
// check possible in the gate at all.
//
// COST. One indexed lookup by email per gated page request. That is the price of revocation actually meaning
// revocation, and for a small team on a fast Postgres it is the right trade. It fails OPEN on a database
// error, deliberately: an outage should not lock the whole team out of their own studio.

export async function isStillAllowed(email: string | null | undefined): Promise<boolean> {
  const addr = String(email ?? "").toLowerCase().trim();
  if (!addr) return false;

  // THE ENV SUPER-ADMIN IS NEVER LOCKED OUT. Gary signs in from environment variables and may have no users
  // row at all; without this, the check below would revoke the one account that can fix everything else.
  const sa = (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase().trim();
  if (sa && addr === sa) return true;

  try {
    const rows = (await db().query(
      `select status from users where lower(email) = $1 limit 1`,
      [addr],
    )) as { status: string }[];
    // No row means the account was deleted. Not 'active' means suspended, or an invite that was never
    // accepted. Either way the token is no longer good.
    return rows[0]?.status === "active";
  } catch {
    return true; // fail open - see above
  }
}
