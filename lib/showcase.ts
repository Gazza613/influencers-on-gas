import { randomBytes } from "crypto";
import { db } from "@/lib/db";

// A finished production fit for the public brag wall.
export type ShowcaseVideo = {
  id: string;
  title: string | null;
  final_video_url: string | null;
  created_at: string;
  showcased: boolean;
};

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
  return (await db()`
    select id, title, final_video_url, created_at, showcased
    from productions
    where status = 'complete' and showcased = true and final_video_url is not null
    order by created_at desc`) as ShowcaseVideo[];
}

// What the internal manager shows: every finished video, so a producer can flag
// it into the showcase or remove it again.
export async function listFinishedVideos(): Promise<ShowcaseVideo[]> {
  return (await db()`
    select id, title, final_video_url, created_at, showcased
    from productions
    where status = 'complete' and final_video_url is not null
    order by created_at desc`) as ShowcaseVideo[];
}

// Add to / remove from the showcase (the "delete from showreel" control).
export async function setShowcased(id: string, on: boolean): Promise<void> {
  await db()`update productions set showcased = ${on} where id = ${id}`;
}

// Hard-remove a showcase cut so it disappears entirely (re-publish from the Producer's showreel step).
export async function deleteShowcaseVideo(id: string): Promise<void> {
  await db()`delete from productions where id = ${id}`;
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
