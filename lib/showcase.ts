import { randomBytes } from "crypto";
import { db } from "@/lib/db";

// A finished production fit for the public brag wall.
export type ShowcaseVideo = {
  id: string;
  title: string | null;
  final_video_url: string | null;
  created_at: string;
  showcased: boolean;
  external: boolean; // true = a reel uploaded manually (not produced on the platform)
};

// Lazily ensure the `external` column exists, so manual showreel uploads work without a separate
// migration step. Idempotent + memoised (Postgres no-ops if the column is already there).
let _ensured = false;
async function ensureSchema(): Promise<void> {
  if (_ensured) return;
  await db()`alter table productions add column if not exists external boolean not null default false`;
  _ensured = true;
}

// ── App settings (tiny key/value store) ──────────────────────────────────────
async function getSetting(key: string): Promise<string | null> {
  const rows = (await db()`select value from app_settings where key = ${key}`) as { value: string }[];
  return rows[0]?.value ?? null;
}
async function setSetting(key: string, value: string): Promise<void> {
  await db()`
    insert into app_settings (key, value, updated_at) values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

// The single public-link token. Created lazily on first read so the share link is
// always available without a separate setup step.
export async function getShowcaseToken(): Promise<string> {
  let t = await getSetting("showcase_public_token");
  if (!t) { t = randomBytes(16).toString("hex"); await setSetting("showcase_public_token", t); }
  return t;
}

export async function isValidShowcaseToken(token: string): Promise<boolean> {
  if (!token) return false;
  return token === (await getShowcaseToken());
}

// ── Showcase queries ──────────────────────────────────────────────────────────
// What the public wall shows: complete productions with a final video, flagged in.
export async function listShowcaseVideos(): Promise<ShowcaseVideo[]> {
  await ensureSchema();
  return (await db()`
    select id, title, final_video_url, created_at, showcased, external
    from productions
    where status = 'complete' and showcased = true and final_video_url is not null
    order by created_at desc`) as ShowcaseVideo[];
}

// What the internal manager shows: every finished video, so a producer can flag
// it into the showcase or remove it again.
export async function listFinishedVideos(): Promise<ShowcaseVideo[]> {
  await ensureSchema();
  return (await db()`
    select id, title, final_video_url, created_at, showcased, external
    from productions
    where status = 'complete' and final_video_url is not null
    order by created_at desc`) as ShowcaseVideo[];
}

// Add a manually-uploaded external showreel (not produced on the platform). Goes straight onto the
// wall (showcased) and is tagged external so the internal manager can distinguish it.
export async function addExternalShowreel(opts: { title: string; url: string; clientId: string }): Promise<ShowcaseVideo> {
  await ensureSchema();
  const rows = (await db()`
    insert into productions (client_id, title, final_video_url, status, showcased, external)
    values (${opts.clientId}, ${opts.title}, ${opts.url}, 'complete', true, true)
    returning id, title, final_video_url, created_at, showcased, external`) as ShowcaseVideo[];
  return rows[0];
}

// Add to / remove from the showcase (the "delete from showreel" control).
export async function setShowcased(id: string, on: boolean): Promise<void> {
  await db()`update productions set showcased = ${on} where id = ${id}`;
}

// Hard-remove a showcase cut so it disappears entirely (re-publish from the Producer's showreel step).
// Scoped to FINISHED cuts only, so a stray/old id can never delete an in-progress production.
export async function deleteShowcaseVideo(id: string): Promise<void> {
  await db()`delete from productions where id = ${id} and status = 'complete'`;
}

// ── Showreel publishing for Producer cuts ──────────────────────────────────────
// The finished Producer cut lives on the influencer persona; accepting it publishes a
// row into productions so it flows into the existing showcase wall + public share link.
// Resolve a client_id (productions requires one): the influencer's, else the first
// client, else a seeded default agency client. Single-org safe.
export async function resolveClientId(preferred: string | null): Promise<string> {
  if (preferred) return preferred;
  const rows = (await db()`select id from clients order by created_at asc limit 1`) as { id: string }[];
  if (rows[0]) return rows[0].id;
  const made = (await db()`insert into clients (name, slug) values ('GAS Marketing', 'gas-marketing') on conflict (slug) do update set name = excluded.name returning id`) as { id: string }[];
  return made[0].id;
}

// Upsert the showcase row for a Producer cut. Pass an existing id to update it
// (re-stitch / re-decide), or omit to insert. Returns the production id.
export async function upsertProducerCut(opts: { showcaseId?: string | null; clientId: string; title: string; url: string; showcased: boolean }): Promise<string> {
  if (opts.showcaseId) {
    await db()`update productions set title = ${opts.title}, final_video_url = ${opts.url}, status = 'complete', showcased = ${opts.showcased} where id = ${opts.showcaseId}`;
    return opts.showcaseId;
  }
  const rows = (await db()`
    insert into productions (client_id, title, final_video_url, status, showcased)
    values (${opts.clientId}, ${opts.title}, ${opts.url}, 'complete', ${opts.showcased})
    returning id`) as { id: string }[];
  return rows[0].id;
}
