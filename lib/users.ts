import { db } from "./db";

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
