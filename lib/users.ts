import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";

// Access is gated to GAS Marketing employees/teams for now.
export const GAS_DOMAIN = "@gasmarketing.co.za";
export const isGasEmail = (email: string) => email.toLowerCase().trim().endsWith(GAS_DOMAIN);

// Upsert a user row (the env super-admin has no row until first action). Used to
// satisfy FK attribution (consents.granted_by, influencers.created_by) and to
// start populating the users table ahead of Phase 1b.
export async function ensureUser(email: string, name?: string | null, role = "producer"): Promise<string> {
  const rows = (await db().query(
    `insert into users (email, name, role) values ($1, $2, $3)
     on conflict (email) do update set name = coalesce(excluded.name, users.name)
     returning id`,
    [email.toLowerCase().trim(), name ?? null, role],
  )) as { id: string }[];
  return rows[0].id;
}

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;          // 'super_admin' | 'admin' | 'producer'
  status: string;        // 'invited' | 'active' | 'suspended'
  created_at: string;
  suspended_at?: string | null;
};

export async function listUsers(): Promise<AppUser[]> {
  return (await db().query(
    `select id, email, name, role, status, to_char(created_at,'YYYY-MM-DD') as created_at
     from users order by created_at asc`,
  )) as AppUser[];
}

export async function getUserByEmail(email: string): Promise<(AppUser & { password_hash: string | null }) | null> {
  const rows = (await db().query(
    `select id, email, name, role, status, password_hash, to_char(created_at,'YYYY-MM-DD') as created_at
     from users where lower(email)=lower($1) limit 1`, [email],
  )) as (AppUser & { password_hash: string | null })[];
  return rows[0] ?? null;
}

// Create or refresh an invite. Returns the raw token to embed in the email link.
export async function inviteUser(o: { email: string; name?: string; role?: string }): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const role = o.role === "admin" ? "admin" : "producer";
  await db().query(
    `insert into users (email, name, role, status, invite_token, invite_expires)
     values ($1,$2,$3,'invited',$4, now() + interval '7 days')
     on conflict (email) do update set
       name = coalesce(excluded.name, users.name),
       role = excluded.role,
       status = case when users.status='active' then 'active' else 'invited' end,
       invite_token = excluded.invite_token,
       invite_expires = excluded.invite_expires`,
    [o.email.toLowerCase().trim(), o.name ?? null, role, token],
  );
  return token;
}

export async function getInvite(token: string): Promise<{ email: string; name: string | null } | null> {
  const rows = (await db().query(
    `select email, name from users where invite_token=$1 and invite_expires > now() limit 1`, [token],
  )) as { email: string; name: string | null }[];
  return rows[0] ?? null;
}

// Accept an invite: set the password, activate, clear the token.
export async function acceptInvite(token: string, password: string): Promise<boolean> {
  const inv = await getInvite(token);
  if (!inv) return false;
  const hash = await bcrypt.hash(password, 10);
  const res = (await db().query(
    `update users set password_hash=$2, status='active', invite_token=null, invite_expires=null
     where invite_token=$1 returning id`, [token, hash],
  )) as { id: string }[];
  return res.length > 0;
}

// Verify credentials for sign-in (active users with a password only).
export async function verifyUser(email: string, password: string): Promise<AppUser | null> {
  const u = await getUserByEmail(email);
  if (!u || u.status !== "active" || !u.password_hash) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, created_at: u.created_at };
}

export async function deleteUser(id: string): Promise<void> {
  await db().query(`delete from users where id=$1`, [id]);
}

// SUSPEND rather than delete. Removal used to be the only option, which meant losing the person's record and
// any way to let them back in. Suspension is reversible and keeps the history; both are instant now, because
// the auth gate re-checks status on every request (lib/access-check).
//
// The password is deliberately left in place: a suspension is "not right now", not "start again". Reactivating
// lets them sign straight back in with what they already had.
export async function suspendUser(id: string): Promise<void> {
  await db().query(`update users set status='suspended', suspended_at=now() where id=$1`, [id]);
}

// Back to active. An invite that was never accepted returns to 'invited', not 'active' - it still has no
// password, and marking it active would leave an account nobody can sign in to.
export async function reactivateUser(id: string): Promise<void> {
  await db().query(
    `update users set status = case when password_hash is null then 'invited' else 'active' end,
                      suspended_at = null
     where id=$1`, [id],
  );
}
