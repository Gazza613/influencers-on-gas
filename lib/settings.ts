import { db } from "./db";

// Small key/value store for choices that must be changeable WITHOUT A DEPLOY.
//
// The rule this follows is the same one behind rate_card and the subscriptions: anything Gary might want to
// undo at 11pm belongs in the database, not in code. "I may go back to how it is now" is a requirement, not a
// nice-to-have, and a requirement met by "ask Claude to redeploy" is not met at all.

async function ensure(): Promise<void> {
  await db().query(`create table if not exists app_settings (
    key text primary key, value text, updated_at timestamptz not null default now())`);
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    await ensure();
    const rows = (await db().query(`select value from app_settings where key = $1`, [key])) as { value: string }[];
    return rows[0]?.value ?? fallback;
  } catch {
    // A missing table or an unreachable database must never take a page down; it just means "the default".
    return fallback;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensure();
  await db().query(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

// The public landing page: "systems" shows the six systems, "cards" shows the floating influencer photos.
export const LANDING_LAYOUT = "landing_layout";
export type LandingLayout = "systems" | "cards";
