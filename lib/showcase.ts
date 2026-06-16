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
