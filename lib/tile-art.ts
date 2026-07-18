import { db } from "./db";

// DASHBOARD TILE ARTWORK, PULLED FROM THE WORK ITSELF (Gary).
//
// The brief was "creatively brilliant images" with a way back if he does not like them. Two decisions follow
// from that, and both are deliberate:
//
// 1. THE ARTWORK IS OUR OWN OUTPUT, NOT DECORATION. A cast face we generated, a funnel creative we built, the
//    CEO piece we published. Stock or AI-generated abstract art would make the front door look like every
//    other AI product; real output is proof, cannot be copied by a competitor, and turns the dashboard into
//    something you can flex in front of a client. It also never goes stale: the tile shows the newest work.
//
// 2. IT SITS BEHIND THE DESIGN, NOT INSTEAD OF IT. A low-opacity layer under the existing mark, colour wash
//    and type. Six full-bleed hero images would compete with each other and flatten the hierarchy that makes
//    this page navigable - and the two research desks, which produce text, would have looked like the odd
//    ones out. As atmosphere it lifts all six without breaking any.
//
// REVERSIBLE WITHOUT A DEPLOY (Gary: "if i want to revert ... then i should be able to"). A master switch and
// a per-tile override live in the database, exactly like rate_card and the subscriptions. Nothing here is
// hard-coded, so turning it off is a click and never a code change.

export type TileArt = { url: string; source: string };

// Tile keys, matching the dashboard's doors.
export const TILE_KEYS = ["influencers", "creatives", "media", "psi", "strategist", "journalist"] as const;
export type TileKey = (typeof TILE_KEYS)[number];

async function ensureTable(): Promise<void> {
  await db().query(`create table if not exists dashboard_tiles (
    tile_key   text primary key,
    image_url  text,
    updated_at timestamptz not null default now())`);
  await db().query(`create table if not exists app_settings (
    key text primary key, value text, updated_at timestamptz not null default now())`);
}

export async function artworkEnabled(): Promise<boolean> {
  await ensureTable();
  const rows = (await db().query(`select value from app_settings where key = 'tile_artwork'`)) as { value: string }[];
  // ON by default once the feature ships: the point is to see it. Turning it off is the explicit act.
  return rows[0]?.value !== "off";
}

export async function setArtworkEnabled(on: boolean): Promise<void> {
  await ensureTable();
  await db().query(
    `insert into app_settings (key, value) values ('tile_artwork', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [on ? "on" : "off"],
  );
}

export async function setTileOverride(key: string, url: string | null): Promise<void> {
  await ensureTable();
  if (!url) { await db().query(`delete from dashboard_tiles where tile_key = $1`, [key]); return; }
  await db().query(
    `insert into dashboard_tiles (tile_key, image_url) values ($1, $2)
     on conflict (tile_key) do update set image_url = excluded.image_url, updated_at = now()`,
    [key, url],
  );
}

// The newest real thing each desk has made. Every lookup is defensive: the dashboard must render even if a
// table is empty, a deploy is mid-migration, or a desk has simply never produced anything yet.
async function autoArt(): Promise<Partial<Record<TileKey, TileArt>>> {
  const out: Partial<Record<TileKey, TileArt>> = {};

  // INFLUENCERS: the newest cast hero. Prefer the humanised frame, which is the one we would show a client.
  try {
    const r = (await db().query(
      `select coalesce(persona->>'hero_realism_url', persona->>'hero_url') as url
       from influencers
       where coalesce(persona->>'hero_realism_url', persona->>'hero_url') is not null
       order by created_at desc limit 1`,
    )) as { url: string }[];
    if (r[0]?.url) out.influencers = { url: r[0].url, source: "Newest cast member" };
  } catch { /* tile falls back to marks only */ }

  // CREATIVES: the newest funnel creative from the most recent campaign run.
  try {
    const r = (await db().query(
      `select creatives from studio_campaigns where creatives is not null order by created_at desc limit 1`,
    )) as { creatives: unknown }[];
    const list = r[0]?.creatives as { url?: string }[] | null;
    const url = Array.isArray(list) ? list.find((c) => c?.url)?.url : undefined;
    if (url) out.creatives = { url, source: "Latest funnel creative" };
  } catch { /* as above */ }

  // JOURNALIST: the most recent CEO newsletter creative.
  try {
    const r = (await db().query(
      // studio_intel timestamps its rows with found_at, not created_at. Getting this wrong fails silently:
      // the catch below would swallow it and the tile would just never show artwork, with nothing to explain why.
      `select newsletter_art from studio_intel where newsletter_art is not null order by found_at desc nulls last limit 1`,
    )) as { newsletter_art: string }[];
    if (r[0]?.newsletter_art) out.journalist = { url: r[0].newsletter_art, source: "Latest CEO creative" };
  } catch { /* as above */ }

  // STRATEGIST, MEDIA and PSI produce no image of their own - the research desks are text, and the other two
  // are separate products on their own domains. They stay mark-only unless someone uploads artwork for them.
  return out;
}

// What the dashboard renders: auto-pulled work, with any manual override winning.
export async function getTileArt(): Promise<Record<string, TileArt>> {
  if (!(await artworkEnabled())) return {};
  const [auto, overrides] = await Promise.all([
    autoArt(),
    db().query(`select tile_key, image_url from dashboard_tiles`).catch(() => []) as Promise<{ tile_key: string; image_url: string }[]>,
  ]);
  const merged: Record<string, TileArt> = { ...(auto as Record<string, TileArt>) };
  for (const o of overrides) if (o.image_url) merged[o.tile_key] = { url: o.image_url, source: "Your upload" };
  return merged;
}
